// Deployed Arc testnet addresses + the on-chain pool ids per competition. Written by
// `pnpm --filter @longshot/agent deploy:all`; imported at build time so the browser and the
// server read the same values.

import raw from "./addresses.json" with { type: "json" };
import type { Address } from "./types.js";
import type { CompetitionKey } from "./leagues.js";

export interface PoolDeployment {
  poolId: number;
  entryFeeUSDC: string;
  budgetPerAgentUSDC: string;
  prizeSplitBps: number[];
  createTx?: string;
}

export interface Addresses {
  network: string;
  chainId: number;
  usdc: Address;
  gatewayWallet: Address;
  contracts: { AgentRegistry: Address; Pool: Address; ReputationBond: Address };
  deploy: Record<string, string>;
  pools: Partial<Record<CompetitionKey, PoolDeployment>>;
}

export const ADDRESSES = raw as Addresses;

const ZERO = "0x0000000000000000000000000000000000000000";

/** True once the contracts have been deployed (addresses.json is no longer the zero template). */
export function isDeployed(): boolean {
  return ADDRESSES.contracts.Pool !== ZERO;
}

/** The pool deployment for a competition, or undefined if not created yet. */
export function poolFor(key: CompetitionKey): PoolDeployment | undefined {
  return ADDRESSES.pools[key];
}

/** Map an on-chain pool id (as a string) back to its competition key. */
export function competitionForPool(poolId: string): CompetitionKey | undefined {
  for (const [key, p] of Object.entries(ADDRESSES.pools)) {
    if (p && String(p.poolId) === poolId) return key as CompetitionKey;
  }
  return undefined;
}
