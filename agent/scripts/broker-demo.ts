// Phase 3.4 demo: show the broker catalog, buy one brokered evidence item (agent -> broker ->
// source, payment chain depth 2), and print the recorded markup split. Pays from the deployer's
// Gateway balance via rawKeySigner. Needs the dev server up + $RPC + DEPLOYER_PRIVATE_KEY.
//
// Run: pnpm broker:demo

import { formatUnits } from "viem";
import { USDC_DECIMALS } from "@longshot/shared";
import { rawKeySigner } from "../src/paying/signers.ts";
import { buyEvidence } from "../src/paying/client.ts";

const base = process.argv[2] ?? "http://localhost:3100";
const pk = process.env.DEPLOYER_PRIVATE_KEY;
if (!pk) throw new Error("DEPLOYER_PRIVATE_KEY not set");
const signer = rawKeySigner(pk);

const cat = (await (await fetch(`${base}/api/broker/catalog`)).json()) as {
  markupBps: number;
  sources: { source: string; basePriceUSDC: string; markupUSDC: string; brokerPriceUSDC: string; reputation: unknown }[];
};
console.log(`broker catalog (markup ${cat.markupBps} bps):`);
for (const s of cat.sources) {
  console.log(`  ${s.source.padEnd(9)} base ${s.basePriceUSDC} + markup ${s.markupUSDC} = broker ${s.brokerPriceUSDC} USDC  rep=${JSON.stringify(s.reputation)}`);
}

const url = `${base}/api/broker/evidence/form?fixtureId=worldcup-1`;
const r = await buyEvidence({
  url,
  signer,
  agentId: "demo-agent",
  fixtureId: "worldcup-1",
  source: "form",
  budget: 100_000n,
  spent: 0n,
});
if (!r.ok) {
  console.error("brokered buy blocked:", r);
  process.exit(1);
}
console.log(`\nbought brokered form: paid ${formatUnits(BigInt(r.purchase.priceUSDC), USDC_DECIMALS)} USDC, uuid=${r.purchase.settlementUuid}`);
console.log("broker meta on response:", JSON.stringify((r.data as { broker?: unknown }).broker));

const rev = (await (await fetch(`${base}/api/broker/revenue`)).json()) as {
  totalSales: number;
  totalRevenueUSDC: string;
  totalPassthroughUSDC: string;
  paymentChainDepth: number;
  bySource: { source: string; sales: number; revenueUSDC: string; passthroughUSDC: string }[];
};
const formRev = rev.bySource.find((x) => x.source === "form");
console.log(`\nbroker revenue: ${rev.totalRevenueUSDC} USDC markup kept, ${rev.totalPassthroughUSDC} USDC passthrough, ${rev.totalSales} sale(s), chain depth ${rev.paymentChainDepth}`);
console.log(`  form split: revenue ${formRev?.revenueUSDC} + passthrough ${formRev?.passthroughUSDC}`);

const pass = rev.totalSales >= 1 && Number(rev.totalRevenueUSDC) > 0 && (formRev?.sales ?? 0) >= 1;
console.log(pass ? "broker:demo PASS" : "broker:demo FAIL");
if (!pass) process.exit(1);
