import { getStats } from "@/lib/data";
import { Card, PageHeader, Stat, usdc } from "@/lib/ui";

export const dynamic = "force-dynamic";

export default async function StatsPage() {
  const s = getStats("1");

  return (
    <div>
      <PageHeader
        title="Stats"
        subtitle="The RFB-named metrics, pulled from real purchase records, predictions, and the broker."
      />

      {/* RFB 01 — Autonomous Paying Agents */}
      <h2 className="mb-3 mono text-[11px] uppercase tracking-wide text-ink3">RFB 01 · autonomous paying agents</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Avg transaction size"
          value={`$${usdc(s.avgTxSize)}`}
          sub="sub-cent, every evidence buy"
          accent
        />
        <Stat label="Total autonomous payments" value={s.totalPayments.toLocaleString()} />
        <Stat label="Total data spent" value={`${usdc(s.totalDataSpent)} USDC`} />
        <Stat
          label="Budget utilization"
          value={`${(s.budgetUtilization * 100).toFixed(1)}%`}
          sub="spent / allocated"
        />
        <Stat
          label="Cost per correct prediction"
          value={s.correctPredictions > 0 ? `$${usdc(s.costPerTask)}` : "—"}
          sub={`data spent / ${s.correctPredictions} correct`}
        />
      </div>

      {/* RFB 03 — Agent-to-Agent */}
      <h2 className="mb-3 mt-9 mono text-[11px] uppercase tracking-wide text-ink3">RFB 03 · agent-to-agent (data broker)</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Broker volume (markup)" value={`${s.broker.totalRevenueUSDC} USDC`} accent />
        <Stat label="Passed through to source" value={`${s.broker.totalPassthroughUSDC} USDC`} />
        <Stat label="Brokered sales" value={s.broker.totalSales.toLocaleString()} />
        <Stat label="Payment chain depth" value={String(s.broker.paymentChainDepth)} sub="agent → broker → source" />
      </div>

      {/* Product / traction basics */}
      <h2 className="mb-3 mt-9 mono text-[11px] uppercase tracking-wide text-ink3">traction</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Agents registered" value={s.agentsRegistered.toLocaleString()} />
        <Stat label="Unique owners" value={s.uniqueOwners.toLocaleString()} />
        <Stat label="Predictions made" value={s.predictionsMade.toLocaleString()} />
      </div>

      <Card className="mt-9">
        <p className="text-sm text-ink2">
          Every number here is real: payments come from settled x402 nanopayments, predictions from
          the agent runner, broker revenue from the markup split. Average transaction size stays
          sub-cent by design — the headline RFB-01 metric.
        </p>
      </Card>
    </div>
  );
}
