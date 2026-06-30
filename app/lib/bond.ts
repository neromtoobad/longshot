// Reads the on-chain ReputationBond: how much USDC the broker has staked behind each evidence
// source, how much has been slashed for bad data, and the resolved hit rate. Server-only (RPC).
// Reputation here is capital at risk on Arc, not a number — see contracts/src/ReputationBond.sol.

import { keccak256, toBytes, type Address } from "viem";
import { createArcPublicClient } from "@longshot/shared";
import { REPUTATION_BOND_ADDRESS } from "./contracts";

const bondAbi = [
  {
    type: "function",
    name: "bondOf",
    stateMutability: "view",
    inputs: [{ name: "key", type: "bytes32" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "bonder", type: "address" },
          { name: "posted", type: "uint256" },
          { name: "remaining", type: "uint256" },
          { name: "slashed", type: "uint256" },
          { name: "served", type: "uint64" },
          { name: "hits", type: "uint64" },
        ],
      },
    ],
  },
] as const;

const SOURCES = ["form", "odds", "injuries", "h2h"] as const;

export interface SourceBond {
  source: string;
  postedUSDC: string; // base units
  remainingUSDC: string;
  slashedUSDC: string;
  served: number;
  hits: number;
  hitRate: number | null; // 0..1, null until served
}

export interface BondSummary {
  address: string;
  totalStakedUSDC: string;
  totalRemainingUSDC: string;
  totalSlashedUSDC: string;
  sources: SourceBond[];
}

/** Read the broker's reputation bonds from Arc. Returns null if RPC is unset or the read fails
 *  (so the page degrades gracefully rather than erroring). */
export async function readBondReputation(): Promise<BondSummary | null> {
  try {
    const client = createArcPublicClient();
    const rows = await Promise.all(
      SOURCES.map(async (source) => {
        const key = keccak256(toBytes(source));
        const b = (await client.readContract({
          address: REPUTATION_BOND_ADDRESS as Address,
          abi: bondAbi,
          functionName: "bondOf",
          args: [key],
        })) as { posted: bigint; remaining: bigint; slashed: bigint; served: bigint; hits: bigint };
        const served = Number(b.served);
        const hits = Number(b.hits);
        return {
          source,
          postedUSDC: b.posted.toString(),
          remainingUSDC: b.remaining.toString(),
          slashedUSDC: b.slashed.toString(),
          served,
          hits,
          hitRate: served > 0 ? +(hits / served).toFixed(3) : null,
        } satisfies SourceBond;
      }),
    );
    const sum = (pick: (r: SourceBond) => string) => rows.reduce((a, r) => a + BigInt(pick(r)), 0n).toString();
    return {
      address: REPUTATION_BOND_ADDRESS,
      totalStakedUSDC: sum((r) => r.postedUSDC),
      totalRemainingUSDC: sum((r) => r.remainingUSDC),
      totalSlashedUSDC: sum((r) => r.slashedUSDC),
      sources: rows,
    };
  } catch {
    return null;
  }
}
