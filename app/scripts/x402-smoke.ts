// x402 seller smoke test (Phase 3.2): unpaid request -> 402, paid request -> 200.
// Buyer pays from DEPLOYER_PRIVATE_KEY's Gateway balance via the x402-batching GatewayClient.
//
// Run with the dev server up:
//   pnpm --filter @longshot/app x402:smoke   (needs $RPC + DEPLOYER_PRIVATE_KEY)

import { GatewayClient } from "@circle-fin/x402-batching/client";

const base = process.argv[2] ?? "http://localhost:3100";
const url = `${base}/api/evidence/form?fixtureId=worldcup-1`;

const pk = process.env.DEPLOYER_PRIVATE_KEY;
if (!pk) throw new Error("DEPLOYER_PRIVATE_KEY not set");

const unpaid = await fetch(url);
console.log(`unpaid: HTTP ${unpaid.status} (expect 402)`);

const client = new GatewayClient({
  chain: "arcTestnet",
  privateKey: (pk.startsWith("0x") ? pk : `0x${pk}`) as `0x${string}`,
});

const { status, data } = await client.pay(url);
console.log(`paid:   HTTP ${status} (expect 200)`);
console.log("data:", JSON.stringify(data));

if (unpaid.status !== 402 || status !== 200) {
  console.error("SMOKE FAILED");
  process.exit(1);
}
console.log("x402 seller smoke: PASS");
