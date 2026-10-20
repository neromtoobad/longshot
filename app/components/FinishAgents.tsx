"use client";

// Agents the connected wallet registered on-chain but never finished (a wallet popup failed
// mid-mint, or the save step failed). Each one resumes exactly where it stopped: enter a pool if
// it never joined, fund its wallet, then save. Nothing is registered or paid twice.

import { useCallback, useEffect, useState } from "react";
import type { Address } from "viem";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { COMPETITIONS, type AgentTemplate, type CompetitionKey } from "@longshot/shared";
import { ARCHETYPES, GAS_RESERVE, matchPreset, templateFromForm, usdcStr } from "@/lib/archetypes";
import { POOL_ADDRESS, USDC_ADDRESS, poolAbi, poolConfig, usdcAbi } from "@/lib/contracts";
import { ensureArcRpc, friendlyWalletError } from "@/lib/arc-wallet";
import { arcChain } from "@/lib/wagmi";

interface Pending {
  onChainAgentId: string;
  name: string;
  walletAddress: string;
  templateHash: string;
  league: CompetitionKey | null;
  walletUSDC: string;
}

function templateFor(p: Pending): AgentTemplate {
  return matchPreset(p.templateHash, p.name) ?? templateFromForm({ ...ARCHETYPES[0].form, name: p.name || ARCHETYPES[0].form.name });
}

function Row({ p, owner, onDone }: { p: Pending; owner: Address; onDone: () => void }) {
  const { connector } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const client = usePublicClient({ chainId: arcChain.id });
  const [league, setLeague] = useState<CompetitionKey>(p.league ?? "epl");
  const [step, setStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const template = templateFor(p);
  const budget = BigInt(template.budget);
  const needsEntry = !p.league;
  const cfg = poolConfig(league);
  const fund = needsEntry && budget > 0n && BigInt(p.walletUSDC) < budget ? budget + GAS_RESERVE - BigInt(p.walletUSDC) : 0n;

  async function finish() {
    if (!client || !cfg) return;
    setError(null);
    try {
      await ensureArcRpc(connector);
      if (needsEntry) {
        if (cfg.entryFee > 0n) {
          setStep("approving entry…");
          await client.waitForTransactionReceipt({
            hash: await writeContractAsync({ address: USDC_ADDRESS, abi: usdcAbi, functionName: "approve", args: [POOL_ADDRESS, cfg.entryFee] }),
          });
        }
        setStep("paying entry…");
        await client.waitForTransactionReceipt({
          hash: await writeContractAsync({ address: POOL_ADDRESS, abi: poolAbi, functionName: "join", args: [cfg.poolId, BigInt(p.onChainAgentId)] }),
        });
      }
      if (fund > 0n) {
        setStep("funding agent wallet…");
        await client.waitForTransactionReceipt({
          hash: await writeContractAsync({ address: USDC_ADDRESS, abi: usdcAbi, functionName: "transfer", args: [p.walletAddress as Address, fund] }),
        });
      }
      setStep("saving…");
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: template.name,
          persona: template.persona,
          prompt: template.prompt,
          riskAppetite: template.riskAppetite,
          preferBroker: template.dataPreference.preferBroker,
          budget: template.budget,
          willingnessToPay: template.dataPreference.willingnessToPay,
          avatar: { style: "bottts", seed: `agent-${p.onChainAgentId}` },
          league: p.league ?? league,
          owner,
          walletAddress: p.walletAddress,
          onChainAgentId: p.onChainAgentId,
        }),
      });
      const json = (await res.json()) as { agentId?: string; error?: string };
      if (!res.ok || !json.agentId) throw new Error(json.error ?? "could not save agent");
      onDone();
    } catch (e) {
      setError(friendlyWalletError(e));
    } finally {
      setStep(null);
    }
  }

  const leagueName = COMPETITIONS.find((c) => c.key === (p.league ?? league))?.name;
  return (
    <div className="rounded-xl border border-gold/40 bg-gold/5 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="font-semibold">
            {template.name} <span className="mono text-[11px] text-ink3">on-chain #{p.onChainAgentId}</span>
          </div>
          <div className="mt-0.5 text-xs text-ink2">
            {needsEntry
              ? `Registered, not entered yet. Finishing pays the ${cfg ? usdcStr(cfg.entryFee) : "—"} USDC entry${fund > 0n ? ` and funds ${usdcStr(fund)} USDC of data budget` : ""}.`
              : `Registered and entered in the ${leagueName}. Finishing just saves it, no payment.`}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {needsEntry && (
            <select
              value={league}
              onChange={(e) => setLeague(e.target.value as CompetitionKey)}
              className="rounded-lg border border-line bg-surface2 px-2 py-1.5 text-xs"
            >
              {COMPETITIONS.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
          <button
            onClick={finish}
            disabled={Boolean(step)}
            className="rounded-lg bg-accent px-3 py-1.5 text-xs font-bold text-white transition hover:opacity-90 disabled:opacity-60"
          >
            {step ?? "Finish setup"}
          </button>
        </div>
      </div>
      {error && <p className="mt-2 text-xs text-neg">{error}</p>}
    </div>
  );
}

export function FinishAgents({ owner, onFinished }: { owner: Address; onFinished: () => void }) {
  const [pending, setPending] = useState<Pending[]>([]);

  const load = useCallback(async () => {
    try {
      const r = (await fetch(`/api/agents/pending?owner=${owner}`).then((x) => x.json())) as { pending?: Pending[] };
      setPending(r.pending ?? []);
    } catch {
      setPending([]);
    }
  }, [owner]);

  useEffect(() => {
    // Look up unfinished agents whenever the connected owner changes (external sync).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  if (pending.length === 0) return null;
  return (
    <section className="glass mt-5 p-4">
      <div className="mono text-[10px] uppercase tracking-wider text-gold">unfinished agents · {pending.length}</div>
      <p className="mt-1 text-xs text-ink2">
        These were registered from this wallet but setup stopped partway. Finish them here; nothing is registered or charged twice.
      </p>
      <div className="mt-3 space-y-2">
        {pending.map((p) => (
          <Row
            key={p.onChainAgentId}
            p={p}
            owner={owner}
            onDone={() => {
              load();
              onFinished();
            }}
          />
        ))}
      </div>
    </section>
  );
}
