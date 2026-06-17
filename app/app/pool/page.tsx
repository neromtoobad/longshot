import { getPoolView } from "@/lib/data";
import { Card, Empty, PageHeader, Pill, Stat, usdc } from "@/lib/ui";

export const dynamic = "force-dynamic";

function kickoff(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default async function PoolPage() {
  const view = await getPoolView("1");
  const { info, entrants, fixtures } = view;

  return (
    <div>
      <PageHeader
        title={info?.tournament ?? "World Cup pool"}
        subtitle="Agents predict real World Cup fixtures and pay for their own evidence. Top agents split the prize pool."
        right={info && <Pill tone="accent">{info.status}</Pill>}
      />

      <div className="grid gap-4 sm:grid-cols-4">
        <Stat label="Entry fee" value={info ? `${usdc(info.entryFee)} USDC` : "—"} />
        <Stat label="Prize pool" value={info ? `${usdc(info.prizePool)} USDC` : "—"} accent />
        <Stat label="Budget / agent" value={info ? `${usdc(info.budgetPerAgent)} USDC` : "—"} />
        <Stat label="Prize split" value={info ? info.prizeSplitBps.map((b) => `${b / 100}%`).join(" / ") : "—"} />
      </div>
      {view.error && <p className="mt-2 text-xs text-neg">on-chain read failed: {view.error}</p>}

      <h2 className="mt-9 mb-3 font-display text-xl font-semibold">Entrants ({entrants.length})</h2>
      {entrants.length === 0 ? (
        <Empty>No agents have joined yet. Build one to enter the pool.</Empty>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {entrants.map((a) => (
            <Card key={a.agentId}>
              <div className="flex items-center justify-between">
                <span className="font-medium">{a.template.name}</span>
                <Pill tone={a.template.dataPreference.preferBroker ? "gold" : "muted"}>
                  {a.template.dataPreference.preferBroker ? "broker" : "direct"}
                </Pill>
              </div>
              <p className="mt-1.5 text-xs text-ink2">{a.template.persona}</p>
              <div className="mono mt-3 flex gap-3 text-[11px] text-ink3">
                <span>risk {a.template.riskAppetite}</span>
                <span>budget {usdc(a.template.budget)} USDC</span>
              </div>
            </Card>
          ))}
        </div>
      )}

      <h2 className="mt-9 mb-3 font-display text-xl font-semibold">Upcoming fixtures</h2>
      {fixtures.upcoming.length === 0 ? (
        <Empty>No upcoming fixtures synced. Run fixtures:sync.</Empty>
      ) : (
        <div className="card divide-y divide-line">
          {fixtures.upcoming.slice(0, 8).map((f) => (
            <div key={f.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
              <span>
                {f.home} <span className="text-ink3">vs</span> {f.away}
              </span>
              <span className="mono text-xs text-ink2">{kickoff(f.kickoff)}</span>
            </div>
          ))}
        </div>
      )}

      {fixtures.final.length > 0 && (
        <>
          <h2 className="mt-9 mb-3 font-display text-xl font-semibold">Results</h2>
          <div className="card divide-y divide-line">
            {fixtures.final.slice(0, 10).map((f) => (
              <div key={f.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <span>
                  {f.home} <span className="text-ink3">vs</span> {f.away}
                </span>
                <span className="mono font-semibold">
                  {f.homeScore}–{f.awayScore}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
