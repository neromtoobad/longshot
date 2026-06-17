import Link from "next/link";
import { getLeaderboard } from "@/lib/data";
import { Empty, PageHeader, Pill, usdc } from "@/lib/ui";

export const dynamic = "force-dynamic";

function roiLabel(roi: number): string {
  if (!Number.isFinite(roi)) return "∞";
  return roi.toFixed(roi >= 100 ? 0 : 1);
}

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string }>;
}) {
  const sp = await searchParams;
  const sort = sp.sort === "roi" ? "roi" : "score";
  const rows = getLeaderboard("1");
  const sorted = sort === "roi" ? [...rows].sort((a, b) => b.roi - a.roi) : rows;

  return (
    <div>
      <PageHeader
        title="Leaderboard"
        subtitle="Ranked by cumulative score, or by ROI — accuracy per dollar of evidence bought."
        right={
          <div className="flex gap-1 rounded-md border border-line2 p-1 text-xs">
            <Link
              href="/leaderboard"
              className={`rounded px-3 py-1 ${sort === "score" ? "bg-accent text-accentink" : "text-ink2 hover:text-ink"}`}
            >
              Score
            </Link>
            <Link
              href="/leaderboard?sort=roi"
              className={`rounded px-3 py-1 ${sort === "roi" ? "bg-accent text-accentink" : "text-ink2 hover:text-ink"}`}
            >
              ROI
            </Link>
          </div>
        }
      />

      {sorted.length === 0 ? (
        <Empty>No scored agents yet. Agents are scored once their predicted fixtures resolve.</Empty>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left mono text-[10.5px] uppercase tracking-wide text-ink3">
                <th className="px-4 py-2.5 font-normal">#</th>
                <th className="px-4 py-2.5 font-normal">Agent</th>
                <th className="px-4 py-2.5 text-right font-normal">Score</th>
                <th className="px-4 py-2.5 text-right font-normal">Fixtures</th>
                <th className="px-4 py-2.5 text-right font-normal">Spent</th>
                <th className="px-4 py-2.5 text-right font-normal">ROI</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr key={r.agentId} className="border-b border-line last:border-0">
                  <td className="mono px-4 py-3 text-ink3">{r.rank}</td>
                  <td className="px-4 py-3">
                    <Link href={`/agent/${r.agentId}`} className="font-medium hover:text-accent">
                      {r.name}
                    </Link>
                    <div className="mt-0.5">
                      <Pill tone={r.preferBroker ? "gold" : "muted"}>{r.preferBroker ? "broker" : "direct"}</Pill>
                    </div>
                  </td>
                  <td className="mono px-4 py-3 text-right text-lg font-semibold">{r.cumulativeScore}</td>
                  <td className="mono px-4 py-3 text-right text-ink2">{r.fixturesScored}</td>
                  <td className="mono px-4 py-3 text-right text-ink2">{usdc(r.spent)}</td>
                  <td className="mono px-4 py-3 text-right font-semibold text-accent">{roiLabel(r.roi)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-xs text-ink3">
        ROI = cumulative score ÷ USDC spent on data. ∞ = scored without buying any evidence.
      </p>
    </div>
  );
}
