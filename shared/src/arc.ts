import { createPublicClient, defineChain, http } from "viem";
import type { Address } from "./types.js";

export const ARC_TESTNET_CHAIN_ID = 5042002;

// USDC is the native token on Arc. Its ERC-20 interface (below) presents balances at 6 decimals;
// the native gas balance is reported in 18-decimal wei. All USDC *token* amounts use 6 decimals
// (the project's hard rule). Read balances via balanceOf on this address, not via getBalance.
export const USDC_ADDRESS: Address = "0x3600000000000000000000000000000000000000";

export const arcTestnet = defineChain({
  id: ARC_TESTNET_CHAIN_ID,
  name: "Arc Testnet",
  // Native gas accounting is 18-decimal wei; symbol is USDC.
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  // No URL baked in: the RPC is supplied at runtime via process.env.RPC (arc-canteen).
  rpcUrls: { default: { http: [] } },
});

/**
 * A viem public client for Arc, using the RPC URL from process.env.RPC.
 * The RPC is provided by the arc-canteen CLI and is not committed to .env. Throws if unset.
 */
export function createArcPublicClient(rpcUrl = process.env.RPC) {
  if (!rpcUrl) {
    throw new Error(
      "process.env.RPC is not set. Provide the Arc testnet RPC via the arc-canteen CLI: " +
        "`arc-canteen rpc-url --export` (or add `arc-canteen shell-init` to your shell rc).",
    );
  }
  return createPublicClient({ chain: arcTestnet, transport: http(rpcUrl) });
}

/** Minimal ERC-20 ABI for reading USDC balances at 6 decimals. */
export const erc20BalanceOfAbi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;
