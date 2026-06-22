// Server data module: joins the runtime store (agents, predictions, purchases, fixtures) with
// on-chain state + scoring into the views the pages render. Read-only, server-only.

import type { EvidenceSource, Fixture } from "@longshot/shared";
import { buildLeaderboard, buildScoreRows, scorePrediction, type ScoredEntry } from "@longshot/shared";
import { allFixtures } from "./fixtures-store";
import { readAgents, readPredictions, readPurchases, readSettlements, type StoredAgent } from "./store";
import { brokerCatalog, brokerRevenue } from "./broker";
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

export interface ActivityItem {
  kind: "buy" | "predict";
  agentId: string;
  agentName: string;
  avatar?: { style: string; seed: string };
  text: string;
  detail: string;
  at: string;
}

/** Recent autonomous activity (evidence buys + predictions) for the home ticker. Newest first. */
export function getActivity(poolId: string, limit = 24): ActivityItem[] {
  const agents = readAgents().filter((a) => a.poolId === poolId);
  const byId = new Map(agents.map((a) => [a.agentId, a]));
  const fixtures = new Map(allFixtures().filter((f) => f.poolId === poolId).map((f) => [f.id, f]));
  const items: ActivityItem[] = [];

  for (const p of readPurchases()) {
    const a = byId.get(p.agentId);
    if (!a) continue;
    items.push({
      kind: "buy",
      agentId: p.agentId,
      agentName: a.template.name,
      avatar: a.avatar,
      text: `bought ${p.source}`,
      detail: `$${(Number(BigInt(p.priceUSDC)) / 1_000_000).toFixed(4)}`,
      at: p.createdAt,
    });
  }

  for (const p of readPredictions().filter((p) => p.poolId === poolId)) {
    const a = byId.get(p.agentId);
    if (!a) continue;
    const fx = fixtures.get(p.fixtureId);
    const matchup = fx ? `${fx.home} ${p.homeScore}–${p.awayScore} ${fx.away}` : `${p.homeScore}–${p.awayScore}`;
    items.push({
      kind: "predict",
      agentId: p.agentId,
      agentName: a.template.name,
      avatar: a.avatar,
      text: "predicted",
      detail: matchup,
      at: p.createdAt,
    });
  }

  return items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()).slice(0, limit);
}

/** The agent-to-agent payment network (RFB 3): which agents route through the broker, the broker's
 *  per-source markup catalog, and realized sales — for the network visualization. */
export function getBrokerNetwork(poolId: string) {
  const agents = readAgents().filter((a) => a.poolId === poolId);
  const catalog = brokerCatalog();
  const revenue = brokerRevenue();
  return {
    markupBps: catalog.markupBps,
    brokerAgents: agents.filter((a) => a.template.dataPreference.preferBroker).map((a) => ({ id: a.agentId, name: a.template.name, avatar: a.avatar })),
    directAgents: agents.filter((a) => !a.template.dataPreference.preferBroker).map((a) => ({ id: a.agentId, name: a.template.name, avatar: a.avatar })),
    catalog: catalog.sources, // {source, basePriceUSDC, markupUSDC, brokerPriceUSDC, reputation}
    revenue, // {totalSales, totalRevenueUSDC, totalPassthroughUSDC, bySource, paymentChainDepth}
  };
}

export interface MyAgent {
  agentId: string;
  name: string;
  avatar?: { style: string; seed: string };
  onChainAgentId?: string;
  riskAppetite: string;
  preferBroker: boolean;
  budgetUSDC: string; // base units
  willingnessToPay: Partial<Record<EvidenceSource, string>>;
  persona: string;
  prompt: string;
  score: number;
  fixturesScored: number;
  predictions: number;
  spent: string; // base units
  roi: number;
  provisioned: boolean; // has a runnable data wallet
}

/** The connected owner's agents with live progress + their editable strategy (for the My Agents page). */
export function getMyAgents(owner: string, poolId = "1"): MyAgent[] {
  const lower = owner.toLowerCase();
  const agents = readAgents().filter((a) => a.poolId === poolId && (a.owner || "").toLowerCase() === lower);
  const finals = finalFixtureMap(poolId);
  const preds = readPredictions().filter((p) => p.poolId === poolId);
  const purchases = readPurchases();

  return agents.map((a) => {
    const mine = preds.filter((p) => p.agentId === a.agentId);
    let score = 0;
    let scored = 0;
    for (const p of mine) {
      const f = finals.get(p.fixtureId);
      if (f) {
        score += scorePrediction({ homeScore: p.homeScore, awayScore: p.awayScore }, { homeScore: f.homeScore!, awayScore: f.awayScore! });
        scored += 1;
      }
    }
    const spent = purchases.filter((p) => p.agentId === a.agentId).reduce((s, p) => s + BigInt(p.priceUSDC), 0n);
    const roi = spent > 0n ? score / (Number(spent) / 1_000_000) : score > 0 ? Infinity : 0;
    return {
      agentId: a.agentId,
      name: a.template.name,
      avatar: a.avatar,
      onChainAgentId: a.onChainAgentId,
      riskAppetite: a.template.riskAppetite,
      preferBroker: a.template.dataPreference.preferBroker,
      budgetUSDC: a.template.budget,
      willingnessToPay: a.template.dataPreference.willingnessToPay,
      persona: a.template.persona,
      prompt: a.template.prompt,
      score,
      fixturesScored: scored,
      predictions: mine.length,
      spent: spent.toString(),
      roi,
      provisioned: Boolean(a.walletAddress),
    };
  });
}

export interface SettlementTrace {
  uuid: string;
  status: string;
  agentName: string;
  source: string;
  fromAddress: string | null;
  toAddress: string | null;
  amountUSDC: string | null;
  onArc: boolean;
  settledAt: string | null;
  batchTxHash: string | null;
}

export interface SettlementSummary {
  total: number;
  completed: number;
  rows: SettlementTrace[];
}

/** Reconciled x402 settlements joined with the agent + source that paid them (for the proof panel). */
export function getSettlements(poolId: string, limit = 12): SettlementSummary {
  const settlements = readSettlements();
  const agents = readAgents().filter((a) => a.poolId === poolId);
  const byId = new Map(agents.map((a) => [a.agentId, a]));
  // Map a settlement UUID -> the purchase that produced it (agent + source).
  const purchaseByUuid = new Map(readPurchases().map((p) => [p.settlementUuid, p]));

  const rows: SettlementTrace[] = settlements.map((s) => {
    const purchase = purchaseByUuid.get(s.uuid);
    const agent = purchase ? byId.get(purchase.agentId) : undefined;
    return {
      uuid: s.uuid,
      status: s.status,
      agentName: agent?.template.name ?? "agent",
      source: purchase?.source ?? "evidence",
      fromAddress: s.fromAddress,
      toAddress: s.toAddress,
      amountUSDC: s.amount,
      onArc: (s.network ?? "").includes("5042002"),
      settledAt: s.settledAt,
      batchTxHash: s.batchTxHash,
    };
  });

  return {
    total: settlements.length,
    completed: settlements.filter((s) => s.status === "completed" || s.status === "confirmed").length,
    rows: rows.filter((r) => purchaseByUuid.has(r.uuid)).slice(0, limit),
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
