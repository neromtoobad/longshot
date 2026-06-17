import Link from "next/link";
import { allFixtures } from "@/lib/fixtures-store";
import { readAgents, readPredictions } from "@/lib/store";
import { scorePrediction } from "@longshot/shared";
import { Card, Empty, PageHeader, Pill, usdc } from "@/lib/ui";

export const dynamic = "force-dynamic";

export default async function AgentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const agent = readAgents().find((a) => a.agentId === id);
  if (!agent) {
    return <Empty>Unknown agent {id}.</Empty>;
  }
  const finals = new Map(allFixtures().filter((f) => f.status === "final").map((f) => [f.id, f]));
  const preds = readPredictions().filter((p) => p.agentId === id);

  return (
    <div>
      <PageHeader
        title={agent.template.name}
        subtitle={agent.template.persona}
        right={<Pill tone={agent.template.dataPreference.preferBroker ? "gold" : "muted"}>{agent.template.dataPreference.preferBroker ? "broker" : "direct"}</Pill>}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <div className="mono text-[10.5px] uppercase tracking-wide text-ink3">risk appetite</div>
          <div className="mt-1 text-lg font-medium capitalize">{agent.template.riskAppetite}</div>
        </Card>
        <Card>
          <div className="mono text-[10.5px] uppercase tracking-wide text-ink3">budget</div>
          <div className="mono mt-1 text-lg font-medium">{usdc(agent.template.budget)} USDC</div>
        </Card>
        <Card>
          <div className="mono text-[10.5px] uppercase tracking-wide text-ink3">wallet</div>
          <div className="mono mt-1 truncate text-xs text-ink2">{agent.walletAddress}</div>
        </Card>
      </div>

      <h2 className="mt-9 mb-3 font-display text-xl font-semibold">Predictions ({preds.length})</h2>
      {preds.length === 0 ? (
        <Empty>This agent hasn&apos;t predicted any fixtures yet.</Empty>
      ) : (
        <div className="card divide-y divide-line">
          {preds.map((p) => {
            const f = finals.get(p.fixtureId);
            const pts = f ? scorePrediction({ homeScore: p.homeScore, awayScore: p.awayScore }, { homeScore: f.homeScore!, awayScore: f.awayScore! }) : null;
            return (
              <div key={p.fixtureId} className="px-4 py-3">
                <div className="flex items-center justify-between text-sm">
                  <span>{f ? `${f.home} vs ${f.away}` : `fixture ${p.fixtureId}`}</span>
                  <span className="mono">
                    pred {p.homeScore}–{p.awayScore}
                    {f && (
                      <>
                        {" · actual "}
                        <span className="font-semibold">{f.homeScore}–{f.awayScore}</span>
                      </>
                    )}
                    {pts !== null && <span className="ml-2 text-accent">+{pts}</span>}
                  </span>
                </div>
                {p.rationale && <p className="mt-1 text-xs text-ink3">{p.rationale}</p>}
              </div>
            );
          })}
        </div>
      )}

      <p className="mt-6 text-sm">
        <Link href="/leaderboard" className="text-accent hover:underline">
          ← back to leaderboard
        </Link>
      </p>
    </div>
  );
}
