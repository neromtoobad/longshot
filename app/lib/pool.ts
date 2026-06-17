// On-chain Pool helpers for the results resolver: read a fixture's stored result (idempotency) and
// write a result via resolveFixture from the resolver key (DEPLOYER is owner+resolver for MVP).
// Server-only (uses a private key + fs). TODO(trust upgrade): UMA optimistic oracle for resolution
// — see circlefin/arc-prediction-markets.

import { readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import { createWalletClient, http, type Address, type Hash } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arcTestnet, createArcPublicClient } from "@longshot/shared";

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
] as const;

function poolAddress(): Address {
  const path = resolvePath(process.cwd(), process.env.ADDRESSES_PATH ?? "../shared/addresses.arc.json");
  const json = JSON.parse(readFileSync(path, "utf-8")) as { contracts: { Pool: Address } };
  return json.contracts.Pool;
}

function resolverKey(): `0x${string}` {
  const pk = process.env.DEPLOYER_PRIVATE_KEY;
  if (!pk) throw new Error("DEPLOYER_PRIVATE_KEY (resolver key) not set");
  return (pk.startsWith("0x") ? pk : `0x${pk}`) as `0x${string}`;
}

export interface OnChainResult {
  resolved: boolean;
  homeScore: number;
  awayScore: number;
}

export async function readResult(poolId: bigint, fixtureId: bigint): Promise<OnChainResult> {
  const raw = (await createArcPublicClient().readContract({
    address: poolAddress(),
    abi: poolAbi,
    functionName: "results",
    args: [poolId, fixtureId],
  })) as unknown;
  if (Array.isArray(raw)) {
    return { resolved: Boolean(raw[0]), homeScore: Number(raw[1]), awayScore: Number(raw[2]) };
  }
  const o = raw as { resolved: boolean; homeScore: number | bigint; awayScore: number | bigint };
  return { resolved: o.resolved, homeScore: Number(o.homeScore), awayScore: Number(o.awayScore) };
}

export async function resolveFixtureOnChain(
  poolId: bigint,
  fixtureId: bigint,
  homeScore: number,
  awayScore: number,
): Promise<Hash> {
  const rpc = process.env.RPC;
  if (!rpc) throw new Error("process.env.RPC not set");
  const wallet = createWalletClient({
    account: privateKeyToAccount(resolverKey()),
    chain: arcTestnet,
    transport: http(rpc),
  });
  return wallet.writeContract({
    address: poolAddress(),
    abi: poolAbi,
    functionName: "resolveFixture",
    args: [poolId, fixtureId, homeScore, awayScore],
  });
}
