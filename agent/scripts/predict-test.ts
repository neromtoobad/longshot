// Phase 4.2 test: run the predict loop end to end with the payment + model layers stubbed. Asserts
// the buy-or-skip decision respects the budget cap and a structured prediction is produced. No
// network, no payment, no model call.
//
// Run: pnpm predict:test

import assert from "node:assert/strict";
import { compileTemplate, type AgentTemplate } from "../src/template.ts";
import { runPredictLoop, type Candidate } from "../src/predict.ts";
import type { BuyEvidenceResult } from "../src/paying/client.ts";
import type { X402Signer } from "../src/paying/signers.ts";

const signer: X402Signer = {
  address: "0x0000000000000000000000000000000000000001",
  signTypedData: async () => "0x" as `0x${string}`,
};

const template: AgentTemplate = {
  name: "Test Agent",
  prompt: "Predict the exact score.",
  persona: "A deterministic tester.",
  riskAppetite: "high", // minRatio 1
  dataPreference: { preferBroker: false, willingnessToPay: { form: "6000", odds: "6000", h2h: "6000" } },
  modelProvider: "venice",
  budget: "8000", // 0.008 USDC — fits 2 of the 3 valued buys, not all
};
const config = compileTemplate(template);

const PRICES: Record<string, bigint> = { form: 3000n, odds: 5000n, h2h: 2000n, injuries: 2000n };

const listCandidates = async (): Promise<Candidate[]> =>
  (Object.keys(PRICES) as (keyof typeof PRICES)[]).map((source) => ({
    source: source as Candidate["source"],
    price: PRICES[source],
    url: `stub://${source}`,
  }));

let buyCount = 0;
const buyStub = async (a: {
  source: string;
  agentId: string;
  fixtureId: string;
}): Promise<BuyEvidenceResult> => {
  buyCount++;
  return {
    ok: true,
    data: { stub: a.source },
    remaining: 0n,
    purchase: {
      id: `p${buyCount}`,
      agentId: a.agentId,
      fixtureId: a.fixtureId,
      source: a.source as Candidate["source"],
      priceUSDC: PRICES[a.source].toString(),
      settlementUuid: `uuid-${buyCount}`,
      batchTxHash: null,
      createdAt: "2026-06-17T00:00:00.000Z",
    },
  };
};

const callModel = async () => ({ homeScore: 2, awayScore: 1, confidence: 0.7, rationale: "stub" });

// Force the static (no-model) decision path so the test stays deterministic and offline.
const planEvidence = async () => null;

const result = await runPredictLoop({
  config,
  agentId: "agent-1",
  fixture: { id: "wc-1", home: "Brazil", away: "Croatia" },
  signer,
  baseUrl: "stub://base",
  deps: { listCandidates, buy: buyStub as never, callModel, planEvidence },
});

// Buy-or-skip: ranked by value/dollar -> h2h(3.0) buy, form(2.0) buy, odds(1.2) skip (over budget);
// injuries never valued (WTP 0) so it's not even a candidate decision.
const bought = result.decisions.filter((d) => d.decision === "buy").map((d) => d.source);
const skipped = result.decisions.filter((d) => d.decision === "skip");

assert.deepEqual(bought.sort(), ["form", "h2h"], "buys the two best value/dollar within budget");
assert.equal(result.purchases.length, 2);
assert.equal(result.spent, 5000n, "spent = h2h(2000) + form(3000)");
assert.ok(result.spent <= config.budget, "spend respects the cap");
assert.ok(
  skipped.some((d) => d.source === "odds" && /budget/.test(d.reason)),
  "odds skipped for budget",
);

// Structured prediction produced.
assert.equal(result.prediction.homeScore, 2);
assert.equal(result.prediction.awayScore, 1);
assert.equal(result.prediction.confidence, 0.7);
assert.match(result.predictionHash, /^0x[0-9a-f]{64}$/, "predictionHash is bytes32");

console.log("decisions:");
for (const d of result.decisions) {
  console.log(`  ${d.source.padEnd(9)} ${d.decision.toUpperCase().padEnd(4)} (vpd ${d.valuePerDollar}) — ${d.reason}`);
}
console.log(`prediction: ${result.prediction.homeScore}-${result.prediction.awayScore} (conf ${result.prediction.confidence})`);
console.log(`spent ${Number(result.spent) / 1e6} of ${Number(config.budget) / 1e6} USDC budget`);
console.log("predict:test PASS");
