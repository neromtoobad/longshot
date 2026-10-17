// Built-in statistical model, used when no LLM key is configured (and as a fallback when the LLM
// call fails). It predicts from the evidence the agent actually bought, so buying data still
// changes the forecast:
//   odds  -> expected goals fitted to the bookmaker's 1X2 and over/under prices
//   form  -> goals for/against per game over the last five
//   table -> points-per-game gap from the league table
//   h2h   -> small nudge from past meetings
// Each signal gives (home xG, away xG); they are blended by weight and turned into a scoreline
// with an independent Poisson model.

import type { RiskAppetite } from "@longshot/shared";

export interface StatsPrediction {
  homeScore: number;
  awayScore: number;
  confidence: number;
  rationale: string;
}

type Xg = { h: number; a: number };
type Evidence = Record<string, unknown>;

const BASELINE: Xg = { h: 1.5, a: 1.2 };
const MAX_GOALS = 7;

function pois(k: number, lambda: number): number {
  let p = Math.exp(-lambda);
  for (let i = 1; i <= k; i++) p *= lambda / i;
  return p;
}

function grid(x: Xg): number[][] {
  const g: number[][] = [];
  for (let i = 0; i <= MAX_GOALS; i++) {
    g.push([]);
    for (let j = 0; j <= MAX_GOALS; j++) g[i].push(pois(i, x.h) * pois(j, x.a));
  }
  return g;
}

function outcomeProbs(g: number[][]) {
  let home = 0;
  let draw = 0;
  let away = 0;
  for (let i = 0; i <= MAX_GOALS; i++)
    for (let j = 0; j <= MAX_GOALS; j++) {
      if (i > j) home += g[i][j];
      else if (i === j) draw += g[i][j];
      else away += g[i][j];
    }
  return { home, draw, away };
}

function num(x: unknown): number | null {
  const n = typeof x === "number" ? x : Number(x);
  return Number.isFinite(n) ? n : null;
}

/** Fit (h, a) so the Poisson model reproduces the market's home-win prob and over-2.5 prob. */
function xgFromOdds(o: Evidence): Xg | null {
  const ip = o.impliedProbabilities as Evidence | undefined;
  const pHome = num(ip?.home);
  const pAway = num(ip?.away);
  if (pHome === null || pAway === null) return null;
  const pOver = num((o.totals as Evidence | undefined)?.overProbability);
  let best: Xg | null = null;
  let bestErr = Infinity;
  for (let total = 1.6; total <= 4.4; total += 0.05) {
    for (let share = 0.2; share <= 0.8; share += 0.01) {
      const x = { h: total * share, a: total * (1 - share) };
      const g = grid(x);
      const p = outcomeProbs(g);
      let err = (p.home - pHome) ** 2 + (p.away - pAway) ** 2;
      if (pOver !== null) {
        let under = 0;
        for (let i = 0; i <= 2; i++) for (let j = 0; i + j <= 2; j++) under += g[i][j];
        err += (1 - under - pOver) ** 2;
      }
      if (err < bestErr) {
        bestErr = err;
        best = x;
      }
    }
  }
  return best;
}

function xgFromForm(f: Evidence): Xg | null {
  const h = f.home as Evidence | undefined;
  const a = f.away as Evidence | undefined;
  const hp = num(h?.played) ?? 5;
  const ap = num(a?.played) ?? 5;
  const hgf = num(h?.goalsFor);
  const hga = num(h?.goalsAgainst);
  const agf = num(a?.goalsFor);
  const aga = num(a?.goalsAgainst);
  if (hgf === null || hga === null || agf === null || aga === null || hp === 0 || ap === 0) return null;
  return {
    h: Math.max(0.3, ((hgf / hp + aga / ap) / 2) * 1.1),
    a: Math.max(0.3, ((agf / ap + hga / hp) / 2) * 0.92),
  };
}

function xgFromTable(t: Evidence): Xg | null {
  const h = t.home as Evidence | undefined;
  const a = t.away as Evidence | undefined;
  const hppg = num(h?.pointsPerGame);
  const appg = num(a?.pointsPerGame);
  if (hppg === null || appg === null) return null;
  const gap = Math.max(-2, Math.min(2, hppg - appg)); // ppg gap, roughly -2..2
  return { h: Math.max(0.4, BASELINE.h + gap * 0.35), a: Math.max(0.3, BASELINE.a - gap * 0.3) };
}

function xgFromH2h(t: Evidence): Xg | null {
  const n = num(t.meetings);
  const hw = num(t.homeWins);
  const aw = num(t.awayWins);
  if (!n || hw === null || aw === null) return null;
  const tilt = ((hw - aw) / n) * 0.3;
  return { h: BASELINE.h + tilt, a: BASELINE.a - tilt };
}

const WEIGHTS = { odds: 0.6, form: 0.22, table: 0.13, h2h: 0.05 } as const;

export function statsPredict(args: {
  home: string;
  away: string;
  evidence: Partial<Record<string, unknown>>;
  riskAppetite: RiskAppetite;
}): StatsPrediction {
  const signals: { w: number; x: Xg; label: string }[] = [];
  const ev = args.evidence as Record<string, Evidence | undefined>;
  const odds = ev.odds && xgFromOdds(ev.odds);
  if (odds) signals.push({ w: WEIGHTS.odds, x: odds, label: "the market" });
  const form = ev.form && xgFromForm(ev.form);
  if (form) signals.push({ w: WEIGHTS.form, x: form, label: "recent form" });
  const table = ev.table && xgFromTable(ev.table);
  if (table) signals.push({ w: WEIGHTS.table, x: table, label: "the table" });
  const h2h = ev.h2h && xgFromH2h(ev.h2h);
  if (h2h) signals.push({ w: WEIGHTS.h2h, x: h2h, label: "head-to-head" });

  let x = BASELINE;
  if (signals.length) {
    const wsum = signals.reduce((s, v) => s + v.w, 0);
    x = {
      h: signals.reduce((s, v) => s + v.w * v.x.h, 0) / wsum,
      a: signals.reduce((s, v) => s + v.w * v.x.a, 0) / wsum,
    };
  }

  const g = grid(x);
  const p = outcomeProbs(g);
  const ranked = (
    [
      ["home", p.home],
      ["draw", p.draw],
      ["away", p.away],
    ] as const
  )
    .slice()
    .sort((a, b) => b[1] - a[1]);

  // High-risk agents take the second-likeliest outcome when it is close: that is the longshot.
  let pick: (typeof ranked)[number] = ranked[0];
  if (args.riskAppetite === "high" && ranked[0][1] - ranked[1][1] < 0.08) pick = ranked[1];

  let best = { i: 1, j: 1, p: -1 };
  for (let i = 0; i <= MAX_GOALS; i++)
    for (let j = 0; j <= MAX_GOALS; j++) {
      const ok = pick[0] === "home" ? i > j : pick[0] === "draw" ? i === j : i < j;
      if (ok && g[i][j] > best.p) best = { i, j, p: g[i][j] };
    }

  const who = pick[0] === "home" ? args.home : pick[0] === "away" ? args.away : "neither side";
  const basis = signals.length ? signals.map((s) => s.label).join(", ") : "league averages only (bought nothing)";
  const rationale =
    `Read from ${basis}: expected goals ${x.h.toFixed(2)}-${x.a.toFixed(2)}, ` +
    `${pick[0] === "draw" ? "a draw" : `${who} to win`} at ${Math.round(pick[1] * 100)}%. ` +
    `Likeliest scoreline in that outcome: ${best.i}-${best.j}.`;

  return { homeScore: best.i, awayScore: best.j, confidence: +pick[1].toFixed(2), rationale };
}
