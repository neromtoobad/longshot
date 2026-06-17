// Model provider layer (Venice), reusing CROSSFIRE's pattern: Venice is OpenAI-compatible, so we
// use the OpenAI SDK with a baseURL swap. The predict loop (Phase 4.2) calls veniceJson() to get a
// structured prediction. Built lazily so a missing key fails at call time, not at import/build.

import OpenAI from "openai";
import { DEFAULT_MODEL } from "../template.js";

let client: OpenAI | null = null;

export function venice(): OpenAI {
  if (client) return client;
  client = new OpenAI({
    apiKey: process.env.MODEL_PROVIDER_KEY ?? "MODEL_PROVIDER_KEY-not-set",
    baseURL: "https://api.venice.ai/api/v1",
  });
  return client;
}

/** Ask Venice for a JSON object (response_format json_object) and parse it. Throws on non-JSON. */
export async function veniceJson(opts: {
  system: string;
  user: string;
  model?: string;
  temperature?: number;
}): Promise<unknown> {
  const res = await venice().chat.completions.create({
    model: opts.model ?? DEFAULT_MODEL,
    messages: [
      { role: "system", content: opts.system },
      { role: "user", content: opts.user },
    ],
    response_format: { type: "json_object" },
    temperature: opts.temperature ?? 0.4,
  });
  const content = res.choices?.[0]?.message?.content;
  if (!content) throw new Error("Venice returned no content");
  try {
    return JSON.parse(content);
  } catch {
    throw new Error(`Venice returned non-JSON: ${content.slice(0, 200)}`);
  }
}
