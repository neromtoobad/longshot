// Phase 5.2: results resolver. Reads finished fixtures from the store and writes their scores
// on-chain via Pool.resolveFixture (resolver key). Idempotent (skips fixtures already resolved
// on-chain). Dry-run by default; pass --broadcast to write. Scoring is wired in Phase 5.3.
//
// Run: pnpm resolve:pool <poolId> [--broadcast]   (needs $RPC; --broadcast needs DEPLOYER_PRIVATE_KEY)

import { allFixtures } from "../lib/fixtures-store";
import { readResult, resolveFixtureOnChain } from "../lib/pool";

const poolId = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : "1";
const broadcast = process.argv.includes("--broadcast");

const finals = allFixtures().filter(
  (f) => f.status === "final" && f.homeScore !== null && f.awayScore !== null,
);
console.log(`${finals.length} finished fixtures in pool ${poolId} (${broadcast ? "BROADCAST" : "dry run"})`);

let resolved = 0;
let skipped = 0;
let pending = 0;

for (const f of finals) {
  // ESPN ids are numeric strings; the contract fixtureId is uint256.
  let fixtureId: bigint;
  try {
    fixtureId = BigInt(f.id);
  } catch {
    console.log(`  ! ${f.id} is not numeric — skipping`);
    continue;
  }

  const onchain = await readResult(BigInt(poolId), fixtureId);
  if (onchain.resolved) {
    skipped++;
    continue;
  }

  const line = `${f.home} ${f.homeScore}-${f.awayScore} ${f.away} [${f.id}]`;
  if (!broadcast) {
    pending++;
    console.log(`  would resolve ${line}`);
    continue;
  }
  try {
    const tx = await resolveFixtureOnChain(BigInt(poolId), fixtureId, f.homeScore!, f.awayScore!);
    resolved++;
    console.log(`  resolved ${line}  tx=${tx}`);
  } catch (e) {
    console.error(`  ✗ ${line}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

if (broadcast) {
  console.log(`done: resolved ${resolved}, skipped ${skipped} already on-chain`);
} else {
  console.log(`dry run: ${pending} would resolve, ${skipped} already resolved. Re-run with --broadcast to write.`);
}
