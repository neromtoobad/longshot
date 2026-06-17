// Phase 3.1 demo: provision a Circle DCW wallet for an agent, fund a tiny amount from the
// deployer, and print the balance. Also shows the budget-cap guard.
//
// Run: pnpm wallet:demo   (needs CIRCLE_API_KEY + CIRCLE_ENTITY_SECRET in .env and $RPC in env)

import { formatUnits } from "viem";
import { USDC_DECIMALS, createArcPublicClient } from "@longshot/shared";
import { createAgentWallet, getAgentUsdcBalance, fundFromDeployer, checkBudget } from "../src/wallet.ts";

const FUND_AMOUNT = 50_000n; // 0.05 USDC

function usdc(v: bigint): string {
  return `${formatUnits(v, USDC_DECIMALS)} USDC`;
}

async function main() {
  console.log("provisioning agent wallet (Circle DCW, EOA, ARC-TESTNET)...");
  const w = await createAgentWallet("demo");
  console.log("  walletId:   ", w.walletId);
  console.log("  walletSetId:", w.walletSetId);
  console.log("  address:    ", w.address);

  console.log("balance before:", usdc(await getAgentUsdcBalance(w.address)));

  console.log(`funding ${usdc(FUND_AMOUNT)} from deployer...`);
  const hash = await fundFromDeployer(w.address, FUND_AMOUNT);
  console.log("  fund tx:", hash);
  await createArcPublicClient().waitForTransactionReceipt({ hash });

  console.log("balance after: ", usdc(await getAgentUsdcBalance(w.address)));

  // Budget-cap guard demo: spent 4.998 of a 5 USDC budget.
  const budget = 5_000_000n;
  const spent = 4_998_000n;
  console.log("budget guard, request 0.001 USDC:", checkBudget(budget, spent, 1_000n));
  console.log("budget guard, request 0.005 USDC:", checkBudget(budget, spent, 5_000n));
}

main().catch((e) => {
  console.error("wallet:demo failed:", e instanceof Error ? e.message : String(e));
  process.exit(1);
});
