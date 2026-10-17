import { createPublicClient, defineChain, http, type PublicClient, type Transport } from "viem";
import type { Address } from "./types.js";

export const ARC_TESTNET_CHAIN_ID = 5042002;
/** Public Arc testnet RPC. Override with process.env.RPC (e.g. a keyed endpoint). */
export const ARC_TESTNET_PUBLIC_RPC = "https://rpc.testnet.arc.io";
export const ARC_TESTNET_EXPLORER = "https://explorer.testnet.arc.io";

// USDC is the native token on Arc. Its ERC-20 interface (below) presents balances at 6 decimals;
// the native gas balance is reported in 18-decimal wei. All USDC *token* amounts use 6 decimals
// (the project's hard rule). Read balances via balanceOf on this address, not via getBalance.
export const USDC_ADDRESS: Address = "0x3600000000000000000000000000000000000000";

export const arcTestnet = defineChain({
  id: ARC_TESTNET_CHAIN_ID,
  name: "Arc Testnet",
  // Native gas accounting is 18-decimal wei; symbol is USDC.
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: [ARC_TESTNET_PUBLIC_RPC] } },
  blockExplorers: { default: { name: "ArcScan", url: ARC_TESTNET_EXPLORER } },
});

/** The RPC to use: process.env.RPC when set, else the public Arc testnet RPC. */
export function arcRpcUrl(): string {
  return process.env.RPC || ARC_TESTNET_PUBLIC_RPC;
}

/** A viem public client for Arc testnet. */
export function createArcPublicClient(rpcUrl = arcRpcUrl()): PublicClient<Transport, typeof arcTestnet> {
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
