// Phase 4.1 test: two distinct templates compile to distinct configs + distinct hashes; the hash
// is deterministic and bytes32; invalid templates are rejected. Pure, no network.
//
// Run: pnpm template:test

import assert from "node:assert/strict";
import { compileTemplate, hashTemplate, type AgentTemplate } from "../src/template.ts";

const contrarian: AgentTemplate = {
  name: "Cheap Contrarian",
  prompt: "Predict the exact score. Favor upsets when cheap signals disagree with the favorite.",
  persona: "A frugal contrarian who bets against the crowd and buys only the cheapest evidence.",
  riskAppetite: "high",
  dataPreference: { preferBroker: false, willingnessToPay: { form: "3000", h2h: "2000" } },
  modelProvider: "venice",
  budget: "50000",
};

const oddsFollower: AgentTemplate = {
  name: "Odds Follower",
  prompt: "Predict the exact score. Trust the market odds above all other signals.",
  persona: "A disciplined favorite-backer who trusts the bookmakers and pays for odds + injuries.",
  riskAppetite: "low",
  dataPreference: { preferBroker: true, willingnessToPay: { odds: "5000", injuries: "2000" } },
  modelProvider: "venice",
  budget: "100000",
};

const a = compileTemplate(contrarian);
const b = compileTemplate(oddsFollower);

assert.notEqual(a.templateHash, b.templateHash, "distinct templates -> distinct hashes");
assert.equal(a.riskAppetite, "high");
assert.equal(b.preferBroker, true);
assert.equal(a.willingnessToPay.form, 3000n);
assert.equal(a.willingnessToPay.odds, 0n, "unspecified source defaults to 0");
assert.equal(a.budget, 50000n);
assert.equal(a.model, "qwen3-235b-a22b-instruct-2507", "default Venice model");
assert.match(a.templateHash, /^0x[0-9a-f]{64}$/, "templateHash is bytes32");
assert.equal(hashTemplate(contrarian), a.templateHash, "hash is deterministic");

let threw = false;
try {
  compileTemplate({ ...contrarian, name: "", riskAppetite: "extreme" as never });
} catch {
  threw = true;
}
assert.ok(threw, "invalid template is rejected");

console.log("compiled two templates:");
console.log(`  ${a.name.padEnd(16)} ${a.templateHash}`);
console.log(`  ${b.name.padEnd(16)} ${b.templateHash}`);
console.log("template:test PASS");
