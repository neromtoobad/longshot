// Agent-to-agent payment network (RFB 3): agents pay the broker, the broker keeps a markup and
// forwards the base price to the evidence source — a 2-hop nanopayment chain. This visualizes it.

import type { getBrokerNetwork } from "@/lib/data";
import { Avatar } from "@/components/Avatar";

type Net = ReturnType<typeof getBrokerNetwork>;

function Arrow({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center px-1 text-ink3">
      <span className="mono text-[10px] text-accent2">{label}</span>
      <svg width="44" height="12" viewBox="0 0 44 12" fill="none" className="text-line2">
        <path d="M0 6h38m0 0l-5-4m5 4l-5 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

export function BrokerNetwork({ net }: { net: Net }) {
  // Use one source (form) as the worked example for the chain amounts.
  const ex = net.catalog.find((c) => c.source === "form") ?? net.catalog[0];
  const markupPct = (net.markupBps / 100).toFixed(0);

  return (
    <section className="mb-7">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="mono text-[11px] uppercase tracking-wider text-ink3">agent-to-agent network · rfb 3</div>
        <span className="pill text-accent2 border-accent2/40">2-hop chain · {markupPct}% markup</span>
      </div>

      <div className="glass p-5">
        {/* the live chain: agent -> broker -> source */}
        <div className="flex flex-wrap items-stretch justify-center gap-1">
          {/* agents that route through the broker */}
          <div className="flex min-w-[150px] flex-1 flex-col rounded-xl border border-line bg-surface2 p-3">
            <div className="mono text-[10px] uppercase tracking-wider text-ink3">agents · broker-routed</div>
            <div className="mt-2 space-y-2">
              {net.brokerAgents.length === 0 ? (
                <div className="text-xs text-ink3">none routing via broker</div>
              ) : (
                net.brokerAgents.map((a) => (
                  <div key={a.id} className="flex items-center gap-2">
                    <Avatar name={a.name} avatar={a.avatar} size={22} />
                    <span className="truncate text-xs font-medium">{a.name}</span>
                  </div>
                ))
              )}
            </div>
            <div className="mono mt-3 border-t border-line pt-2 text-[10px] text-ink3">{net.directAgents.length} other agents buy direct</div>
          </div>

          <Arrow label={`$${ex?.brokerPriceUSDC ?? "0"}`} />

          {/* broker node */}
          <div className="flex min-w-[150px] flex-1 flex-col items-center justify-center rounded-xl grad-hi-soft p-3 text-center">
            <div className="text-lg">🛰️</div>
            <div className="font-bold">Data Broker</div>
            <div className="mono mt-1 text-[10px] uppercase tracking-wider text-ink3">keeps {markupPct}% markup</div>
            <div className="num mt-2 text-sm font-extrabold text-accent2">{net.revenue.totalRevenueUSDC} USDC</div>
            <div className="mono text-[10px] text-ink3">revenue · {net.revenue.totalSales} sales</div>
          </div>

          <Arrow label={`$${ex?.basePriceUSDC ?? "0"}`} />

          {/* evidence sources */}
          <div className="flex min-w-[150px] flex-1 flex-col rounded-xl border border-line bg-surface2 p-3">
            <div className="mono text-[10px] uppercase tracking-wider text-ink3">evidence sources</div>
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              {net.catalog.map((c) => (
                <span key={c.source} className="mono rounded-md bg-bg px-2 py-1 text-[11px] capitalize text-ink2">{c.source}</span>
              ))}
            </div>
            <div className="mono mt-3 border-t border-line pt-2 text-[10px] text-ink3">forwarded: {net.revenue.totalPassthroughUSDC} USDC</div>
          </div>
        </div>

        <p className="mt-3 text-center text-[11px] text-ink3">
          A broker-routed agent pays the broker price; the broker keeps its {markupPct}% markup and forwards the base price to the source — two nanopayments, one chain.
        </p>

        {/* per-source markup catalog */}
        <div className="mt-4 overflow-hidden rounded-xl border border-line">
          <div className="grid grid-cols-5 gap-2 border-b border-line bg-surface2 px-3 py-2 mono text-[10px] uppercase tracking-wider text-ink3">
            <span>source</span><span className="text-right">base</span><span className="text-right">+ markup</span><span className="text-right">broker price</span><span className="text-right">sales</span>
          </div>
          {net.catalog.map((c) => {
            const sale = net.revenue.bySource.find((b) => b.source === c.source);
            return (
              <div key={c.source} className="grid grid-cols-5 gap-2 px-3 py-2 text-sm">
                <span className="capitalize">{c.source}</span>
                <span className="num text-right text-ink2">${c.basePriceUSDC}</span>
                <span className="num text-right text-accent2">${c.markupUSDC}</span>
                <span className="num text-right font-semibold">${c.brokerPriceUSDC}</span>
                <span className="num text-right text-ink2">{sale?.sales ?? 0}</span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
