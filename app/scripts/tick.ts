// Matchday tick: refresh ESPN results, optionally resolve newly-final fixtures on-chain, and print
// the live leaderboard. The leaderboard auto-scores from resolved fixtures + predictions, so running
// this on a schedule keeps the league alive as real matches finish.
//
// Run: pnpm tick [poolId] [--broadcast]
//   (sync-only by default; --broadcast resolves on-chain — needs $RPC + DEPLOYER_PRIVATE_KEY)

import { createArcPublicClient, fetchWorldCupFixtures } from "@longshot/shared";
import { allFixtures, saveFixtures } from "../lib/fixtures-store";
import { getLeaderboard } from "../lib/data";
import { readResult, resolveFixtureOnChain } from "../lib/pool";
import { readPredictions } from "../lib/store";

const poolId = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : "1";
const broadcast = process.argv.includes("--broadcast");
const start = process.env.WC_START ?? "20260615";
const end = process.env.WC_END ?? "20260629";

const predicted = new Set(readPredictions().filter((p) => p.poolId === poolId).map((p) => p.fixtureId));
const wasFinal = new Set(allFixtures().filter((f) => f.poolId === poolId && f.status === "final").map((f) => f.id));

const fixtures = await fetchWorldCupFixtures({ poolId, start, end });
saveFixtures(fixtures);

const nowFinal = fixtures.filter((f) => f.poolId === poolId && f.status === "final");
const newlyFinal = nowFinal.filter((f) => !wasFinal.has(f.id));
const newlyScored = newlyFinal.filter((f) => predicted.has(f.id));
console.log(
  `tick: synced ${fixtures.length} fixtures · ${nowFinal.length} final (${newlyFinal.length} new) · ${newlyScored.length} newly-scored predicted fixture(s)`,
);

if (broadcast) {
  for (const f of nowFinal) {
    if (f.homeScore == null || f.awayScore == null) continue;
    let fid: bigint;
    try {
      fid = BigInt(f.id);
    } catch {
      continue;
    }
    if ((await readResult(BigInt(poolId), fid)).resolved) continue;
    try {
      const tx = await resolveFixtureOnChain(BigInt(poolId), fid, f.homeScore, f.awayScore);
      await createArcPublicClient().waitForTransactionReceipt({ hash: tx });
      console.log(`  resolved on-chain: ${f.home} ${f.homeScore}-${f.awayScore} ${f.away}  tx=${tx}`);
    } catch (e) {
      console.error(`  ✗ resolve ${f.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}

const board = getLeaderboard(poolId);
const scored = board.filter((b) => b.fixturesScored > 0);
console.log(`\nleaderboard · ${scored.length}/${board.length} scored:`);
for (const r of board) {
  console.log(`  ${r.rank}. ${r.name} — ${r.cumulativeScore} pts · ${r.fixturesScored} scored · ROI ${Number.isFinite(r.roi) ? r.roi.toFixed(1) : "∞"}`);
}
if (scored.length === 0) console.log("  (no predicted fixtures have resolved yet — scores land as those matches finish)");
