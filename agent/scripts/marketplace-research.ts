// Demo: a LONGSHOT agent buys REAL research from the Circle Agent Marketplace (x402 nanopayment on
// Base) for an upcoming fixture, then predicts the score with Venice using that research.
//
// Run: pnpm --filter @longshot/agent market:research [fixtureId]
// Needs: the Circle CLI logged in (`circle wallet login`) + a little USDC on the service's chain,
// and MODEL_PROVIDER_KEY (Venice) for the prediction. Gracefully exits if the wallet isn't ready.

import { fetchMarketplaceResearch } from "../src/paying/marketplace.ts";
import { veniceJson } from "../src/model/venice.ts";
import { readFixtures } from "../src/store.ts";

const arg = process.argv[2];
const fixtures = readFixtures();
const fx = (arg ? fixtures.find((f) => f.id === arg) : fixtures.find((f) => f.status === "scheduled")) ?? fixtures[0];
if (!fx) {
  console.error("no fixtures — run fixtures:sync first");
  process.exit(1);
}

const query = `${fx.home} vs ${fx.away} football match preview: recent form, key injuries, head-to-head record, likely scoreline. World Cup 2026.`;
console.log(`fixture ${fx.id}: ${fx.home} vs ${fx.away}`);
console.log(`buying real marketplace research via x402 nanopayment...`);

const res = await fetchMarketplaceResearch(query);
if (!res.ok) {
  console.error(`\nmarketplace unavailable: ${res.reason}`);
  console.error(`→ log in: circle wallet login   ·   fund: circle wallet fund --chain ${res.chain}   ·   then re-run`);
  process.exit(1);
}

console.log(`\nPAID on ${res.chain} · ${res.serviceUrl}`);
console.log(`research (truncated):\n${(res.text ?? "").slice(0, 700)}\n`);

console.log(`predicting with Venice, using the bought research...`);
const system = `You are a sharp football prediction agent. Use the provided research. Respond with ONLY a JSON object, no markdown: {"homeScore": <int>=0>, "awayScore": <int>=0>, "confidence": <0..1>, "rationale": "<one or two sentences>"}.`;
const user = [
  `Fixture: ${fx.home} (home) vs ${fx.away} (away).`,
  `Real web research you paid for via the Circle Agent Marketplace:\n${res.text}`,
  `Predict the exact final score.`,
].join("\n\n");

const prediction = await veniceJson({ system, user });
console.log(`\nprediction (marketplace-informed): ${JSON.stringify(prediction)}`);
console.log(`\nmarket:research PASS — agent bought real data from the Circle Agent Marketplace and predicted with it.`);
