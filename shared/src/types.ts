// LONGSHOT data model (BUILD_GUIDE section 4).
//
// USDC convention: all USDC amounts are stored as strings of base units at 6 decimals
// (e.g. "10000" = 0.01 USDC). Strings, not bigint, so the model is JSON-serializable across
// API routes and persistence. Convert with the helpers in ./usdc.ts. Never use floats for money.

export const USDC_DECIMALS = 6;

/** USDC amount in base units (6 decimals), as a decimal string. e.g. "2500" = 0.0025 USDC. */
export type UsdcBaseUnits = string;

/** A bytes32 hex string, e.g. a templateHash or predictionHash. */
export type Bytes32 = `0x${string}`;

/** An EVM address. */
export type Address = `0x${string}`;

/** ISO-8601 timestamp string. */
export type IsoTimestamp = string;

export type RiskAppetite = "low" | "medium" | "high";

export type EvidenceSource = "form" | "odds" | "injuries" | "h2h";

export type PoolStatus = "open" | "closed" | "finalized";

export type FixtureStatus = "scheduled" | "in_play" | "final";

export interface Agent {
  id: string;
  owner: Address;
  name: string;
  /** The editable prompt template the agent was built from. */
  template: string;
  walletAddress: Address;
  poolId: string;
  /** Total budget allocated to this agent for data buys. */
  budget: UsdcBaseUnits;
  /** Cumulative USDC spent on evidence so far. */
  spent: UsdcBaseUnits;
  createdAt: IsoTimestamp;
}

export interface Pool {
  id: string;
  tournament: string;
  entryFee: UsdcBaseUnits;
  budgetPerAgent: UsdcBaseUnits;
  /** Prize split for the top N agents, in basis points. Must sum to 10000. */
  prizeSplit: number[];
  status: PoolStatus;
  /** Total escrowed entry fees = the prize pool. */
  prizePool: UsdcBaseUnits;
}

export interface Fixture {
  id: string;
  poolId: string;
  home: string;
  away: string;
  /** Team crest/logo URLs (from ESPN); null if unavailable. */
  homeLogo: string | null;
  awayLogo: string | null;
  kickoff: IsoTimestamp;
  status: FixtureStatus;
  /** Final home score; null until resolved. */
  homeScore: number | null;
  /** Final away score; null until resolved. */
  awayScore: number | null;
}

export interface Prediction {
  id: string;
  agentId: string;
  fixtureId: string;
  homeScore: number;
  awayScore: number;
  /** Model confidence, 0..1. */
  confidence: number;
  rationale: string;
  createdAt: IsoTimestamp;
}

export interface Purchase {
  id: string;
  agentId: string;
  fixtureId: string;
  source: EvidenceSource;
  priceUSDC: UsdcBaseUnits;
  /** Gateway settlement UUID (the receipt) and/or the on-chain batch tx hash once reconciled. */
  settlementUuid: string;
  batchTxHash: Bytes32 | null;
  createdAt: IsoTimestamp;
}

export interface Score {
  agentId: string;
  fixtureId: string;
  /** Points earned for this fixture: exact score = 3, correct result = 1, correct goal diff = 1. */
  points: number;
  /** Running cumulative points for the agent across the pool. */
  cumulative: number;
}
