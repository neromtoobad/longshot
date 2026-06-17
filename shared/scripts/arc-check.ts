// Arc connection smoke test (EXECUTION_PLAN Phase 1.2).
// Reads process.env.RPC (from arc-canteen) and DEPLOYER_PRIVATE_KEY (from .env), then prints the
// chain id, latest block, and the deployer's USDC balance at 6 decimals.
//
// Run: pnpm arc:check   (resolve RPC first, e.g. `eval "$(arc-canteen rpc-url --export)"`)

import { formatUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { createArcPublicClient, USDC_ADDRESS, erc20BalanceOfAbi, USDC_DECIMALS } from "../src/index.js";

async function call<T>(method: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Surface a blocked method clearly — the arc-canteen proxy enforces a JSON-RPC allowlist.
    throw new Error(`RPC method '${method}' failed (allowlist?): ${msg}`);
  }
}

async function main() {
  const client = createArcPublicClient();

  const chainId = await call("eth_chainId", () => client.getChainId());
  console.log(`chain id:      ${chainId} (0x${chainId.toString(16)})`);

  const block = await call("eth_blockNumber", () => client.getBlockNumber());
  console.log(`latest block:  ${block}`);

  const pk = process.env.DEPLOYER_PRIVATE_KEY;
  if (!pk) {
    console.log("DEPLOYER_PRIVATE_KEY not set — skipping USDC balance read.");
    return;
  }
  const account = privateKeyToAccount((pk.startsWith("0x") ? pk : `0x${pk}`) as `0x${string}`);
  const raw = await call("eth_call balanceOf", () =>
    client.readContract({
      address: USDC_ADDRESS,
      abi: erc20BalanceOfAbi,
      functionName: "balanceOf",
      args: [account.address],
    }),
  );
  console.log(`address:       ${account.address}`);
  console.log(
    `USDC balance:  ${formatUnits(raw, USDC_DECIMALS)} USDC  (raw ${raw}, ${USDC_DECIMALS} decimals)`,
  );
}

main().catch((err) => {
  console.error("arc:check failed:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
