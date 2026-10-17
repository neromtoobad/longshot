// Quick live check that the configured model endpoint answers with JSON.
// Run: pnpm --filter @longshot/agent model:ping

import { llmJson, modelConfigured, defaultModelName } from "../src/model/llm.ts";

if (!modelConfigured()) {
  console.log("no MODEL_API_KEY set: agents will use the built-in statistical model");
  process.exit(0);
}
const out = await llmJson({
  system: "Respond with ONLY a JSON object, no markdown.",
  user: 'Return exactly {"ok": true}.',
});
console.log(`${defaultModelName()} responded:`, JSON.stringify(out));
