// Predict loop (EXECUTION_PLAN Phase 4.2) — the core agentic behaviour.
//
// For one agent and one fixture: rank candidate evidence by expected value vs price (the
// buy-or-skip decision under budget — logged for the agent page + the ROI story), buy what's worth
// it through the paying client (cap-enforced), assemble it + the persona into the model context,
// call Venice, and emit a structured prediction + a commitment hash for Pool.recordPrediction.
//
// buy / model / catalog deps are injectable so the loop is testable without network or payment.

import { keccak256, toBytes } from "viem";
import type { Bytes32, EvidenceSource, Purchase, RiskAppetite } from "@longshot/shared";
import type { AgentConfig } from "./template.js";
import { buyEvidence, type BuyEvidenceResult } from "./paying/client.js";
import type { X402Signer } from "./paying/signers.js";
import { veniceJson } from "./model/venice.js";

export interface PredictFixture {
  id: string;
  home: string;
  away: string;
}

export interface Prediction {
  homeScore: number;
  awayScore: number;
  confidence: number; // 0..1
  rationale: string;
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

export interface PredictResult {
  agentId: string;
  fixtureId: string;
  prediction: Prediction;
  predictionHash: Bytes32;
  decisions: EvidenceDecision[];
  purchases: Purchase[];
  spent: bigint;
}

export interface Candidate {
  source: EvidenceSource;
  price: bigint;
  url: string;
}

export interface PredictDeps {
  /** List candidate evidence (source, price, paywalled URL) for the fixture. */
  listCandidates?: (baseUrl: string, config: AgentConfig, fixtureId: string) => Promise<Candidate[]>;
  /** Buy one evidence item (defaults to the real paying client). */
  buy?: (args: Parameters<typeof buyEvidence>[0]) => Promise<BuyEvidenceResult>;
  /** Call the model with system + user prompts, returning parsed JSON. */
  callModel?: (system: string, user: string) => Promise<unknown>;
}

export interface PredictArgs {
  config: AgentConfig;
  agentId: string;
  fixture: PredictFixture;
  signer: X402Signer;
  baseUrl: string;
  /** Cumulative spend before this fixture (for the budget cap across a pool). */
  spentSoFar?: bigint;
  deps?: PredictDeps;
}

// Minimum value-per-dollar an agent demands before buying, by risk appetite. Higher risk buys more
// readily; lower risk only buys evidence priced well under its willingness-to-pay.
const MIN_VALUE_PER_DOLLAR: Record<RiskAppetite, number> = { low: 2, medium: 1.5, high: 1 };

function parseUsdc(s: string): bigint {
  return BigInt(Math.round(parseFloat(s) * 1_000_000));
}
function fmt(v: bigint): string {
  return (Number(v) / 1_000_000).toString();
}

/** Default candidate lister: read the broker catalog, price by the agent's broker-vs-direct pref. */
async function defaultListCandidates(
  baseUrl: string,
  config: AgentConfig,
  fixtureId: string,
): Promise<Candidate[]> {
  const res = await fetch(`${baseUrl}/api/broker/catalog`);
  const catalog = (await res.json()) as {
    sources: { source: EvidenceSource; basePriceUSDC: string; brokerPriceUSDC: string }[];
  };
  return catalog.sources.map((s) => {
    const price = parseUsdc(config.preferBroker ? s.brokerPriceUSDC : s.basePriceUSDC);
    const path = config.preferBroker ? `/api/broker/evidence/${s.source}` : `/api/evidence/${s.source}`;
    return { source: s.source, price, url: `${baseUrl}${path}?fixtureId=${fixtureId}` };
  });
}

function num(x: unknown, fallback: number): number {
  const n = typeof x === "number" ? x : Number(x);
  return Number.isFinite(n) ? n : fallback;
}
function clamp(x: number, lo: number, hi: number): number {
  return Math.min(Math.max(x, lo), hi);
}

function parsePrediction(raw: unknown): Prediction {
  const o = (raw ?? {}) as Record<string, unknown>;
  return {
    homeScore: Math.max(0, Math.round(num(o.homeScore, 0))),
    awayScore: Math.max(0, Math.round(num(o.awayScore, 0))),
    confidence: clamp(num(o.confidence, 0.5), 0, 1),
    rationale: String(o.rationale ?? "").slice(0, 600),
  };
}

export function predictionHash(agentId: string, fixtureId: string, p: Prediction): Bytes32 {
  return keccak256(
    toBytes(`${agentId}|${fixtureId}|${p.homeScore}-${p.awayScore}|${p.confidence}`),
  );
}

export async function runPredictLoop(args: PredictArgs): Promise<PredictResult> {
  const { config, agentId, fixture, signer, baseUrl } = args;
  const deps = args.deps ?? {};
  const listCandidates = deps.listCandidates ?? defaultListCandidates;
  const buy = deps.buy ?? buyEvidence;
  const callModel =
    deps.callModel ?? ((system, user) => veniceJson({ system, user, model: config.model }));

  const minRatio = MIN_VALUE_PER_DOLLAR[config.riskAppetite];
  const candidates = await listCandidates(baseUrl, config, fixture.id);

  // Rank valued sources by value-per-dollar (willingness-to-pay / price), best first.
  const ranked = candidates
    .filter((c) => config.willingnessToPay[c.source] > 0n)
    .map((c) => ({ ...c, vpd: Number(config.willingnessToPay[c.source]) / Number(c.price) }))
    .sort((a, b) => b.vpd - a.vpd);

  let spent = args.spentSoFar ?? 0n;
  const remainingAtStart = config.budget - spent;
  let remaining = remainingAtStart > 0n ? remainingAtStart : 0n;

  const decisions: EvidenceDecision[] = [];
  const purchases: Purchase[] = [];
  const evidence: Partial<Record<EvidenceSource, unknown>> = {};

  for (const c of ranked) {
    const wtp = config.willingnessToPay[c.source];
    const base = {
      source: c.source,
      priceUSDC: fmt(c.price),
      willingnessToPayUSDC: fmt(wtp),
      valuePerDollar: +c.vpd.toFixed(2),
    };
    if (c.price > wtp) {
      decisions.push({ ...base, decision: "skip", reason: `price ${fmt(c.price)} over willingness ${fmt(wtp)}` });
      continue;
    }
    if (c.price > remaining) {
      decisions.push({ ...base, decision: "skip", reason: `price ${fmt(c.price)} over remaining budget ${fmt(remaining)}` });
      continue;
    }
    if (c.vpd < minRatio) {
      decisions.push({ ...base, decision: "skip", reason: `value/price ${c.vpd.toFixed(2)} below ${config.riskAppetite} threshold ${minRatio}` });
      continue;
    }

    const result = await buy({
      url: c.url,
      signer,
      agentId,
      fixtureId: fixture.id,
      source: c.source,
      budget: config.budget,
      spent,
    });
    if (!result.ok) {
      decisions.push({ ...base, decision: "skip", reason: `budget guard: ${result.reason}` });
      continue;
    }
    spent += c.price;
    remaining -= c.price;
    purchases.push(result.purchase);
    evidence[c.source] = result.data;
    decisions.push({ ...base, decision: "buy", reason: "value clears threshold, within budget", settlementUuid: result.purchase.settlementUuid });
  }

  // Assemble persona + bought evidence into the model context.
  const system = [
    `You are ${config.persona}`,
    config.prompt,
    `Respond with ONLY a JSON object, no markdown: {"homeScore": <int>=0>, "awayScore": <int>=0>, "confidence": <0..1>, "rationale": "<one or two sentences>"}.`,
  ].join("\n\n");
  const user = [
    `Fixture: ${fixture.home} (home) vs ${fixture.away} (away).`,
    Object.keys(evidence).length
      ? `Evidence you bought:\n${JSON.stringify(evidence, null, 2)}`
      : `You chose to buy no evidence. Predict from your prior.`,
    `Predict the exact final score.`,
  ].join("\n\n");

  const prediction = parsePrediction(await callModel(system, user));
  const hash = predictionHash(agentId, fixture.id, prediction);

  return {
    agentId,
    fixtureId: fixture.id,
    prediction,
    predictionHash: hash,
    decisions,
    purchases,
    spent: spent - (args.spentSoFar ?? 0n),
  };
}
