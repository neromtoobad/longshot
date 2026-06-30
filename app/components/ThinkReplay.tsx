"use client";

// Replays a real prediction step-by-step: each evidence decision (buy = x402 settled / skip = why),
// then the model's reasoning, then the verdict. Uses the agent's actual stored decision log — it's a
// genuine call, animated. Decisions show by default; "watch it think" re-plays the sequence.

import { useState } from "react";

interface Decision {
  source: string;
  decision: string;
  priceUSDC: string;
  reason: string;
  estimatedValue?: number;
  settlementUuid?: string;
}

type Item = { kind: "decision"; d: Decision } | { kind: "reason" } | { kind: "verdict" };

export function ThinkReplay({
  decisions,
  rationale,
  homeScore,
  awayScore,
}: {
  decisions: Decision[];
  rationale: string;
  homeScore: number;
  awayScore: number;
}) {
  const timeline: Item[] = [...decisions.map((d) => ({ kind: "decision" as const, d })), { kind: "reason" as const }, { kind: "verdict" as const }];
  const [n, setN] = useState(timeline.length); // everything visible by default
  const [playing, setPlaying] = useState(false);

  function play() {
    setN(0);
    setPlaying(true);
    let i = 0;
    const step = () => {
      i += 1;
      setN(i);
      if (i < timeline.length) setTimeout(step, 650);
      else setPlaying(false);
    };
    setTimeout(step, 350);
  }

  return (
    <div className="mt-3 border-t border-line pt-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="mono text-[10px] uppercase tracking-wider text-ink3">evidence decisions</span>
        <button onClick={play} disabled={playing} className="mono text-[10px] uppercase tracking-wider text-accent2 transition hover:text-accent disabled:text-ink3">
          {playing ? "thinking…" : n < timeline.length ? "…" : "▶ watch it think"}
        </button>
      </div>
      <div className="space-y-1.5">
        {timeline.slice(0, n).map((item, idx) => (
          <div key={idx} className="fade-up text-xs">
            {item.kind === "decision" ? (
              <div className="flex items-baseline gap-2">
                <span className={`mono w-12 font-semibold ${item.d.decision === "buy" ? "text-pos" : "text-ink3"}`}>{item.d.decision === "buy" ? "BUY" : "SKIP"}</span>
                <span className="w-16 text-ink2">{item.d.source}</span>
                {typeof item.d.estimatedValue === "number" && (
                  <span className="mono shrink-0 rounded bg-line/60 px-1 text-[10px] text-ink2" title="model's value-of-information estimate for this match (0–1)">
                    value {item.d.estimatedValue.toFixed(2)}
                  </span>
                )}
                {item.d.decision === "buy" && (
                  <span className="mono shrink-0 text-accent2">
                    ${item.d.priceUSDC} · x402{item.d.settlementUuid && !item.d.settlementUuid.startsWith("test-") ? ` ✓ ${item.d.settlementUuid.slice(0, 8)}` : " settled"}
                  </span>
                )}
                <span className="text-ink3">{item.d.reason}</span>
              </div>
            ) : item.kind === "reason" ? (
              <div className="text-ink2">🧠 <span className="text-ink3">{rationale || "synthesizing the evidence…"}</span></div>
            ) : (
              <div className="font-semibold text-accent">⚽ calls it {homeScore}–{awayScore}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
