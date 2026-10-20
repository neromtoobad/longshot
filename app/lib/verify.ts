// Server-side checks that tie API writes to on-chain facts and wallet signatures.

import { verifyMessage, type Address } from "viem";
import { ADDRESSES, createArcPublicClient } from "@longshot/shared";

const getAgentAbi = [
  {
    type: "function",
    name: "getAgent",
    stateMutability: "view",
    inputs: [{ name: "agentId", type: "uint256" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "owner", type: "address" },
          { name: "name", type: "string" },
          { name: "templateHash", type: "bytes32" },
          { name: "walletAddress", type: "address" },
          { name: "poolId", type: "uint256" },
        ],
      },
    ],
  },
] as const;

/** The registry's record for an on-chain agent id, or null if unknown. */
export async function registryAgent(agentId: string) {
  try {
    return await createArcPublicClient().readContract({
      address: ADDRESSES.contracts.AgentRegistry,
      abi: getAgentAbi,
      functionName: "getAgent",
      args: [BigInt(agentId)],
    });
  } catch {
    return null;
  }
}

/** The message a wallet signs to edit an agent. Includes a timestamp so a signature expires. */
export function editMessage(agentId: string, issuedAt: string): string {
  return `LONGSHOT: edit agent ${agentId}\nissued ${issuedAt}`;
}

/** The message a wallet signs to save an agent whose template differs from its registration. */
export function saveMessage(agentId: string, issuedAt: string): string {
  return `LONGSHOT: save agent ${agentId}\nissued ${issuedAt}`;
}

/** True when `signature` is `owner`'s signature over the save message, issued in the last 10 min. */
export async function verifySave(agentId: string, owner: string, issuedAt: string, signature: string): Promise<boolean> {
  const t = new Date(issuedAt).getTime();
  if (!Number.isFinite(t) || Math.abs(Date.now() - t) > 10 * 60 * 1000) return false;
  try {
    return await verifyMessage({ address: owner as Address, message: saveMessage(agentId, issuedAt), signature: signature as `0x${string}` });
  } catch {
    return false;
  }
}

/** True when `signature` is `owner`'s signature over the edit message, issued in the last 10 min. */
export async function verifyEdit(agentId: string, owner: string, issuedAt: string, signature: string): Promise<boolean> {
  const t = new Date(issuedAt).getTime();
  if (!Number.isFinite(t) || Math.abs(Date.now() - t) > 10 * 60 * 1000) return false;
  try {
    return await verifyMessage({
      address: owner as Address,
      message: editMessage(agentId, issuedAt),
      signature: signature as `0x${string}`,
    });
  } catch {
    return false;
  }
}

const ownerAbi = [
  {
    type: "function",
    name: "agentsByOwner",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ type: "uint256[]" }],
  },
] as const;

const joinedAbi = [
  {
    type: "function",
    name: "joined",
    stateMutability: "view",
    inputs: [{ type: "uint256" }, { type: "uint256" }],
    outputs: [{ type: "bool" }],
  },
] as const;

/** On-chain agent ids registered by an owner (oldest first). */
export async function agentIdsByOwner(owner: string): Promise<bigint[]> {
  try {
    const ids = await createArcPublicClient().readContract({
      address: ADDRESSES.contracts.AgentRegistry,
      abi: ownerAbi,
      functionName: "agentsByOwner",
      args: [owner as Address],
    });
    return [...ids];
  } catch {
    return [];
  }
}

/** The on-chain pool ids an agent has joined (normally zero or one). */
export async function joinedPoolIds(agentId: string): Promise<number[]> {
  const out: number[] = [];
  for (const p of Object.values(ADDRESSES.pools)) {
    if (!p) continue;
    try {
      const ok = await createArcPublicClient().readContract({
        address: ADDRESSES.contracts.Pool,
        abi: joinedAbi,
        functionName: "joined",
        args: [BigInt(p.poolId), BigInt(agentId)],
      });
      if (ok) out.push(p.poolId);
    } catch {
      /* skip */
    }
  }
  return out;
}
