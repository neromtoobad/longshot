// Server data module: joins the runtime store (agents, predictions, purchases, fixtures) with
// on-chain state + scoring into the views the pages render. Read-only, server-only.

import type { Fixture } from "@longshot/shared";
import { buildLeaderboard, buildScoreRows, scorePrediction, type ScoredEntry } from "@longshot/shared";
import { allFixtures } from "./fixtures-store";
import { readAgents, readPredictions, readPurchases, type StoredAgent } from "./store";
import { brokerRevenue } from "./broker";
import { readPoolInfo, type PoolInfo } from "./pool";

export interface LeaderboardEntry {
  rank: number;
  agentId: string;
  name: string;
  persona: string;
  cumulativeScore: number;
  fixturesScored: number;
  spent: string;
  roi: number;
  preferBroker: boolean;
  avatar?: { style: string; seed: string };
}

function finalFixtureMap(poolId: string): Map<string, Fixture> {
  const map = new Map<string, Fixture>();
  for (const f of allFixtures()) {
    if (f.poolId === poolId && f.status === "final" && f.homeScore !== null && f.awayScore !== null) {
      map.set(f.id, f);
    }
  }
  return map;
}

export function getLeaderboard(poolId: string): LeaderboardEntry[] {
  const agents = readAgents().filter((a) => a.poolId === poolId);
  const finals = finalFixtureMap(poolId);
  const predictions = readPredictions().filter((p) => p.poolId === poolId);

  const entries: ScoredEntry[] = [];
  const spentByAgent: Record<string, bigint> = {};
  for (const a of agents) spentByAgent[a.agentId] = 0n;

  for (const p of predictions) {
    spentByAgent[p.agentId] = (spentByAgent[p.agentId] ?? 0n) + BigInt(p.spent);
    const fixture = finals.get(p.fixtureId);
    if (!fixture) continue; // only score resolved fixtures
    entries.push({
      agentId: p.agentId,
      fixtureId: p.fixtureId,
      pred: { homeScore: p.homeScore, awayScore: p.awayScore },
      actual: { homeScore: fixture.homeScore!, awayScore: fixture.awayScore! },
    });
  }

  const rows = buildScoreRows(entries);
  const board = buildLeaderboard(rows, spentByAgent);
  const byId = new Map(agents.map((a) => [a.agentId, a]));

  return board.map((r, i) => {
    const a = byId.get(r.agentId);
    return {
      rank: i + 1,
      agentId: r.agentId,
      name: a?.template.name ?? `Agent ${r.agentId}`,
      persona: a?.template.persona ?? "",
      cumulativeScore: r.cumulativeScore,
      fixturesScored: r.fixturesScored,
      spent: r.spent,
      roi: r.roi,
      preferBroker: a?.template.dataPreference.preferBroker ?? false,
      avatar: a?.avatar,
    };
  });
}

export interface PoolStats {
  agentsRegistered: number;
  uniqueOwners: number;
  predictionsMade: number;
  totalPayments: number;
  totalDataSpent: string;
  avgTxSize: string;
  budgetUtilization: number;
  costPerTask: string;
  correctPredictions: number;
  broker: ReturnType<typeof brokerRevenue>;
}

export function getStats(poolId: string): PoolStats {
  const agents = readAgents().filter((a) => a.poolId === poolId);
  const predictions = readPredictions().filter((p) => p.poolId === poolId);
  const purchases = readPurchases().filter((p) => agents.some((a) => a.agentId === p.agentId));

  const totalSpent = purchases.reduce((s, p) => s + BigInt(p.priceUSDC), 0n);
  const allocated = agents.reduce((s, a) => s + BigInt(a.template.budget), 0n);

  // Cost per task = data spent / correct predictions (a prediction that scored any points).
  const finals = finalFixtureMap(poolId);
  let correct = 0;
  for (const p of predictions) {
    const f = finals.get(p.fixtureId);
    if (f && scorePrediction({ homeScore: p.homeScore, awayScore: p.awayScore }, { homeScore: f.homeScore!, awayScore: f.awayScore! }) > 0) {
      correct++;
    }
  }
  const costPerTask = correct > 0 ? totalSpent / BigInt(correct) : 0n;
  const avgTx = purchases.length > 0 ? totalSpent / BigInt(purchases.length) : 0n;

  return {
    agentsRegistered: agents.length,
    uniqueOwners: new Set(agents.map((a) => a.owner.toLowerCase())).size,
    predictionsMade: predictions.length,
    totalPayments: purchases.length,
    totalDataSpent: totalSpent.toString(),
    avgTxSize: avgTx.toString(),
    budgetUtilization: allocated > 0n ? Number(totalSpent) / Number(allocated) : 0,
    costPerTask: costPerTask.toString(),
    correctPredictions: correct,
    broker: brokerRevenue(),
  };
}

export interface PoolView {
  poolId: string;
  info: PoolInfo | null;
  entrants: StoredAgent[];
  fixtures: { upcoming: Fixture[]; final: Fixture[] };
  error?: string;
}

export async function getPoolView(poolId: string): Promise<PoolView> {
  const entrants = readAgents().filter((a) => a.poolId === poolId);
  const all = allFixtures().filter((f) => f.poolId === poolId);
  const upcoming = all
    .filter((f) => f.status !== "final")
    .sort((a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime());
  const final = all.filter((f) => f.status === "final");

  let info: PoolInfo | null = null;
  let error: string | undefined;
  try {
    info = await readPoolInfo(BigInt(poolId));
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  return { poolId, info, entrants, fixtures: { upcoming, final }, error };
}
