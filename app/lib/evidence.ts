// Evidence payloads. `form` and `h2h` are derived from REAL ESPN results in the fixture store
// (every World Cup match we ingested). `odds` and `injuries` have no free real feed on testnet, so
// they are modeled deterministically per fixture and labelled as such. Each payload carries a
// `basis` so the buyer (and judges) can see real-results vs modeled.

import type { Fixture } from "@longshot/shared";
import { allFixtures } from "./fixtures-store";

export type EvidenceBasis = "real-results" | "modeled";

export interface EvidenceMeta {
  fixtureId: string;
  source: "form" | "odds" | "injuries" | "h2h";
  basis: EvidenceBasis;
  /** true only when the data is modeled (no real feed) rather than derived from real results. */
  placeholder: boolean;
  generatedAt: string;
}

function seed(fixtureId: string): number {
  let h = 0;
  for (let i = 0; i < fixtureId.length; i++) h = (h * 31 + fixtureId.charCodeAt(i)) >>> 0;
  return h;
}

function meta(fixtureId: string, source: EvidenceMeta["source"], basis: EvidenceBasis): EvidenceMeta {
  return { fixtureId, source, basis, placeholder: basis === "modeled", generatedAt: new Date().toISOString() };
}

// --- real-results helpers --------------------------------------------------

function fixtureById(id: string): Fixture | undefined {
  return allFixtures().find((f) => f.id === id);
}

function isFinal(f: Fixture): f is Fixture & { homeScore: number; awayScore: number } {
  return f.status === "final" && f.homeScore !== null && f.awayScore !== null;
}

/** A team's finished matches before `beforeMs`, newest first. */
function teamFinals(team: string, beforeMs: number): (Fixture & { homeScore: number; awayScore: number })[] {
  return allFixtures()
    .filter(isFinal)
    .filter((f) => (f.home === team || f.away === team) && new Date(f.kickoff).getTime() < beforeMs)
    .sort((a, b) => new Date(b.kickoff).getTime() - new Date(a.kickoff).getTime());
}

/** result of `team` in a finished fixture, from its own perspective. */
function teamResult(team: string, f: Fixture & { homeScore: number; awayScore: number }) {
  const gf = f.home === team ? f.homeScore : f.awayScore;
  const ga = f.home === team ? f.awayScore : f.homeScore;
  return { gf, ga, r: gf > ga ? "W" : gf === ga ? "D" : "L" };
}

function teamForm(team: string, beforeMs: number) {
  const last = teamFinals(team, beforeMs).slice(0, 5);
  if (last.length === 0) return null;
  let goalsFor = 0;
  let goalsAgainst = 0;
  const last5 = last.map((f) => {
    const { gf, ga, r } = teamResult(team, f);
    goalsFor += gf;
    goalsAgainst += ga;
    return r;
  });
  return { last5, goalsFor, goalsAgainst, played: last.length };
}

// --- evidence sources ------------------------------------------------------

export function formEvidence(fixtureId: string) {
  const fx = fixtureById(fixtureId);
  if (fx) {
    const before = new Date(fx.kickoff).getTime();
    const home = teamForm(fx.home, before);
    const away = teamForm(fx.away, before);
    if (home && away) {
      return { ...meta(fixtureId, "form", "real-results"), home, away };
    }
  }
  // fallback: modeled (e.g. a team with no prior finished matches)
  const s = seed(fixtureId);
  const f = (n: number) => ["W", "D", "L"][(s >> n) % 3];
  return {
    ...meta(fixtureId, "form", "modeled"),
    home: { last5: [f(0), f(2), f(4), f(6), f(8)], goalsFor: 6 + (s % 7), goalsAgainst: 3 + (s % 5) },
    away: { last5: [f(1), f(3), f(5), f(7), f(9)], goalsFor: 5 + (s % 6), goalsAgainst: 4 + (s % 4) },
  };
}

export function h2hEvidence(fixtureId: string) {
  const fx = fixtureById(fixtureId);
  if (fx) {
    const before = new Date(fx.kickoff).getTime();
    const meetings = allFixtures()
      .filter(isFinal)
      .filter(
        (f) =>
          f.id !== fixtureId &&
          new Date(f.kickoff).getTime() < before &&
          ((f.home === fx.home && f.away === fx.away) || (f.home === fx.away && f.away === fx.home)),
      );
    if (meetings.length > 0) {
      let homeWins = 0;
      let draws = 0;
      let awayWins = 0;
      for (const m of meetings) {
        const { r } = teamResult(fx.home, m); // from the current home team's perspective
        if (r === "W") homeWins++;
        else if (r === "D") draws++;
        else awayWins++;
      }
      return { ...meta(fixtureId, "h2h", "real-results"), meetings: meetings.length, homeWins, draws, awayWins };
    }
  }
  // fallback: modeled (first-ever meeting, no prior results)
  const s = seed(fixtureId);
  return {
    ...meta(fixtureId, "h2h", "modeled"),
    meetings: 5 + (s % 6),
    homeWins: s % 5,
    draws: (s >> 2) % 4,
    awayWins: (s >> 4) % 5,
  };
}

// odds + injuries: no free real feed on testnet, so these are modeled per fixture (labelled "modeled").

export function oddsEvidence(fixtureId: string) {
  const s = seed(fixtureId);
  const home = 0.3 + (s % 35) / 100;
  const draw = 0.25 + (s % 15) / 100;
  const away = Math.max(0.05, 1 - home - draw);
  const norm = home + draw + away;
  return {
    ...meta(fixtureId, "odds", "modeled"),
    impliedProbabilities: {
      home: +(home / norm).toFixed(3),
      draw: +(draw / norm).toFixed(3),
      away: +(away / norm).toFixed(3),
    },
  };
}

export function injuriesEvidence(fixtureId: string) {
  const s = seed(fixtureId);
  return {
    ...meta(fixtureId, "injuries", "modeled"),
    home: { out: s % 4, doubtful: (s >> 2) % 3 },
    away: { out: (s >> 3) % 4, doubtful: (s >> 5) % 3 },
  };
}
