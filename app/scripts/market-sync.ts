// Snapshot the real Circle Agent Marketplace catalog (x402 services) via the Circle CLI into
// app/lib/marketplace.json, which the /market page renders. Mirrors fixtures:sync.
//
// Run: pnpm market:sync   (needs the Circle CLI installed: `circle services search` works offline of auth)

import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

// LONGSHOT-relevant queries — the kinds of evidence a prediction agent would buy.
const QUERIES = ["web search", "research", "news", "sports", "odds prediction market", "crypto market data", "academic papers"];

const NETWORKS: Record<string, string> = {
  "eip155:8453": "Base",
  "eip155:84532": "Base Sepolia",
  "eip155:1": "Ethereum",
  "eip155:137": "Polygon",
  "eip155:42161": "Arbitrum",
};

interface MarketService {
  resource: string;
  provider: string;
  description: string;
  category: string;
  priceUSDC: string; // human, e.g. "0.0096"
  network: string; // friendly name
  rawNetwork: string;
}

function search(q: string): unknown[] {
  try {
    const out = execFileSync("circle", ["services", "search", q, "--limit", "8", "--output", "json"], { encoding: "utf8", timeout: 30_000 });
    return (JSON.parse(out)?.data?.items ?? []) as unknown[];
  } catch {
    return [];
  }
}

const seen = new Set<string>();
const services: MarketService[] = [];

for (const q of QUERIES) {
  for (const item of search(q)) {
    const it = item as Record<string, unknown>;
    const resource = String(it.resource ?? "");
    if (!resource || seen.has(resource)) continue;
    seen.add(resource);
    const accept = ((it.accepts as Record<string, unknown>[]) ?? [])[0] ?? {};
    const meta = (it.metadata as Record<string, unknown>) ?? {};
    const provider = (meta.provider as Record<string, unknown>)?.name ?? meta.name ?? new URL(resource).hostname;
    const amount = accept.amount != null ? Number(accept.amount) / 1_000_000 : null;
    const net = String(accept.network ?? "");
    services.push({
      resource,
      provider: String(provider),
      description: String(meta.description ?? "").slice(0, 160),
      category: String(meta.category ?? it.category ?? ""),
      priceUSDC: amount != null ? amount.toFixed(amount < 0.01 ? 4 : amount < 1 ? 3 : 2) : "—",
      network: NETWORKS[net] ?? net.replace("eip155:", "chain "),
      rawNetwork: net,
    });
  }
}

const path = resolve(process.cwd(), "lib/marketplace.json");
writeFileSync(path, JSON.stringify({ syncedAt: new Date().toISOString(), source: "Circle Agent Marketplace (api.circle.com/v2/x402/discover)", services }, null, 2));
console.log(`market:sync — wrote ${services.length} x402 services to lib/marketplace.json`);
for (const s of services.slice(0, 12)) console.log(`  ${s.network} · $${s.priceUSDC} · ${s.provider} · ${s.resource}`);
