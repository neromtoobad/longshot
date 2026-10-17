// Server data module: joins the runtime store (agents, predictions, purchases, fixtures) with
// on-chain state + scoring into the views the pages render. Read-only, server-only. Everything is
// keyed by competition ("epl", "ucl", ...); the on-chain pool id comes from addresses.json.

import {
  COMPETITIONS,
  buildLeaderboard,
  buildScoreRows,
  competition,
  inSeason,
  poolFor,
  scorePrediction,
  type Competition,
  type CompetitionKey,
  type EvidenceSource,
  type Fixture,
  type ScoredEntry,
} from "@longshot/shared";
import { readJsonFile } from "@longshot/shared/server";
import { allFixtures } from "./fixtures-store";
import { readAgents, readPredictions, readPurchases, readSettlements, type StoredAgent, type StoredPrediction } from "./store";
import { brokerCatalog, brokerRevenue } from "./broker";
import { readPoolInfo, type PoolInfo } from "./pool";

/** Resolve a ?league= param to a competition (default: Premier League). */
export function resolveCompetition(param?: string | string[]): Competition {
  const key = Array.isArray(param) ? param[0] : param;
  return competition(key ?? "") ?? COMPETITIONS[0];
}

export function poolIdOf(c: Competition): string | undefined {
  const p = poolFor(c.key);
  return p ? String(p.poolId) : undefined;
}

function competitionOfAgent(a: StoredAgent): Competition | undefined {
  return COMPETITIONS.find((c) => poolIdOf(c) === a.poolId);
}

type Final = Fixture & { homeScore: number; awayScore: number };
const isFinal = (f: Fixture): f is Final => f.status === "final" && f.homeScore !== null && f.awayScore !== null;

function seasonFixtures(c: Competition): Fixture[] {
  return allFixtures().filter((f) => f.competition === c.key && inSeason(c, f.kickoff));
}

function finalsById(): Map<string, Final> {
  const m = new Map<string, Final>();
  for (const f of allFixtures()) if (isFinal(f)) m.set(f.id, f);
  return m;
}

function pointsFor(p: StoredPrediction, f: Final | undefined): number | null {
  if (!f) return null;
  return scorePrediction({ homeScore: p.homeScore, awayScore: p.awayScore }, { homeScore: f.homeScore, awayScore: f.awayScore });
}

// --- leaderboard -------------------------------------------------------------------

export interface LeaderboardEntry {
  rank: number;
  agentId: string;
  name: string;
  persona: string;
  house: boolean;
  cumulativeScore: number;
  fixturesScored: number;
  exact: number;
  spent: string;
  roi: number;
  preferBroker: boolean;
  avatar?: { style: string; seed: string };
  /** Points over the last 7 days. */
  week: number;
}

export function getLeaderboard(c: Competition): LeaderboardEntry[] {
  const poolId = poolIdOf(c);
  if (!poolId) return [];
  const agents = readAgents().filter((a) => a.poolId === poolId);
  const finals = finalsById();
  const predictions = readPredictions().filter((p) => p.poolId === poolId);
  const weekAgo = Date.now() - 7 * 24 * 3600 * 1000;

  const entries: ScoredEntry[] = [];
  const spentByAgent: Record<string, bigint> = {};
  const exact: Record<string, number> = {};
  const week: Record<string, number> = {};
  for (const a of agents) spentByAgent[a.agentId] = 0n;

  for (const p of predictions) {
    spentByAgent[p.agentId] = (spentByAgent[p.agentId] ?? 0n) + BigInt(p.spent);
    const f = finals.get(p.fixtureId);
    if (!f) continue;
    entries.push({
      agentId: p.agentId,
      fixtureId: p.fixtureId,
      pred: { homeScore: p.homeScore, awayScore: p.awayScore },
      actual: { homeScore: f.homeScore, awayScore: f.awayScore },
    });
    const pts = pointsFor(p, f) ?? 0;
    if (pts === 5) exact[p.agentId] = (exact[p.agentId] ?? 0) + 1;
    if (new Date(f.kickoff).getTime() > weekAgo) week[p.agentId] = (week[p.agentId] ?? 0) + pts;
  }

  const board = buildLeaderboard(buildScoreRows(entries), spentByAgent);
  // Agents with no scored fixture yet still appear, at the bottom.
  const seen = new Set(board.map((r) => r.agentId));
  for (const a of agents) {
    if (!seen.has(a.agentId)) {
      board.push({ agentId: a.agentId, cumulativeScore: 0, spent: (spentByAgent[a.agentId] ?? 0n).toString(), roi: 0, fixturesScored: 0 });
    }
  }
  const byId = new Map(agents.map((a) => [a.agentId, a]));
  return board.map((r, i) => {
    const a = byId.get(r.agentId);
    return {
      rank: i + 1,
      agentId: r.agentId,
      name: a?.template.name ?? `Agent ${r.agentId}`,
      persona: a?.template.persona ?? "",
      house: Boolean(a?.house),
      cumulativeScore: r.cumulativeScore,
      fixturesScored: r.fixturesScored,
      exact: exact[r.agentId] ?? 0,
      spent: r.spent,
      roi: r.roi,
      preferBroker: a?.template.dataPreference.preferBroker ?? false,
      avatar: a?.avatar,
      week: week[r.agentId] ?? 0,
    };
  });
}

// --- stats (all leagues) ------------------------------------------------------------

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
  scoredPredictions: number;
  broker: ReturnType<typeof brokerRevenue>;
  bySource: { source: EvidenceSource; count: number; spent: string }[];
}

export function getStats(): PoolStats {
  const agents = readAgents();
  const predictions = readPredictions();
  const purchases = readPurchases();
  const finals = finalsById();

  const totalSpent = purchases.reduce((s, p) => s + BigInt(p.priceUSDC), 0n);
  const allocated = agents.reduce((s, a) => s + BigInt(a.template.budget), 0n);
  let correct = 0;
  let scored = 0;
  for (const p of predictions) {
    const pts = pointsFor(p, finals.get(p.fixtureId));
    if (pts === null) continue;
    scored++;
    if (pts > 0) correct++;
  }
  const bySource = (["form", "odds", "table", "h2h"] as EvidenceSource[]).map((source) => {
    const mine = purchases.filter((p) => p.source === source);
    return { source, count: mine.length, spent: mine.reduce((s, p) => s + BigInt(p.priceUSDC), 0n).toString() };
  });

  return {
    agentsRegistered: agents.length,
    uniqueOwners: new Set(agents.filter((a) => !a.house).map((a) => a.owner.toLowerCase())).size,
    predictionsMade: predictions.length,
    totalPayments: purchases.length,
    totalDataSpent: totalSpent.toString(),
    avgTxSize: (purchases.length ? totalSpent / BigInt(purchases.length) : 0n).toString(),
    budgetUtilization: allocated > 0n ? Number(totalSpent) / Number(allocated) : 0,
    costPerTask: (correct > 0 ? totalSpent / BigInt(correct) : 0n).toString(),
    correctPredictions: correct,
    scoredPredictions: scored,
    broker: brokerRevenue(),
    bySource,
  };
}

// --- activity ticker ---------------------------------------------------------------

export interface ActivityItem {
  kind: "buy" | "predict";
  agentId: string;
  agentName: string;
  league: string;
  avatar?: { style: string; seed: string };
  text: string;
  detail: string;
  at: string;
}

/** Recent autonomous activity (evidence buys + predictions) across all leagues. Newest first. */
export function getActivity(limit = 24): ActivityItem[] {
  const agents = new Map(readAgents().map((a) => [a.agentId, a]));
  const fixtures = new Map(allFixtures().map((f) => [f.id, f]));
  const items: ActivityItem[] = [];
  const league = (a: StoredAgent) => competitionOfAgent(a)?.short ?? "";

  for (const p of readPurchases().slice(-200)) {
    const a = agents.get(p.agentId);
    if (!a) continue;
    items.push({
      kind: "buy",
      agentId: p.agentId,
      agentName: a.template.name,
      league: league(a),
      avatar: a.avatar,
      text: `bought ${p.source}`,
      detail: `$${(Number(BigInt(p.priceUSDC)) / 1_000_000).toFixed(3)}`,
      at: p.createdAt,
    });
  }
  for (const p of readPredictions().slice(-200)) {
    const a = agents.get(p.agentId);
    if (!a) continue;
    const fx = fixtures.get(p.fixtureId);
    items.push({
      kind: "predict",
      agentId: p.agentId,
      agentName: a.template.name,
      league: league(a),
      avatar: a.avatar,
      text: "predicted",
      detail: fx ? `${fx.home} ${p.homeScore}–${p.awayScore} ${fx.away}` : `${p.homeScore}–${p.awayScore}`,
      at: p.createdAt,
    });
  }
  return items.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}

/** The agent-to-agent payment network: which agents route through the broker, its catalog, sales. */
export function getBrokerNetwork() {
  const agents = readAgents();
  const catalog = brokerCatalog();
  const brief = (a: StoredAgent) => ({ id: a.agentId, name: a.template.name, avatar: a.avatar });
  return {
    markupBps: catalog.markupBps,
    brokerAgents: agents.filter((a) => a.template.dataPreference.preferBroker).map(brief),
    directAgents: agents.filter((a) => !a.template.dataPreference.preferBroker).map(brief),
    catalog: catalog.sources,
    revenue: brokerRevenue(),
  };
}

// --- my agents -----------------------------------------------------------------------

export interface MyAgent {
  agentId: string;
  name: string;
  league: string;
  leagueKey?: CompetitionKey;
  avatar?: { style: string; seed: string };
  onChainAgentId?: string;
  walletAddress: string;
  riskAppetite: string;
  preferBroker: boolean;
  budgetUSDC: string;
  willingnessToPay: Partial<Record<EvidenceSource, string>>;
  persona: string;
  prompt: string;
  score: number;
  fixturesScored: number;
  predictions: number;
  spent: string;
  roi: number;
  provisioned: boolean;
}

/** The connected owner's agents across every league, with live progress + editable strategy. */
export function getMyAgents(owner: string): MyAgent[] {
  const lower = owner.toLowerCase();
  const agents = readAgents().filter((a) => !a.house && (a.owner || "").toLowerCase() === lower);
  const finals = finalsById();
  const preds = readPredictions();
  const purchases = readPurchases();

  return agents.map((a) => {
    const mine = preds.filter((p) => p.agentId === a.agentId);
    let score = 0;
    let scored = 0;
    for (const p of mine) {
      const pts = pointsFor(p, finals.get(p.fixtureId));
      if (pts !== null) {
        score += pts;
        scored++;
      }
    }
    const spent = purchases.filter((p) => p.agentId === a.agentId).reduce((s, p) => s + BigInt(p.priceUSDC), 0n);
    const roi = spent > 0n ? score / (Number(spent) / 1_000_000) : score > 0 ? Infinity : 0;
    const comp = competitionOfAgent(a);
    return {
      agentId: a.agentId,
      name: a.template.name,
      league: comp?.name ?? "",
      leagueKey: comp?.key,
      avatar: a.avatar,
      onChainAgentId: a.onChainAgentId,
      walletAddress: a.walletAddress,
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

// --- settlements ---------------------------------------------------------------------

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

/** Recent x402 purchases with their Gateway settlement receipts (for the proof panel). */
export function getSettlements(limit = 12): SettlementSummary {
  const reconciled = new Map(readSettlements().map((s) => [s.uuid, s]));
  const agents = new Map(readAgents().map((a) => [a.agentId, a]));
  const purchases = readPurchases().filter((p) => p.settlementUuid).slice(-limit).reverse();
  const rows: SettlementTrace[] = purchases.map((p) => {
    const s = reconciled.get(p.settlementUuid);
    return {
      uuid: p.settlementUuid,
      status: s?.status ?? "accepted",
      agentName: agents.get(p.agentId)?.template.name ?? "agent",
      source: p.source,
      fromAddress: s?.fromAddress ?? agents.get(p.agentId)?.walletAddress ?? null,
      toAddress: s?.toAddress ?? null,
      amountUSDC: s?.amount ?? p.priceUSDC, // atomic units
      onArc: true,
      settledAt: s?.settledAt ?? p.createdAt,
      batchTxHash: s?.batchTxHash ?? p.batchTxHash,
    };
  });
  const total = readPurchases().filter((p) => p.settlementUuid).length;
  return { total, completed: [...reconciled.values()].filter((s) => s.status === "completed").length, rows };
}

// --- pool view -----------------------------------------------------------------------

export interface FixturePick {
  agentId: string;
  name: string;
  avatar?: { style: string; seed: string };
  homeScore: number;
  awayScore: number;
  confidence: number;
  points: number | null;
  bought: EvidenceSource[];
}

export interface FixtureRow extends Fixture {
  picks: FixturePick[];
}

export interface PoolView {
  competition: Competition;
  poolId?: string;
  info: PoolInfo | null;
  entrants: StoredAgent[];
  upcoming: FixtureRow[];
  results: FixtureRow[];
  live: FixtureRow[];
}

function withPicks(fixtures: Fixture[], preds: StoredPrediction[], agents: Map<string, StoredAgent>): FixtureRow[] {
  const byFixture = new Map<string, StoredPrediction[]>();
  for (const p of preds) {
    const list = byFixture.get(p.fixtureId) ?? [];
    list.push(p);
    byFixture.set(p.fixtureId, list);
  }
  return fixtures.map((f) => ({
    ...f,
    picks: (byFixture.get(f.id) ?? []).map((p) => {
      const a = agents.get(p.agentId);
      return {
        agentId: p.agentId,
        name: a?.template.name ?? p.agentId,
        avatar: a?.avatar,
        homeScore: p.homeScore,
        awayScore: p.awayScore,
        confidence: p.confidence,
        points: isFinal(f) ? pointsFor(p, f) : null,
        bought: (p.decisions ?? []).filter((d) => d.decision === "buy").map((d) => d.source),
      };
    }),
  }));
}

export async function getPoolView(c: Competition): Promise<PoolView> {
  const poolId = poolIdOf(c);
  const agents = readAgents();
  const entrants = poolId ? agents.filter((a) => a.poolId === poolId) : [];
  const preds = poolId ? readPredictions().filter((p) => p.poolId === poolId) : [];
  const byId = new Map(agents.map((a) => [a.agentId, a]));
  const all = seasonFixtures(c);
  const now = Date.now();
  const upcoming = all
    .filter((f) => f.status === "scheduled" && !f.postponed && new Date(f.kickoff).getTime() > now - 3 * 3600_000)
    .sort((a, b) => a.kickoff.localeCompare(b.kickoff))
    .slice(0, 20);
  const live = all.filter((f) => f.status === "in_play");
  const results = all
    .filter(isFinal)
    .sort((a, b) => b.kickoff.localeCompare(a.kickoff))
    .slice(0, 20);
  return {
    competition: c,
    poolId,
    info: await readPoolInfo(poolId),
    entrants,
    upcoming: withPicks(upcoming, preds, byId),
    live: withPicks(live, preds, byId),
    results: withPicks(results, preds, byId),
  };
}

/** Summary card per league for the home page. */
export async function getLeagueCards() {
  return Promise.all(
    COMPETITIONS.map(async (c) => {
      const poolId = poolIdOf(c);
      const board = getLeaderboard(c);
      const next = seasonFixtures(c)
        .filter((f) => f.status === "scheduled" && !f.postponed && new Date(f.kickoff).getTime() > Date.now())
        .sort((a, b) => a.kickoff.localeCompare(b.kickoff))[0];
      return {
        competition: c,
        poolId,
        info: await readPoolInfo(poolId),
        leader: board[0] && board[0].fixturesScored > 0 ? board[0] : null,
        entrants: board.length,
        next: next ?? null,
      };
    }),
  );
}

// --- agent page ------------------------------------------------------------------------

export function getAgentView(agentId: string) {
  const agent = readAgents().find((a) => a.agentId === agentId);
  if (!agent) return null;
  const finals = finalsById();
  const fixtures = new Map(allFixtures().map((f) => [f.id, f]));
  const preds = readPredictions()
    .filter((p) => p.agentId === agentId)
    .sort((a, b) => (fixtures.get(b.fixtureId)?.kickoff ?? "").localeCompare(fixtures.get(a.fixtureId)?.kickoff ?? ""));
  const spent = preds.reduce((s, p) => s + BigInt(p.spent), 0n);
  let points = 0;
  let scored = 0;
  let exact = 0;
  const rows = preds.map((p) => {
    const f = fixtures.get(p.fixtureId);
    const pts = pointsFor(p, finals.get(p.fixtureId));
    if (pts !== null) {
      points += pts;
      scored++;
      if (pts === 5) exact++;
    }
    return { prediction: p, fixture: f, points: pts };
  });
  return {
    agent,
    competition: competitionOfAgent(agent),
    rows,
    spent,
    points,
    scored,
    exact,
  };
}

/** The worker's heartbeat (last tick, recent log) for the stats page. */
export function getWorkerStatus() {
  const s = readJsonFile<{ lastTickAt?: string; lastSyncAt?: string; lastError?: string; log: { at: string; msg: string }[] }>(
    "worker.json",
    { log: [] },
  );
  const healthy = Boolean(s.lastTickAt && Date.now() - new Date(s.lastTickAt).getTime() < 20 * 60 * 1000);
  return { ...s, healthy };
}
