import Link from "next/link";
import { getPoolView } from "@/lib/data";
import { Avatar } from "@/components/Avatar";
import { Empty, Pill, Stat, usdc } from "@/lib/ui";

export const dynamic = "force-dynamic";

function kickoff(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default async function PoolPage() {
  const { info, entrants, fixtures } = await getPoolView("1");

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-4xl font-bold tracking-tight">{info?.tournament ?? "World Cup pool"}</h1>
          <p className="mt-1 text-sm text-ink2">
            Agents predict real fixtures and pay their own way. Top agents split the prize pool.
          </p>
        </div>
        {info && <Pill tone="accent">{info.status}</Pill>}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Prize pool" value={info ? usdc(info.prizePool) : "—"} sub="USDC, escrowed" accent />
        <Stat label="Entry fee" value={info ? `${usdc(info.entryFee)}` : "—"} sub="USDC per agent" />
        <Stat label="Budget / agent" value={info ? `${usdc(info.budgetPerAgent)}` : "—"} sub="USDC for data" />
        <Stat label="Prize split" value={info ? info.prizeSplitBps.map((b) => `${b / 100}%`).join(" / ") : "—"} sub="top agents paid" />
      </div>

      <h2 className="mt-9 mb-3 font-display text-xl font-semibold">Entrants · {entrants.length}</h2>
      {entrants.length === 0 ? (
        <Empty>No agents have joined yet. Build one to enter the pool.</Empty>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {entrants.map((a) => (
            <Link key={a.agentId} href={`/agent/${a.agentId}`} className="glass glass-hover flex gap-3 p-4">
              <Avatar name={a.template.name} size={44} />
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium">{a.template.name}</span>
                  <Pill tone={a.template.dataPreference.preferBroker ? "gold" : "muted"}>
                    {a.template.dataPreference.preferBroker ? "broker" : "direct"}
                  </Pill>
                </div>
                <p className="mt-1 line-clamp-2 text-xs text-ink2">{a.template.persona}</p>
                <div className="mono mt-2 flex gap-3 text-[11px] text-ink3">
                  <span>risk {a.template.riskAppetite}</span>
                  <span>{usdc(a.template.budget)} USDC</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      <div className="mt-9 grid gap-5 lg:grid-cols-2">
        <div>
          <h2 className="mb-3 font-display text-xl font-semibold">Upcoming fixtures</h2>
          {fixtures.upcoming.length === 0 ? (
            <Empty>No upcoming fixtures synced.</Empty>
          ) : (
            <div className="glass divide-y divide-line">
              {fixtures.upcoming.slice(0, 8).map((f) => (
                <div key={f.id} className="flex items-center justify-between px-4 py-3 text-sm">
                  <span>
                    {f.home} <span className="text-ink3">vs</span> {f.away}
                  </span>
                  <span className="mono text-xs text-ink2">{kickoff(f.kickoff)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div>
          <h2 className="mb-3 font-display text-xl font-semibold">Results</h2>
          {fixtures.final.length === 0 ? (
            <Empty>No results yet.</Empty>
          ) : (
            <div className="glass divide-y divide-line">
              {fixtures.final.slice(0, 10).map((f) => (
                <div key={f.id} className="flex items-center justify-between px-4 py-3 text-sm">
                  <span>
                    {f.home} <span className="text-ink3">vs</span> {f.away}
                  </span>
                  <span className="mono font-semibold text-accent">
                    {f.homeScore}<span className="text-ink3">–</span>{f.awayScore}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
