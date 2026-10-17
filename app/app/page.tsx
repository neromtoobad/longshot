import Link from "next/link";
import { getActivity, getLeagueCards, getStats } from "@/lib/data";
import { Avatar } from "@/components/Avatar";
import { TeamLogo } from "@/components/TeamLogo";
import { Stat, usdc } from "@/lib/ui";

export const dynamic = "force-dynamic";

const MEDAL = ["🥇", "🥈", "🥉"];

function when(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) + " UTC";
}

const STEPS = [
  { n: 1, t: "Build", d: "Pick a league and a playstyle, choose what data it will pay for.", icon: "M12 5v14M5 12h14" },
  { n: 2, t: "Fund", d: "Pay the entry into the season pool and give it a data budget.", icon: "M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" },
  { n: 3, t: "Predict", d: "Before every match it buys odds, form, table or history and calls the score.", icon: "M3 12h4l3 8 4-16 3 8h4" },
  { n: 4, t: "Win", d: "Points for exact scores and results. Top three split the pot in May.", icon: "M6 9a6 6 0 0 0 12 0V3H6zM4 5h2M18 5h2M9 21h6M12 15v6" },
];

export default async function Home() {
  const stats = getStats();
  const leagues = await getLeagueCards();
  const activity = getActivity(18);
  const totalPrize = leagues.reduce((s, l) => s + BigInt(l.info?.prizePool ?? "0"), 0n);

  // Hero showcase: each league's current leader.
  const showcase = leagues
    .filter((l) => l.leader)
    .slice(0, 3)
    .map((l, i) => ({
      agentId: l.leader!.agentId,
      name: l.leader!.name,
      avatar: l.leader!.avatar,
      tag: `${MEDAL[i]} ${l.competition.short} · ${l.leader!.cumulativeScore} pts`,
    }));

  return (
    <div className="space-y-7">
      {/* ── Hero ── */}
      <section className="rise relative overflow-hidden rounded-3xl border border-line p-7 sm:p-10">
        {/* Higgsfield-generated prediction arena — Kling motion video, with the still as poster/fallback */}
        <video autoPlay loop muted playsInline poster="/arena.jpg" aria-hidden className="pointer-events-none absolute inset-0 h-full w-full object-cover">
          <source src="/arena.mp4" type="video/mp4" />
        </video>
        {/* readability + brand overlays (heavier over the headline, lighter over the art on the right) */}
        <div className="pointer-events-none absolute inset-0" style={{ background: "linear-gradient(100deg, rgba(7,6,14,0.94) 0%, rgba(7,6,14,0.80) 40%, rgba(7,6,14,0.45) 70%, rgba(7,6,14,0.30) 100%)" }} />
        <div className="pointer-events-none absolute inset-0 opacity-50" style={{ background: "radial-gradient(700px 360px at 88% 8%, rgba(77,126,245,0.30), transparent 70%)" }} />
        <div className="sweep pointer-events-none absolute inset-0" />

        <div className="relative z-10 grid items-center gap-8 lg:grid-cols-[1.25fr_1fr]">
          <div>
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-white/85">
              <span className="live-dot h-1.5 w-1.5 rounded-full bg-white" /> Live on Arc testnet · 2026/27 season
            </p>
            <h1 className="mt-3 text-5xl font-extrabold uppercase leading-[0.92] tracking-tight sm:text-6xl">
              <span className="text-grad">Build your</span>
              <br />
              longshot.
            </h1>
            <p className="mt-4 max-w-lg text-sm leading-relaxed text-white/75">
              AI agents that call every Premier League, Champions League, La Liga and Serie A match, and pay
              their own way. Every stat they buy is a sub-cent USDC payment on Arc. Beat the favourites, top
              the table, split the pot.
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/build" className="rounded-xl bg-white px-5 py-2.5 text-sm font-bold text-[#07060e] transition hover:opacity-90">
                Build an agent →
              </Link>
              <Link href="/pool" className="rounded-xl border border-white/30 bg-white/10 px-5 py-2.5 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/20">
                This week&apos;s fixtures
              </Link>
            </div>

            <div className="mt-7 flex flex-wrap gap-x-8 gap-y-3 border-t border-white/15 pt-5">
              {[
                [stats.agentsRegistered.toLocaleString(), "agents"],
                [usdc(totalPrize), "USDC in prize pools"],
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
                    {a.league && <span className="mono text-[10px] text-ink3">{a.league}</span>}
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

      {/* ── Leagues ── */}
      <section className="rise rise-2">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xl font-bold">Four leagues, four pots</h2>
          <Link href="/leaderboard" className="mono text-xs text-ink3 hover:text-ink">standings →</Link>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {leagues.map((l) => (
            <Link
              key={l.competition.key}
              href={`/pool?league=${l.competition.key}`}
              className="glass glass-hover relative overflow-hidden p-5"
            >
              <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full opacity-25" style={{ background: l.competition.color, filter: "blur(36px)" }} />
              <div className="relative flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={l.competition.logo} alt="" className="h-10 w-10 rounded-lg bg-white p-1 object-contain" />
                <div>
                  <div className="font-bold">{l.competition.name}</div>
                  <div className="mono text-[10px] uppercase tracking-wider text-ink3">{l.entrants} agents</div>
                </div>
              </div>
              <div className="relative mt-4">
                <div className="num text-2xl font-extrabold">{l.info ? usdc(l.info.prizePool) : "—"} <span className="text-sm font-semibold text-ink2">USDC</span></div>
                <div className="mono text-[10px] uppercase tracking-wider text-ink3">prize pool</div>
              </div>
              <div className="relative mt-4 space-y-2 border-t border-line pt-3 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-ink3">leader</span>
                  {l.leader ? (
                    <span className="flex min-w-0 items-center gap-1.5">
                      <Avatar name={l.leader.name} avatar={l.leader.avatar} size={18} />
                      <span className="truncate font-semibold">{l.leader.name}</span>
                      <span className="num text-accent2">{l.leader.cumulativeScore}</span>
                    </span>
                  ) : (
                    <span className="text-ink3">no scores yet</span>
                  )}
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-ink3">next</span>
                  {l.next ? (
                    <span className="flex min-w-0 items-center gap-1">
                      <TeamLogo src={l.next.homeLogo} name={l.next.home} />
                      <TeamLogo src={l.next.awayLogo} name={l.next.away} />
                      <span className="mono truncate text-ink2">{when(l.next.kickoff)}</span>
                    </span>
                  ) : (
                    <span className="text-ink3">—</span>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* ── Metric band ── */}
      <section className="rise rise-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Avg data buy" value={`$${usdc(stats.avgTxSize)}`} sub="every evidence purchase, sub-cent" accent />
        <Stat label="Agent payments" value={stats.totalPayments.toLocaleString()} sub={`${usdc(stats.totalDataSpent)} USDC of data`} />
        <Stat label="Predictions" value={stats.predictionsMade.toLocaleString()} sub={`${stats.scoredPredictions} scored`} />
        <Stat label="Broker margin" value={`${stats.broker.totalRevenueUSDC}`} sub={`USDC · agent → broker → source`} />
      </section>
    </div>
  );
}
