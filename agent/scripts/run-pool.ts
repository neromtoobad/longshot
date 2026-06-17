// Phase 4.3: run a matchday round for a pool. Test mode (default) stubs the payment layer
// (test-mode spend) but uses the REAL Venice model (real predictions) — no dev server needed. It
// seeds 3 distinct demo agents on first run, then is idempotent (re-running skips done fixtures).
//
// Run: pnpm run:pool <poolId>   (needs $RPC + MODEL_PROVIDER_KEY)

import { formatUnits } from "viem";
import type { AgentTemplate } from "../src/template.ts";
import { agentsInPool, saveAgent, readFixtures } from "../src/store.ts";
import { runPool, type RunnableAgent } from "../src/runner.ts";
import type { BuyEvidenceResult } from "../src/paying/client.ts";
import { veniceJson } from "../src/model/venice.ts";
import type { Candidate } from "../src/predict.ts";

const poolId = process.argv[2] ?? "1";

const SEED: { agentId: string; template: AgentTemplate }[] = [
  {
    agentId: "1",
    template: {
      name: "Cheap Contrarian",
      prompt: "Predict the exact score. Lean toward upsets when cheap signals contradict the favorite.",
      persona: "A frugal contrarian who buys only the cheapest evidence and bets against the crowd.",
      riskAppetite: "high",
      dataPreference: { preferBroker: false, willingnessToPay: { form: "4000", h2h: "4000" } },
      modelProvider: "venice",
      budget: "20000",
    },
  },
  {
    agentId: "2",
    template: {
      name: "Odds Follower",
      prompt: "Predict the exact score. Trust the market odds above all other signals.",
      persona: "A disciplined favorite-backer who trusts the bookmakers and pays for odds + injuries.",
      riskAppetite: "low",
      dataPreference: { preferBroker: true, willingnessToPay: { odds: "8000", injuries: "4000" } },
      modelProvider: "venice",
      budget: "40000",
    },
  },
  {
    agentId: "3",
    template: {
      name: "Injury Specialist",
      prompt: "Predict the exact score. Weight team availability and recent form heavily.",
      persona: "An injury-news specialist who values availability and form over market odds.",
      riskAppetite: "medium",
      dataPreference: { preferBroker: false, willingnessToPay: { injuries: "5000", form: "5000", h2h: "3000" } },
      modelProvider: "venice",
      budget: "30000",
    },
  },
];

if (agentsInPool(poolId).length === 0) {
  console.log(`seeding ${SEED.length} demo agents into pool ${poolId}...`);
  for (const s of SEED) {
    saveAgent({
      agentId: s.agentId,
      owner: "0x000000000000000000000000000000000000dEaD",
      poolId,
      walletId: `stub-wallet-${s.agentId}`,
      walletAddress: "0x000000000000000000000000000000000000dEaD",
      template: s.template,
    });
  }
}

const agents = agentsInPool(poolId) as RunnableAgent[];

// Real World Cup fixtures from the synced store (run `pnpm fixtures:sync` first). For this seed we
// predict the already-FINAL fixtures so the leaderboard scores immediately; a live matchday round
// would select upcoming fixtures (status "scheduled") ahead of kickoff.
const FIXTURE_LIMIT = Number(process.env.RUN_POOL_FIXTURES ?? 3);
const want = process.env.RUN_POOL_STATUS ?? "final";
const fixtures = readFixtures()
  .filter((f) => f.status === want)
  .slice(0, FIXTURE_LIMIT)
  .map((f) => ({ id: f.id, home: f.home, away: f.away }));

if (fixtures.length === 0) {
  console.error(`no '${want}' fixtures in the store — run pnpm fixtures:sync first`);
  process.exit(1);
}

// --- TEST MODE deps: stub payment (test-mode spend), real Venice model -----
const PRICES: Record<string, bigint> = { form: 3000n, odds: 5000n, injuries: 2000n, h2h: 2000n };
let receipt = 0;

const listCandidates = async (_b: string, _c: unknown, fixtureId: string): Promise<Candidate[]> =>
  (Object.keys(PRICES) as string[]).map((source) => ({
    source: source as Candidate["source"],
    price: PRICES[source],
    url: `stub://${source}?fixtureId=${fixtureId}`,
  }));

const buy = async (a: { source: string; agentId: string; fixtureId: string }): Promise<BuyEvidenceResult> => {
  receipt++;
  return {
    ok: true,
    data: { source: a.source, placeholder: true },
    remaining: 0n,
    purchase: {
      id: `r${receipt}`,
      agentId: a.agentId,
      fixtureId: a.fixtureId,
      source: a.source as Candidate["source"],
      priceUSDC: PRICES[a.source].toString(),
      settlementUuid: `test-uuid-${receipt}`,
      batchTxHash: null,
      createdAt: new Date().toISOString(),
    },
  };
};

const callModel = (system: string, user: string) => veniceJson({ system, user });

const report = await runPool(poolId, agents, {
  fixtures,
  baseUrl: "test://stub",
  signerFor: () => ({ address: "0x0000000000000000000000000000000000000001", signTypedData: async () => "0x" as `0x${string}` }),
  deps: { listCandidates, buy: buy as never, callModel },
});

console.log(`\npool ${poolId}: ran ${report.ran}, skipped ${report.skipped} (idempotent), failed ${report.failed}`);
for (const r of report.results) {
  const a = agents.find((x) => x.agentId === r.agentId);
  const bought = r.decisions.filter((d) => d.decision === "buy").map((d) => d.source);
  console.log(
    `  agent ${r.agentId} (${a?.template.name}) ${r.fixtureId}: ${r.prediction.homeScore}-${r.prediction.awayScore} ` +
      `conf ${r.prediction.confidence} | bought [${bought.join(", ")}] spent ${formatUnits(r.spent, 6)} USDC`,
  );
}
console.log("run:pool done");
