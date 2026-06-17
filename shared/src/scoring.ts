// Scoring + ROI (BUILD_GUIDE section 3). Pure functions shared by the resolver, the leaderboard,
// and finalize. Points per fixture: exact score = 3, correct result (W/D/L) = 1, correct goal
// difference = 1 (they sum, so an exact prediction = 5). ROI = cumulative score / USDC spent on data
// — the metric that proves an agent reasons about cost vs value.

import type { Score, UsdcBaseUnits } from "./types.js";

export interface ScoreLine {
  homeScore: number;
  awayScore: number;
}

/** Points for one prediction vs the actual result. Max 5 (exact). */
export function scorePrediction(pred: ScoreLine, actual: ScoreLine): number {
  let points = 0;
  if (pred.homeScore === actual.homeScore && pred.awayScore === actual.awayScore) points += 3;
  const predDiff = pred.homeScore - pred.awayScore;
  const actualDiff = actual.homeScore - actual.awayScore;
  if (Math.sign(predDiff) === Math.sign(actualDiff)) points += 1; // correct W/D/L
  if (predDiff === actualDiff) points += 1; // correct goal difference
  return points;
}

/** ROI = cumulative score per USDC spent. Zero-spend: 0 if no score, else Infinity (free-data win). */
export function roi(cumulativeScore: number, spentBaseUnits: bigint): number {
  const usdc = Number(spentBaseUnits) / 1_000_000;
  if (usdc === 0) return cumulativeScore === 0 ? 0 : Number.POSITIVE_INFINITY;
  return cumulativeScore / usdc;
}

export interface ScoredEntry {
  agentId: string;
  fixtureId: string;
  pred: ScoreLine;
  actual: ScoreLine;
}

/** Per-(agent,fixture) Score rows with a running cumulative per agent (in input order). */
export function buildScoreRows(entries: ScoredEntry[]): Score[] {
  const cumulative: Record<string, number> = {};
  return entries.map((e) => {
    const points = scorePrediction(e.pred, e.actual);
    cumulative[e.agentId] = (cumulative[e.agentId] ?? 0) + points;
    return { agentId: e.agentId, fixtureId: e.fixtureId, points, cumulative: cumulative[e.agentId] };
  });
}

export interface LeaderboardRow {
  agentId: string;
  cumulativeScore: number;
  spent: UsdcBaseUnits;
  roi: number;
  fixturesScored: number;
}

/**
 * Rank agents by cumulative score (ties broken by ROI). The leaderboard reads this directly; the
 * ROI toggle re-sorts by `roi`; finalize reads `cumulativeScore` to rank for payout.
 */
export function buildLeaderboard(
  rows: Score[],
  spentByAgent: Record<string, bigint>,
): LeaderboardRow[] {
  const agg: Record<string, { score: number; count: number }> = {};
  for (const r of rows) {
    const a = (agg[r.agentId] ??= { score: 0, count: 0 });
    a.score += r.points;
    a.count += 1;
  }
  return Object.entries(agg)
    .map(([agentId, v]) => {
      const spent = spentByAgent[agentId] ?? 0n;
      return {
        agentId,
        cumulativeScore: v.score,
        spent: spent.toString(),
        roi: roi(v.score, spent),
        fixturesScored: v.count,
      };
    })
    .sort((a, b) => b.cumulativeScore - a.cumulativeScore || b.roi - a.roi);
}
