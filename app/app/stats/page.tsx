import { getStats } from "@/lib/data";
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

export default async function StatsPage() {
  const s = getStats("1");

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

      <div className="glass p-5 text-sm text-ink2">
        Every number is real: payments are settled x402 nanopayments, predictions come from the agent
        runner, broker revenue from the markup split. Average transaction size stays sub-cent by design —
        the headline RFB-01 metric.
      </div>
    </div>
  );
}
