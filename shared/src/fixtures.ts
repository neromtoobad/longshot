// World Cup fixtures ingestion from ESPN (reuses CROSSFIRE's scoreboard pull). Real fixtures and
// real results — no synthetic data. Normalizes ESPN events to the BUILD_GUIDE §4 fixture model.

import type { Fixture, FixtureStatus } from "./types.js";

const SCOREBOARD = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard";

interface EspnCompetitor {
  homeAway?: string;
  team?: { displayName?: string; logo?: string };
  score?: string | number;
}
interface EspnCompetition {
  status?: { type?: { state?: string; completed?: boolean } };
  competitors?: EspnCompetitor[];
}
interface EspnEvent {
  id?: string;
  date?: string;
  competitions?: EspnCompetition[];
}

function toFixture(event: EspnEvent, poolId: string): Fixture | null {
  const comp = event.competitions?.[0];
  const competitors = comp?.competitors ?? [];
  const home = competitors.find((c) => c.homeAway === "home");
  const away = competitors.find((c) => c.homeAway === "away");
  const homeName = home?.team?.displayName;
  const awayName = away?.team?.displayName;
  if (!event.id || !homeName || !awayName) return null;

  const type = comp?.status?.type;
  const status: FixtureStatus = type?.completed ? "final" : type?.state === "in" ? "in_play" : "scheduled";
  const scored = status !== "scheduled";

  return {
    id: event.id,
    poolId,
    home: homeName,
    away: awayName,
    homeLogo: home?.team?.logo ?? null,
    awayLogo: away?.team?.logo ?? null,
    kickoff: event.date ?? "",
    status,
    homeScore: scored ? Number(home?.score ?? 0) : null,
    awayScore: scored ? Number(away?.score ?? 0) : null,
  };
}

export interface FetchFixturesOptions {
  poolId: string;
  /** Inclusive date range, YYYYMMDD. ESPN accepts dates=START-END. */
  start: string;
  end: string;
  signal?: AbortSignal;
}

/** Pull the World Cup scoreboard for a date range and normalize to fixtures (upcoming + results). */
export async function fetchWorldCupFixtures(opts: FetchFixturesOptions): Promise<Fixture[]> {
  const res = await fetch(`${SCOREBOARD}?dates=${opts.start}-${opts.end}`, {
    headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
    signal: opts.signal ?? AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`ESPN scoreboard ${res.status}`);
  const page = (await res.json()) as { events?: EspnEvent[] };
  const fixtures: Fixture[] = [];
  for (const event of page.events ?? []) {
    const fixture = toFixture(event, opts.poolId);
    if (fixture) fixtures.push(fixture);
  }
  return fixtures;
}
