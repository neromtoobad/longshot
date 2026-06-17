import Link from "next/link";
import { allFixtures } from "@/lib/fixtures-store";
import { readAgents, readPredictions } from "@/lib/store";
import { scorePrediction } from "@longshot/shared";
import { Card, Empty, PageHeader, Pill, Stat, usdc } from "@/lib/ui";

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
      <PageHeader
        title={agent.template.name}
        subtitle={agent.template.persona}
        right={<Pill tone={agent.template.dataPreference.preferBroker ? "gold" : "muted"}>{agent.template.dataPreference.preferBroker ? "broker" : "direct"}</Pill>}
      />

      <div className="grid gap-4 sm:grid-cols-4">
        <Stat label="Score" value={totalPoints} accent />
        <Stat label="Budget" value={`${usdc(agent.template.budget)} USDC`} sub={`risk ${agent.template.riskAppetite}`} />
        <Stat label="Spent on data" value={`${usdc(spent.toString())} USDC`} sub={`${usdc(remaining.toString())} remaining`} />
        <Stat label="Predictions" value={preds.length} />
      </div>
      <Card className="mt-4">
        <div className="mono text-[10.5px] uppercase tracking-wide text-ink3">circle wallet</div>
        <div className="mono mt-1 truncate text-xs text-ink2">
          {agent.walletAddress || "provisioned at matchday (Circle DCW, EOA on Arc)"}
        </div>
      </Card>

      <h2 className="mt-9 mb-3 font-display text-xl font-semibold">Calls ({preds.length})</h2>
      {preds.length === 0 ? (
        <Empty>This agent hasn&apos;t predicted any fixtures yet. Run the pool to generate calls.</Empty>
      ) : (
        <div className="space-y-3">
          {preds.map((p) => {
            const f = finals.get(p.fixtureId);
            const pts = f ? scorePrediction({ homeScore: p.homeScore, awayScore: p.awayScore }, { homeScore: f.homeScore!, awayScore: f.awayScore! }) : null;
            return (
              <Card key={p.fixtureId}>
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-medium">{f ? `${f.home} vs ${f.away}` : `fixture ${p.fixtureId}`}</div>
                    {p.rationale && <p className="mt-1 max-w-2xl text-xs text-ink3">{p.rationale}</p>}
                  </div>
                  <div className="mono whitespace-nowrap text-right text-sm">
                    <div>
                      pred <span className="font-semibold">{p.homeScore}–{p.awayScore}</span>
                    </div>
                    {f && <div className="text-ink3">actual {f.homeScore}–{f.awayScore}</div>}
                    {pts !== null && <div className="text-accent">+{pts} pts</div>}
                  </div>
                </div>

                {/* The buy-or-skip decision log — the proof of agency. */}
                {p.decisions && p.decisions.length > 0 && (
                  <div className="mt-3 border-t border-line pt-3">
                    <div className="mono mb-2 text-[10px] uppercase tracking-wide text-ink3">evidence decisions</div>
                    <div className="space-y-1">
                      {p.decisions.map((d) => (
                        <div key={d.source} className="flex items-baseline gap-2 text-xs">
                          <span className={`mono w-12 ${d.decision === "buy" ? "text-pos" : "text-ink3"}`}>
                            {d.decision === "buy" ? "BUY" : "SKIP"}
                          </span>
                          <span className="w-16 text-ink2">{d.source}</span>
                          <span className="mono w-20 text-ink3">{usdc(toBase(d.priceUSDC))} USDC</span>
                          <span className="text-ink3">{d.reason}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <p className="mt-6 text-sm">
        <Link href="/leaderboard" className="text-accent hover:underline">← back to leaderboard</Link>
      </p>
    </div>
  );
}

// Decision prices are stored as USDC strings (e.g. "0.003"); usdc() wants base units.
function toBase(usdcStr: string): string {
  const n = parseFloat(usdcStr);
  return String(Math.round((Number.isFinite(n) ? n : 0) * 1_000_000));
}
