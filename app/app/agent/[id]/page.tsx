import Link from "next/link";
import { allFixtures } from "@/lib/fixtures-store";
import { readAgents, readPredictions } from "@/lib/store";
import { scorePrediction } from "@longshot/shared";
import { Avatar } from "@/components/Avatar";
import { ThinkReplay } from "@/components/ThinkReplay";
import { Empty, Pill, Stat, usdc } from "@/lib/ui";

export const dynamic = "force-dynamic";

export default async function AgentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const agent = readAgents().find((a) => a.agentId === id);
  if (!agent) return <Empty>Unknown agent {id}.</Empty>;

  const finals = new Map(allFixtures().filter((f) => f.status === "final").map((f) => [f.id, f]));
  const preds = readPredictions().filter((p) => p.agentId === id);
  const spent = preds.reduce((s, p) => s + BigInt(p.spent), 0n);
  const budget = BigInt(agent.template.budget);
  const remaining = budget > spent ? budget - spent : 0n;
  const totalPoints = preds.reduce((s, p) => {
    const f = finals.get(p.fixtureId);
    return f ? s + scorePrediction({ homeScore: p.homeScore, awayScore: p.awayScore }, { homeScore: f.homeScore!, awayScore: f.awayScore! }) : s;
  }, 0);

  return (
    <div>
      <Link href="/leaderboard" className="mono text-xs text-ink3 transition hover:text-ink">← leaderboard</Link>

      <div className="mt-3 mb-6 flex items-center gap-4">
        <Avatar name={agent.template.name} avatar={agent.avatar} size={64} />
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-3xl font-bold tracking-tight">{agent.template.name}</h1>
            <Pill tone={agent.template.dataPreference.preferBroker ? "gold" : "muted"}>
              {agent.template.dataPreference.preferBroker ? "broker" : "direct"}
            </Pill>
          </div>
          <p className="mt-1 max-w-2xl text-sm text-ink2">{agent.template.persona}</p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <Stat label="Score" value={totalPoints} sub={`${preds.length} predictions`} accent />
        <Stat label="Budget" value={`${usdc(agent.template.budget)}`} sub={`risk ${agent.template.riskAppetite}`} />
        <Stat label="Spent on data" value={`${usdc(spent.toString())}`} sub={`${usdc(remaining.toString())} USDC left`} />
        <Stat label="Risk appetite" value={<span className="capitalize">{agent.template.riskAppetite}</span>} />
      </div>

      <div className="mt-4 glass p-4">
        <span className="mono text-[10px] uppercase tracking-wider text-ink3">circle wallet (EOA on Arc)</span>
        <div className="mono mt-1 truncate text-xs text-ink2">{agent.walletAddress || "provisioned at matchday"}</div>
      </div>

      <h2 className="mt-9 mb-3 font-display text-xl font-semibold">Calls · {preds.length}</h2>
      {preds.length === 0 ? (
        <Empty>This agent hasn&apos;t predicted any fixtures yet. Run the pool to generate calls.</Empty>
      ) : (
        <div className="space-y-3">
          {preds.map((p) => {
            const f = finals.get(p.fixtureId);
            const pts = f ? scorePrediction({ homeScore: p.homeScore, awayScore: p.awayScore }, { homeScore: f.homeScore!, awayScore: f.awayScore! }) : null;
            return (
              <div key={p.fixtureId} className="glass p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="font-medium">{f ? `${f.home} vs ${f.away}` : `fixture ${p.fixtureId}`}</div>
                    {p.rationale && <p className="mt-1 max-w-2xl text-xs text-ink3">{p.rationale}</p>}
                  </div>
                  <div className="mono whitespace-nowrap text-right text-sm">
                    <div>
                      pred <span className="font-semibold text-accent">{p.homeScore}–{p.awayScore}</span>
                    </div>
                    {f && <div className="text-ink3">actual {f.homeScore}–{f.awayScore}</div>}
                    {pts !== null && <div className="text-accent">+{pts} pts</div>}
                  </div>
                </div>

                {p.decisions && p.decisions.length > 0 && (
                  <ThinkReplay decisions={p.decisions} rationale={p.rationale ?? ""} homeScore={p.homeScore} awayScore={p.awayScore} />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
