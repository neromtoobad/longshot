// Agent template schema + compiler (EXECUTION_PLAN Phase 4.1).
//
// A template is a single editable prompt plus a small structured header the user tunes. The
// compiler validates it and turns it into a runnable AgentConfig + a templateHash (bytes32) that
// matches what AgentRegistry stores on-chain. Same template in -> same hash out.

import { keccak256, toBytes } from "viem";
import type { Bytes32, EvidenceSource, RiskAppetite, UsdcBaseUnits } from "@longshot/shared";

export const EVIDENCE_SOURCES: EvidenceSource[] = ["form", "odds", "injuries", "h2h"];
export const DEFAULT_MODEL = "qwen3-235b-a22b-instruct-2507";

export interface AgentTemplate {
  name: string;
  /** The editable instruction prompt that drives the model. */
  prompt: string;
  /** Free-text persona / read on the game. */
  persona: string;
  riskAppetite: RiskAppetite;
  dataPreference: {
    /** Prefer buying through the Data Broker (reputation) vs direct from source. */
    preferBroker: boolean;
    /** Max it will pay per source (USDC base units). Missing or "0" = never buy that source. */
    willingnessToPay: Partial<Record<EvidenceSource, UsdcBaseUnits>>;
  };
  modelProvider: "venice";
  model?: string;
  /** Total data budget for the agent (USDC base units). */
  budget: UsdcBaseUnits;
}

export interface AgentConfig {
  name: string;
  prompt: string;
  persona: string;
  riskAppetite: RiskAppetite;
  preferBroker: boolean;
  /** Max willingness-to-pay per source, base units; every source present, default 0n. */
  willingnessToPay: Record<EvidenceSource, bigint>;
  modelProvider: "venice";
  model: string;
  budget: bigint;
  templateHash: Bytes32;
}

export class TemplateValidationError extends Error {
  constructor(public readonly issues: string[]) {
    super(`invalid agent template: ${issues.join("; ")}`);
    this.name = "TemplateValidationError";
  }
}

function parseAmount(label: string, value: string | undefined, issues: string[]): bigint {
  if (value === undefined) return 0n;
  if (!/^\d+$/.test(value)) {
    issues.push(`${label} must be a non-negative integer string of USDC base units, got "${value}"`);
    return 0n;
  }
  return BigInt(value);
}

/** Deterministic JSON (sorted keys) so the templateHash is stable across runs and machines. */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const keys = Object.keys(value as Record<string, unknown>).sort();
    return `{${keys
      .map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

/** keccak256 of the canonical template — the bytes32 stored in AgentRegistry. */
export function hashTemplate(template: AgentTemplate): Bytes32 {
  return keccak256(toBytes(stableStringify(template)));
}

export function compileTemplate(template: AgentTemplate): AgentConfig {
  const issues: string[] = [];

  if (!template.name?.trim()) issues.push("name is required");
  if (!template.prompt?.trim()) issues.push("prompt is required");
  if (!template.persona?.trim()) issues.push("persona is required");
  if (!["low", "medium", "high"].includes(template.riskAppetite)) {
    issues.push(`riskAppetite must be low|medium|high, got "${template.riskAppetite}"`);
  }
  if (template.modelProvider !== "venice") {
    issues.push(`modelProvider must be "venice", got "${template.modelProvider}"`);
  }

  const budget = parseAmount("budget", template.budget, issues);

  const willingnessToPay = {} as Record<EvidenceSource, bigint>;
  for (const source of EVIDENCE_SOURCES) {
    willingnessToPay[source] = parseAmount(
      `dataPreference.willingnessToPay.${source}`,
      template.dataPreference?.willingnessToPay?.[source],
      issues,
    );
  }

  if (issues.length > 0) throw new TemplateValidationError(issues);

  return {
    name: template.name.trim(),
    prompt: template.prompt,
    persona: template.persona,
    riskAppetite: template.riskAppetite,
    preferBroker: Boolean(template.dataPreference?.preferBroker),
    willingnessToPay,
    modelProvider: "venice",
    model: template.model?.trim() || DEFAULT_MODEL,
    budget,
    templateHash: hashTemplate(template),
  };
}
