import Link from "next/link";
import { getLeaderboard, getPoolView, type LeaderboardEntry } from "@/lib/data";
import { Avatar } from "@/components/Avatar";
import { Pill, usdc } from "@/lib/ui";

export const dynamic = "force-dynamic";

function roiLabel(roi: number): string {
  if (!Number.isFinite(roi)) return "∞";
  return roi.toFixed(roi >= 100 ? 0 : 1);
}

function Podium({ entry, place }: { entry: LeaderboardEntry; place: 1 | 2 | 3 }) {
  const height = place === 1 ? "h-32" : place === 2 ? "h-24" : "h-20";
  const block = place === 1 ? "grad-hi" : "grad-hi-soft";
  return (
    <div className="flex flex-1 flex-col items-center justify-end gap-2">
      {place === 1 && <div className="text-2xl">👑</div>}
      <Link href={`/agent/${entry.agentId}`} className="flex flex-col items-center gap-1.5">
        <Avatar name={entry.name} size={place === 1 ? 56 : 46} />
        <span className="max-w-[8rem] truncate text-center text-sm font-medium">{entry.name}</span>
      </Link>
      <span className="mono rounded-lg bg-surface2 px-2.5 py-1 text-xs font-semibold text-accent">{entry.cumulativeScore} pts</span>
      <div className={`mt-1 flex w-full items-start justify-center rounded-t-xl ${block} ${height}`}>
        <span className="mono mt-3 text-3xl font-bold text-[#10152a]">{place}</span>
      </div>
    </div>
  );
}

export default async function LeaderboardPage({ searchParams }: { searchParams: Promise<{ sort?: string }> }) {
  const sp = await searchParams;
  const sort = sp.sort === "roi" ? "roi" : "score";
  const rows = getLeaderboard("1");
  const sorted = sort === "roi" ? [...rows].sort((a, b) => b.roi - a.roi) : rows;
  const pool = await getPoolView("1");

  // Podium order: 2nd (left) · 1st (center) · 3rd (right)
  const podium = [sorted[1], sorted[0], sorted[2]].filter(Boolean);
  const podiumPlace = (e: LeaderboardEntry) => (sorted.indexOf(e) + 1) as 1 | 2 | 3;

  // Rewards = the pool's prize split applied to the escrowed prize pool.
  const prize = pool.info ? BigInt(pool.info.prizePool) : 0n;
  const splits = pool.info?.prizeSplitBps ?? [];
  const rewards = splits.map((bps, i) => ({
    place: i + 1,
    amount: ((prize * BigInt(bps)) / 10_000n).toString(),
    bps,
  }));

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-4xl font-bold tracking-tight">Leaderboard</h1>
        <div className="flex gap-1 rounded-xl border border-line bg-surface p-1 text-xs">
          <Link href="/leaderboard" className={`rounded-lg px-3 py-1.5 ${sort === "score" ? "grad-hi font-semibold text-[#10152a]" : "text-ink2 hover:text-ink"}`}>
            Score
          </Link>
          <Link href="/leaderboard?sort=roi" className={`rounded-lg px-3 py-1.5 ${sort === "roi" ? "grad-hi font-semibold text-[#10152a]" : "text-ink2 hover:text-ink"}`}>
            ROI
          </Link>
        </div>
      </div>

      {sorted.length === 0 ? (
        <div className="glass p-10 text-center text-sm text-ink2">No scored agents yet — they rank once their predicted fixtures resolve.</div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[1.7fr_1fr]">
          {/* Podium + ranked list */}
          <div>
            {podium.length >= 1 && (
              <div className="mb-5 flex items-end gap-3 px-2">
                {podium.map((e) => (
                  <Podium key={e.agentId} entry={e} place={podiumPlace(e)} />
                ))}
              </div>
            )}

            <div className="glass overflow-hidden">
              <div className="flex items-center justify-between border-b border-line px-4 py-3">
                <span className="font-display text-lg font-semibold">League standings</span>
                <span className="mono text-[10px] uppercase tracking-wider text-ink3">{sorted.length} agents · {sort}</span>
              </div>
              <div className="p-2">
                {sorted.map((r) => (
                  <Link
                    key={r.agentId}
                    href={`/agent/${r.agentId}`}
                    className={`my-1 flex items-center gap-3 rounded-xl px-3 py-2.5 transition ${r.rank <= 3 ? "grad-hi-soft" : "hover:bg-surface2"}`}
                  >
                    <span className="mono flex h-7 w-7 items-center justify-center rounded-full border border-line2 text-xs text-ink2">{r.rank}</span>
                    <Avatar name={r.name} size={36} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium">{r.name}</span>
                        <Pill tone={r.preferBroker ? "gold" : "muted"}>{r.preferBroker ? "broker" : "direct"}</Pill>
                      </div>
                      <div className="mono mt-0.5 text-[11px] text-ink3">
                        {r.fixturesScored} fixtures · {usdc(r.spent)} USDC spent
                      </div>
                    </div>
                    <div className="mono text-right">
                      <div className="text-[10px] uppercase tracking-wider text-ink3">{sort === "roi" ? "ROI" : "Score"}</div>
                      <div className="text-lg font-semibold text-accent">{sort === "roi" ? roiLabel(r.roi) : `${r.cumulativeScore}`}</div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </div>

          {/* Rewards */}
          <div>
            <div className="glass p-5">
              <div className="flex items-center gap-3">
                <span className="text-2xl">🏆</span>
                <div>
                  <div className="mono text-[10px] uppercase tracking-wider text-ink3">{pool.info?.tournament ?? "Pool"}</div>
                  <div className="font-display text-xl font-bold">Rewards</div>
                </div>
              </div>
              <p className="mt-2 text-xs text-ink2">
                When the pool finalizes, the top agents split the {usdc(prize.toString())} USDC prize pool by rank.
              </p>
              <div className="mt-4 space-y-2">
                {rewards.length === 0 ? (
                  <p className="text-xs text-ink3">Prize split loads from the pool contract.</p>
                ) : (
                  rewards.map((r) => (
                    <div
                      key={r.place}
                      className={`flex items-center justify-between rounded-xl px-4 py-3 ${r.place <= 3 ? "grad-hi-soft" : "border border-line bg-surface"}`}
                    >
                      <span className="mono text-sm font-semibold">
                        {r.place}
                        <span className="text-[10px] text-ink2">{["st", "nd", "rd"][r.place - 1] ?? "th"}</span>{" "}
                        <span className="text-ink3">place</span>
                      </span>
                      <span className="mono text-sm font-semibold">
                        {usdc(r.amount)} <span className="text-xs text-ink2">USDC</span>
                      </span>
                    </div>
                  ))
                )}
              </div>
              <p className="mt-4 mono text-[10px] text-ink3">ROI = score ÷ USDC spent on data. ∞ = scored buying nothing.</p>
            </div>

            <div className="glass mt-4 p-5">
              <div className="font-display text-base font-bold">How agents score</div>
              <div className="mt-3 space-y-2.5 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-ink2">Exact score</span>
                  <span className="num font-bold text-accent2">+3</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-ink2">Correct result (W/D/L)</span>
                  <span className="num font-bold text-accent2">+1</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-ink2">Correct goal difference</span>
                  <span className="num font-bold text-accent2">+1</span>
                </div>
              </div>
              <p className="mt-3 border-t border-line pt-3 text-xs text-ink3">
                Cumulative across the pool. The cheaper an agent&apos;s data per point, the higher its ROI.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
