import { getBrokerNetwork, getSettlements, getStats } from "@/lib/data";
import { readBondReputation } from "@/lib/bond";
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

export default async function StatsPage() {
  const s = getStats("1");
  const settle = getSettlements("1", 12);
  const net = getBrokerNetwork("1");
  const bonds = await readBondReputation();

  return (
    <div>
      <PageHeader title="Stats" subtitle="The RFB-named metrics, pulled from real settlements, predictions, and the broker." />

      <Group label="RFB 01 · autonomous paying agents">
        <Stat label="Avg transaction size" value={`$${usdc(s.avgTxSize)}`} sub="sub-cent, every evidence buy" accent />
        <Stat label="Autonomous payments" value={s.totalPayments.toLocaleString()} sub="settled x402 nanopayments" />
        <Stat label="Total data spent" value={`${usdc(s.totalDataSpent)} USDC`} sub="across all agents" />
        <Stat label="Budget utilization" value={`${(s.budgetUtilization * 100).toFixed(1)}%`} sub="spent / allocated" />
      </Group>

      <Group label="RFB 03 · agent-to-agent (data broker)">
        <Stat label="Broker volume" value={`${s.broker.totalRevenueUSDC} USDC`} sub="markup kept by the broker" accent />
        <Stat label="Passed to source" value={`${s.broker.totalPassthroughUSDC} USDC`} sub="base price forwarded" />
        <Stat label="Brokered sales" value={s.broker.totalSales.toLocaleString()} sub="routed through the broker" />
        <Stat label="Payment chain depth" value={String(s.broker.paymentChainDepth)} sub="agent → broker → source" />
      </Group>

      <BrokerNetwork net={net} />

      {/* ── Bonded reputation: the broker stakes USDC behind each source; bad data slashes it ── */}
      {bonds && (
        <section className="mb-7">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="mono text-[11px] uppercase tracking-wider text-ink3">bonded reputation · capital at risk (ERC-8004 spirit)</div>
            <span className="pill text-pos border-pos/40">{usdc(bonds.totalRemainingUSDC)} USDC staked</span>
          </div>

          <div className="glass overflow-hidden">
            <div className="flex items-center gap-2 border-b border-line px-4 py-3 text-[11px] text-ink2">
              <span className="mono text-ink3">the broker posts a USDC bond behind each source it resells. when a match resolves, good data holds the bond, bad data slashes it.</span>
            </div>
            <div className="divide-y divide-line">
              {bonds.sources.map((b) => {
                const slashed = Number(b.slashedUSDC) > 0;
                return (
                  <div key={b.source} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-sm">
                    <span className="mono w-16 text-accent2">{b.source}</span>
                    <span className="text-ink2">staked <span className="num font-semibold text-ink">${usdc(b.remainingUSDC)}</span></span>
                    <span className={slashed ? "text-neg" : "text-ink3"}>
                      slashed <span className="num font-semibold">${usdc(b.slashedUSDC)}</span>
                    </span>
                    <span className="ml-auto text-ink3">
                      {b.hitRate === null ? "no calls yet" : `hit rate ${(b.hitRate * 100).toFixed(0)}% · ${b.hits}/${b.served}`}
                    </span>
                    <span className={`pill ${slashed ? "text-neg border-neg/40" : "text-pos border-pos/40"}`}>{slashed ? "slashed" : "bond intact"}</span>
                  </div>
                );
              })}
            </div>
            <div className="border-t border-line px-4 py-2.5 text-[11px] text-ink3">
              reputation = money on the line, not a number. contract {bonds.address.slice(0, 6)}…{bonds.address.slice(-4)} on Arc · slashed bonds flow to the prize pool.
            </div>
          </div>
        </section>
      )}

      <Group label="traction">
        <Stat label="Agents registered" value={s.agentsRegistered.toLocaleString()} sub="real users" />
        <Stat label="Unique owners" value={s.uniqueOwners.toLocaleString()} sub="distinct payers" />
        <Stat label="Predictions made" value={s.predictionsMade.toLocaleString()} sub="real match calls" />
        <Stat
          label="Cost per correct"
          value={s.correctPredictions > 0 ? `$${usdc(s.costPerTask)}` : "—"}
          sub={`data spent / ${s.correctPredictions} correct`}
        />
      </Group>

      {/* ── Settlement proof: every x402 buy, reconciled against Circle's Gateway facilitator ── */}
      {settle.rows.length > 0 && (
        <section className="mb-7">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="mono text-[11px] uppercase tracking-wider text-ink3">settlement proof · x402 on circle gateway</div>
            <span className="pill text-pos border-pos/40">{settle.completed}/{settle.total} settled on Arc</span>
          </div>

          <div className="glass overflow-hidden">
            <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3 text-[11px] text-ink2">
              <span className="mono text-ink3">trace</span>
              <span className="rounded-md bg-surface2 px-2 py-0.5">agent wallet</span>
              <span className="text-ink3">→</span>
              <span className="rounded-md bg-surface2 px-2 py-0.5">x402 402</span>
              <span className="text-ink3">→</span>
              <span className="rounded-md bg-surface2 px-2 py-0.5">Gateway settle</span>
              <span className="text-ink3">→</span>
              <span className="rounded-md bg-surface2 px-2 py-0.5">seller</span>
              <span className="ml-auto text-ink3">verifiable at gateway-api-testnet.circle.com</span>
            </div>

            <div className="divide-y divide-line">
              {settle.rows.map((r) => (
                <div key={r.uuid} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-sm">
                  <span className="w-36 truncate font-medium">{r.agentName}</span>
                  <span className="mono w-16 text-xs text-accent2">{r.source}</span>
                  <span className="mono text-[11px] text-ink3">{shortAddr(r.fromAddress)} → {shortAddr(r.toAddress)}</span>
                  <span className="num ml-auto font-semibold">${r.amountUSDC ? (Number(r.amountUSDC) / 1e6).toFixed(4) : "—"}</span>
                  {r.onArc && <span className="pill text-accent2 border-accent2/40">Arc</span>}
                  <span className={`pill ${r.status === "completed" ? "text-pos border-pos/40" : "text-ink2 border-line2"}`}>{r.status}</span>
                  <span className="mono w-full text-[10px] text-ink3 sm:w-auto">{r.uuid}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      <div className="glass p-5 text-sm text-ink2">
        Every number is real: payments are settled x402 nanopayments (each settlement above is confirmed
        live against Circle&apos;s Gateway facilitator), predictions come from the agent runner, broker
        revenue from the markup split. Average transaction size stays sub-cent by design — the headline
        RFB-01 metric.
      </div>
    </div>
  );
}
