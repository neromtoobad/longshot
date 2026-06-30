// Data Broker (RFB 3). Aggregates the four evidence sources and resells them via its own x402
// endpoints at a small bps markup. The broker keeps the markup as revenue and passes the base
// price through to the source — a 2-hop agent-to-agent payment chain. Tracks per-source reputation
// (hit rate of served data vs outcomes) and broker revenue, both surfaced for /stats.

import type { EvidenceSource } from "@longshot/shared";
import { EVIDENCE_PRICES, priceToAtomic } from "./x402";
import { formEvidence, oddsEvidence, injuriesEvidence, h2hEvidence } from "./evidence";
import { readData, writeData } from "./datadir";

export const SOURCES: EvidenceSource[] = ["form", "odds", "injuries", "h2h"];

/** Broker markup in basis points (default 20%). Configurable via BROKER_MARKUP_BPS. */
export const BROKER_MARKUP_BPS = Number(process.env.BROKER_MARKUP_BPS ?? 2000);

export function isSource(s: string): s is EvidenceSource {
  return (SOURCES as string[]).includes(s);
}

/** Split a source's broker price into base (passthrough) + markup (broker revenue), atomic units. */
export function brokerPriceAtomic(source: EvidenceSource): { base: number; markup: number; total: number } {
  const base = priceToAtomic(EVIDENCE_PRICES[source]);
  const markup = Math.floor((base * BROKER_MARKUP_BPS) / 10_000);
  return { base, markup, total: base + markup };
}

/** "$0.00X" string for the broker price (consumed by withGateway). */
export function brokerPriceStr(source: EvidenceSource): string {
  return `$${brokerPriceAtomic(source).total / 1_000_000}`;
}

export function evidenceFor(source: EvidenceSource, fixtureId: string) {
  switch (source) {
    case "form":
      return formEvidence(fixtureId);
    case "odds":
      return oddsEvidence(fixtureId);
    case "injuries":
      return injuriesEvidence(fixtureId);
    case "h2h":
      return h2hEvidence(fixtureId);
  }
}

// --- reputation (hit rate of served data vs outcomes) ----------------------
// Populated in Phase 5 when fixtures resolve; starts empty.

interface Rep {
  served: number;
  hits: number;
}
const reputation = new Map<EvidenceSource, Rep>();

export function recordOutcome(source: EvidenceSource, hit: boolean): void {
  const r = reputation.get(source) ?? { served: 0, hits: 0 };
  r.served += 1;
  if (hit) r.hits += 1;
  reputation.set(source, r);
}

export function reputationOf(source: EvidenceSource): { served: number; hitRate: number | null } {
  const r = reputation.get(source);
  if (!r || r.served === 0) return { served: 0, hitRate: null };
  return { served: r.served, hitRate: +(r.hits / r.served).toFixed(3) };
}

// --- broker revenue --------------------------------------------------------

interface Rev {
  count: number;
  passthroughAtomic: number; // base, owed to the source
  revenueAtomic: number; // markup, kept by the broker
}

// File-backed so /stats reads real broker revenue across server restarts (seed snapshot on serverless).
function loadRevenue(): Record<string, Rev> {
  return readData<Record<string, Rev>>("broker.json", {});
}

export function recordBrokerSale(source: EvidenceSource, baseAtomic: number, markupAtomic: number): void {
  const all = loadRevenue();
  const r = all[source] ?? { count: 0, passthroughAtomic: 0, revenueAtomic: 0 };
  r.count += 1;
  r.passthroughAtomic += baseAtomic;
  r.revenueAtomic += markupAtomic;
  all[source] = r;
  writeData("broker.json", all);
}

export function brokerRevenue() {
  const revenue = loadRevenue();
  let totalRevenue = 0;
  let totalPassthrough = 0;
  let totalSales = 0;
  const bySource = SOURCES.map((source) => {
    const r = revenue[source] ?? { count: 0, passthroughAtomic: 0, revenueAtomic: 0 };
    totalRevenue += r.revenueAtomic;
    totalPassthrough += r.passthroughAtomic;
    totalSales += r.count;
    return {
      source,
      sales: r.count,
      revenueUSDC: (r.revenueAtomic / 1_000_000).toString(),
      passthroughUSDC: (r.passthroughAtomic / 1_000_000).toString(),
    };
  });
  return {
    markupBps: BROKER_MARKUP_BPS,
    paymentChainDepth: 2, // agent -> broker -> source
    totalSales,
    totalRevenueUSDC: (totalRevenue / 1_000_000).toString(),
    totalPassthroughUSDC: (totalPassthrough / 1_000_000).toString(),
    bySource,
  };
}

export function brokerCatalog() {
  return {
    markupBps: BROKER_MARKUP_BPS,
    sources: SOURCES.map((source) => {
      const p = brokerPriceAtomic(source);
      return {
        source,
        basePriceUSDC: (p.base / 1_000_000).toString(),
        markupUSDC: (p.markup / 1_000_000).toString(),
        brokerPriceUSDC: (p.total / 1_000_000).toString(),
        reputation: reputationOf(source),
      };
    }),
  };
}
