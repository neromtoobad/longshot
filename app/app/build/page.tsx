"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

const SOURCES = ["form", "odds", "injuries", "h2h"] as const;
type Source = (typeof SOURCES)[number];

const PRESET = {
  name: "My Longshot",
  persona: "A contrarian who backs underdogs when cheap signals disagree with the favorite.",
  prompt: "Predict the exact score. Favor upsets when the evidence you bought contradicts the market.",
  riskAppetite: "high" as "low" | "medium" | "high",
  budget: "0.05",
  preferBroker: false,
  wtp: { form: "0.004", odds: "0", injuries: "0.002", h2h: "0.004" } as Record<Source, string>,
};

function toBaseUnits(usdc: string): string {
  const n = parseFloat(usdc);
  if (!Number.isFinite(n) || n <= 0) return "0";
  return String(Math.round(n * 1_000_000));
}

const input = "w-full rounded-md border border-line bg-surface2 px-3 py-2 text-sm text-ink outline-none focus:border-line2";
const label = "mono text-[10.5px] uppercase tracking-wide text-ink3";

export default function BuildPage() {
  const [f, setF] = useState(PRESET);
  const [result, setResult] = useState<{ agentId: string; templateHash: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const buys = useMemo(() => SOURCES.filter((s) => parseFloat(f.wtp[s] || "0") > 0), [f.wtp]);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: f.name,
          persona: f.persona,
          prompt: f.prompt,
          riskAppetite: f.riskAppetite,
          preferBroker: f.preferBroker,
          budget: toBaseUnits(f.budget),
          willingnessToPay: Object.fromEntries(SOURCES.map((s) => [s, toBaseUnits(f.wtp[s])])),
          poolId: "1",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    return (
      <div className="max-w-xl">
        <h1 className="font-display text-3xl font-semibold tracking-tight">Agent created</h1>
        <div className="card mt-5 p-5">
          <p className="text-sm text-ink2">{f.name} has joined the World Cup pool as agent #{result.agentId}.</p>
          <div className="mono mt-3 text-[11px] text-ink3">templateHash</div>
          <div className="mono break-all text-xs text-accent">{result.templateHash}</div>
          <p className="mt-4 text-xs text-ink3">
            Its Circle wallet is provisioned and the on-chain entry is paid at the next matchday run.
          </p>
          <div className="mt-5 flex gap-3">
            <Link href={`/agent/${result.agentId}`} className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accentink">
              View agent
            </Link>
            <Link href="/pool" className="rounded-md border border-line2 px-4 py-2 text-sm text-ink hover:bg-surface">
              Back to pool
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1.3fr_1fr]">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Build an agent</h1>
        <p className="mt-1 text-sm text-ink2">Author the template. Tune what it values and how much it&apos;ll pay for it.</p>

        <div className="mt-6 space-y-4">
          <div>
            <div className={label}>name</div>
            <input className={input} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          </div>
          <div>
            <div className={label}>persona</div>
            <textarea className={input} rows={2} value={f.persona} onChange={(e) => setF({ ...f, persona: e.target.value })} />
          </div>
          <div>
            <div className={label}>prompt</div>
            <textarea className={input} rows={3} value={f.prompt} onChange={(e) => setF({ ...f, prompt: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className={label}>risk appetite</div>
              <select className={input} value={f.riskAppetite} onChange={(e) => setF({ ...f, riskAppetite: e.target.value as typeof f.riskAppetite })}>
                <option value="low">low</option>
                <option value="medium">medium</option>
                <option value="high">high</option>
              </select>
            </div>
            <div>
              <div className={label}>budget (USDC)</div>
              <input className={input} value={f.budget} onChange={(e) => setF({ ...f, budget: e.target.value })} />
            </div>
          </div>

          <div>
            <div className={label}>willingness to pay per source (USDC, 0 = never buy)</div>
            <div className="mt-1 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {SOURCES.map((s) => (
                <div key={s}>
                  <div className="mb-1 text-xs text-ink2">{s}</div>
                  <input className={input} value={f.wtp[s]} onChange={(e) => setF({ ...f, wtp: { ...f.wtp, [s]: e.target.value } })} />
                </div>
              ))}
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-ink2">
            <input type="checkbox" checked={f.preferBroker} onChange={(e) => setF({ ...f, preferBroker: e.target.checked })} />
            buy through the Data Broker (reputation) instead of direct
          </label>

          {error && <p className="text-sm text-neg">{error}</p>}
          <button
            onClick={create}
            disabled={busy}
            className="rounded-md bg-accent px-5 py-2.5 text-sm font-medium text-accentink hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Creating…" : "Create + join pool"}
          </button>
        </div>
      </div>

      <div>
        <div className={label}>live preview</div>
        <div className="card mt-1 p-5">
          <div className="font-display text-lg font-semibold">{f.name || "Untitled agent"}</div>
          <p className="mt-1.5 text-sm text-ink2">{f.persona || "—"}</p>
          <div className="mono mt-4 space-y-1.5 text-[11px] text-ink3">
            <div>risk: <span className="text-ink2">{f.riskAppetite}</span></div>
            <div>budget: <span className="text-ink2">{f.budget || "0"} USDC</span></div>
            <div>sourcing: <span className="text-ink2">{f.preferBroker ? "broker" : "direct"}</span></div>
            <div>
              buys: <span className="text-accent">{buys.length ? buys.join(", ") : "nothing — predicts on its prior"}</span>
            </div>
          </div>
        </div>
        <p className="mt-3 text-xs text-ink3">
          The agent only buys a source when its value-per-dollar clears its risk threshold and the price is
          within both its willingness-to-pay and its remaining budget.
        </p>
      </div>
    </div>
  );
}
