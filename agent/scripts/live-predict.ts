// Phase 7.2 — live matchday: each agent buys real x402 evidence from its OWN Circle DCW wallet
// (signed via signTypedData, no raw key), predicts an UPCOMING fixture with Venice, and records the
// commitment on-chain (Pool.recordPrediction). Run: pnpm live:predict <poolId>
//
// Needs the seller dev server up (APP_BASE_URL, default :3000) + $RPC + Circle creds + DEPLOYER key.

import { dcwSigner } from "../src/paying/signers.ts";
import { runPool, type RunnableAgent } from "../src/runner.ts";
import { agentsInPool, readFixtures } from "../src/store.ts";
import { recordPredictionOnChain } from "../src/pool-client.ts";

const poolId = process.argv[2] ?? "1";
const baseUrl = process.env.APP_BASE_URL ?? "http://localhost:3000";
const limit = Number(process.env.LIVE_FIXTURES ?? 1);

const agents = agentsInPool(poolId) as RunnableAgent[];
if (agents.some((a) => !a.walletId || a.walletId.startsWith("stub-") || !a.onChainAgentId)) {
  console.error("agents not fully provisioned — run seed:wallets then seed:onchain first");
  process.exit(1);
}

const fixtures = readFixtures()
  .filter((f) => f.status === "scheduled")
  .slice(0, limit)
  .map((f) => ({ id: f.id, home: f.home, away: f.away }));
if (fixtures.length === 0) {
  console.error("no upcoming (scheduled) fixtures — run fixtures:sync");
  process.exit(1);
}

console.log(`live predict: ${agents.length} agents x ${fixtures.length} upcoming fixture(s) — real x402 from DCW wallets + on-chain record`);
for (const f of fixtures) console.log(`  fixture ${f.id}: ${f.home} vs ${f.away}`);

const report = await runPool(poolId, agents, {
  fixtures,
  baseUrl,
  signerFor: (a) => dcwSigner(a.walletId, a.walletAddress),
  onPrediction: async (pid, agent, fixtureId, hash) => {
    if (!agent.onChainAgentId) return;
    const tx = await recordPredictionOnChain(BigInt(pid), BigInt(agent.onChainAgentId), BigInt(fixtureId), hash);
    console.log(`    on-chain recordPrediction: agent ${agent.onChainAgentId} fixture ${fixtureId} (tx ${tx})`);
  },
});

console.log(`\nran ${report.ran}, skipped ${report.skipped}, failed ${report.failed}`);
for (const r of report.results) {
  const a = agents.find((x) => x.agentId === r.agentId);
  const bought = r.purchases.map((p) => `${p.source}=${p.settlementUuid.slice(0, 8)}`).join(", ");
  console.log(
    `  ${a?.template.name}: ${r.fixtureId} -> ${r.prediction.homeScore}-${r.prediction.awayScore} ` +
      `| spent ${Number(r.spent) / 1e6} USDC | bought [${bought || "none"}]`,
  );
}
console.log("live:predict done");
