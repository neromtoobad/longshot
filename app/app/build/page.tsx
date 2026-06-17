"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { decodeEventLog } from "viem";
import { useAccount, usePublicClient, useSwitchChain, useWriteContract } from "wagmi";
import { hashTemplate, type AgentTemplate } from "@longshot/shared";
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

const PRESET = {
  name: "My Longshot",
  persona: "A contrarian who backs underdogs when cheap signals disagree with the favorite.",
  prompt: "Predict the exact score. Favor upsets when the evidence you bought contradicts the market.",
  riskAppetite: "high" as "low" | "medium" | "high",
  budget: "0.05",
  preferBroker: false,
  wtp: { form: "0.004", odds: "0", injuries: "0.002", h2h: "0.004" } as Record<Source, string>,
};

function toBaseUnits(v: string): string {
  const n = parseFloat(v);
  if (!Number.isFinite(n) || n <= 0) return "0";
  return String(Math.round(n * 1_000_000));
}

const input = "w-full rounded-xl border border-line bg-surface2 px-3 py-2 text-sm text-ink outline-none transition focus:border-accent/60";
const label = "mono text-[10px] uppercase tracking-wider text-ink3";

type Step = "idle" | "register" | "approve" | "join" | "save" | "done";

export default function BuildPage() {
  const [f, setF] = useState(PRESET);
  const [step, setStep] = useState<Step>("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ agentId: string; joinTx: string } | null>(null);

  const { address, isConnected, chainId } = useAccount();
  const { switchChain } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();

  const onArc = chainId === arcChain.id;
  const buys = useMemo(() => SOURCES.filter((s) => parseFloat(f.wtp[s] || "0") > 0), [f.wtp]);

  function buildTemplate(): AgentTemplate {
    return {
      name: f.name,
      prompt: f.prompt,
      persona: f.persona,
      riskAppetite: f.riskAppetite,
      dataPreference: {
        preferBroker: f.preferBroker,
        willingnessToPay: Object.fromEntries(SOURCES.map((s) => [s, toBaseUnits(f.wtp[s])])),
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

      // 1. Register the agent on-chain (signed by you — you become the owner).
      setStep("register");
      const regTx = await writeContractAsync({
        address: REGISTRY_ADDRESS,
        abi: registryAbi,
        functionName: "registerAgent",
        args: [template.name, templateHash, address],
      });
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

      // 2. Approve the entry fee.
      setStep("approve");
      const apprTx = await writeContractAsync({
        address: USDC_ADDRESS,
        abi: usdcAbi,
        functionName: "approve",
        args: [POOL_ADDRESS, ENTRY_FEE],
      });
      await publicClient.waitForTransactionReceipt({ hash: apprTx });

      // 3. Join the pool — pays the entry into escrow from your wallet.
      setStep("join");
      const joinTx = await writeContractAsync({
        address: POOL_ADDRESS,
        abi: poolAbi,
        functionName: "join",
        args: [WORLD_CUP_POOL_ID, agentId],
      });
      await publicClient.waitForTransactionReceipt({ hash: joinTx });

      // 4. Persist the template so the agent is runnable + shows as an entrant.
      setStep("save");
      await fetch("/api/agents", {
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
          owner: address,
          onChainAgentId: agentId.toString(),
        }),
      });

      setStep("done");
      setResult({ agentId: agentId.toString(), joinTx });
    } catch (e) {
      setError(e instanceof Error ? e.message.slice(0, 200) : String(e));
      setStep("idle");
    }
  }

  if (result) {
    return (
      <div className="max-w-xl">
        <h1 className="font-display text-3xl font-bold tracking-tight">Agent joined 🎉</h1>
        <div className="glass mt-5 p-5">
          <p className="text-sm text-ink2">
            <span className="text-ink">{f.name}</span> is agent #{result.agentId} in the World Cup pool. You paid the 1
            USDC entry from your wallet and own the agent on-chain.
          </p>
          <div className="mono mt-3 text-[10px] uppercase tracking-wider text-ink3">join tx</div>
          <div className="mono break-all text-xs text-accent">{result.joinTx}</div>
          <div className="mt-5 flex gap-3">
            <Link href={`/agent/${result.agentId}`} className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-accentink">
              View agent
            </Link>
            <Link href="/pool" className="rounded-xl border border-line2 px-4 py-2 text-sm text-ink hover:bg-surface">
              Back to pool
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const busy = step !== "idle";
  const stepLabel: Record<Step, string> = {
    idle: "Create + join · 1 USDC entry",
    register: "Registering agent…",
    approve: "Approve USDC…",
    join: "Paying entry…",
    save: "Finishing…",
    done: "Done",
  };

  return (
    <div className="grid gap-8 lg:grid-cols-[1.3fr_1fr]">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight">Build an agent</h1>
        <p className="mt-1 text-sm text-ink2">Author the template, then join the pool from your wallet.</p>

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

          {!isConnected ? (
            <p className="text-sm text-ink2">Connect your wallet (sidebar) to create + join.</p>
          ) : !onArc ? (
            <button onClick={() => switchChain({ chainId: arcChain.id })} className="rounded-xl border border-gold/50 bg-gold/10 px-5 py-2.5 text-sm font-medium text-gold">
              Switch to Arc to continue
            </button>
          ) : (
            <button
              onClick={create}
              disabled={busy}
              className="rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-accentink transition hover:opacity-90 disabled:opacity-60"
            >
              {stepLabel[step]}
            </button>
          )}
        </div>
      </div>

      <div>
        <div className={label}>live preview</div>
        <div className="glass mt-1 p-5">
          <div className="font-display text-lg font-semibold">{f.name || "Untitled agent"}</div>
          <p className="mt-1.5 text-sm text-ink2">{f.persona || "—"}</p>
          <div className="mono mt-4 space-y-1.5 text-[11px] text-ink3">
            <div>risk: <span className="text-ink2">{f.riskAppetite}</span></div>
            <div>budget: <span className="text-ink2">{f.budget || "0"} USDC</span></div>
            <div>sourcing: <span className="text-ink2">{f.preferBroker ? "broker" : "direct"}</span></div>
            <div>buys: <span className="text-accent">{buys.length ? buys.join(", ") : "nothing — predicts on its prior"}</span></div>
          </div>
        </div>
        <p className="mt-3 text-xs text-ink3">
          Creating registers the agent on-chain, approves the entry, and pays it into the pool escrow —
          three transactions from your wallet. Its Circle data-wallet is provisioned at matchday.
        </p>
      </div>
    </div>
  );
}
