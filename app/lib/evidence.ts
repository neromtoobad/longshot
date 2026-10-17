// Evidence payloads, all real. Each one comes from ESPN's per-match summary (cached a few minutes
// per fixture), with the stored results history as a fallback for form and head-to-head:
//   form  = each side's last five matches (any competition) with goals
//   odds  = bookmaker 1X2 moneylines + over/under, converted to fair (vig-free) probabilities
//   table = both clubs' league position, points per game, goal difference
//   h2h   = the last meetings between the two clubs
// `availability()` lets the catalog tell agents what can actually be served for a fixture, so an
// agent never pays for an empty answer.

import { competition, fetchMatchSummary, type EvidenceSource, type Fixture } from "@longshot/shared";
import { allFixtures } from "./fixtures-store";

type Obj = Record<string, unknown>;

const TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, { at: number; data: Obj | null }>();

function fixtureById(id: string): Fixture | undefined {
  return allFixtures().find((f) => f.id === id);
}

async function summary(f: Fixture): Promise<Obj | null> {
  const hit = cache.get(f.id);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data;
  const comp = competition(f.competition);
  let data: Obj | null = null;
  if (comp) {
    try {
      data = await fetchMatchSummary(comp.espn, f.id);
    } catch {
      data = null;
    }
  }
  cache.set(f.id, { at: Date.now(), data });
  return data;
}

function num(x: unknown): number | null {
  const n = typeof x === "number" ? x : Number(x);
  return Number.isFinite(n) ? n : null;
}

function meta(f: Fixture, source: EvidenceSource) {
  return {
    fixtureId: f.id,
    fixture: `${f.home} vs ${f.away}`,
    kickoff: f.kickoff,
    source,
    basis: "espn",
    generatedAt: new Date().toISOString(),
  };
}

/** ESPN team ids for the home and away side, from the summary header. */
function teamIds(s: Obj): { home?: string; away?: string } {
  const comps = ((s.header as Obj)?.competitions as Obj[] | undefined)?.[0]?.competitors as Obj[] | undefined;
  const id = (side: string) => String((comps?.find((c) => c.homeAway === side) as Obj | undefined)?.id ?? "");
  return { home: id("home") || undefined, away: id("away") || undefined };
}

// --- history helpers (stored results) -----------------------------------------

type Final = Fixture & { homeScore: number; awayScore: number };
const isFinal = (f: Fixture): f is Final => f.status === "final" && f.homeScore !== null && f.awayScore !== null;

function historyForm(team: string, beforeMs: number) {
  const last = allFixtures()
    .filter(isFinal)
    .filter((f) => (f.home === team || f.away === team) && new Date(f.kickoff).getTime() < beforeMs)
    .sort((a, b) => b.kickoff.localeCompare(a.kickoff))
    .slice(0, 5);
  if (!last.length) return null;
  let goalsFor = 0;
  let goalsAgainst = 0;
  const results = last.map((f) => {
    const gf = f.home === team ? f.homeScore : f.awayScore;
    const ga = f.home === team ? f.awayScore : f.homeScore;
    goalsFor += gf;
    goalsAgainst += ga;
    return { result: gf > ga ? "W" : gf === ga ? "D" : "L", score: `${gf}-${ga}`, opponent: f.home === team ? f.away : f.home };
  });
  return { last5: results.map((r) => r.result), results, goalsFor, goalsAgainst, played: last.length };
}

// --- form ----------------------------------------------------------------------

function summaryForm(s: Obj, teamId: string | undefined) {
  if (!teamId) return null;
  const block = (s.lastFiveGames as Obj[] | undefined)?.find((b) => String((b.team as Obj)?.id) === teamId);
  const events = (block?.events as Obj[] | undefined) ?? [];
  if (!events.length) return null;
  let goalsFor = 0;
  let goalsAgainst = 0;
  const results = events.slice(0, 5).map((e) => {
    const home = String(e.homeTeamId) === teamId;
    const gf = num(home ? e.homeTeamScore : e.awayTeamScore) ?? 0;
    const ga = num(home ? e.awayTeamScore : e.homeTeamScore) ?? 0;
    goalsFor += gf;
    goalsAgainst += ga;
    return {
      result: String(e.gameResult ?? (gf > ga ? "W" : gf === ga ? "D" : "L")),
      score: `${gf}-${ga}`,
      opponent: String((e.opponent as Obj)?.displayName ?? ""),
      competition: String(e.leagueAbbreviation ?? e.leagueName ?? ""),
    };
  });
  return { last5: results.map((r) => r.result), results, goalsFor, goalsAgainst, played: results.length };
}

async function formEvidence(f: Fixture) {
  const s = await summary(f);
  const ids = s ? teamIds(s) : {};
  const before = new Date(f.kickoff).getTime();
  const home = (s && summaryForm(s, ids.home)) ?? historyForm(f.home, before);
  const away = (s && summaryForm(s, ids.away)) ?? historyForm(f.away, before);
  if (!home || !away) return null;
  return { ...meta(f, "form"), home, away };
}

// --- odds ----------------------------------------------------------------------

function impliedFromAmerican(ml: number): number {
  return ml > 0 ? 100 / (ml + 100) : -ml / (-ml + 100);
}

async function oddsEvidence(f: Fixture) {
  const s = await summary(f);
  const o = ((s?.odds as Obj[] | undefined) ?? (s?.pickcenter as Obj[] | undefined) ?? [])[0] as Obj | undefined;
  const mlHome = num((o?.homeTeamOdds as Obj | undefined)?.moneyLine);
  const mlAway = num((o?.awayTeamOdds as Obj | undefined)?.moneyLine);
  const mlDraw = num((o?.drawOdds as Obj | undefined)?.moneyLine);
  if (mlHome === null || mlAway === null || mlDraw === null) return null;
  const raw = { home: impliedFromAmerican(mlHome), draw: impliedFromAmerican(mlDraw), away: impliedFromAmerican(mlAway) };
  const book = raw.home + raw.draw + raw.away;
  const line = num(o?.overUnder);
  const over = num(o?.overOdds);
  const under = num(o?.underOdds);
  let totals: Obj | undefined;
  if (line !== null && over !== null && under !== null) {
    const po = impliedFromAmerican(over);
    const pu = impliedFromAmerican(under);
    totals = { line, overProbability: +(po / (po + pu)).toFixed(3) };
  }
  return {
    ...meta(f, "odds"),
    provider: String((o?.provider as Obj | undefined)?.name ?? "bookmaker"),
    moneyline: { home: mlHome, draw: mlDraw, away: mlAway },
    impliedProbabilities: {
      home: +(raw.home / book).toFixed(3),
      draw: +(raw.draw / book).toFixed(3),
      away: +(raw.away / book).toFixed(3),
    },
    overround: +(book - 1).toFixed(3),
    ...(totals ? { totals } : {}),
  };
}

// --- table ---------------------------------------------------------------------

function tableRow(entries: Obj[], teamId: string | undefined, name: string) {
  const e = entries.find((x) => (teamId && String(x.id) === teamId) || x.team === name);
  if (!e) return null;
  const stats: Record<string, number> = {};
  for (const st of (e.stats as Obj[] | undefined) ?? []) {
    const v = num(st.value);
    if (v !== null) stats[String(st.name)] = v;
  }
  const played = stats.gamesPlayed ?? 0;
  return {
    team: String(e.team ?? name),
    position: stats.rank ?? null,
    played,
    won: stats.wins ?? null,
    drawn: stats.ties ?? null,
    lost: stats.losses ?? null,
    goalDifference: stats.pointDifferential ?? null,
    points: stats.points ?? null,
    pointsPerGame: played > 0 && stats.points !== undefined ? +(stats.points / played).toFixed(2) : null,
  };
}

async function tableEvidence(f: Fixture) {
  const s = await summary(f);
  const groups = ((s?.standings as Obj | undefined)?.groups as Obj[] | undefined) ?? [];
  const ids = s ? teamIds(s) : {};
  for (const g of groups) {
    const entries = ((g.standings as Obj | undefined)?.entries as Obj[] | undefined) ?? [];
    const home = tableRow(entries, ids.home, f.home);
    const away = tableRow(entries, ids.away, f.away);
    if (home && away) {
      return { ...meta(f, "table"), group: String(g.header ?? ""), teams: entries.length, home, away };
    }
  }
  return null;
}

// --- head to head --------------------------------------------------------------

async function h2hEvidence(f: Fixture) {
  const s = await summary(f);
  const series = ((s?.seasonseries as Obj[] | undefined) ?? []).find((x) => x.type === "head-to-head");
  const meetings: { date: string; home: string; away: string; score: string }[] = [];
  for (const e of (series?.events as Obj[] | undefined) ?? []) {
    if (!((e.statusType as Obj | undefined)?.completed ?? (e.status as Obj | undefined)?.completed)) continue;
    const cs = (e.competitors as Obj[] | undefined) ?? [];
    const h = cs.find((c) => c.homeAway === "home");
    const a = cs.find((c) => c.homeAway === "away");
    if (!h || !a) continue;
    meetings.push({
      date: String(e.date ?? "").slice(0, 10),
      home: String((h.team as Obj | undefined)?.displayName ?? ""),
      away: String((a.team as Obj | undefined)?.displayName ?? ""),
      score: `${h.score}-${a.score}`,
    });
  }
  if (!meetings.length) {
    const before = new Date(f.kickoff).getTime();
    for (const m of allFixtures().filter(isFinal)) {
      if (m.id === f.id || new Date(m.kickoff).getTime() >= before) continue;
      if ((m.home === f.home && m.away === f.away) || (m.home === f.away && m.away === f.home)) {
        meetings.push({ date: m.kickoff.slice(0, 10), home: m.home, away: m.away, score: `${m.homeScore}-${m.awayScore}` });
      }
    }
    meetings.sort((x, y) => y.date.localeCompare(x.date));
  }
  if (!meetings.length) return null;
  let homeWins = 0;
  let draws = 0;
  let awayWins = 0;
  for (const m of meetings) {
    const [hs, as] = m.score.split("-").map(Number);
    const gf = m.home === f.home ? hs : as;
    const ga = m.home === f.home ? as : hs;
    if (gf > ga) homeWins++;
    else if (gf === ga) draws++;
    else awayWins++;
  }
  // homeWins / awayWins are from the perspective of today's home and away side.
  return { ...meta(f, "h2h"), meetings: meetings.length, homeWins, draws, awayWins, recent: meetings.slice(0, 5) };
}

// --- public ----------------------------------------------------------------------

const BUILDERS: Record<EvidenceSource, (f: Fixture) => Promise<Obj | null>> = {
  form: formEvidence,
  odds: oddsEvidence,
  table: tableEvidence,
  h2h: h2hEvidence,
};

/** Build one evidence payload. Null when the fixture is unknown or ESPN has nothing for it. */
export async function evidenceFor(source: EvidenceSource, fixtureId: string): Promise<Obj | null> {
  const f = fixtureById(fixtureId);
  if (!f) return null;
  return BUILDERS[source](f);
}

/** Which sources can be served for a fixture right now. */
export async function availability(fixtureId: string): Promise<Record<EvidenceSource, boolean>> {
  const f = fixtureById(fixtureId);
  const out = { form: false, odds: false, table: false, h2h: false } as Record<EvidenceSource, boolean>;
  if (!f) return out;
  await Promise.all(
    (Object.keys(BUILDERS) as EvidenceSource[]).map(async (s) => {
      out[s] = (await BUILDERS[s](f)) !== null;
    }),
  );
  return out;
}
