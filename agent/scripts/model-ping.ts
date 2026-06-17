// Quick live check that the Venice model layer + MODEL_PROVIDER_KEY work.
// Run: pnpm model:ping

import { veniceJson } from "../src/model/venice.ts";

const out = await veniceJson({
  system: "Respond with ONLY a JSON object, no markdown.",
  user: 'Return exactly {"ok": true, "msg": "hello from venice"}.',
});
console.log("venice responded:", JSON.stringify(out));
