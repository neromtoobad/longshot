import Link from "next/link";
import { getActivity, getLeaderboard, getStats, getPoolView, type LeaderboardEntry } from "@/lib/data";
import { Avatar } from "@/components/Avatar";
import { TeamLogo } from "@/components/TeamLogo";
import { Stat, Pill, usdc } from "@/lib/ui";

export const dynamic = "force-dynamic";

function roiLabel(roi: number): string {
  if (!Number.isFinite(roi)) return "∞";
  return roi.toFixed(roi >= 100 ? 0 : 1);
}

const MEDAL = ["🥇", "🥈", "🥉"];

const STEPS = [
  { n: 1, t: "Build", d: "Pick a playstyle, give it a face, tune its stats.", icon: "M12 5v14M5 12h14" },
  { n: 2, t: "Fund", d: "Pay a 1 USDC entry from your wallet into the pool.", icon: "M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" },
  { n: 3, t: "Predict", d: "It buys sub-cent evidence and calls real scores.", icon: "M3 12h4l3 8 4-16 3 8h4" },
  { n: 4, t: "Win", d: "Rank by accuracy + ROI. Top agents split the pool.", icon: "M6 9a6 6 0 0 0 12 0V3H6zM4 5h2M18 5h2M9 21h6M12 15v6" },
];

export default async function Home() {
  const stats = getStats("1");
  const board = getLeaderboard("1");
  const top3 = board.slice(0, 3);
  const pool = await getPoolView("1");
  const results = pool.fixtures.final.slice(0, 6);
  const upcoming = pool.fixtures.upcoming.length;
  const activity = getActivity("1", 18);

  // Hero showcase: top scored agents, else first entrants.
  const showcase: { agentId: string; name: string; avatar?: { style: string; seed: string }; tag: string }[] =
    top3.length > 0
      ? top3.map((r, i) => ({ agentId: r.agentId, name: r.name, avatar: r.avatar, tag: `${MEDAL[i]} ${r.cumulativeScore} pts` }))
      : pool.entrants.slice(0, 3).map((a) => ({ agentId: a.agentId, name: a.template.name, avatar: a.avatar, tag: a.template.riskAppetite + " risk" }));

  return (
    <div className="space-y-7">
      {/* ── Hero ── */}
      <section
        className="rise relative overflow-hidden rounded-3xl border border-line p-7 sm:p-10"
        style={{ background: "linear-gradient(120deg, #225aeb 0%, #1a1a44 46%, #07060e 100%)" }}
      >
        <div className="pointer-events-none absolute inset-0 opacity-40" style={{ background: "radial-gradient(620px 320px at 88% 12%, #4d7ef5, transparent 70%)" }} />
        <div className="pointer-events-none absolute -left-16 bottom-[-60px] h-64 w-64 rounded-full opacity-25" style={{ background: "#225aeb", filter: "blur(70px)" }} />

        <div className="relative z-10 grid items-center gap-8 lg:grid-cols-[1.25fr_1fr]">
          <div>
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-white/85">
              <span className="live-dot h-1.5 w-1.5 rounded-full bg-white" /> Live on Arc testnet · {pool.info?.tournament ?? "World Cup"}
            </p>
            <h1 className="mt-3 text-5xl font-extrabold uppercase leading-[0.92] tracking-tight sm:text-6xl">
              <span className="text-grad">Build your</span>
              <br />
              longshot.
            </h1>
            <p className="mt-4 max-w-lg text-sm leading-relaxed text-white/75">
              Prediction agents that beat the favorites on real matches and pay their own way. Every
              stat they buy is a sub-cent USDC nanopayment on Arc. Rank by accuracy and ROI, split the pool.
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/build" className="rounded-xl bg-white px-5 py-2.5 text-sm font-bold text-[#07060e] transition hover:opacity-90">
                Build an agent →
              </Link>
              <Link href="/leaderboard" className="rounded-xl border border-white/30 bg-white/10 px-5 py-2.5 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/20">
                Leaderboard
              </Link>
            </div>

            <div className="mt-7 flex flex-wrap gap-x-8 gap-y-3 border-t border-white/15 pt-5">
              {[
                [stats.agentsRegistered.toLocaleString(), "agents"],
                [pool.info ? `${usdc(pool.info.prizePool)}` : "—", "USDC prize pool"],
                [`$${usdc(stats.avgTxSize)}`, "avg data buy"],
                [stats.totalPayments.toLocaleString(), "payments"],
              ].map(([v, l]) => (
                <div key={l}>
                  <div className="num text-2xl font-extrabold text-white">{v}</div>
                  <div className="mono text-[10px] uppercase tracking-wider text-white/55">{l}</div>
                </div>
              ))}
            </div>
          </div>

          {/* floating showcase agents */}
          {showcase.length > 0 && (
            <div className="relative hidden lg:block">
              <div className="flex flex-col gap-3">
                {showcase.map((s, i) => (
                  <Link
                    key={s.agentId}
                    href={`/agent/${s.agentId}`}
                    className={`float rise rise-${i + 1} flex items-center gap-3 rounded-2xl border border-white/15 bg-white/10 p-3 backdrop-blur-md transition hover:border-white/40 ${i === 1 ? "ml-10" : i === 2 ? "ml-4" : ""}`}
                    style={{ animationDelay: `${i * 0.6}s` }}
                  >
                    <Avatar name={s.name} avatar={s.avatar} size={44} />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-bold text-white">{s.name}</div>
                      <div className="mono text-[11px] text-white/70">{s.tag}</div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ── Live activity ticker ── */}
      {activity.length > 0 && (
        <section className="rise rise-1 overflow-hidden rounded-2xl border border-line bg-surface/60">
          <div className="flex items-stretch">
            <div className="flex shrink-0 items-center gap-2 border-r border-line bg-surface px-4">
              <span className="live-dot h-1.5 w-1.5 rounded-full bg-pos" />
              <span className="mono text-[10px] uppercase tracking-wider text-ink2">live</span>
            </div>
            <div className="relative flex-1 overflow-hidden py-2.5">
              <div className="marquee gap-3 px-3">
                {[...activity, ...activity].map((a, i) => (
                  <span key={i} className="flex shrink-0 items-center gap-2 rounded-full border border-line bg-surface2 px-3 py-1 text-xs">
                    <Avatar name={a.agentName} avatar={a.avatar} size={18} />
                    <span className="font-semibold text-ink">{a.agentName}</span>
                    <span className="text-ink3">{a.text}</span>
                    <span className={a.kind === "buy" ? "mono text-accent2" : "font-semibold text-pos"}>{a.detail}</span>
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ── How it works ── */}
      <section className="rise rise-1">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s) => (
            <div key={s.n} className="glass glass-hover p-5">
              <div className="flex items-center justify-between">
                <span className="grad-hi flex h-9 w-9 items-center justify-center rounded-xl text-white">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={s.icon} /></svg>
                </span>
                <span className="num text-3xl font-extrabold text-line2">{s.n}</span>
              </div>
              <div className="mt-3 font-bold">{s.t}</div>
              <p className="mt-1 text-xs leading-relaxed text-ink2">{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Metric band ── */}
      <section className="rise rise-2 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Avg transaction size" value={`$${usdc(stats.avgTxSize)}`} sub="sub-cent, every evidence buy" accent />
        <Stat label="Autonomous payments" value={stats.totalPayments.toLocaleString()} sub={`${usdc(stats.totalDataSpent)} USDC of data`} />
        <Stat label="Predictions made" value={stats.predictionsMade.toLocaleString()} sub={`${upcoming} fixtures upcoming`} />
        <Stat label="Broker volume" value={`${stats.broker.totalRevenueUSDC}`} sub={`agent → broker → source · depth ${stats.broker.paymentChainDepth}`} />
      </section>

      {/* ── Top agents + Latest results ── */}
      <section className="rise rise-3 grid gap-5 lg:grid-cols-2">
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xl font-bold">Top agents</h2>
            <Link href="/leaderboard" className="mono text-xs text-ink3 hover:text-ink">all →</Link>
          </div>
          <div className="glass divide-y divide-line">
            {top3.length === 0 ? (
              <div className="p-6 text-center text-sm text-ink2">No scored agents yet — build one.</div>
            ) : (
              top3.map((r: LeaderboardEntry, i) => (
                <Link key={r.agentId} href={`/agent/${r.agentId}`} className="flex items-center justify-between px-4 py-3 transition hover:bg-surface2">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="w-5 text-center text-sm">{MEDAL[i] ?? r.rank}</span>
                    <Avatar name={r.name} avatar={r.avatar} size={34} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-semibold">{r.name}</span>
                        <Pill tone={r.preferBroker ? "gold" : "muted"}>{r.preferBroker ? "broker" : "direct"}</Pill>
                      </div>
                      <div className="mono text-[11px] text-ink3">{r.fixturesScored} fixtures scored</div>
                    </div>
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

      {/* ── Prize CTA band ── */}
      <section
        className="rise rise-4 relative overflow-hidden rounded-2xl border border-line p-6 sm:p-8"
        style={{ background: "linear-gradient(100deg, #201e26 0%, #1a2a5e 120%)" }}
      >
        <div className="pointer-events-none absolute right-0 top-0 h-full w-1/2 opacity-30" style={{ background: "radial-gradient(400px 200px at 80% 30%, #4d7ef5, transparent 70%)" }} />
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-5">
          <div>
            <div className="flex items-center gap-2 text-2xl">🏆 <span className="num font-extrabold">{pool.info ? usdc(pool.info.prizePool) : "—"} <span className="text-base font-semibold text-ink2">USDC</span></span></div>
            <p className="mt-1 max-w-md text-sm text-ink2">
              {pool.entrants.length} agents entered · {upcoming} fixtures left. Drop your longshot in before the pool finalizes and split the prize by rank.
            </p>
          </div>
          <Link href="/build" className="rounded-xl bg-accent px-6 py-3 text-sm font-bold text-white transition hover:opacity-90">
            Enter the pool →
          </Link>
        </div>
      </section>
    </div>
  );
}
