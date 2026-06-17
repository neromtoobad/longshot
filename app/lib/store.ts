// App-side access to the shared runtime store (written by fixtures:sync + the agent runner, and by
// the register flow). Shares LONGSHOT_DATA_DIR with the agent.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Bytes32, EvidenceSource, Purchase } from "@longshot/shared";

const DATA_DIR = resolve(process.cwd(), process.env.LONGSHOT_DATA_DIR ?? ".data");

function read<T>(file: string, fallback: T): T {
  const path = resolve(DATA_DIR, file);
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, "utf-8")) as T;
}

function write(file: string, value: unknown): void {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(resolve(DATA_DIR, file), JSON.stringify(value, null, 2));
}

export interface StoredAgent {
  agentId: string;
  owner: string;
  poolId: string;
  walletId: string;
  walletAddress: string;
  onChainAgentId?: string;
  gatewayDeposited?: boolean;
  template: {
    name: string;
    persona: string;
    prompt: string;
    riskAppetite: string;
    dataPreference: { preferBroker: boolean; willingnessToPay: Partial<Record<EvidenceSource, string>> };
    modelProvider: "venice";
    model?: string;
    budget: string;
  };
}

export interface EvidenceDecision {
  source: EvidenceSource;
  priceUSDC: string;
  willingnessToPayUSDC: string;
  valuePerDollar: number;
  decision: "buy" | "skip";
  reason: string;
  settlementUuid?: string;
}

export interface StoredPrediction {
  agentId: string;
  fixtureId: string;
  poolId: string;
  homeScore: number;
  awayScore: number;
  confidence: number;
  rationale: string;
  predictionHash: Bytes32;
  spent: string;
  decisions?: EvidenceDecision[];
  createdAt: string;
}

export function readAgents(): StoredAgent[] {
  return read<StoredAgent[]>("agents.json", []);
}
export function readPredictions(): StoredPrediction[] {
  return read<StoredPrediction[]>("predictions.json", []);
}
export function readPurchases(): Purchase[] {
  return read<Purchase[]>("purchases.json", []);
}

/** Persist a new agent (register flow). Returns the assigned agentId. */
export function saveAgent(agent: Omit<StoredAgent, "agentId"> & { agentId?: string }): StoredAgent {
  const agents = readAgents();
  const agentId = agent.agentId ?? String(agents.length + 1);
  const record: StoredAgent = { ...agent, agentId };
  write("agents.json", [...agents.filter((a) => a.agentId !== agentId), record]);
  return record;
}
