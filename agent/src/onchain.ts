// On-chain orchestration for the live matchday: register agents (AgentRegistry), join the pool with
// real USDC entry escrow (Pool), record scores + finalize payout. Uses the deployer key (owner +
// resolver). viem against the deployed addresses in shared/addresses.arc.json.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createWalletClient, http, type Address, type Hash } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arcTestnet, createArcPublicClient, USDC_ADDRESS } from "@longshot/shared";

interface Addresses {
  contracts: { AgentRegistry: Address; Pool: Address };
}

export function addresses(): Addresses {
  const path = resolve(process.cwd(), process.env.ADDRESSES_PATH ?? "../shared/addresses.arc.json");
  return JSON.parse(readFileSync(path, "utf-8")) as Addresses;
}

function deployerAccount() {
  const pk = process.env.DEPLOYER_PRIVATE_KEY;
  if (!pk) throw new Error("DEPLOYER_PRIVATE_KEY not set");
  return privateKeyToAccount((pk.startsWith("0x") ? pk : `0x${pk}`) as `0x${string}`);
}

function wallet() {
  const rpc = process.env.RPC;
  if (!rpc) throw new Error("process.env.RPC not set");
  return createWalletClient({ account: deployerAccount(), chain: arcTestnet, transport: http(rpc) });
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
  { type: "function", name: "totalAgents", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
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
    inputs: [
      { type: "uint256" },
      { type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "recordScore",
    stateMutability: "nonpayable",
    inputs: [
      { name: "poolId", type: "uint256" },
      { name: "agentId", type: "uint256" },
      { name: "cumulative", type: "uint256" },
    ],
    outputs: [],
  },
  { type: "function", name: "finalize", stateMutability: "nonpayable", inputs: [{ name: "poolId", type: "uint256" }], outputs: [] },
  {
    type: "function",
    name: "createPool",
    stateMutability: "nonpayable",
    inputs: [
      { name: "tournament", type: "string" },
      { name: "entryFeeUSDC", type: "uint256" },
      { name: "budgetPerAgentUSDC", type: "uint256" },
      { name: "prizeSplitBps", type: "uint16[]" },
    ],
    outputs: [{ type: "uint256" }],
  },
  { type: "function", name: "totalPools", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
] as const;

const erc20Abi = [
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
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
  },
] as const;

async function send(hash: Hash): Promise<Hash> {
  await createArcPublicClient().waitForTransactionReceipt({ hash });
  return hash;
}

export function deployerAddress(): Address {
  return deployerAccount().address;
}

export async function totalAgents(): Promise<bigint> {
  return createArcPublicClient().readContract({
    address: addresses().contracts.AgentRegistry,
    abi: registryAbi,
    functionName: "totalAgents",
  });
}

/** Register an agent on-chain; returns the assigned agentId (registry ids are sequential, 1-based). */
export async function registerAgent(name: string, templateHash: `0x${string}`, walletAddress: Address): Promise<{ agentId: bigint; tx: Hash }> {
  const tx = await wallet().writeContract({
    address: addresses().contracts.AgentRegistry,
    abi: registryAbi,
    functionName: "registerAgent",
    args: [name, templateHash, walletAddress],
  });
  await send(tx);
  const agentId = await totalAgents(); // just-assigned id
  return { agentId, tx };
}

export async function isJoined(poolId: bigint, agentId: bigint): Promise<boolean> {
  return createArcPublicClient().readContract({
    address: addresses().contracts.Pool,
    abi: poolAbi,
    functionName: "joined",
    args: [poolId, agentId],
  });
}

export async function ensureAllowance(spender: Address, amount: bigint): Promise<void> {
  const current = await createArcPublicClient().readContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: "allowance",
    args: [deployerAddress(), spender],
  });
  if (current >= amount) return;
  const tx = await wallet().writeContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: "approve",
    args: [spender, amount],
  });
  await send(tx);
}

/** Join the pool with the entry fee pulled from the deployer (the agent owner of record). */
export async function joinPool(poolId: bigint, agentId: bigint, entryFee: bigint): Promise<Hash> {
  await ensureAllowance(addresses().contracts.Pool, entryFee);
  const tx = await wallet().writeContract({
    address: addresses().contracts.Pool,
    abi: poolAbi,
    functionName: "join",
    args: [poolId, agentId],
  });
  return send(tx);
}

export async function recordScoreOnChain(poolId: bigint, agentId: bigint, cumulative: bigint): Promise<Hash> {
  const tx = await wallet().writeContract({
    address: addresses().contracts.Pool,
    abi: poolAbi,
    functionName: "recordScore",
    args: [poolId, agentId, cumulative],
  });
  return send(tx);
}

export async function totalPools(): Promise<bigint> {
  return createArcPublicClient().readContract({
    address: addresses().contracts.Pool,
    abi: poolAbi,
    functionName: "totalPools",
  });
}

export async function createPool(
  tournament: string,
  entryFeeUSDC: bigint,
  budgetPerAgentUSDC: bigint,
  prizeSplitBps: number[],
): Promise<{ poolId: bigint; tx: Hash }> {
  const tx = await wallet().writeContract({
    address: addresses().contracts.Pool,
    abi: poolAbi,
    functionName: "createPool",
    args: [tournament, entryFeeUSDC, budgetPerAgentUSDC, prizeSplitBps],
  });
  await send(tx);
  const poolId = await totalPools(); // just-created id (sequential, 1-based)
  return { poolId, tx };
}

export async function finalizePool(poolId: bigint): Promise<Hash> {
  const tx = await wallet().writeContract({
    address: addresses().contracts.Pool,
    abi: poolAbi,
    functionName: "finalize",
    args: [poolId],
  });
  return send(tx);
}
