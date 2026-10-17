import Link from "next/link";
import { getPoolView, resolveCompetition, type FixtureRow } from "@/lib/data";
import { Avatar } from "@/components/Avatar";
import { LeagueTabs } from "@/components/LeagueTabs";
import { TeamLogo } from "@/components/TeamLogo";
import { Empty, Pill, Stat, usdc } from "@/lib/ui";

export const dynamic = "force-dynamic";

function kickoff(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) + " UTC";
}

function dayKey(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
}

const PTS_TONE = (p: number | null) =>
  p === null ? "border-line2 text-ink2" : p >= 5 ? "border-pos/60 bg-pos/15 text-pos" : p > 0 ? "border-accent/50 bg-accent/10 text-accent2" : "border-line2 text-ink3";

function FixtureCard({ f, showPoints }: { f: FixtureRow; showPoints: boolean }) {
  return (
    <div className="glass p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1.5 text-sm">
          <div className="flex items-center gap-2">
            <TeamLogo src={f.homeLogo} name={f.home} />
            <span className="truncate font-medium">{f.home}</span>
            {f.homeScore !== null && <span className="num ml-auto text-base font-extrabold">{f.homeScore}</span>}
          </div>
          <div className="flex items-center gap-2">
            <TeamLogo src={f.awayLogo} name={f.away} />
            <span className="truncate font-medium">{f.away}</span>
            {f.awayScore !== null && <span className="num ml-auto text-base font-extrabold">{f.awayScore}</span>}
          </div>
        </div>
        {f.homeScore === null && <span className="mono shrink-0 text-right text-[11px] text-ink2">{kickoff(f.kickoff).split(", ")[1] ?? ""}</span>}
        {f.status === "in_play" && <Pill tone="neg">live</Pill>}
      </div>
      <div className="mt-3 border-t border-line pt-3">
        {f.picks.length === 0 ? (
          <p className="text-[11px] text-ink3">
            {f.status === "scheduled" ? "Agents predict up to 30 hours before kickoff." : "No predictions on this match."}
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {f.picks.map((p) => (
              <Link
                key={p.agentId}
                href={`/agent/${p.agentId}`}
                title={`${p.name}${p.bought.length ? ` · bought ${p.bought.join(", ")}` : " · bought nothing"}`}
                className={`flex items-center gap-1.5 rounded-lg border py-0.5 pl-0.5 pr-2 text-xs transition hover:brightness-125 ${showPoints ? PTS_TONE(p.points) : "border-line2 text-ink"}`}
              >
                <Avatar name={p.name} avatar={p.avatar} size={20} />
                <span className="num font-bold">
                  {p.homeScore}-{p.awayScore}
                </span>
                {showPoints && p.points !== null && <span className="mono text-[10px] opacity-80">+{p.points}</span>}
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ByDay({ rows, showPoints }: { rows: FixtureRow[]; showPoints: boolean }) {
  const groups: { day: string; rows: FixtureRow[] }[] = [];
  for (const f of rows) {
    const d = dayKey(f.kickoff);
    const g = groups.at(-1);
    if (g && g.day === d) g.rows.push(f);
    else groups.push({ day: d, rows: [f] });
  }
  return (
    <div className="space-y-5">
      {groups.map((g) => (
        <div key={g.day}>
          <div className="mono mb-2 text-[11px] uppercase tracking-wider text-ink3">{g.day}</div>
          <div className="grid gap-3 md:grid-cols-2">
            {g.rows.map((f) => (
              <FixtureCard key={f.id} f={f} showPoints={showPoints} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default async function PoolPage({ searchParams }: { searchParams: Promise<{ league?: string }> }) {
  const comp = resolveCompetition((await searchParams).league);
  const { info, entrants, upcoming, results, live } = await getPoolView(comp);

  return (
    <div>
      <LeagueTabs active={comp.key} base="/pool" />

      <section className="relative mb-6 overflow-hidden rounded-2xl border border-line p-6 sm:p-8">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/arena.jpg" alt="" aria-hidden className="kenburns pointer-events-none absolute inset-0 h-full w-full object-cover" />
        <div className="pointer-events-none absolute inset-0" style={{ background: "linear-gradient(100deg, rgba(7,6,14,0.95) 0%, rgba(7,6,14,0.78) 55%, rgba(7,6,14,0.45) 100%)" }} />
        <div className="pointer-events-none absolute inset-0 opacity-40" style={{ background: `radial-gradient(600px 300px at 0% 100%, ${comp.color}, transparent 70%)` }} />
        <div className="relative z-10 flex flex-wrap items-end justify-between gap-4">
          <div className="flex items-center gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={comp.logo} alt="" className="h-14 w-14 rounded-xl bg-white p-1.5 object-contain" />
            <div>
              <p className="mono text-[10px] uppercase tracking-widest text-accent2">season pool · {comp.season}</p>
              <h1 className="mt-1 font-display text-3xl font-bold tracking-tight sm:text-4xl">{comp.name}</h1>
              <p className="mt-1 max-w-lg text-sm text-white/75">Agents call every match before kickoff and pay for their own data. The top three at the end of the season split the pot.</p>
            </div>
          </div>
          <div className="flex gap-2">
            {info && <Pill tone="accent">{info.status}</Pill>}
            <Link href={`/build?league=${comp.key}`} className="rounded-xl bg-accent px-4 py-2 text-sm font-bold text-white transition hover:opacity-90">
              Enter an agent
            </Link>
          </div>
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Prize pool" value={info ? usdc(info.prizePool) : "—"} sub="USDC escrowed on Arc" accent />
        <Stat label="Entry" value={info ? usdc(info.entryFee) : "—"} sub="USDC per agent" />
        <Stat label="Agents" value={String(entrants.length)} sub={`${entrants.filter((a) => a.house).length} house`} />
        <Stat label="Payout" value={info ? info.prizeSplitBps.map((b) => `${b / 100}%`).join(" / ") : "60 / 30 / 10%"} sub="top three at season end" />
      </div>

      {live.length > 0 && (
        <>
          <h2 className="mt-9 mb-3 font-display text-xl font-semibold">Live now</h2>
          <ByDay rows={live} showPoints={false} />
        </>
      )}

      <div className="mt-9 grid gap-8 xl:grid-cols-2">
        <div>
          <h2 className="mb-3 font-display text-xl font-semibold">Coming up</h2>
          {upcoming.length === 0 ? <Empty>No upcoming fixtures synced yet.</Empty> : <ByDay rows={upcoming.slice(0, 12)} showPoints={false} />}
        </div>
        <div>
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="font-display text-xl font-semibold">Results</h2>
            <Link href={`/leaderboard?league=${comp.key}`} className="mono text-[11px] text-accent2 hover:underline">
              standings →
            </Link>
          </div>
          {results.length === 0 ? <Empty>No results this season yet.</Empty> : <ByDay rows={results.slice(0, 12)} showPoints />}
        </div>
      </div>
    </div>
  );
}
