"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { decodeEventLog, type Hex } from "viem";
import { useAccount, usePublicClient, useSwitchChain, useWriteContract } from "wagmi";
import { hashTemplate, type AgentTemplate } from "@longshot/shared";
import { encodeCall, useWallet } from "@/lib/wallet-context";
import { Avatar } from "@/components/Avatar";
import { AVATAR_STYLES, avatarUrl, randomSeed, SEED_POOL } from "@/lib/avatar";
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
  avatarStyle: string;
  avatarSeed: string;
  sources: Record<Source, SourceState>;
};

const ARCHETYPES: { key: string; emoji: string; blurb: string; form: Form }[] = [
  {
    key: "Cheap Contrarian",
    emoji: "🎲",
    blurb: "backs underdogs on cheap signals",
    form: {
      name: "Cheap Contrarian", avatarStyle: "bottts", avatarSeed: "saber",
      persona: "A frugal contrarian who backs underdogs when cheap signals disagree with the favorite.",
      prompt: "Predict the exact score. Favor upsets when the evidence you bought contradicts the market.",
      risk: "high", budget: "0.03", broker: false,
      sources: { form: { on: true, wtp: "0.004" }, odds: { on: false, wtp: "0" }, injuries: { on: false, wtp: "0" }, h2h: { on: true, wtp: "0.004" } },
    },
  },
  {
    key: "Favorite Backer",
    emoji: "📈",
    blurb: "trusts the market odds",
    form: {
      name: "Favorite Backer", avatarStyle: "bottts-neutral", avatarSeed: "halo",
      persona: "A disciplined favorite-backer who trusts the bookmakers above all.",
      prompt: "Predict the exact score. Weight the market odds heavily; favor the favorite unless the data screams otherwise.",
      risk: "low", budget: "0.04", broker: true,
      sources: { form: { on: false, wtp: "0" }, odds: { on: true, wtp: "0.008" }, injuries: { on: true, wtp: "0.004" }, h2h: { on: false, wtp: "0" } },
    },
  },
  {
    key: "Injury Hunter",
    emoji: "🩹",
    blurb: "weights availability + form",
    form: {
      name: "Injury Hunter", avatarStyle: "bottts", avatarSeed: "krait",
      persona: "An injury-news specialist who values team availability and recent form over market odds.",
      prompt: "Predict the exact score. Heavily weight injuries/availability and recent form.",
      risk: "medium", budget: "0.03", broker: false,
      sources: { form: { on: true, wtp: "0.005" }, odds: { on: false, wtp: "0" }, injuries: { on: true, wtp: "0.005" }, h2h: { on: true, wtp: "0.003" } },
    },
  },
  {
    key: "Data Maximalist",
    emoji: "🧠",
    blurb: "buys everything, every match",
    form: {
      name: "Data Maximalist", avatarStyle: "bottts-neutral", avatarSeed: "pulse",
      persona: "A data maximalist who buys every available signal and synthesizes them all.",
      prompt: "Predict the exact score using every piece of evidence you bought. Be decisive.",
      risk: "high", budget: "0.1", broker: true,
      sources: { form: { on: true, wtp: "0.006" }, odds: { on: true, wtp: "0.008" }, injuries: { on: true, wtp: "0.006" }, h2h: { on: true, wtp: "0.006" } },
    },
  },
  {
    key: "Form Sniper",
    emoji: "🎯",
    blurb: "one signal, dead cheap",
    form: {
      name: "Form Sniper", avatarStyle: "pixel-art", avatarSeed: "ion",
      persona: "A specialist sniper who reads recent form only and refuses to overpay for noise.",
      prompt: "Predict the exact score from recent form alone. Be precise, ignore the market.",
      risk: "medium", budget: "0.02", broker: false,
      sources: { form: { on: true, wtp: "0.005" }, odds: { on: false, wtp: "0" }, injuries: { on: false, wtp: "0" }, h2h: { on: false, wtp: "0" } },
    },
  },
  {
    key: "Coinflip Kid",
    emoji: "🪙",
    blurb: "buys nothing, rides on gut",
    form: {
      name: "Coinflip Kid", avatarStyle: "fun-emoji", avatarSeed: "nova",
      persona: "A reckless gambler who buys no data and predicts on pure instinct, chasing infinite ROI.",
      prompt: "Predict the exact score from your prior alone. Be bold and back the upset.",
      risk: "high", budget: "0.01", broker: false,
      sources: { form: { on: false, wtp: "0" }, odds: { on: false, wtp: "0" }, injuries: { on: false, wtp: "0" }, h2h: { on: false, wtp: "0" } },
    },
  },
];

const ADJ = ["Neon", "Quantum", "Rogue", "Velvet", "Iron", "Solar", "Phantom", "Turbo", "Cosmic", "Feral", "Gilded", "Hyper", "Atomic", "Lunar", "Crimson", "Static"];
const NOUN = ["Jackal", "Magpie", "Oracle", "Comet", "Bandit", "Sphinx", "Falcon", "Cobra", "Maverick", "Nomad", "Specter", "Vulcan", "Reaper", "Drake", "Hydra", "Vandal"];

function toBaseUnits(v: string): string {
  const n = parseFloat(v);
  if (!Number.isFinite(n) || n <= 0) return "0";
  return String(Math.round(n * 1_000_000));
}
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

// ── gamified card maths: turn a strategy into FIFA-style stats + an overall rating + a rarity ──
type Rarity = "bronze" | "silver" | "gold" | "icon";
function computeCard(f: Form) {
  const on = SOURCES.filter((s) => f.sources[s].on && parseFloat(f.sources[s].wtp || "0") > 0);
  const AGG = f.risk === "high" ? 94 : f.risk === "medium" ? 73 : 52; // aggression
  const INT = on.length === 0 ? 24 : clamp(Math.round((on.length / SOURCES.length) * 99), 45, 99); // intel / coverage
  const budgetNum = parseFloat(f.budget) || 0;
  const PWR = clamp(Math.round((budgetNum / 0.2) * 99), 12, 99); // firepower / budget
  const avgWtp = on.length ? on.reduce((s, x) => s + (parseFloat(f.sources[x].wtp) || 0), 0) / on.length : 0;
  const VAL = avgWtp > 0 ? clamp(Math.round(100 - (avgWtp / 0.008) * 78), 22, 99) : 88; // value / thrift (cheaper = higher; buys nothing = thrifty)
  const NET = f.broker ? 90 : 64; // network (broker depth)
  const IQ = clamp(Math.round(INT * 0.5 + PWR * 0.5), 20, 99); // synthesis
  const ovr = clamp(Math.round(AGG * 0.16 + INT * 0.2 + PWR * 0.16 + VAL * 0.22 + NET * 0.12 + IQ * 0.14), 41, 99);
  const stats = [
    { k: "AGG", v: AGG }, { k: "VAL", v: VAL },
    { k: "INT", v: INT }, { k: "NET", v: NET },
    { k: "PWR", v: PWR }, { k: "IQ", v: IQ },
  ];
  const role = f.risk === "high" ? "ST" : f.risk === "low" ? "CB" : "CM";
  const rarity: Rarity = ovr >= 92 ? "icon" : ovr >= 85 ? "gold" : ovr >= 70 ? "silver" : "bronze";
  return { ovr, stats, role, rarity, buys: on };
}

const RARITY: Record<Rarity, { label: string; bg: string; ring: string; ink: string; chip: string }> = {
  icon: { label: "ICON", bg: "linear-gradient(155deg,#1f4694 0%,#0a1530 90%)", ring: "#4d7ef5", ink: "#dbe6ff", chip: "rgba(77,126,245,.25)" },
  gold: { label: "GOLD", bg: "linear-gradient(155deg,#4f4220 0%,#241d0c 90%)", ring: "#e8c349", ink: "#f6e9b8", chip: "rgba(232,195,73,.2)" },
  silver: { label: "SILVER", bg: "linear-gradient(155deg,#3b3e46 0%,#1c1e24 90%)", ring: "#c6cbd4", ink: "#e7ebf2", chip: "rgba(198,203,212,.18)" },
  bronze: { label: "BRONZE", bg: "linear-gradient(155deg,#412d1c 0%,#211710 90%)", ring: "#c47b43", ink: "#f0d2b4", chip: "rgba(196,123,67,.2)" },
};

type Step = "idle" | "register" | "approve" | "join" | "save" | "done";

function Segmented<T extends string>({
  value, options, onChange,
}: { value: T; options: { v: T; label: string; disabled?: boolean }[]; onChange: (v: T) => void }) {
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

// ── the collectible: a FIFA-style agent card driven live by the strategy ──
function AgentCard({ f }: { f: Form }) {
  const { ovr, stats, role, rarity, buys } = computeCard(f);
  const r = RARITY[rarity];
  return (
    <div
      className="relative overflow-hidden rounded-2xl p-5 shadow-xl"
      style={{ background: r.bg, border: `1px solid ${r.ring}`, boxShadow: `0 0 32px ${r.ring}22, inset 0 1px 0 ${r.ring}33`, color: r.ink }}
    >
      {/* sheen */}
      <div className="pointer-events-none absolute -right-8 -top-10 h-40 w-40 rounded-full opacity-20" style={{ background: r.ring, filter: "blur(40px)" }} />

      <div className="relative flex items-start justify-between">
        <div className="leading-none">
          <div className="num text-4xl font-extrabold" style={{ color: r.ink }}>{ovr}</div>
          <div className="mono mt-1 text-xs font-bold tracking-widest" style={{ color: r.ring }}>{role}</div>
          <div className="mt-2 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[9px] font-bold tracking-wider" style={{ background: r.chip, color: r.ink }}>
            ◆ ARC
          </div>
        </div>
        <span className="mono rounded-md px-2 py-0.5 text-[9px] font-bold tracking-[0.2em]" style={{ background: r.chip, color: r.ink }}>{r.label}</span>
      </div>

      <div className="relative mt-1 flex flex-col items-center">
        <div className="rounded-2xl p-1" style={{ boxShadow: `0 0 0 2px ${r.ring}55` }}>
          <Avatar name={f.name} avatar={{ style: f.avatarStyle, seed: f.avatarSeed }} size={92} />
        </div>
        <div className="mt-2 max-w-full truncate text-center text-lg font-extrabold uppercase tracking-wide" style={{ color: r.ink }}>
          {f.name || "Untitled"}
        </div>
      </div>

      <div className="relative mt-3 grid grid-cols-2 gap-x-6 gap-y-2 border-t pt-3" style={{ borderColor: `${r.ring}33` }}>
        {stats.map((s) => (
          <div key={s.k} className="flex items-center gap-2">
            <span className="num w-7 text-sm font-extrabold" style={{ color: r.ink }}>{s.v}</span>
            <span className="mono text-[10px] font-bold tracking-wider" style={{ color: r.ring }}>{s.k}</span>
            <span className="ml-auto h-1.5 w-12 overflow-hidden rounded-full" style={{ background: `${r.ring}22` }}>
              <span className="block h-full rounded-full" style={{ width: `${s.v}%`, background: r.ring }} />
            </span>
          </div>
        ))}
      </div>

      <div className="relative mt-3 border-t pt-3 text-center text-[11px]" style={{ borderColor: `${r.ring}33`, color: r.ink }}>
        {buys.length ? <>buys <span className="font-semibold">{buys.join(" · ")}</span></> : "buys nothing — pure instinct"}
      </div>
    </div>
  );
}

const lbl = "mono text-[10px] uppercase tracking-wider text-ink3";
const inputCls = "w-full rounded-xl border border-line bg-surface2 px-3 py-2 text-sm text-ink outline-none transition focus:border-accent/60";

export default function BuildPage() {
  const [f, setF] = useState<Form>(ARCHETYPES[0].form);
  const [advanced, setAdvanced] = useState(false);
  const [pool, setPool] = useState<string[]>(() => SEED_POOL.slice(0, 11));
  const [step, setStep] = useState<Step>("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ agentId: string; joinTx: string } | null>(null);

  const { address, isConnected, walletType, bundlerClient } = useWallet();
  const { chainId } = useAccount();
  const { switchChain } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();
  // Circle smart accounts are always on Arc; MetaMask must be switched to it.
  const onArc = walletType === "circle" || chainId === arcChain.id;
  const gasless = walletType === "circle";

  const set = (patch: Partial<Form>) => setF((prev) => ({ ...prev, ...patch }));
  const setSource = (s: Source, patch: Partial<SourceState>) =>
    setF((prev) => ({ ...prev, sources: { ...prev.sources, [s]: { ...prev.sources[s], ...patch } } }));

  const buys = useMemo(() => SOURCES.filter((s) => f.sources[s].on && parseFloat(f.sources[s].wtp || "0") > 0), [f.sources]);
  const totalWtp = useMemo(() => buys.reduce((sum, s) => sum + (parseFloat(f.sources[s].wtp) || 0), 0), [buys, f.sources]);

  function rollName() {
    set({ name: `${ADJ[Math.floor(Math.random() * ADJ.length)]} ${NOUN[Math.floor(Math.random() * NOUN.length)]}` });
  }
  function shuffleFaces() {
    const next = Array.from({ length: 11 }, () => randomSeed());
    setPool(next);
    set({ avatarSeed: next[0] });
  }

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

      // 1) Register the agent on-chain. With the Circle smart wallet this is a gasless userOp;
      //    with MetaMask it's a normal tx. Either way we read the receipt to recover the agentId.
      setStep("register");
      let regTxHash: Hex;
      if (gasless && bundlerClient) {
        const op = await bundlerClient.sendUserOperation({
          calls: [encodeCall({ address: REGISTRY_ADDRESS, abi: registryAbi, functionName: "registerAgent", args: [template.name, templateHash, address] })],
          paymaster: true,
        });
        regTxHash = (await bundlerClient.waitForUserOperationReceipt({ hash: op })).receipt.transactionHash;
      } else {
        regTxHash = await writeContractAsync({ address: REGISTRY_ADDRESS, abi: registryAbi, functionName: "registerAgent", args: [template.name, templateHash, address] });
      }
      const regRcpt = await publicClient.waitForTransactionReceipt({ hash: regTxHash });
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

      // 2) Pay the entry: approve + join. The smart wallet batches both into one gasless userOp;
      //    MetaMask sends them as two txs.
      let joinTx: Hex;
      if (gasless && bundlerClient) {
        setStep("join");
        const op = await bundlerClient.sendUserOperation({
          calls: [
            encodeCall({ address: USDC_ADDRESS, abi: usdcAbi, functionName: "approve", args: [POOL_ADDRESS, ENTRY_FEE] }),
            encodeCall({ address: POOL_ADDRESS, abi: poolAbi, functionName: "join", args: [WORLD_CUP_POOL_ID, agentId] }),
          ],
          paymaster: true,
        });
        joinTx = (await bundlerClient.waitForUserOperationReceipt({ hash: op })).receipt.transactionHash;
      } else {
        setStep("approve");
        const apprTx = await writeContractAsync({ address: USDC_ADDRESS, abi: usdcAbi, functionName: "approve", args: [POOL_ADDRESS, ENTRY_FEE] });
        await publicClient.waitForTransactionReceipt({ hash: apprTx });

        setStep("join");
        joinTx = await writeContractAsync({ address: POOL_ADDRESS, abi: poolAbi, functionName: "join", args: [WORLD_CUP_POOL_ID, agentId] });
        await publicClient.waitForTransactionReceipt({ hash: joinTx });
      }

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
          avatar: { style: f.avatarStyle, seed: f.avatarSeed },
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
        <h1 className="text-3xl font-extrabold tracking-tight">Agent minted 🎉</h1>
        <div className="mt-5 grid gap-5 sm:grid-cols-[260px_1fr]">
          <AgentCard f={f} />
          <div>
            <p className="text-sm text-ink2">
              <span className="text-ink">{f.name}</span> is agent #{result.agentId} — you paid the 1 USDC entry from your wallet and own it on-chain.
            </p>
            <div className="mono mt-2 break-all text-[11px] text-accent2">{result.joinTx}</div>
            <div className="mt-5 flex gap-3">
              <Link href={`/agent/${result.agentId}`} className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white">View agent</Link>
              <Link href="/leaderboard" className="rounded-xl border border-line2 px-4 py-2 text-sm text-ink hover:bg-surface">Leaderboard</Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const busy = step !== "idle";
  const stepLabel: Record<Step, string> = {
    idle: gasless ? "Mint + drop in pool · gasless ⚡" : "Mint + drop in pool · 1 USDC entry",
    register: "registering agent…",
    approve: "approving USDC…",
    join: "paying entry…",
    save: "finishing…",
    done: "done",
  };

  return (
    <div>
      <h1 className="text-3xl font-extrabold tracking-tight">Build an agent</h1>
      <p className="mt-1 text-sm text-ink2">Pick a playstyle, give it a face, tune its stats, and drop it in the pool from your wallet.</p>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.35fr_1fr]">
        {/* ── form ── */}
        <div className="space-y-5">
          {/* quick start */}
          <div className="glass p-5">
            <div className={lbl}>quick start · pick a playstyle</div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              {ARCHETYPES.map((a) => {
                const active = a.form.name === f.name;
                return (
                  <button
                    key={a.key}
                    type="button"
                    onClick={() => setF(a.form)}
                    className={`flex items-center gap-3 rounded-xl border p-3 text-left transition ${active ? "border-accent bg-accent/10" : "border-line bg-surface2 hover:border-line2"}`}
                  >
                    <Avatar name={a.form.name} avatar={{ style: a.form.avatarStyle, seed: a.form.avatarSeed }} size={38} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 font-semibold">
                        <span>{a.emoji}</span> <span className="truncate">{a.key}</span>
                      </div>
                      <div className="mt-0.5 truncate text-xs text-ink2">{a.blurb}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* identity + avatar picker */}
          <div className="glass p-5">
            <div className="flex items-center gap-4">
              <Avatar name={f.name} avatar={{ style: f.avatarStyle, seed: f.avatarSeed }} size={56} />
              <div className="flex-1">
                <div className={lbl}>agent name</div>
                <div className="mt-1 flex gap-2">
                  <input className={inputCls} value={f.name} onChange={(e) => set({ name: e.target.value })} />
                  <button type="button" onClick={rollName} title="random name" className="shrink-0 rounded-xl border border-line bg-surface2 px-3 text-base hover:border-line2">🎲</button>
                </div>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between">
              <div className={lbl}>choose a face</div>
              <button type="button" onClick={shuffleFaces} className="mono text-[10px] uppercase tracking-wider text-accent2 hover:text-accent">🎲 shuffle</button>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {AVATAR_STYLES.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => set({ avatarStyle: s.id })}
                  className={`rounded-lg px-2.5 py-1 text-xs transition ${f.avatarStyle === s.id ? "grad-hi font-semibold text-white" : "border border-line bg-surface2 text-ink2 hover:text-ink"}`}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-6 gap-2">
              {pool.map((seed) => {
                const selected = seed === f.avatarSeed;
                return (
                  <button
                    key={seed}
                    type="button"
                    onClick={() => set({ avatarSeed: seed })}
                    className={`rounded-xl p-0.5 transition ${selected ? "bg-accent" : "bg-transparent hover:bg-surface2"}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={avatarUrl(f.avatarStyle, seed)} alt={seed} className="h-full w-full rounded-lg border border-line2 bg-surface2" />
                  </button>
                );
              })}
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
            <p className="text-sm text-ink2">Connect a wallet (top right) to mint + drop your agent — a Circle smart wallet (passkey, gasless) or MetaMask.</p>
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

        {/* ── card preview ── */}
        <div className="space-y-5 lg:sticky lg:top-6 lg:self-start">
          <div className={lbl}>your agent card · live</div>
          <AgentCard f={f} />

          <div className="glass p-5">
            <div className="flex items-center justify-between">
              <div className={lbl}>budget</div>
              <span className="num text-sm font-bold">{f.budget || "0"} USDC</span>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <div className={lbl}>max / match</div>
              <span className="num text-sm font-bold">${totalWtp.toFixed(3)}</span>
            </div>
          </div>

          <div className="glass p-5">
            <div className="flex items-center justify-between">
              <div className="font-bold">Minting on Arc</div>
              {gasless && <span className="rounded-md bg-accent/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-accent2">⚡ gasless</span>}
            </div>
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
            <p className="mt-3 border-t border-line pt-3 text-[11px] text-ink3">
              {gasless ? "Signed with your passkey. Approve + pay are batched into one sponsored user-op — no gas, no seed phrase." : "Signed in your wallet. You pay network gas in USDC."}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
