// App-side read access to the shared runtime store (written by fixtures:sync + the agent runner).
// Read-only; the app never writes these. Shares LONGSHOT_DATA_DIR with the agent.

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Bytes32, EvidenceSource, Purchase } from "@longshot/shared";

const DATA_DIR = resolve(process.cwd(), process.env.LONGSHOT_DATA_DIR ?? ".data");

function read<T>(file: string, fallback: T): T {
  const path = resolve(DATA_DIR, file);
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, "utf-8")) as T;
}

export interface StoredAgent {
  agentId: string;
  owner: string;
  poolId: string;
  walletId: string;
  walletAddress: string;
  template: {
    name: string;
    persona: string;
    prompt: string;
    riskAppetite: string;
    dataPreference: { preferBroker: boolean; willingnessToPay: Partial<Record<EvidenceSource, string>> };
    budget: string;
  };
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
