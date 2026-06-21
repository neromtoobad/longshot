import market from "@/lib/marketplace.json";
import { Pill } from "@/lib/ui";

export const dynamic = "force-dynamic";

interface Service {
  resource: string;
  provider: string;
  description: string;
  category: string;
  priceUSDC: string;
  network: string;
  rawNetwork: string;
}

// Map an x402 network id to the Circle CLI --chain flag for the pay command.
const CHAIN_FLAG: Record<string, string> = {
  "eip155:8453": "BASE",
  "eip155:84532": "BASE-SEPOLIA",
  "eip155:1": "ETH",
  "eip155:137": "MATIC",
  "eip155:42161": "ARB",
};

function host(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
function pathTail(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return "";
  }
}

export default function MarketPage() {
  const services = (market.services as Service[]).filter((s) => s.priceUSDC !== "—");
  const prices = services.map((s) => parseFloat(s.priceUSDC)).filter((n) => Number.isFinite(n));
  const lo = prices.length ? Math.min(...prices) : 0;
  const hi = prices.length ? Math.max(...prices) : 0;
  const networks = [...new Set(services.map((s) => s.network))];

  return (
    <div>
      <h1 className="text-3xl font-extrabold tracking-tight">Agent Marketplace</h1>
      <p className="mt-1 max-w-3xl text-sm text-ink2">
        Real x402 services from the <span className="text-ink">Circle Agent Marketplace</span>. LONGSHOT agents discover
        evidence here and pay per request with <span className="text-accent2">Gateway nanopayments</span> — sub-cent USDC,
        no API keys, no subscriptions. The prediction pool + scoring stay on Arc; these services settle on Base / Ethereum.
      </p>

      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        <div className="glass p-4">
          <div className="mono text-[10px] uppercase tracking-wider text-ink3">services</div>
          <div className="num mt-1 text-2xl font-extrabold text-accent2">{services.length}</div>
          <div className="mt-1 text-[11px] text-ink2">live x402 endpoints</div>
        </div>
        <div className="glass p-4">
          <div className="mono text-[10px] uppercase tracking-wider text-ink3">price range</div>
          <div className="num mt-1 text-2xl font-extrabold">${lo.toFixed(4)}–${hi.toFixed(2)}</div>
          <div className="mt-1 text-[11px] text-ink2">USDC per request</div>
        </div>
        <div className="glass p-4">
          <div className="mono text-[10px] uppercase tracking-wider text-ink3">networks</div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {networks.map((n) => (
              <Pill key={n} tone="accent2">{n}</Pill>
            ))}
          </div>
          <div className="mt-1 text-[11px] text-ink2">USDC settlement</div>
        </div>
      </div>

      <div className="mt-6 grid gap-3 lg:grid-cols-2">
        {services.map((s) => {
          const chain = CHAIN_FLAG[s.rawNetwork] ?? "BASE";
          return (
            <div key={s.resource} className="glass glass-hover flex flex-col p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{s.provider}</span>
                    <Pill tone="accent2">{s.network}</Pill>
                    {s.category && <Pill tone="muted">{s.category}</Pill>}
                  </div>
                  <div className="mono mt-0.5 truncate text-[11px] text-ink3">{host(s.resource)}{pathTail(s.resource)}</div>
                </div>
                <div className="text-right">
                  <div className="num text-lg font-extrabold text-accent">${s.priceUSDC}</div>
                  <div className="mono text-[9px] uppercase tracking-wider text-ink3">/ request</div>
                </div>
              </div>
              {s.description && <p className="mt-2 text-xs text-ink2">{s.description}</p>}
              <div className="mono mt-3 truncate rounded-lg border border-line bg-bg px-2.5 py-1.5 text-[11px] text-ink2">
                <span className="text-ink3">$ </span>circle services pay &quot;{host(s.resource)}…&quot; --chain {chain}
              </div>
            </div>
          );
        })}
      </div>

      <div className="glass mt-6 p-5 text-sm text-ink2">
        Browse is live (read-only). To buy, an agent wallet pays the x402 nanopayment: <span className="mono text-ink">circle wallet login</span> →
        fund a little USDC on the service&apos;s chain → <span className="mono text-ink">circle services pay &lt;url&gt; --chain &lt;chain&gt;</span>.
        Catalog snapshot from Circle&apos;s discovery API — refresh with <span className="mono text-ink">pnpm market:sync</span>.
      </div>
    </div>
  );
}
