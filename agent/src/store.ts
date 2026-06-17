// File-backed store for the runtime. Agents are stored as their JSON-safe template (recompiled to
// an AgentConfig on read, since AgentConfig holds bigints). Predictions are stored for idempotency
// (never predict the same fixture twice per agent) and for the agent page / /stats. MVP persistence
// — swap for a DB later. Location: $LONGSHOT_DATA_DIR or ./.data (gitignored).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Address, Bytes32, Fixture, Purchase } from "@longshot/shared";
import type { EvidenceDecision } from "./predict.js";
import { compileTemplate, type AgentConfig, type AgentTemplate } from "./template.js";

const DATA_DIR = resolve(process.cwd(), process.env.LONGSHOT_DATA_DIR ?? ".data");
const AGENTS = resolve(DATA_DIR, "agents.json");
const PREDICTIONS = resolve(DATA_DIR, "predictions.json");
const FIXTURES = resolve(DATA_DIR, "fixtures.json");
const PURCHASES = resolve(DATA_DIR, "purchases.json");

function readJson<T>(path: string, fallback: T): T {
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, "utf-8")) as T;
}
function writeJson(path: string, value: unknown): void {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2));
}

export interface AgentRecord {
  agentId: string;
  owner: Address;
  poolId: string;
  walletId: string;
  walletAddress: Address;
  template: AgentTemplate;
  /** On-chain agentId from AgentRegistry, once registered. */
  onChainAgentId?: string;
  /** Whether the agent's Circle wallet has deposited USDC into Gateway. */
  gatewayDeposited?: boolean;
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
  createdAt: string;
}

export function saveAgent(record: AgentRecord): void {
  const agents = readJson<AgentRecord[]>(AGENTS, []).filter((a) => a.agentId !== record.agentId);
  agents.push(record);
  writeJson(AGENTS, agents);
}

export function allAgents(): AgentRecord[] {
  return readJson<AgentRecord[]>(AGENTS, []);
}

export function agentsInPool(poolId: string): (AgentRecord & { config: AgentConfig })[] {
  return allAgents()
    .filter((a) => a.poolId === poolId)
    .map((a) => ({ ...a, config: compileTemplate(a.template) }));
}

export function savePrediction(p: StoredPrediction): void {
  const all = readJson<StoredPrediction[]>(PREDICTIONS, []).filter(
    (x) => !(x.agentId === p.agentId && x.fixtureId === p.fixtureId),
  );
  all.push(p);
  writeJson(PREDICTIONS, all);
}

export function allPredictions(): StoredPrediction[] {
  return readJson<StoredPrediction[]>(PREDICTIONS, []);
}

export function hasPredicted(agentId: string, fixtureId: string): boolean {
  return allPredictions().some((p) => p.agentId === agentId && p.fixtureId === fixtureId);
}

export function spentByAgent(agentId: string): bigint {
  return allPredictions()
    .filter((p) => p.agentId === agentId)
    .reduce((sum, p) => sum + BigInt(p.spent), 0n);
}

/** Read synced fixtures (written by fixtures:sync) — same file the app uses. */
export function readFixtures(): Fixture[] {
  return readJson<Fixture[]>(FIXTURES, []);
}

/** Append purchase records (the nanopayments) for /stats. */
export function savePurchases(purchases: Purchase[]): void {
  if (purchases.length === 0) return;
  const all = readJson<Purchase[]>(PURCHASES, []);
  const seen = new Set(all.map((p) => p.id));
  for (const p of purchases) if (!seen.has(p.id)) all.push(p);
  writeJson(PURCHASES, all);
}

export function allStoredPurchases(): Purchase[] {
  return readJson<Purchase[]>(PURCHASES, []);
}
