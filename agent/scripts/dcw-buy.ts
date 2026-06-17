// Phase 7.2 proof: an agent's OWN Circle DCW wallet buys x402 evidence — signed via Circle
// signTypedData (no raw key), paid from the wallet's Gateway balance. Run: pnpm dcw:buy

import { dcwSigner } from "../src/paying/signers.ts";
import { buyEvidence } from "../src/paying/client.ts";
import { agentsInPool } from "../src/store.ts";

const baseUrl = process.env.APP_BASE_URL ?? "http://localhost:3000";
const a = agentsInPool("1").find((x) => x.walletId && !x.walletId.startsWith("stub-"));
if (!a) {
  console.error("no agent with a provisioned DCW wallet — run seed:wallets first");
  process.exit(1);
}

console.log(`${a.template.name} — DCW wallet ${a.walletAddress} (id ${a.walletId})`);
console.log("buying /api/evidence/form via x402, signed by the DCW wallet...");

const signer = dcwSigner(a.walletId, a.walletAddress);
const res = await buyEvidence({
  url: `${baseUrl}/api/evidence/form?fixtureId=760434`,
  signer,
  agentId: a.agentId,
  fixtureId: "760434",
  source: "form",
  budget: 1_000_000n,
  spent: 0n,
});

if (res.ok) {
  console.log(`PAID: settlement ${res.purchase.settlementUuid}, price ${Number(res.purchase.priceUSDC) / 1e6} USDC`);
  console.log("dcw:buy PASS — agent paid for data from its own custodial wallet");
} else {
  console.error("blocked:", res);
  process.exit(1);
}
