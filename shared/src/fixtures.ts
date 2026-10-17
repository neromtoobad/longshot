// Fixture ingestion from ESPN's public soccer scoreboard. Real fixtures and real results, no
// synthetic data. Normalizes ESPN events to the fixture model.
//
// ESPN no longer accepts `dates=START-END` ranges for these leagues (400). It does accept a whole
// year (`dates=2026&limit=1000`) or a month (`dates=202610`), so a season is two year pulls.

import type { Fixture, FixtureStatus } from "./types.js";
import type { Competition } from "./leagues.js";

const BASE = "https://site.api.espn.com/apis/site/v2/sports/soccer";

interface EspnCompetitor {
  homeAway?: string;
  team?: { displayName?: string; logo?: string };
  score?: string | number;
}
interface EspnCompetition {
  status?: { type?: { state?: string; completed?: boolean; name?: string } };
  competitors?: EspnCompetitor[];
}
interface EspnEvent {
  id?: string;
  date?: string;
  competitions?: EspnCompetition[];
}

function toFixture(event: EspnEvent, comp: Competition, poolId: string): Fixture | null {
  const c = event.competitions?.[0];
  const competitors = c?.competitors ?? [];
  const home = competitors.find((x) => x.homeAway === "home");
  const away = competitors.find((x) => x.homeAway === "away");
  const homeName = home?.team?.displayName;
  const awayName = away?.team?.displayName;
  if (!event.id || !homeName || !awayName) return null;

  const type = c?.status?.type;
  // Postponed / cancelled matches stay "scheduled" with no score; they never resolve.
  const postponed = /POSTPONED|CANCELED|CANCELLED|ABANDONED/.test(type?.name ?? "");
  const status: FixtureStatus = postponed
    ? "scheduled"
    : type?.completed
      ? "final"
      : type?.state === "in"
        ? "in_play"
        : "scheduled";
  const scored = status !== "scheduled";

  return {
    id: event.id,
    poolId,
    competition: comp.key,
    home: homeName,
    away: awayName,
    homeLogo: home?.team?.logo ?? null,
    awayLogo: away?.team?.logo ?? null,
    kickoff: event.date ?? "",
    status,
    postponed: postponed || undefined,
    homeScore: scored ? Number(home?.score ?? 0) : null,
    awayScore: scored ? Number(away?.score ?? 0) : null,
  };
}

async function getJson(url: string, signal?: AbortSignal): Promise<{ events?: EspnEvent[] }> {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
    signal: signal ?? AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`ESPN ${res.status} for ${url}`);
  return (await res.json()) as { events?: EspnEvent[] };
}

export interface FetchLeagueOptions {
  competition: Competition;
  poolId: string;
  /** Calendar years to pull, e.g. [2026, 2027]. Older years feed form and head-to-head. */
  years: number[];
  signal?: AbortSignal;
}

/** Pull every fixture (upcoming and results) for a competition across whole calendar years. */
export async function fetchLeagueFixtures(opts: FetchLeagueOptions): Promise<Fixture[]> {
  const out = new Map<string, Fixture>();
  for (const year of opts.years) {
    const page = await getJson(
      `${BASE}/${opts.competition.espn}/scoreboard?dates=${year}&limit=1000`,
      opts.signal,
    );
    for (const event of page.events ?? []) {
      const f = toFixture(event, opts.competition, opts.poolId);
      if (f) out.set(f.id, f);
    }
  }
  return [...out.values()].sort((a, b) => a.kickoff.localeCompare(b.kickoff));
}

/** ESPN's per-match summary (odds, standings, last five, season series). Server-side only. */
export async function fetchMatchSummary(
  espnLeague: string,
  eventId: string,
  signal?: AbortSignal,
): Promise<Record<string, unknown>> {
  const res = await fetch(`${BASE}/${espnLeague}/summary?event=${eventId}`, {
    headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
    signal: signal ?? AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`ESPN summary ${res.status} for ${eventId}`);
  return (await res.json()) as Record<string, unknown>;
}
