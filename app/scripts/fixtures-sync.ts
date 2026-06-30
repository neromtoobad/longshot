// Phase 5.1: pull the World Cup schedule from ESPN, normalize, store, and show the next 5 upcoming.
// Run: pnpm fixtures:sync [poolId]

import { fetchWorldCupFixtures } from "@longshot/shared";
import { saveFixtures, upcomingFixtures, allFixtures } from "../lib/fixtures-store";

const poolId = process.argv[2] ?? "1";
const start = process.env.WC_START ?? "20260615";
const end = process.env.WC_END ?? "20260720"; // through the final, so knockout rounds show as upcoming

const fixtures = await fetchWorldCupFixtures({ poolId, start, end });
saveFixtures(fixtures);

const counts = fixtures.reduce<Record<string, number>>((acc, f) => {
  acc[f.status] = (acc[f.status] ?? 0) + 1;
  return acc;
}, {});
console.log(`synced ${fixtures.length} World Cup fixtures (pool ${poolId}, ${start}-${end})`);
console.log(`  by status: ${JSON.stringify(counts)}`);

const next = upcomingFixtures(5);
console.log(`next ${next.length} upcoming:`);
for (const f of next) {
  console.log(`  ${f.kickoff}  ${f.home} vs ${f.away}  [${f.id}]`);
}
if (allFixtures().length === 0) {
  console.error("no fixtures returned — check the date window / ESPN availability");
  process.exit(1);
}
