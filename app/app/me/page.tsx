"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useWallet } from "@/lib/wallet-context";
import { Avatar } from "@/components/Avatar";
import { AVATAR_STYLES, randomSeed } from "@/lib/avatar";

const SOURCES = ["form", "odds", "injuries", "h2h"] as const;
type Source = (typeof SOURCES)[number];

interface MyAgent {
  agentId: string;
  name: string;
  avatar?: { style: string; seed: string };
  onChainAgentId?: string;
  riskAppetite: string;
  preferBroker: boolean;
  budgetUSDC: string;
  willingnessToPay: Partial<Record<Source, string>>;
  persona: string;
  prompt: string;
  score: number;
  fixturesScored: number;
  predictions: number;
  spent: string;
  roi: number;
  provisioned: boolean;
}

const base2usdc = (b: string) => (Number(b || "0") / 1_000_000).toString();
const usdc2base = (v: string) => {
  const n = parseFloat(v);
  return String(Math.round((Number.isFinite(n) ? n : 0) * 1_000_000));
};
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const roiLabel = (roi: number) => (!Number.isFinite(roi) ? "∞" : roi.toFixed(roi >= 100 ? 0 : 1));

export default function MePage() {
  const { address, isConnected } = useWallet();
  const [agents, setAgents] = useState<MyAgent[] | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!address) return;
    const r = (await fetch(`/api/agents?owner=${address}`).then((x) => x.json())) as { agents?: MyAgent[] };
    setAgents(r.agents ?? []);
  }, [address]);

  useEffect(() => {
    // Load the connected owner's agents when the address changes (external sync).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (address) load();
    else setAgents(null);
  }, [address, load]);

  if (!isConnected || !address) {
    return (
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">My Agents</h1>
        <div className="glass mt-5 p-8 text-center text-sm text-ink2">Connect your wallet (top right) to see and tune the agents you own.</div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">My Agents</h1>
          <p className="mono mt-1 text-xs text-ink3">owner {short(address)}</p>
        </div>
        <Link href="/build" className="rounded-xl bg-accent px-4 py-2 text-sm font-bold text-white transition hover:opacity-90">+ Build another</Link>
      </div>

      {agents === null ? (
        <div className="glass mt-5 p-8 text-center text-sm text-ink2">loading…</div>
      ) : agents.length === 0 ? (
        <div className="glass mt-5 p-8 text-center text-sm text-ink2">No agents owned by this wallet yet. <Link href="/build" className="text-accent2">Build one →</Link></div>
      ) : (
        <div className="mt-5 space-y-4">
          {agents.map((a) =>
            editing === a.agentId ? (
              <EditForm key={a.agentId} agent={a} owner={address} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />
            ) : (
              <AgentRow key={a.agentId} agent={a} onEdit={() => setEditing(a.agentId)} />
            ),
          )}
        </div>
      )}
    </div>
  );
}

function AgentRow({ agent: a, onEdit }: { agent: MyAgent; onEdit: () => void }) {
  const buys = SOURCES.filter((s) => Number(a.willingnessToPay[s] ?? "0") > 0);
  return (
    <div className="glass p-4">
      <div className="flex items-start gap-4">
        <Avatar name={a.name} avatar={a.avatar} size={52} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-bold">{a.name}</span>
            <span className="pill text-ink2 border-line2">{a.riskAppetite} risk</span>
            <span className={`pill ${a.preferBroker ? "text-gold border-gold/40" : "text-ink2 border-line2"}`}>{a.preferBroker ? "broker" : "direct"}</span>
            <span className={`pill ${a.provisioned ? "text-pos border-pos/40" : "text-ink3 border-line2"}`}>{a.provisioned ? "live" : "wallet pending"}</span>
            {a.onChainAgentId && <span className="mono text-[10px] text-ink3">on-chain #{a.onChainAgentId}</span>}
          </div>
          <div className="mono mt-1 text-[11px] text-ink3">buys: {buys.length ? buys.join(", ") : "nothing — predicts on prior"}</div>
        </div>
        <div className="flex shrink-0 gap-2">
          <Link href={`/agent/${a.agentId}`} className="rounded-lg border border-line2 px-3 py-1.5 text-xs text-ink hover:bg-surface2">View</Link>
          <button onClick={onEdit} className="rounded-lg bg-accent/15 px-3 py-1.5 text-xs font-semibold text-accent2 hover:bg-accent/25">Edit</button>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 border-t border-line pt-3 sm:grid-cols-4">
        {[
          ["Score", `${a.score} pts`],
          ["Predictions", `${a.predictions}`, `${a.fixturesScored} scored`],
          ["Data spent", `${base2usdc(a.spent)} USDC`],
          ["ROI", roiLabel(a.roi)],
        ].map(([label, value, sub]) => (
          <div key={label}>
            <div className="mono text-[10px] uppercase tracking-wider text-ink3">{label}</div>
            <div className="num text-lg font-extrabold text-accent2">{value}</div>
            {sub && <div className="text-[10px] text-ink3">{sub}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

const inputCls = "w-full rounded-xl border border-line bg-surface2 px-3 py-2 text-sm text-ink outline-none transition focus:border-accent/60";

function EditForm({ agent: a, owner, onClose, onSaved }: { agent: MyAgent; owner: string; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(a.name);
  const [risk, setRisk] = useState(a.riskAppetite);
  const [broker, setBroker] = useState(a.preferBroker);
  const [budget, setBudget] = useState(base2usdc(a.budgetUSDC));
  const [persona, setPersona] = useState(a.persona);
  const [prompt, setPrompt] = useState(a.prompt);
  const [style, setStyle] = useState(a.avatar?.style ?? "bottts");
  const [seed, setSeed] = useState(a.avatar?.seed ?? a.name);
  const [wtp, setWtp] = useState<Record<Source, { on: boolean; v: string }>>(() => {
    const o = {} as Record<Source, { on: boolean; v: string }>;
    for (const s of SOURCES) {
      const v = Number(a.willingnessToPay[s] ?? "0");
      o[s] = { on: v > 0, v: v > 0 ? base2usdc(String(v)) : "0.004" };
    }
    return o;
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const willingnessToPay = Object.fromEntries(SOURCES.map((s) => [s, wtp[s].on ? usdc2base(wtp[s].v) : "0"]));
      const res = await fetch(`/api/agents/${a.agentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner, name, riskAppetite: risk, preferBroker: broker, budget: usdc2base(budget), willingnessToPay, persona, prompt, avatar: { style, seed } }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || json.error) throw new Error(json.error ?? "save failed");
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="glass border-accent/40 p-5" style={{ borderColor: "color-mix(in srgb, var(--color-accent) 50%, var(--color-line))" }}>
      <div className="flex items-center gap-4">
        <Avatar name={name} avatar={{ style, seed }} size={52} />
        <div className="flex-1">
          <div className="mono text-[10px] uppercase tracking-wider text-ink3">edit · agent #{a.onChainAgentId ?? a.agentId}</div>
          <div className="mt-1 flex gap-2">
            <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
            <button type="button" onClick={() => setSeed(randomSeed())} title="shuffle face" className="shrink-0 rounded-xl border border-line bg-surface2 px-3 hover:border-line2">🎲</button>
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {AVATAR_STYLES.map((s) => (
          <button key={s.id} type="button" onClick={() => setStyle(s.id)} className={`rounded-lg px-2.5 py-1 text-xs transition ${style === s.id ? "grad-hi font-semibold text-white" : "border border-line bg-surface2 text-ink2 hover:text-ink"}`}>{s.label}</button>
        ))}
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <div className="mono text-[10px] uppercase tracking-wider text-ink3">risk appetite</div>
          <div className="mt-1.5 flex gap-1 rounded-xl border border-line bg-surface p-1">
            {["low", "medium", "high"].map((r) => (
              <button key={r} type="button" onClick={() => setRisk(r)} className={`flex-1 rounded-lg px-2 py-1.5 text-sm capitalize ${risk === r ? "grad-hi font-semibold text-white" : "text-ink2 hover:text-ink"}`}>{r}</button>
            ))}
          </div>
        </div>
        <div>
          <div className="mono text-[10px] uppercase tracking-wider text-ink3">data sourcing</div>
          <div className="mt-1.5 flex gap-1 rounded-xl border border-line bg-surface p-1">
            {[["direct", false], ["broker", true]].map(([label, val]) => (
              <button key={String(label)} type="button" onClick={() => setBroker(val as boolean)} className={`flex-1 rounded-lg px-2 py-1.5 text-sm capitalize ${broker === val ? "grad-hi font-semibold text-white" : "text-ink2 hover:text-ink"}`}>{label}</button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4">
        <div className="mono text-[10px] uppercase tracking-wider text-ink3">evidence it values</div>
        <div className="mt-2 space-y-2">
          {SOURCES.map((s) => (
            <div key={s} className="flex items-center gap-3 rounded-xl border border-line bg-surface2 px-3 py-2">
              <button type="button" onClick={() => setWtp((w) => ({ ...w, [s]: { ...w[s], on: !w[s].on } }))} className={`relative h-6 w-11 shrink-0 rounded-full transition ${wtp[s].on ? "bg-accent" : "bg-line2"}`}>
                <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${wtp[s].on ? "left-[22px]" : "left-0.5"}`} />
              </button>
              <span className="w-20 text-sm capitalize">{s}</span>
              {wtp[s].on ? (
                <label className="ml-auto flex items-center gap-2 text-xs text-ink3">
                  pay up to $
                  <input className="w-20 rounded-lg border border-line bg-bg px-2 py-1 text-right text-sm text-ink outline-none focus:border-accent/60" value={wtp[s].v} onChange={(e) => setWtp((w) => ({ ...w, [s]: { ...w[s], v: e.target.value } }))} />
                </label>
              ) : (
                <span className="ml-auto text-xs text-ink3">won&apos;t buy</span>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4">
        <div className="mono text-[10px] uppercase tracking-wider text-ink3">data budget (USDC)</div>
        <input className={`${inputCls} mt-1.5 w-32`} value={budget} onChange={(e) => setBudget(e.target.value)} />
      </div>

      <div className="mt-4 space-y-2">
        <textarea className={inputCls} rows={2} value={persona} onChange={(e) => setPersona(e.target.value)} placeholder="persona" />
        <textarea className={inputCls} rows={3} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="prompt" />
      </div>

      {error && <p className="mt-2 text-sm text-neg">{error}</p>}
      <div className="mt-4 flex gap-2">
        <button onClick={save} disabled={busy} className="rounded-xl bg-accent px-5 py-2 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-60">{busy ? "saving…" : "Save changes"}</button>
        <button onClick={onClose} disabled={busy} className="rounded-xl border border-line2 px-4 py-2 text-sm text-ink hover:bg-surface2">Cancel</button>
      </div>
      <p className="mono mt-3 text-[10px] text-ink3">Tunes the off-chain strategy your agent runs on. The on-chain registration (#{a.onChainAgentId ?? "—"}) stays as your original commitment.</p>
    </div>
  );
}
