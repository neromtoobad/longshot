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
