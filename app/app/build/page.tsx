"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { decodeEventLog } from "viem";
import { useAccount, usePublicClient, useSwitchChain, useWriteContract } from "wagmi";
import { hashTemplate, type AgentTemplate } from "@longshot/shared";
import { Avatar } from "@/components/Avatar";
import { arcChain } from "@/lib/wagmi";
import {
  ENTRY_FEE,
  POOL_ADDRESS,
  REGISTRY_ADDRESS,
  USDC_ADDRESS,
  WORLD_CUP_POOL_ID,
  poolAbi,
  registryAbi,
  usdcAbi,
} from "@/lib/contracts";

const SOURCES = ["form", "odds", "injuries", "h2h"] as const;
type Source = (typeof SOURCES)[number];
type Risk = "low" | "medium" | "high";
type SourceState = { on: boolean; wtp: string };
type Form = {
  name: string;
  persona: string;
  prompt: string;
  risk: Risk;
  budget: string;
  broker: boolean;
  sources: Record<Source, SourceState>;
};

const ARCHETYPES: { key: string; emoji: string; blurb: string; form: Form }[] = [
  {
    key: "Cheap Contrarian",
    emoji: "🎲",
    blurb: "backs underdogs on cheap signals",
    form: {
      name: "Cheap Contrarian",
      persona: "A frugal contrarian who backs underdogs when cheap signals disagree with the favorite.",
      prompt: "Predict the exact score. Favor upsets when the evidence you bought contradicts the market.",
      risk: "high",
      budget: "0.03",
      broker: false,
      sources: { form: { on: true, wtp: "0.004" }, odds: { on: false, wtp: "0" }, injuries: { on: false, wtp: "0" }, h2h: { on: true, wtp: "0.004" } },
    },
  },
  {
    key: "Favorite Backer",
    emoji: "📈",
    blurb: "trusts the market odds",
    form: {
      name: "Favorite Backer",
      persona: "A disciplined favorite-backer who trusts the bookmakers above all.",
      prompt: "Predict the exact score. Weight the market odds heavily; favor the favorite unless the data screams otherwise.",
      risk: "low",
      budget: "0.04",
      broker: true,
      sources: { form: { on: false, wtp: "0" }, odds: { on: true, wtp: "0.008" }, injuries: { on: true, wtp: "0.004" }, h2h: { on: false, wtp: "0" } },
    },
  },
  {
    key: "Injury Hunter",
    emoji: "🩹",
    blurb: "weights availability + form",
    form: {
      name: "Injury Hunter",
      persona: "An injury-news specialist who values team availability and recent form over market odds.",
      prompt: "Predict the exact score. Heavily weight injuries/availability and recent form.",
      risk: "medium",
      budget: "0.03",
      broker: false,
      sources: { form: { on: true, wtp: "0.005" }, odds: { on: false, wtp: "0" }, injuries: { on: true, wtp: "0.005" }, h2h: { on: true, wtp: "0.003" } },
    },
  },
  {
    key: "Data Maximalist",
    emoji: "🧠",
    blurb: "buys everything, every match",
    form: {
      name: "Data Maximalist",
      persona: "A data maximalist who buys every available signal and synthesizes them all.",
      prompt: "Predict the exact score using every piece of evidence you bought. Be decisive.",
      risk: "high",
      budget: "0.1",
      broker: true,
      sources: { form: { on: true, wtp: "0.006" }, odds: { on: true, wtp: "0.008" }, injuries: { on: true, wtp: "0.006" }, h2h: { on: true, wtp: "0.006" } },
    },
  },
];

function toBaseUnits(v: string): string {
  const n = parseFloat(v);
  if (!Number.isFinite(n) || n <= 0) return "0";
  return String(Math.round(n * 1_000_000));
}

type Step = "idle" | "register" | "approve" | "join" | "save" | "done";

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { v: T; label: string; disabled?: boolean }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex gap-1 rounded-xl border border-line bg-surface p-1">
      {options.map((o) => (
        <button
          key={o.v}
          type="button"
          disabled={o.disabled}
          onClick={() => onChange(o.v)}
          className={`flex-1 rounded-lg px-3 py-1.5 text-sm capitalize transition ${
            value === o.v ? "grad-hi font-semibold text-white" : "text-ink2 hover:text-ink"
          } ${o.disabled ? "cursor-not-allowed opacity-40" : ""}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" onClick={() => onChange(!on)} className={`relative h-6 w-11 shrink-0 rounded-full transition ${on ? "bg-accent" : "bg-line2"}`}>
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${on ? "left-[22px]" : "left-0.5"}`} />
    </button>
  );
}

const lbl = "mono text-[10px] uppercase tracking-wider text-ink3";
const inputCls = "w-full rounded-xl border border-line bg-surface2 px-3 py-2 text-sm text-ink outline-none transition focus:border-accent/60";

export default function BuildPage() {
  const [f, setF] = useState<Form>(ARCHETYPES[0].form);
  const [advanced, setAdvanced] = useState(false);
  const [step, setStep] = useState<Step>("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ agentId: string; joinTx: string } | null>(null);

  const { address, isConnected, chainId } = useAccount();
  const { switchChain } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();
  const onArc = chainId === arcChain.id;

  const set = (patch: Partial<Form>) => setF((prev) => ({ ...prev, ...patch }));
  const setSource = (s: Source, patch: Partial<SourceState>) =>
    setF((prev) => ({ ...prev, sources: { ...prev.sources, [s]: { ...prev.sources[s], ...patch } } }));

  const buys = useMemo(() => SOURCES.filter((s) => f.sources[s].on && parseFloat(f.sources[s].wtp || "0") > 0), [f.sources]);
  const totalWtp = useMemo(() => buys.reduce((sum, s) => sum + (parseFloat(f.sources[s].wtp) || 0), 0), [buys, f.sources]);

  function buildTemplate(): AgentTemplate {
    return {
      name: f.name,
      prompt: f.prompt,
      persona: f.persona,
      riskAppetite: f.risk,
      dataPreference: {
        preferBroker: f.broker,
        willingnessToPay: Object.fromEntries(SOURCES.map((s) => [s, f.sources[s].on ? toBaseUnits(f.sources[s].wtp) : "0"])),
      },
      modelProvider: "venice",
      budget: toBaseUnits(f.budget),
    };
  }

  async function create() {
    if (!isConnected || !address || !publicClient) return;
    setError(null);
    try {
      const template = buildTemplate();
      const templateHash = hashTemplate(template);

      setStep("register");
      const regTx = await writeContractAsync({ address: REGISTRY_ADDRESS, abi: registryAbi, functionName: "registerAgent", args: [template.name, templateHash, address] });
      const regRcpt = await publicClient.waitForTransactionReceipt({ hash: regTx });
      let agentId: bigint | undefined;
      for (const log of regRcpt.logs) {
        try {
          const ev = decodeEventLog({ abi: registryAbi, data: log.data, topics: log.topics });
          if (ev.eventName === "AgentRegistered") {
            agentId = (ev.args as { agentId: bigint }).agentId;
            break;
          }
        } catch {
          /* not our event */
        }
      }
      if (agentId === undefined) throw new Error("could not read agentId from registration");

      setStep("approve");
      const apprTx = await writeContractAsync({ address: USDC_ADDRESS, abi: usdcAbi, functionName: "approve", args: [POOL_ADDRESS, ENTRY_FEE] });
      await publicClient.waitForTransactionReceipt({ hash: apprTx });

      setStep("join");
      const joinTx = await writeContractAsync({ address: POOL_ADDRESS, abi: poolAbi, functionName: "join", args: [WORLD_CUP_POOL_ID, agentId] });
      await publicClient.waitForTransactionReceipt({ hash: joinTx });

      setStep("save");
      await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: f.name,
          persona: f.persona,
          prompt: f.prompt,
          riskAppetite: f.risk,
          preferBroker: f.broker,
          budget: toBaseUnits(f.budget),
          willingnessToPay: Object.fromEntries(SOURCES.map((s) => [s, f.sources[s].on ? toBaseUnits(f.sources[s].wtp) : "0"])),
          poolId: "1",
          owner: address,
          onChainAgentId: agentId.toString(),
        }),
      });

      setStep("done");
      setResult({ agentId: agentId.toString(), joinTx });
    } catch (e) {
      setError(e instanceof Error ? e.message.slice(0, 180) : String(e));
      setStep("idle");
    }
  }

  if (result) {
    return (
      <div className="max-w-xl">
        <h1 className="text-3xl font-extrabold tracking-tight">Agent joined 🎉</h1>
        <div className="glass mt-5 flex items-center gap-4 p-5">
          <Avatar name={f.name} size={56} />
          <div>
            <p className="text-sm text-ink2">
              <span className="text-ink">{f.name}</span> is agent #{result.agentId} — you paid the 1 USDC entry from your wallet and own it on-chain.
            </p>
            <div className="mono mt-2 break-all text-[11px] text-accent2">{result.joinTx}</div>
          </div>
        </div>
        <div className="mt-5 flex gap-3">
          <Link href={`/agent/${result.agentId}`} className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white">View agent</Link>
          <Link href="/leaderboard" className="rounded-xl border border-line2 px-4 py-2 text-sm text-ink hover:bg-surface">Leaderboard</Link>
        </div>
      </div>
    );
  }

  const busy = step !== "idle";
  const stepLabel: Record<Step, string> = {
    idle: "Create + join · 1 USDC entry",
    register: "1/3 · registering agent…",
    approve: "2/3 · approve USDC…",
    join: "3/3 · paying entry…",
    save: "finishing…",
    done: "done",
  };

  return (
    <div>
      <h1 className="text-3xl font-extrabold tracking-tight">Build an agent</h1>
      <p className="mt-1 text-sm text-ink2">Pick a playstyle, tune it, and drop it in the pool from your wallet.</p>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.35fr_1fr]">
        {/* ── form ── */}
        <div className="space-y-5">
          {/* quick start */}
          <div className="glass p-5">
            <div className={lbl}>quick start</div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              {ARCHETYPES.map((a) => {
                const active = a.form.name === f.name;
                return (
                  <button
                    key={a.key}
                    type="button"
                    onClick={() => setF(a.form)}
                    className={`rounded-xl border p-3 text-left transition ${active ? "border-accent bg-accent/10" : "border-line bg-surface2 hover:border-line2"}`}
                  >
                    <div className="flex items-center gap-2 font-semibold">
                      <span className="text-lg">{a.emoji}</span> {a.key}
                    </div>
                    <div className="mt-0.5 text-xs text-ink2">{a.blurb}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* identity */}
          <div className="glass flex items-center gap-4 p-5">
            <Avatar name={f.name} size={56} />
            <div className="flex-1">
              <div className={lbl}>agent name</div>
              <input className={`${inputCls} mt-1`} value={f.name} onChange={(e) => set({ name: e.target.value })} />
            </div>
          </div>

          {/* strategy */}
          <div className="glass space-y-4 p-5">
            <div>
              <div className={lbl}>risk appetite</div>
              <div className="mt-1.5">
                <Segmented
                  value={f.risk}
                  onChange={(v) => set({ risk: v })}
                  options={[{ v: "low", label: "low" }, { v: "medium", label: "medium" }, { v: "high", label: "high" }]}
                />
              </div>
              <p className="mt-1.5 text-[11px] text-ink3">Higher risk buys evidence more readily; lower risk only buys clear value.</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className={lbl}>data sourcing</div>
                <div className="mt-1.5">
                  <Segmented value={f.broker ? "broker" : "direct"} onChange={(v) => set({ broker: v === "broker" })} options={[{ v: "direct", label: "direct" }, { v: "broker", label: "broker" }]} />
                </div>
              </div>
              <div>
                <div className={lbl}>pool</div>
                <div className="mt-1.5">
                  <Segmented value="wc" onChange={() => {}} options={[{ v: "wc", label: "World Cup" }, { v: "soon", label: "more soon", disabled: true }]} />
                </div>
              </div>
            </div>
          </div>

          {/* evidence */}
          <div className="glass p-5">
            <div className="flex items-center justify-between">
              <div className={lbl}>evidence it values</div>
              <span className="mono text-[10px] text-ink3">max ${totalWtp.toFixed(3)} / match</span>
            </div>
            <div className="mt-3 space-y-2.5">
              {SOURCES.map((s) => (
                <div key={s} className="flex items-center gap-3 rounded-xl border border-line bg-surface2 px-3 py-2">
                  <Toggle on={f.sources[s].on} onChange={(on) => setSource(s, { on })} />
                  <span className="w-20 text-sm capitalize">{s}</span>
                  {f.sources[s].on ? (
                    <label className="ml-auto flex items-center gap-2 text-xs text-ink3">
                      pay up to $
                      <input
                        className="w-20 rounded-lg border border-line bg-bg px-2 py-1 text-right text-sm text-ink outline-none focus:border-accent/60"
                        value={f.sources[s].wtp}
                        onChange={(e) => setSource(s, { wtp: e.target.value })}
                      />
                    </label>
                  ) : (
                    <span className="ml-auto text-xs text-ink3">won&apos;t buy</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* budget */}
          <div className="glass p-5">
            <div className={lbl}>data budget (USDC)</div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {["0.02", "0.05", "0.1", "0.2"].map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => set({ budget: b })}
                  className={`rounded-xl border px-4 py-2 text-sm transition ${f.budget === b ? "border-accent bg-accent/10 text-ink" : "border-line bg-surface2 text-ink2 hover:text-ink"}`}
                >
                  ${b}
                </button>
              ))}
              <input className="w-28 rounded-xl border border-line bg-surface2 px-3 py-2 text-sm outline-none focus:border-accent/60" value={f.budget} onChange={(e) => set({ budget: e.target.value })} placeholder="custom" />
            </div>
          </div>

          {/* advanced */}
          <div className="glass p-5">
            <button type="button" onClick={() => setAdvanced((a) => !a)} className="flex w-full items-center justify-between">
              <span className={lbl}>advanced · persona + prompt</span>
              <span className="text-ink3">{advanced ? "–" : "+"}</span>
            </button>
            {advanced && (
              <div className="mt-3 space-y-3">
                <textarea className={inputCls} rows={2} value={f.persona} onChange={(e) => set({ persona: e.target.value })} placeholder="persona" />
                <textarea className={inputCls} rows={3} value={f.prompt} onChange={(e) => set({ prompt: e.target.value })} placeholder="prompt" />
              </div>
            )}
          </div>

          {error && <p className="text-sm text-neg">{error}</p>}
          {!isConnected ? (
            <p className="text-sm text-ink2">Connect your wallet (sidebar) to create + join.</p>
          ) : !onArc ? (
            <button type="button" onClick={() => switchChain({ chainId: arcChain.id })} className="rounded-xl border border-gold/50 bg-gold/10 px-5 py-2.5 text-sm font-semibold text-gold">
              Switch to Arc to continue
            </button>
          ) : (
            <button type="button" onClick={create} disabled={busy} className="w-full rounded-xl bg-accent px-5 py-3 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-60">
              {stepLabel[step]}
            </button>
          )}
        </div>

        {/* ── preview ── */}
        <div className="space-y-5 lg:sticky lg:top-6 lg:self-start">
          <div className="glass p-5">
            <div className={lbl}>preview</div>
            <div className="mt-3 flex items-center gap-3">
              <Avatar name={f.name} size={52} />
              <div>
                <div className="font-bold">{f.name || "Untitled agent"}</div>
                <div className="mono mt-0.5 text-[11px] text-ink3">{f.risk} risk · {f.broker ? "broker" : "direct"}</div>
              </div>
            </div>
            <p className="mt-3 text-sm text-ink2">{f.persona || "—"}</p>
            <div className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-4">
              <div>
                <div className={lbl}>budget</div>
                <div className="num mt-1 font-bold">{f.budget || "0"} USDC</div>
              </div>
              <div>
                <div className={lbl}>max / match</div>
                <div className="num mt-1 font-bold">${totalWtp.toFixed(3)}</div>
              </div>
              <div className="col-span-2">
                <div className={lbl}>buys</div>
                <div className="mt-1 text-sm text-accent2">{buys.length ? buys.join(", ") : "nothing — predicts on its prior"}</div>
              </div>
            </div>
          </div>

          <div className="glass p-5">
            <div className="font-bold">Joining · 3 transactions</div>
            <ol className="mt-3 space-y-2.5 text-sm">
              {[
                ["Register", "your agent on-chain — you own it"],
                ["Approve", "the 1 USDC entry for the Pool"],
                ["Pay entry", "escrows it into the prize pool"],
              ].map(([t, d], i) => (
                <li key={t} className="flex gap-3">
                  <span className="num flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/15 text-xs font-bold text-accent2">{i + 1}</span>
                  <span><span className="font-semibold">{t}</span> <span className="text-ink2">{d}</span></span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
