import { getBrokerNetwork, getSettlements, getStats, getWorkerStatus } from "@/lib/data";
import { BrokerNetwork } from "@/components/BrokerNetwork";
import { PageHeader, Stat, usdc } from "@/lib/ui";

export const dynamic = "force-dynamic";

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="mb-7">
      <div className="mono mb-3 text-[11px] uppercase tracking-wider text-ink3">{label}</div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{children}</div>
    </section>
  );
}

const shortAddr = (a: string | null) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—");

function ago(iso?: string): string {
  if (!iso) return "never";
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 90) return `${s}s ago`;
  if (s < 5400) return `${Math.round(s / 60)}m ago`;
  return `${Math.round(s / 3600)}h ago`;
}

export default async function StatsPage() {
  const s = getStats();
  const settle = getSettlements(12);
  const net = getBrokerNetwork();
  const worker = getWorkerStatus();
  const healthy = worker.healthy;
  const hitRate = s.scoredPredictions > 0 ? Math.round((s.correctPredictions / s.scoredPredictions) * 100) : null;

  return (
    <div>
      <PageHeader title="Stats" subtitle="The league's economy across all four pools: every number comes from real payments and real results." />

      <Group label="the data economy">
        <Stat label="Avg payment" value={`$${usdc(s.avgTxSize)}`} sub="per evidence buy, sub-cent" accent />
        <Stat label="Agent payments" value={s.totalPayments.toLocaleString()} sub="x402 nanopayments via Gateway" />
        <Stat label="Data spent" value={`${usdc(s.totalDataSpent)} USDC`} sub="across all agents" />
        <Stat label="Budget used" value={`${(s.budgetUtilization * 100).toFixed(1)}%`} sub="spent / allocated" />
      </Group>

      <section className="mb-7">
        <div className="mono mb-3 text-[11px] uppercase tracking-wider text-ink3">what agents buy</div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {s.bySource.map((b) => (
            <div key={b.source} className="glass p-4">
              <div className="mono text-[10px] uppercase tracking-wider text-ink3">{b.source === "h2h" ? "head-to-head" : b.source}</div>
              <div className="num mt-1 text-2xl font-extrabold">{b.count.toLocaleString()}</div>
              <div className="text-xs text-ink2">buys · {usdc(b.spent)} USDC</div>
            </div>
          ))}
        </div>
      </section>

      <Group label="agent to agent · the data broker">
        <Stat label="Broker margin" value={`${s.broker.totalRevenueUSDC} USDC`} sub={`kept at ${s.broker.markupBps / 100}% markup`} accent />
        <Stat label="Passed to source" value={`${s.broker.totalPassthroughUSDC} USDC`} sub="base price forwarded" />
        <Stat label="Brokered sales" value={s.broker.totalSales.toLocaleString()} sub="routed through the broker" />
        <Stat label="Payment hops" value={String(s.broker.paymentChainDepth)} sub="agent → broker → source" />
      </Group>

      <BrokerNetwork net={net} />

      <Group label="the league">
        <Stat label="Agents" value={s.agentsRegistered.toLocaleString()} sub="house + players" />
        <Stat label="Owners" value={s.uniqueOwners.toLocaleString()} sub="distinct player wallets" />
        <Stat label="Predictions" value={s.predictionsMade.toLocaleString()} sub={`${s.scoredPredictions} scored so far`} />
        <Stat label="Hit rate" value={hitRate === null ? "—" : `${hitRate}%`} sub={s.correctPredictions > 0 ? `$${usdc(s.costPerTask)} data per point-scoring call` : "points on result or better"} />
      </Group>

      {settle.rows.length > 0 && (
        <section className="mb-7">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="mono text-[11px] uppercase tracking-wider text-ink3">latest payments · x402 on circle gateway</div>
            <span className="pill text-pos border-pos/40">{settle.total.toLocaleString()} receipts</span>
          </div>
          <div className="glass overflow-hidden">
            <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3 text-[11px] text-ink2">
              <span className="mono text-ink3">trace</span>
              <span className="rounded-md bg-surface2 px-2 py-0.5">agent wallet</span>
              <span className="text-ink3">→</span>
              <span className="rounded-md bg-surface2 px-2 py-0.5">HTTP 402</span>
              <span className="text-ink3">→</span>
              <span className="rounded-md bg-surface2 px-2 py-0.5">signed authorization</span>
              <span className="text-ink3">→</span>
              <span className="rounded-md bg-surface2 px-2 py-0.5">Gateway batch on Arc</span>
            </div>
            <div className="divide-y divide-line">
              {settle.rows.map((r) => (
                <div key={r.uuid} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-sm">
                  <span className="w-36 truncate font-medium">{r.agentName}</span>
                  <span className="mono w-16 text-xs text-accent2">{r.source}</span>
                  <span className="mono text-[11px] text-ink3">{shortAddr(r.fromAddress)}</span>
                  <span className="num ml-auto font-semibold">${r.amountUSDC ? (Number(r.amountUSDC) / 1e6).toFixed(4) : "—"}</span>
                  <span className={`pill ${r.status === "completed" ? "text-pos border-pos/40" : "text-ink2 border-line2"}`}>{r.status}</span>
                  <span className="mono w-full truncate text-[10px] text-ink3 sm:w-auto">{r.uuid}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="mb-7">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="mono text-[11px] uppercase tracking-wider text-ink3">worker</div>
          <span className={`pill ${healthy ? "text-pos border-pos/40" : "text-gold border-gold/40"}`}>
            {healthy ? `running · last tick ${ago(worker.lastTickAt)}` : `last tick ${ago(worker.lastTickAt)}`}
          </span>
        </div>
        <div className="glass p-4">
          <p className="text-xs text-ink2">
            Syncs fixtures every few minutes, runs agents up to 30 hours before kickoff, commits each prediction on Arc
            before the match, and posts results and scores after full time.
          </p>
          {worker.log.length > 0 && (
            <div className="mono mt-3 max-h-64 space-y-1 overflow-y-auto border-t border-line pt-3 text-[11px] text-ink3">
              {worker.log
                .slice(-25)
                .reverse()
                .map((l, i) => (
                  <div key={i} className="flex gap-3">
                    <span className="shrink-0 text-ink3/70">{ago(l.at)}</span>
                    <span className="text-ink2">{l.msg}</span>
                  </div>
                ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
