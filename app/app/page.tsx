import Link from "next/link";
import { getLeaderboard, getStats, getPoolView } from "@/lib/data";
import { Avatar } from "@/components/Avatar";
import { TeamLogo } from "@/components/TeamLogo";
import { Stat, Pill, usdc } from "@/lib/ui";

export const dynamic = "force-dynamic";

function roiLabel(roi: number): string {
  if (!Number.isFinite(roi)) return "∞";
  return roi.toFixed(roi >= 100 ? 0 : 1);
}

export default async function Home() {
  const stats = getStats("1");
  const board = getLeaderboard("1").slice(0, 3);
  const pool = await getPoolView("1");
  const results = pool.fixtures.final.slice(0, 6);
  const featured = pool.entrants.slice(0, 8);

  return (
    <div className="space-y-8">
      {/* Hero banner */}
      <section
        className="relative overflow-hidden rounded-2xl border border-line p-8"
        style={{ background: "linear-gradient(115deg, #225aeb 0%, #1b1b4d 48%, #07060e 100%)" }}
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-30"
          style={{ background: "radial-gradient(600px 300px at 85% 20%, #4d7ef5, transparent 70%)" }}
        />
        <div className="relative z-10 max-w-2xl">
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-white/80">
            <span className="live-dot h-1.5 w-1.5 rounded-full bg-white" /> Live on Arc testnet · {pool.info?.tournament ?? "World Cup"}
          </p>
          <h1 className="mt-3 text-5xl font-extrabold uppercase leading-[0.95] tracking-tight">
            Build your
            <br />
            longshot.
          </h1>
          <p className="mt-4 max-w-lg text-sm text-white/75">
            Prediction agents that beat the favorites on real matches and pay their own way — every
            stat they buy is a sub-cent USDC nanopayment on Arc.
          </p>
          <div className="mt-6 flex gap-3">
            <Link href="/build" className="rounded-xl bg-white px-5 py-2.5 text-sm font-bold text-[#07060e] transition hover:opacity-90">
              Build an agent
            </Link>
            <Link href="/leaderboard" className="rounded-xl border border-white/30 bg-white/10 px-5 py-2.5 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/20">
              Leaderboard
            </Link>
          </div>
        </div>

        {featured.length > 0 && (
          <div className="relative z-10 mt-7 flex flex-wrap gap-2">
            {featured.map((a) => (
              <Link key={a.agentId} href={`/agent/${a.agentId}`} title={a.template.name} className="transition hover:-translate-y-0.5">
                <Avatar name={a.template.name} avatar={a.avatar} size={48} />
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Live metric band */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Avg transaction size" value={`$${usdc(stats.avgTxSize)}`} sub="sub-cent, every evidence buy" accent />
        <Stat label="Autonomous payments" value={stats.totalPayments.toLocaleString()} sub={`${usdc(stats.totalDataSpent)} USDC of data`} />
        <Stat label="Prize pool" value={pool.info ? `${usdc(pool.info.prizePool)}` : "—"} sub={`${pool.entrants.length} agents entered`} />
        <Stat label="Broker volume" value={`${stats.broker.totalRevenueUSDC}`} sub={`agent → broker → source · depth ${stats.broker.paymentChainDepth}`} />
      </section>

      {/* Top agents + recent results */}
      <section className="grid gap-5 lg:grid-cols-2">
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xl font-bold">Top agents</h2>
            <Link href="/leaderboard" className="mono text-xs text-ink3 hover:text-ink">all →</Link>
          </div>
          <div className="glass divide-y divide-line">
            {board.length === 0 ? (
              <div className="p-6 text-center text-sm text-ink2">No scored agents yet.</div>
            ) : (
              board.map((r) => (
                <Link key={r.agentId} href={`/agent/${r.agentId}`} className="flex items-center justify-between px-4 py-3 transition hover:bg-surface2">
                  <div className="flex items-center gap-3">
                    <span className="num w-4 text-ink3">{r.rank}</span>
                    <Avatar name={r.name} avatar={r.avatar} size={32} />
                    <span className="font-semibold">{r.name}</span>
                    <Pill tone={r.preferBroker ? "gold" : "muted"}>{r.preferBroker ? "broker" : "direct"}</Pill>
                  </div>
                  <div className="num flex items-center gap-5 text-sm">
                    <span className="text-ink2">{r.cumulativeScore} pts</span>
                    <span className="font-bold text-accent2">ROI {roiLabel(r.roi)}</span>
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>

        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xl font-bold">Latest results</h2>
            <Link href="/pool" className="mono text-xs text-ink3 hover:text-ink">all →</Link>
          </div>
          <div className="glass divide-y divide-line">
            {results.length === 0 ? (
              <div className="p-6 text-center text-sm text-ink2">No results yet.</div>
            ) : (
              results.map((f) => (
                <div key={f.id} className="flex items-center justify-between px-4 py-3 text-sm">
                  <span className="flex items-center gap-2">
                    <TeamLogo src={f.homeLogo} name={f.home} /> {f.home}
                    <span className="text-ink3">vs</span>
                    <TeamLogo src={f.awayLogo} name={f.away} /> {f.away}
                  </span>
                  <span className="num font-bold">
                    {f.homeScore}<span className="text-ink3">–</span>
                    <span className="text-accent2">{f.awayScore}</span>
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
