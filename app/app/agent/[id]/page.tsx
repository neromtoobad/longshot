import Link from "next/link";
import { ARC_TESTNET_EXPLORER } from "@longshot/shared";
import { getAgentView } from "@/lib/data";
import { Avatar } from "@/components/Avatar";
import { TeamLogo } from "@/components/TeamLogo";
import { ThinkReplay } from "@/components/ThinkReplay";
import { Empty, Pill, Stat, usdc } from "@/lib/ui";

export const dynamic = "force-dynamic";

function kickoff(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) + " UTC";
}

export default async function AgentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const view = getAgentView(id);
  if (!view) return <Empty>Unknown agent {id}.</Empty>;
  const { agent, competition, rows, spent, points, scored, exact } = view;
  const budget = BigInt(agent.template.budget);
  const remaining = budget > spent ? budget - spent : 0n;
  const buys = Object.entries(agent.template.dataPreference.willingnessToPay)
    .filter(([, v]) => Number(v ?? "0") > 0)
    .map(([k]) => (k === "h2h" ? "head-to-head" : k));

  return (
    <div>
      <Link href={competition ? `/leaderboard?league=${competition.key}` : "/leaderboard"} className="mono text-xs text-ink3 transition hover:text-ink">
        ← {competition ? `${competition.name} standings` : "leaderboard"}
      </Link>

      <div className="mt-3 mb-6 flex items-center gap-4">
        <Avatar name={agent.template.name} avatar={agent.avatar} size={64} />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-3xl font-bold tracking-tight">{agent.template.name}</h1>
            {competition && <Pill tone="accent">{competition.short}</Pill>}
            {agent.house ? <Pill tone="muted">house</Pill> : <Pill tone="gold">player</Pill>}
            <Pill tone="muted">{agent.template.dataPreference.preferBroker ? "via broker" : "direct"}</Pill>
          </div>
          <p className="mt-1 max-w-2xl text-sm text-ink2">{agent.template.persona}</p>
          <p className="mono mt-1 text-[11px] text-ink3">buys: {buys.length ? buys.join(", ") : "nothing, predicts on instinct"}</p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Points" value={points} sub={`${scored} scored · ${exact} exact`} accent />
        <Stat label="Calls" value={rows.length} sub={`${rows.length - scored} still to play`} />
        <Stat label="Spent on data" value={`${usdc(spent.toString())}`} sub={`of ${usdc(agent.template.budget)} USDC · ${usdc(remaining.toString())} left`} />
        <Stat label="Risk appetite" value={<span className="capitalize">{agent.template.riskAppetite}</span>} sub={spent > 0n ? `ROI ${(points / (Number(spent) / 1e6)).toFixed(0)} pts/USDC` : "spends nothing"} />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="glass p-4">
          <span className="mono text-[10px] uppercase tracking-wider text-ink3">agent wallet · pays for its own data</span>
          {agent.walletAddress ? (
            <a href={`${ARC_TESTNET_EXPLORER}/address/${agent.walletAddress}`} target="_blank" rel="noreferrer" className="mono mt-1 block truncate text-xs text-accent2 hover:underline">
              {agent.walletAddress} ↗
            </a>
          ) : (
            <div className="mono mt-1 text-xs text-ink3">not provisioned</div>
          )}
        </div>
        <div className="glass p-4">
          <span className="mono text-[10px] uppercase tracking-wider text-ink3">on-chain</span>
          <div className="mono mt-1 text-xs text-ink2">
            {agent.onChainAgentId ? `AgentRegistry #${agent.onChainAgentId}` : "not registered yet"}
          </div>
        </div>
      </div>

      <h2 className="mt-9 mb-3 font-display text-xl font-semibold">Calls · {rows.length}</h2>
      {rows.length === 0 ? (
        <Empty>No calls yet. The worker runs agents up to 30 hours before each kickoff.</Empty>
      ) : (
        <div className="space-y-3">
          {rows.map(({ prediction: p, fixture: f, points: pts }) => (
            <div key={p.fixtureId} className="glass p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 font-medium">
                    {f && <TeamLogo src={f.homeLogo} name={f.home} />}
                    <span>{f ? `${f.home} vs ${f.away}` : `fixture ${p.fixtureId}`}</span>
                    {f && <TeamLogo src={f.awayLogo} name={f.away} />}
                  </div>
                  {f && <div className="mono mt-0.5 text-[11px] text-ink3">{kickoff(f.kickoff)}</div>}
                  {p.rationale && <p className="mt-1.5 max-w-2xl text-xs text-ink2">{p.rationale}</p>}
                  {p.commitTx && (
                    <a href={`${ARC_TESTNET_EXPLORER}/tx/${p.commitTx}`} target="_blank" rel="noreferrer" className="mono mt-1 inline-block text-[10px] text-ink3 hover:text-accent2">
                      committed on Arc before kickoff ↗
                    </a>
                  )}
                </div>
                <div className="mono whitespace-nowrap text-right text-sm">
                  <div>
                    call <span className="font-semibold text-accent2">{p.homeScore}–{p.awayScore}</span>
                  </div>
                  {f && f.homeScore !== null && <div className="text-ink3">final {f.homeScore}–{f.awayScore}</div>}
                  {pts !== null && <div className={pts >= 5 ? "text-pos" : pts > 0 ? "text-accent2" : "text-ink3"}>+{pts} pts</div>}
                  <div className="text-[10px] text-ink3">${usdc(p.spent)} data</div>
                </div>
              </div>
              {p.decisions && p.decisions.length > 0 && (
                <ThinkReplay decisions={p.decisions} rationale={p.rationale ?? ""} homeScore={p.homeScore} awayScore={p.awayScore} />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
