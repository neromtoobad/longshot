// App-side access to the shared runtime store (written by fixtures:sync + the agent runner, and by
// the register flow). Shares LONGSHOT_DATA_DIR with the agent.

import type { Bytes32, EvidenceSource, Purchase } from "@longshot/shared";
import { readData as read, writeData as write } from "./datadir";

export interface StoredAgent {
  agentId: string;
  owner: string;
  poolId: string;
  walletId: string;
  walletAddress: string;
  onChainAgentId?: string;
  gatewayDeposited?: boolean;
  /** Cosmetic agent image (DiceBear style + seed). Not part of the on-chain template hash. */
  avatar?: { style: string; seed: string };
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

export interface Settlement {
  uuid: string;
  status: string;
  fromAddress: string | null;
  toAddress: string | null;
  amount: string | null;
  network: string | null;
  settledAt: string | null;
  batchTxHash: string | null;
}

export function readSettlements(): Settlement[] {
  return read<Settlement[]>("settlements.json", []);
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

export interface AgentPatch {
  name?: string;
  persona?: string;
  prompt?: string;
  riskAppetite?: string;
  preferBroker?: boolean;
  budget?: string; // USDC base units
  willingnessToPay?: Partial<Record<EvidenceSource, string>>;
  avatar?: { style: string; seed: string };
}

/**
 * Edit an existing agent's strategy. Owner-gated: only succeeds when `owner` matches the stored
 * owner (case-insensitive). Returns the updated record, or null on not-found / wrong owner. The
 * on-chain registration (templateHash) is the original commitment; this tunes the off-chain config
 * the runtime uses.
 */
export function updateAgent(agentId: string, owner: string, patch: AgentPatch): StoredAgent | null {
  const agents = readAgents();
  const idx = agents.findIndex((a) => a.agentId === agentId);
  if (idx < 0) return null;
  const a = agents[idx];
  if (!a.owner || a.owner.toLowerCase() !== owner.toLowerCase()) return null;

  const t = a.template;
  const updated: StoredAgent = {
    ...a,
    avatar: patch.avatar ?? a.avatar,
    template: {
      ...t,
      name: patch.name?.trim() || t.name,
      persona: patch.persona ?? t.persona,
      prompt: patch.prompt ?? t.prompt,
      riskAppetite: patch.riskAppetite ?? t.riskAppetite,
      budget: patch.budget ?? t.budget,
      dataPreference: {
        preferBroker: patch.preferBroker ?? t.dataPreference.preferBroker,
        willingnessToPay: patch.willingnessToPay ?? t.dataPreference.willingnessToPay,
      },
    },
  };
  agents[idx] = updated;
  write("agents.json", agents);
  return updated;
}
