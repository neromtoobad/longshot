// On-chain Pool client for the runner: record a prediction commitment and check whether an agent
// already predicted a fixture (the authoritative idempotency source). Uses the runner key
// (DEPLOYER_PRIVATE_KEY for MVP; the deployer is set as Pool.runner). Real-mode only — the test
// run uses the local store for idempotency, so this isn't exercised until Phase 7.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createWalletClient, http, type Address, type Hash } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arcTestnet, createArcPublicClient, type Bytes32 } from "@longshot/shared";

const poolAbi = [
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
    inputs: [
      { name: "", type: "uint256" },
      { name: "", type: "uint256" },
      { name: "", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bytes32" }],
  },
] as const;

const ZERO_HASH = "0x0000000000000000000000000000000000000000000000000000000000000000";

function poolAddress(): Address {
  const path = resolve(process.cwd(), process.env.ADDRESSES_PATH ?? "../shared/addresses.arc.json");
  const json = JSON.parse(readFileSync(path, "utf-8")) as { contracts: { Pool: Address } };
  return json.contracts.Pool;
}

function runnerKey(): `0x${string}` {
  const pk = process.env.DEPLOYER_PRIVATE_KEY;
  if (!pk) throw new Error("DEPLOYER_PRIVATE_KEY (runner key) not set");
  return (pk.startsWith("0x") ? pk : `0x${pk}`) as `0x${string}`;
}

export async function alreadyPredictedOnChain(
  poolId: bigint,
  agentId: bigint,
  fixtureId: bigint,
): Promise<boolean> {
  const hash = await createArcPublicClient().readContract({
    address: poolAddress(),
    abi: poolAbi,
    functionName: "predictionHash",
    args: [poolId, agentId, fixtureId],
  });
  return hash !== ZERO_HASH;
}

export async function recordPredictionOnChain(
  poolId: bigint,
  agentId: bigint,
  fixtureId: bigint,
  hash: Bytes32,
): Promise<Hash> {
  const rpc = process.env.RPC;
  if (!rpc) throw new Error("process.env.RPC not set");
  const wallet = createWalletClient({
    account: privateKeyToAccount(runnerKey()),
    chain: arcTestnet,
    transport: http(rpc),
  });
  return wallet.writeContract({
    address: poolAddress(),
    abi: poolAbi,
    functionName: "recordPrediction",
    args: [poolId, agentId, fixtureId, hash],
  });
}
