// Model provider: any OpenAI-compatible chat completions endpoint (OpenAI, OpenRouter, Venice,
// Groq, Together, Anthropic's compatibility layer...). Configured by env:
//   MODEL_API_KEY   the key (MODEL_PROVIDER_KEY is accepted for older .env files)
//   MODEL_BASE_URL  e.g. https://openrouter.ai/api/v1 (default: OpenAI)
//   MODEL_NAME      default model when the agent template doesn't pin one
// With no key the runtime uses the built-in statistical model (./stats.ts) instead.

function apiKey(): string | undefined {
  return process.env.MODEL_API_KEY || process.env.MODEL_PROVIDER_KEY || undefined;
}

export function modelConfigured(): boolean {
  return Boolean(apiKey());
}

export function defaultModelName(): string {
  return process.env.MODEL_NAME || "gpt-4o-mini";
}

function baseUrl(): string {
  if (process.env.MODEL_BASE_URL) return process.env.MODEL_BASE_URL.replace(/\/$/, "");
  // Older .env files only set MODEL_PROVIDER_KEY, which was a Venice key.
  if (!process.env.MODEL_API_KEY && process.env.MODEL_PROVIDER_KEY) return "https://api.venice.ai/api/v1";
  return "https://api.openai.com/v1";
}

/** Pull the first JSON object out of a model reply (tolerates code fences and stray prose). */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error(`model returned no JSON: ${text.slice(0, 200)}`);
  return JSON.parse(body.slice(start, end + 1));
}

/** Ask the model for a JSON object and parse it. Throws on transport errors or non-JSON. */
export async function llmJson(opts: {
  system: string;
  user: string;
  model?: string;
  temperature?: number;
}): Promise<unknown> {
  const key = apiKey();
  if (!key) throw new Error("no model key configured (MODEL_API_KEY)");
  const res = await fetch(`${baseUrl()}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: opts.model || defaultModelName(),
      messages: [
        { role: "system", content: opts.system },
        { role: "user", content: opts.user },
      ],
      temperature: opts.temperature ?? 0.4,
      max_tokens: 600,
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`model ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = body.choices?.[0]?.message?.content;
  if (!content) throw new Error("model returned no content");
  return extractJson(content);
}
