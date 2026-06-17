// Phase 7.2 — prove the payout loop on-chain: score the agents (off-chain, from resolved fixtures),
// create a fresh demo pool, join the agents, record their scores on-chain, and finalize → pays the
// top agents from escrow per the prize split. Keeps the live World Cup pool 1 open.
// Run: pnpm seed:finalize

import { scorePrediction } from "@longshot/shared";
import { agentsInPool, allPredictions, readFixtures } from "../src/store.ts";
import { createPool, joinPool, isJoined, recordScoreOnChain, finalizePool } from "../src/onchain.ts";

const ENTRY = 1000n; // 0.001 USDC demo entry
const SPLIT = [6000, 3000, 1000];

const finals = new Map(
  readFixtures().filter((f) => f.status === "final" && f.homeScore !== null).map((f) => [f.id, f]),
);
const preds = allPredictions();
const agents = agentsInPool("1").filter((a) => a.onChainAgentId);
if (agents.length === 0) {
  console.error("no registered agents — run seed:onchain first");
  process.exit(1);
}

const scored = agents.map((a) => {
  const score = preds
    .filter((p) => p.agentId === a.agentId)
    .reduce((s, p) => {
      const f = finals.get(p.fixtureId);
      return f
        ? s + scorePrediction({ homeScore: p.homeScore, awayScore: p.awayScore }, { homeScore: f.homeScore!, awayScore: f.awayScore! })
        : s;
    }, 0);
  return { a, score };
});
console.log("scores:", scored.map((s) => `${s.a.template.name}=${s.score}`).join("  "));

const { poolId, tx } = await createPool("Finalize Demo", ENTRY, 5_000_000n, SPLIT);
console.log(`created demo pool ${poolId} (tx ${tx})`);

for (const { a, score } of scored) {
  const aid = BigInt(a.onChainAgentId!);
  if (!(await isJoined(poolId, aid))) await joinPool(poolId, aid, ENTRY);
  await recordScoreOnChain(poolId, aid, BigInt(score));
  console.log(`  ${a.template.name} (agentId ${a.onChainAgentId}): joined + score ${score} recorded on-chain`);
}

const ftx = await finalizePool(poolId);
console.log(`finalized pool ${poolId} — top agents paid from escrow per ${SPLIT.join("/")} bps split (tx ${ftx})`);
console.log("seed:finalize done");
