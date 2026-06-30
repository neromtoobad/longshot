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
import { fetchMarketplaceResearch } from "./paying/marketplace.js";

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
  /** Model's estimate (0..1) of how much this source would sharpen THIS prediction. Absent on the
   *  static fallback path (no model key). This is the value-of-information judgment that makes the
   *  buy decision an agent decision, not a fixed formula. */
  estimatedValue?: number;
  decision: "buy" | "skip";
  reason: string;
  settlementUuid?: string;
}

/** Per-source plan the model returns before buying: how informative each source is for this match. */
export interface EvidencePlanItem {
  value: number; // 0..1
  worth: boolean;
  reason: string;
}
export type EvidencePlan = Partial<Record<EvidenceSource, EvidencePlanItem>>;

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
  /** Reason about the value of each evidence source for THIS fixture before buying. Returns null to
   *  fall back to the static willingness-to-pay heuristic (default: ask the model when a key is set). */
  planEvidence?: (args: {
    fixture: PredictFixture;
    config: AgentConfig;
    candidates: { source: EvidenceSource; priceUSDC: string }[];
    remainingUSDC: string;
  }) => Promise<EvidencePlan | null>;
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
// readily; lower risk only buys evidence priced well under its willingness-to-pay. (Static fallback
// when the model planner is unavailable.)
const MIN_VALUE_PER_DOLLAR: Record<RiskAppetite, number> = { low: 2, medium: 1.5, high: 1 };

// Minimum model-estimated value (0..1) the agent demands before paying, by risk appetite. Low-risk
// agents only pay for evidence the model thinks is highly informative for this match; high-risk
// agents pay on a weaker signal.
const MIN_ESTIMATED_VALUE: Record<RiskAppetite, number> = { low: 0.6, medium: 0.45, high: 0.3 };

/** Default evidence planner: ask the model to judge how much each paid source would sharpen THIS
 *  prediction. Returns null (→ static fallback) when no model key is configured (offline/tests) or
 *  on any error, so a prediction never blocks on the planning call. */
async function defaultPlanEvidence(args: {
  fixture: PredictFixture;
  config: AgentConfig;
  candidates: { source: EvidenceSource; priceUSDC: string }[];
  remainingUSDC: string;
}): Promise<EvidencePlan | null> {
  if (!process.env.MODEL_PROVIDER_KEY) return null;
  const { fixture, config, candidates, remainingUSDC } = args;
  if (candidates.length === 0) return null;
  const system = [
    `You are ${config.persona}`,
    config.prompt,
    `Before predicting a football score you may BUY paid evidence, each priced in USDC. Spend only where the data would actually change or sharpen your prediction for THIS specific match — not by habit. Cheap, decisive signals beat expensive marginal ones.`,
    `Respond with ONLY a JSON object, no markdown: {"plan":[{"source":"form|odds|injuries|h2h","value":<0..1 how much buying this would improve THIS prediction>,"worth":<true|false>,"reason":"<short, match-specific>"}]}.`,
  ].join("\n\n");
  const user = [
    `Fixture: ${fixture.home} (home) vs ${fixture.away} (away).`,
    `Budget remaining: $${remainingUSDC} USDC.`,
    `Evidence for sale:\n${candidates.map((c) => `- ${c.source}: $${c.priceUSDC}`).join("\n")}`,
    `Judge each source for this match.`,
  ].join("\n\n");
  try {
    const raw = (await veniceJson({ system, user, model: config.model })) as { plan?: unknown };
    const list = Array.isArray(raw?.plan) ? raw.plan : [];
    const plan: EvidencePlan = {};
    for (const item of list as Record<string, unknown>[]) {
      const source = String(item.source ?? "") as EvidenceSource;
      if (!(["form", "odds", "injuries", "h2h"] as string[]).includes(source)) continue;
      plan[source] = {
        value: clamp(num(item.value, 0.4), 0, 1),
        worth: item.worth !== false,
        reason: String(item.reason ?? "").slice(0, 160),
      };
    }
    return Object.keys(plan).length ? plan : null;
  } catch {
    return null;
  }
}

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

  const planEvidence = deps.planEvidence ?? defaultPlanEvidence;
  const minRatio = MIN_VALUE_PER_DOLLAR[config.riskAppetite];
  const minValue = MIN_ESTIMATED_VALUE[config.riskAppetite];
  const candidates = await listCandidates(baseUrl, config, fixture.id);

  let spent = args.spentSoFar ?? 0n;
  const remainingAtStart = config.budget - spent;
  let remaining = remainingAtStart > 0n ? remainingAtStart : 0n;

  // Valued sources the agent's config will pay anything for.
  const valued = candidates.filter((c) => config.willingnessToPay[c.source] > 0n);

  // Ask the model to judge each source's value for THIS match (best-effort; null → static fallback).
  const plan = await planEvidence({
    fixture,
    config,
    candidates: valued.map((c) => ({ source: c.source, priceUSDC: fmt(c.price) })),
    remainingUSDC: fmt(remaining),
  });

  // Rank: when the model planned, by estimated-value-per-dollar; else by willingness-to-pay/price.
  const ranked = valued
    .map((c) => {
      const item = plan?.[c.source];
      const priceUsd = Number(c.price) / 1_000_000;
      const staticVpd = Number(config.willingnessToPay[c.source]) / Number(c.price);
      const score = item ? item.value / priceUsd : staticVpd;
      return { ...c, item, staticVpd, score };
    })
    .sort((a, b) => b.score - a.score);

  const decisions: EvidenceDecision[] = [];
  const purchases: Purchase[] = [];
  const evidence: Partial<Record<EvidenceSource, unknown>> = {};

  for (const c of ranked) {
    const wtp = config.willingnessToPay[c.source];
    const base = {
      source: c.source,
      priceUSDC: fmt(c.price),
      willingnessToPayUSDC: fmt(wtp),
      valuePerDollar: +c.score.toFixed(2),
      ...(c.item ? { estimatedValue: +c.item.value.toFixed(2) } : {}),
    };
    if (c.price > wtp) {
      decisions.push({ ...base, decision: "skip", reason: `price ${fmt(c.price)} over willingness ${fmt(wtp)}` });
      continue;
    }
    if (c.price > remaining) {
      decisions.push({ ...base, decision: "skip", reason: `price ${fmt(c.price)} over remaining budget ${fmt(remaining)}` });
      continue;
    }
    if (c.item) {
      // Model-driven: pay only when the data is informative enough for this match to justify the cost.
      if (!c.item.worth || c.item.value < minValue) {
        decisions.push({ ...base, decision: "skip", reason: `model values it ${c.item.value.toFixed(2)} for this match (<${minValue}): ${c.item.reason}` });
        continue;
      }
    } else if (c.staticVpd < minRatio) {
      // Static fallback (no model key): value-per-dollar threshold by risk appetite.
      decisions.push({ ...base, decision: "skip", reason: `value/price ${c.staticVpd.toFixed(2)} below ${config.riskAppetite} threshold ${minRatio}` });
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
    decisions.push({
      ...base,
      decision: "buy",
      reason: c.item ? `worth it for this match: ${c.item.reason}` : "value clears threshold, within budget",
      settlementUuid: result.purchase.settlementUuid,
    });
  }

  // Assemble persona + bought evidence into the model context.
  const system = [
    `You are ${config.persona}`,
    config.prompt,
    `Respond with ONLY a JSON object, no markdown: {"homeScore": <int>=0>, "awayScore": <int>=0>, "confidence": <0..1>, "rationale": "<one or two sentences>"}.`,
  ].join("\n\n");
  // Opt-in (USE_MARKETPLACE=1): buy real research from the Circle Agent Marketplace (x402 nanopayment
  // on Base) and feed it to the model as premium evidence. Never blocks a prediction — skips on any error.
  let marketplaceBlock = "";
  if (process.env.USE_MARKETPLACE === "1") {
    try {
      const r = await fetchMarketplaceResearch(
        `${fixture.home} vs ${fixture.away} football match preview: recent form, key injuries, head-to-head, likely scoreline. World Cup 2026.`,
      );
      if (r.ok && r.text) {
        marketplaceBlock = `Premium research you bought from the Circle Agent Marketplace (x402 nanopayment on ${r.chain}):\n${r.text}`;
      }
    } catch {
      /* marketplace is best-effort; never block the prediction */
    }
  }

  const user = [
    `Fixture: ${fixture.home} (home) vs ${fixture.away} (away).`,
    Object.keys(evidence).length
      ? `Evidence you bought:\n${JSON.stringify(evidence, null, 2)}`
      : `You chose to buy no evidence. Predict from your prior.`,
    marketplaceBlock,
    `Predict the exact final score.`,
  ]
    .filter(Boolean)
    .join("\n\n");

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
