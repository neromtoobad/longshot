// On-chain calls against the deployed AgentRegistry + Pool (addresses from @longshot/shared). The
// treasury key is the Pool owner, resolver and runner: it creates pools, enters house agents,
// commits predictions on agents' behalf, posts results and scores, and finalizes payouts.

import { parseUnits, type Address, type Hash } from "viem";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { ADDRESSES, arcRpcUrl, arcTestnet, createArcPublicClient, USDC_ADDRESS, type Bytes32 } from "@longshot/shared";
import { treasuryKey } from "./wallet.js";

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
  { type: "function", name: "setRunner", stateMutability: "nonpayable", inputs: [{ name: "_runner", type: "address" }], outputs: [] },
  { type: "function", name: "runner", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "totalPools", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
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
  {
    type: "function",
    name: "recordPrediction",
    stateMutability: "nonpayable",
    inputs: [
      { name: "poolId", type: "uint256" },
      { name: "agentId", type: "uint256" },
      { name: "fixtureId", type: "uint256" },
      { name: "hash", type: "bytes32" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "predictionHash",
    stateMutability: "view",
    inputs: [{ type: "uint256" }, { type: "uint256" }, { type: "uint256" }],
    outputs: [{ type: "bytes32" }],
  },
  {
    type: "function",
    name: "resolveFixture",
    stateMutability: "nonpayable",
    inputs: [
      { name: "poolId", type: "uint256" },
      { name: "fixtureId", type: "uint256" },
      { name: "homeScore", type: "uint8" },
      { name: "awayScore", type: "uint8" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "results",
    stateMutability: "view",
    inputs: [{ type: "uint256" }, { type: "uint256" }],
    outputs: [
      { name: "resolved", type: "bool" },
      { name: "homeScore", type: "uint8" },
      { name: "awayScore", type: "uint8" },
    ],
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
  {
    type: "function",
    name: "agentScore",
    stateMutability: "view",
    inputs: [{ type: "uint256" }, { type: "uint256" }],
    outputs: [{ type: "uint256" }],
  },
  { type: "function", name: "finalize", stateMutability: "nonpayable", inputs: [{ name: "poolId", type: "uint256" }], outputs: [] },
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

const MIN_FEE = parseUnits("25", 9);

function treasury() {
  return createWalletClient({
    account: privateKeyToAccount(treasuryKey()),
    chain: arcTestnet,
    transport: http(arcRpcUrl()),
  });
}

// Every treasury write goes through one queue so concurrent callers never race on the nonce.
let queue: Promise<unknown> = Promise.resolve();

async function write(params: Parameters<ReturnType<typeof treasury>["writeContract"]>[0]): Promise<Hash> {
  const run = async () => {
    const pub = createArcPublicClient();
    const est = await pub.estimateFeesPerGas();
    const maxFeePerGas = (est.maxFeePerGas > MIN_FEE ? est.maxFeePerGas : MIN_FEE) * 2n;
    const maxPriorityFeePerGas = est.maxPriorityFeePerGas > MIN_FEE ? est.maxPriorityFeePerGas : MIN_FEE;
    const hash = await treasury().writeContract({ ...params, maxFeePerGas, maxPriorityFeePerGas } as never);
    const receipt = await pub.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error(`tx reverted: ${hash}`);
    return hash;
  };
  const next = queue.then(run, run);
  queue = next.catch(() => undefined);
  return next;
}

const pool = () => ADDRESSES.contracts.Pool;
const registry = () => ADDRESSES.contracts.AgentRegistry;

export async function totalAgents(): Promise<bigint> {
  return createArcPublicClient().readContract({ address: registry(), abi: registryAbi, functionName: "totalAgents" });
}

/** Register an agent; registry ids are sequential and 1-based, so the new id is totalAgents(). */
export async function registerAgent(name: string, templateHash: Bytes32, walletAddress: Address): Promise<{ agentId: bigint; tx: Hash }> {
  const tx = await write({
    address: registry(),
    abi: registryAbi,
    functionName: "registerAgent",
    args: [name, templateHash, walletAddress],
  } as never);
  return { agentId: await totalAgents(), tx };
}

export async function isJoined(poolId: bigint, agentId: bigint): Promise<boolean> {
  return createArcPublicClient().readContract({ address: pool(), abi: poolAbi, functionName: "joined", args: [poolId, agentId] });
}

export async function ensureTreasuryAllowance(spender: Address, amount: bigint): Promise<void> {
  const owner = privateKeyToAccount(treasuryKey()).address;
  const current = await createArcPublicClient().readContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: "allowance",
    args: [owner, spender],
  });
  if (current >= amount) return;
  await write({ address: USDC_ADDRESS, abi: erc20Abi, functionName: "approve", args: [spender, 2n ** 255n] } as never);
}

/** The treasury enters an agent (house agents). The treasury becomes the prize recipient. */
export async function joinPool(poolId: bigint, agentId: bigint, entryFee: bigint): Promise<Hash> {
  if (entryFee > 0n) await ensureTreasuryAllowance(pool(), entryFee);
  return write({ address: pool(), abi: poolAbi, functionName: "join", args: [poolId, agentId] } as never);
}

export async function createPool(name: string, entryFee: bigint, budget: bigint, split: number[]): Promise<{ poolId: bigint; tx: Hash }> {
  const tx = await write({ address: pool(), abi: poolAbi, functionName: "createPool", args: [name, entryFee, budget, split] } as never);
  const poolId = await createArcPublicClient().readContract({ address: pool(), abi: poolAbi, functionName: "totalPools" });
  return { poolId, tx };
}

export async function setRunner(runner: Address): Promise<Hash> {
  return write({ address: pool(), abi: poolAbi, functionName: "setRunner", args: [runner] } as never);
}

export async function predictionOnChain(poolId: bigint, agentId: bigint, fixtureId: bigint): Promise<Bytes32> {
  return createArcPublicClient().readContract({
    address: pool(),
    abi: poolAbi,
    functionName: "predictionHash",
    args: [poolId, agentId, fixtureId],
  });
}

/** Commit a prediction hash before kickoff (treasury acts as the authorized runner). */
export async function recordPredictionOnChain(poolId: bigint, agentId: bigint, fixtureId: bigint, hash: Bytes32): Promise<Hash> {
  return write({ address: pool(), abi: poolAbi, functionName: "recordPrediction", args: [poolId, agentId, fixtureId, hash] } as never);
}

export async function resultOnChain(poolId: bigint, fixtureId: bigint): Promise<{ resolved: boolean; homeScore: number; awayScore: number }> {
  const [resolved, homeScore, awayScore] = await createArcPublicClient().readContract({
    address: pool(),
    abi: poolAbi,
    functionName: "results",
    args: [poolId, fixtureId],
  });
  return { resolved, homeScore, awayScore };
}

export async function resolveFixtureOnChain(poolId: bigint, fixtureId: bigint, home: number, away: number): Promise<Hash> {
  return write({ address: pool(), abi: poolAbi, functionName: "resolveFixture", args: [poolId, fixtureId, home, away] } as never);
}

export async function scoreOnChain(poolId: bigint, agentId: bigint): Promise<bigint> {
  return createArcPublicClient().readContract({ address: pool(), abi: poolAbi, functionName: "agentScore", args: [poolId, agentId] });
}

export async function recordScoreOnChain(poolId: bigint, agentId: bigint, cumulative: bigint): Promise<Hash> {
  return write({ address: pool(), abi: poolAbi, functionName: "recordScore", args: [poolId, agentId, cumulative] } as never);
}

export async function finalizePool(poolId: bigint): Promise<Hash> {
  return write({ address: pool(), abi: poolAbi, functionName: "finalize", args: [poolId] } as never);
}
