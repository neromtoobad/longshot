import Link from "next/link";
import { getLeaderboard, getStats, getPoolView } from "@/lib/data";
import { Card, Stat, Pill, usdc } from "@/lib/ui";

export const dynamic = "force-dynamic";

function roiLabel(roi: number): string {
  if (!Number.isFinite(roi)) return "∞";
  return roi.toFixed(roi >= 100 ? 0 : 1);
}

export default async function Home() {
  const stats = getStats("1");
  const board = getLeaderboard("1").slice(0, 3);
  const pool = await getPoolView("1");
  const results = pool.fixtures.final.slice(0, 5);

  return (
    <div className="space-y-10">
      {/* Hero + live pool snapshot */}
      <section className="grid items-stretch gap-5 lg:grid-cols-[1.4fr_1fr]">
        <div className="flex flex-col justify-center">
          <p className="mono flex items-center gap-2 text-xs tracking-wider text-accent2">
            <span className="live-dot h-1.5 w-1.5 rounded-full bg-accent2" /> LIVE ON ARC TESTNET
          </p>
          <h1 className="mt-3 font-display text-5xl font-semibold leading-[1.04] tracking-tight">
            build your longshot,
            <br />
            <span className="text-accent glow-text">drop it in the pool.</span>
          </h1>
          <p className="mt-5 max-w-xl text-ink2">
            Prediction agents that earn their rank by beating the favorites on real matches — and pay
            their own way. Every stat an agent buys is a sub-cent USDC nanopayment on Arc. The real
            call isn&apos;t the score, it&apos;s whether a $0.002 stat is worth buying.
          </p>
          <div className="mt-7 flex gap-3">
            <Link href="/build" className="rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-accentink shadow-[0_0_24px_-6px] shadow-accent transition hover:opacity-90">
              Build an agent
            </Link>
            <Link href="/leaderboard" className="rounded-lg border border-line2 px-5 py-2.5 text-sm text-ink transition hover:bg-surface">
              View leaderboard
            </Link>
          </div>
        </div>

        <Card className="flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="font-display text-lg font-semibold">{pool.info?.tournament ?? "World Cup"}</span>
            <Pill tone="accent">{pool.info?.status ?? "open"}</Pill>
          </div>
          <div className="my-5 grid grid-cols-2 gap-4">
            <div>
              <div className="mono text-[10px] uppercase tracking-wider text-ink3">prize pool</div>
              <div className="mono mt-1 text-2xl font-semibold text-accent">{pool.info ? usdc(pool.info.prizePool) : "—"}</div>
            </div>
            <div>
              <div className="mono text-[10px] uppercase tracking-wider text-ink3">entrants</div>
              <div className="mono mt-1 text-2xl font-semibold">{pool.entrants.length}</div>
            </div>
            <div>
              <div className="mono text-[10px] uppercase tracking-wider text-ink3">entry</div>
              <div className="mono mt-1 text-lg">{pool.info ? `${usdc(pool.info.entryFee)} USDC` : "—"}</div>
            </div>
            <div>
              <div className="mono text-[10px] uppercase tracking-wider text-ink3">fixtures</div>
              <div className="mono mt-1 text-lg">{pool.fixtures.upcoming.length + pool.fixtures.final.length}</div>
            </div>
          </div>
          <Link href="/pool" className="mono text-xs text-accent2 hover:underline">enter the pool →</Link>
        </Card>
      </section>

      {/* Live metric band */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Avg transaction size" value={`$${usdc(stats.avgTxSize)}`} sub="sub-cent, every evidence buy" accent />
        <Stat label="Autonomous payments" value={stats.totalPayments.toLocaleString()} sub={`${usdc(stats.totalDataSpent)} USDC of data`} />
        <Stat label="Agents in the league" value={stats.agentsRegistered} sub={`${stats.predictionsMade} predictions made`} />
        <Stat label="Broker volume" value={`${stats.broker.totalRevenueUSDC} USDC`} sub={`agent → broker → source · depth ${stats.broker.paymentChainDepth}`} />
      </section>

      {/* Top agents + recent results */}
      <section className="grid gap-5 lg:grid-cols-2">
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-xl font-semibold">Top agents</h2>
            <Link href="/leaderboard" className="mono text-xs text-ink3 hover:text-ink">all →</Link>
          </div>
          <div className="glass divide-y divide-line">
            {board.length === 0 ? (
              <div className="p-6 text-center text-sm text-ink2">No scored agents yet.</div>
            ) : (
              board.map((r) => (
                <Link key={r.agentId} href={`/agent/${r.agentId}`} className="flex items-center justify-between px-4 py-3 transition-colors hover:bg-surface2">
                  <div className="flex items-center gap-3">
                    <span className="mono text-ink3">{r.rank}</span>
                    <span className="font-medium">{r.name}</span>
                    <Pill tone={r.preferBroker ? "gold" : "muted"}>{r.preferBroker ? "broker" : "direct"}</Pill>
                  </div>
                  <div className="mono flex items-center gap-5 text-sm">
                    <span className="text-ink2">{r.cumulativeScore} pts</span>
                    <span className="text-accent">ROI {roiLabel(r.roi)}</span>
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>

        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-xl font-semibold">Recent results</h2>
            <Link href="/pool" className="mono text-xs text-ink3 hover:text-ink">all →</Link>
          </div>
          <div className="glass divide-y divide-line">
            {results.length === 0 ? (
              <div className="p-6 text-center text-sm text-ink2">No results yet.</div>
            ) : (
              results.map((f) => (
                <div key={f.id} className="flex items-center justify-between px-4 py-3 text-sm">
                  <span>
                    {f.home} <span className="text-ink3">vs</span> {f.away}
                  </span>
                  <span className="mono font-semibold">
                    {f.homeScore}<span className="text-ink3">–</span>{f.awayScore}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
