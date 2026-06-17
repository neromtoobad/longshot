// Phase 3.3 test: buy 3 evidence items under the budget cap (3 settlement UUIDs come back without
// waiting on-chain), then confirm the 4th is blocked once the cap is hit. Pays from the deployer's
// Gateway balance via rawKeySigner; production agents use dcwSigner (same client code path).
//
// Needs the seller dev server running (default http://localhost:3100) and $RPC + DEPLOYER_PRIVATE_KEY.
// Run: pnpm pay:demo

import { formatUnits } from "viem";
import { USDC_DECIMALS, type EvidenceSource } from "@longshot/shared";
import { rawKeySigner } from "../src/paying/signers.ts";
import { buyEvidence } from "../src/paying/client.ts";

const base = process.argv[2] ?? "http://localhost:3100";
const fixtureId = "worldcup-1";
const agentId = "demo-agent";

const pk = process.env.DEPLOYER_PRIVATE_KEY;
if (!pk) throw new Error("DEPLOYER_PRIVATE_KEY not set");
const signer = rawKeySigner(pk);

const usdc = (v: bigint) => `${formatUnits(v, USDC_DECIMALS)} USDC`;

// Budget fits form(0.003)+odds(0.005)+h2h(0.002)=0.010, but not a 4th buy.
const budget = 11_000n; // 0.011 USDC
let spent = 0n;
const uuids: string[] = [];

const buys: { source: EvidenceSource }[] = [
  { source: "form" },
  { source: "odds" },
  { source: "h2h" },
  { source: "injuries" }, // 4th — should be blocked by the cap
];

for (const b of buys) {
  const url = `${base}/api/evidence/${b.source}?fixtureId=${fixtureId}`;
  const r = await buyEvidence({ url, signer, agentId, fixtureId, source: b.source, budget, spent });
  if (r.ok) {
    spent += BigInt(r.purchase.priceUSDC);
    uuids.push(r.purchase.settlementUuid);
    console.log(`bought ${b.source.padEnd(9)} ${usdc(BigInt(r.purchase.priceUSDC))}  uuid=${r.purchase.settlementUuid}  (spent ${usdc(spent)})`);
  } else {
    console.log(`BLOCKED ${b.source.padEnd(9)} ${r.reason} — requested ${usdc(r.requested)}, remaining ${usdc(r.remaining)}`);
  }
}

console.log(`\n${uuids.length} settlement UUIDs returned (expect 3, no on-chain wait); 4th blocked by budget cap.`);
const pass = uuids.length === 3 && uuids.every(Boolean);
console.log(pass ? "pay:demo PASS" : "pay:demo FAIL");
if (!pass) process.exit(1);
