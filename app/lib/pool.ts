// Read-only view of an on-chain pool (prize pool, entry fee, status). Server-only (RPC). Cached
// briefly so page renders don't hammer the RPC. Writes (results, scores) happen in the worker.

import { createArcPublicClient, isDeployed } from "@longshot/shared";
import { POOL_ADDRESS } from "./contracts";

const poolAbi = [
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
    inputs: [
      { name: "", type: "uint256" },
      { name: "", type: "uint256" },
    ],
    outputs: [
      { name: "resolved", type: "bool" },
      { name: "homeScore", type: "uint8" },
      { name: "awayScore", type: "uint8" },
    ],
  },
  {
    type: "function",
    name: "getPool",
    stateMutability: "view",
    inputs: [{ name: "poolId", type: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "tournament", type: "string" },
          { name: "entryFee", type: "uint256" },
          { name: "budgetPerAgent", type: "uint256" },
          { name: "prizeSplitBps", type: "uint16[]" },
          { name: "status", type: "uint8" },
          { name: "prizePool", type: "uint256" },
          { name: "agentIds", type: "uint256[]" },
        ],
      },
    ],
  },
] as const;

export interface PoolInfo {
  tournament: string;
  entryFee: string;
  budgetPerAgent: string;
  prizeSplitBps: number[];
  status: "open" | "closed" | "finalized";
  prizePool: string;
  onChainAgentCount: number;
}

const POOL_STATUS = ["open", "closed", "finalized"] as const;

async function fetchPoolInfo(poolId: bigint): Promise<PoolInfo> {
  const p = (await createArcPublicClient().readContract({
    address: POOL_ADDRESS,
    abi: poolAbi,
    functionName: "getPool",
    args: [poolId],
  })) as {
    tournament: string;
    entryFee: bigint;
    budgetPerAgent: bigint;
    prizeSplitBps: readonly number[];
    status: number;
    prizePool: bigint;
    agentIds: readonly bigint[];
  };
  return {
    tournament: p.tournament,
    entryFee: p.entryFee.toString(),
    budgetPerAgent: p.budgetPerAgent.toString(),
    prizeSplitBps: [...p.prizeSplitBps],
    status: POOL_STATUS[p.status] ?? "open",
    prizePool: p.prizePool.toString(),
    onChainAgentCount: p.agentIds.length,
  };
}


const cache = new Map<string, { at: number; info: PoolInfo }>();

/** On-chain pool info, or null before deploy / on RPC failure. */
export async function readPoolInfo(poolId: string | undefined): Promise<PoolInfo | null> {
  if (!poolId || !isDeployed()) return null;
  const hit = cache.get(poolId);
  if (hit && Date.now() - hit.at < 30_000) return hit.info;
  try {
    const info = await fetchPoolInfo(BigInt(poolId));
    cache.set(poolId, { at: Date.now(), info });
    return info;
  } catch {
    return hit?.info ?? null;
  }
}
