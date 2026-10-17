// File-backed store for the runtime, in the data dir shared with the app ($LONGSHOT_DATA_DIR,
// default ./.data). Agents are stored as their JSON-safe template (recompiled to an AgentConfig on
// read, since AgentConfig holds bigints). Predictions are stored for idempotency (never predict the
// same fixture twice per agent) and for the agent page and /stats.

import type { Address, Bytes32, Fixture, Purchase } from "@longshot/shared";
import { readJsonFile, writeJsonFile } from "@longshot/shared/server";
import type { EvidenceDecision } from "./predict.js";
import { compileTemplate, type AgentConfig, type AgentTemplate } from "./template.js";

export interface AgentRecord {
  agentId: string;
  owner: Address;
  poolId: string;
  /** The agent's own wallet (key in the keystore). Empty until provisioned. */
  walletAddress: Address | "";
  template: AgentTemplate;
  /** On-chain agentId from AgentRegistry, once registered. */
  onChainAgentId?: string;
  /** House agents are run and topped up by the treasury so every league has a field. */
  house?: boolean;
  avatar?: { style: string; seed: string };
  createdAt?: string;
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
  spent: string; // USDC base units
  decisions: EvidenceDecision[];
  /** recordPrediction tx on Arc, once committed. */
  commitTx?: string;
  createdAt: string;
}

export function allAgents(): AgentRecord[] {
  return readJsonFile<AgentRecord[]>("agents.json", []);
}

export function saveAgent(record: AgentRecord): void {
  const agents = allAgents().filter((a) => a.agentId !== record.agentId);
  agents.push(record);
  writeJsonFile("agents.json", agents);
}

export function agentsInPool(poolId: string): (AgentRecord & { config: AgentConfig })[] {
  return allAgents()
    .filter((a) => a.poolId === poolId)
    .map((a) => ({ ...a, config: compileTemplate(a.template) }));
}

export function allPredictions(): StoredPrediction[] {
  return readJsonFile<StoredPrediction[]>("predictions.json", []);
}

export function savePrediction(p: StoredPrediction): void {
  const all = allPredictions().filter((x) => !(x.agentId === p.agentId && x.fixtureId === p.fixtureId));
  all.push(p);
  writeJsonFile("predictions.json", all);
}

export function markCommitted(agentId: string, fixtureId: string, tx: string): void {
  const all = allPredictions();
  const p = all.find((x) => x.agentId === agentId && x.fixtureId === fixtureId);
  if (!p) return;
  p.commitTx = tx;
  writeJsonFile("predictions.json", all);
}

export function hasPredicted(agentId: string, fixtureId: string): boolean {
  return allPredictions().some((p) => p.agentId === agentId && p.fixtureId === fixtureId);
}

export function spentByAgent(agentId: string): bigint {
  return allPredictions()
    .filter((p) => p.agentId === agentId)
    .reduce((sum, p) => sum + BigInt(p.spent), 0n);
}

export function readFixtures(): Fixture[] {
  return readJsonFile<Fixture[]>("fixtures.json", []);
}

export function saveFixtures(fixtures: Fixture[]): void {
  writeJsonFile("fixtures.json", fixtures);
}

/** Append purchase records (the nanopayments) for /stats. */
export function savePurchases(purchases: Purchase[]): void {
  if (purchases.length === 0) return;
  const all = allStoredPurchases();
  const seen = new Set(all.map((p) => p.id));
  for (const p of purchases) if (!seen.has(p.id)) all.push(p);
  writeJsonFile("purchases.json", all);
}

export function allStoredPurchases(): Purchase[] {
  return readJsonFile<Purchase[]>("purchases.json", []);
}

/** Worker bookkeeping: which (pool, fixture) results are on-chain, last run times, errors. */
export interface WorkerState {
  resolved: Record<string, true>; // `${poolId}:${fixtureId}`
  scoredAt: Record<string, string>; // poolId -> ISO
  lastSyncAt?: string;
  lastHistorySyncAt?: string;
  lastTickAt?: string;
  lastError?: string;
  log: { at: string; msg: string }[];
}

export function readWorkerState(): WorkerState {
  return readJsonFile<WorkerState>("worker.json", { resolved: {}, scoredAt: {}, log: [] });
}

export function writeWorkerState(s: WorkerState): void {
  s.log = s.log.slice(-200);
  writeJsonFile("worker.json", s);
}
