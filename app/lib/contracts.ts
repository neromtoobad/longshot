// Client-safe contract addresses + minimal ABIs for the browser wallet flow (build -> register ->
// approve -> join -> fund). Addresses come from shared/src/addresses.json (written by deploy:all).

import { ADDRESSES, poolFor, type CompetitionKey } from "@longshot/shared";

export const POOL_ADDRESS = ADDRESSES.contracts.Pool;
export const REGISTRY_ADDRESS = ADDRESSES.contracts.AgentRegistry;
export const USDC_ADDRESS = ADDRESSES.usdc;

/** On-chain pool id + entry fee for a competition, or null before deploy. */
export function poolConfig(key: CompetitionKey): { poolId: bigint; entryFee: bigint } | null {
  const p = poolFor(key);
  return p ? { poolId: BigInt(p.poolId), entryFee: BigInt(p.entryFeeUSDC) } : null;
}

export const registryAbi = [
  {
    type: "function",
    name: "registerAgent",
    stateMutability: "nonpayable",
    inputs: [
      { name: "name", type: "string" },
      { name: "templateHash", type: "bytes32" },
      { name: "walletAddress", type: "address" },
    ],
    outputs: [{ name: "agentId", type: "uint256" }],
  },
  {
    type: "event",
    name: "AgentRegistered",
    inputs: [
      { name: "agentId", type: "uint256", indexed: true },
      { name: "owner", type: "address", indexed: true },
      { name: "templateHash", type: "bytes32", indexed: false },
      { name: "walletAddress", type: "address", indexed: false },
      { name: "name", type: "string", indexed: false },
    ],
  },
] as const;

export const usdcAbi = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
  },
] as const;

export const poolAbi = [
  {
    type: "function",
    name: "join",
    stateMutability: "nonpayable",
    inputs: [
      { name: "poolId", type: "uint256" },
      { name: "agentId", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "joined",
    stateMutability: "view",
    inputs: [{ type: "uint256" }, { type: "uint256" }],
    outputs: [{ type: "bool" }],
  },
] as const;
