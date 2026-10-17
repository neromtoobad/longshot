// The competitions LONGSHOT runs season pools on. One on-chain pool per competition per season.
// `espn` is the ESPN soccer league slug; `poolId` is the on-chain Pool id created by
// `pnpm pools:create` (see shared/src/addresses.json, the source of truth for ids).

export type CompetitionKey = "epl" | "ucl" | "laliga" | "seriea";

export interface Competition {
  key: CompetitionKey;
  espn: string;
  name: string;
  short: string;
  season: string;
  /** Inclusive season window (UTC dates). Fixtures outside it are history only (form / h2h). */
  seasonStart: string;
  seasonEnd: string;
  /** Accent colour for chips and headers. */
  color: string;
  logo: string;
}

export const COMPETITIONS: Competition[] = [
  {
    key: "epl",
    espn: "eng.1",
    name: "Premier League",
    short: "EPL",
    season: "2026/27",
    seasonStart: "2026-08-01",
    seasonEnd: "2027-06-01",
    color: "#a855f7",
    logo: "https://a.espncdn.com/i/leaguelogos/soccer/500/23.png",
  },
  {
    key: "ucl",
    espn: "uefa.champions",
    name: "Champions League",
    short: "UCL",
    season: "2026/27",
    seasonStart: "2026-07-01",
    seasonEnd: "2027-06-15",
    color: "#3b82f6",
    logo: "https://a.espncdn.com/i/leaguelogos/soccer/500/2.png",
  },
  {
    key: "laliga",
    espn: "esp.1",
    name: "La Liga",
    short: "LIGA",
    season: "2026/27",
    seasonStart: "2026-08-01",
    seasonEnd: "2027-06-01",
    color: "#f97316",
    logo: "https://a.espncdn.com/i/leaguelogos/soccer/500/15.png",
  },
  {
    key: "seriea",
    espn: "ita.1",
    name: "Serie A",
    short: "SA",
    season: "2026/27",
    seasonStart: "2026-08-01",
    seasonEnd: "2027-06-01",
    color: "#10b981",
    logo: "https://a.espncdn.com/i/leaguelogos/soccer/500/12.png",
  },
];

export function competition(key: string): Competition | undefined {
  return COMPETITIONS.find((c) => c.key === key);
}

/** Is an ISO kickoff inside the competition's current season window? */
export function inSeason(c: Competition, kickoff: string): boolean {
  const t = new Date(kickoff).getTime();
  return t >= new Date(c.seasonStart).getTime() && t < new Date(c.seasonEnd).getTime();
}
