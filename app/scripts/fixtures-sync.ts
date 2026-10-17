// Pull this season's fixtures (plus last year's results for form and head-to-head) for every league
// from ESPN into the data dir. The worker does this on every tick; this is for local dev.
// Run: pnpm fixtures:sync

import { COMPETITIONS, fetchLeagueFixtures, poolFor, type Fixture } from "@longshot/shared";
import { saveFixtures } from "../lib/fixtures-store";

const year = new Date().getUTCFullYear();
const all: Fixture[] = [];
for (const c of COMPETITIONS) {
  const pool = poolFor(c.key);
  const list = await fetchLeagueFixtures({ competition: c, poolId: pool ? String(pool.poolId) : "", years: [year - 1, year, year + 1] });
  const upcoming = list.filter((f) => f.status === "scheduled" && new Date(f.kickoff).getTime() > Date.now());
  console.log(`${c.name.padEnd(17)} ${String(list.length).padStart(4)} fixtures · next: ${upcoming[0] ? `${upcoming[0].home} vs ${upcoming[0].away} ${upcoming[0].kickoff}` : "—"}`);
  all.push(...list);
}
saveFixtures(all.sort((a, b) => a.kickoff.localeCompare(b.kickoff)));
console.log(`saved ${all.length} fixtures`);
