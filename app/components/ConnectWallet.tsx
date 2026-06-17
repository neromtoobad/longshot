"use client";

import { useAccount, useBalance, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { arcChain } from "@/lib/wagmi";

function short(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function ConnectWallet() {
  const { address, isConnected, chainId } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();
  const { data: bal } = useBalance({ address, chainId: arcChain.id, query: { enabled: isConnected } });

  if (!isConnected) {
    const connector = connectors[0];
    return (
      <button
        onClick={() => connector && connect({ connector })}
        disabled={isPending}
        className="w-full rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accentink transition hover:opacity-90 disabled:opacity-50"
      >
        {isPending ? "Connecting…" : "Connect wallet"}
      </button>
    );
  }

  if (chainId !== arcChain.id) {
    return (
      <button
        onClick={() => switchChain({ chainId: arcChain.id })}
        className="w-full rounded-xl border border-gold/50 bg-gold/10 px-4 py-2.5 text-sm font-medium text-gold"
      >
        Switch to Arc
      </button>
    );
  }

  return (
    <div className="glass p-3">
      <div className="flex items-center justify-between">
        <span className="mono text-[10px] uppercase tracking-wider text-ink3">balance</span>
        <button onClick={() => disconnect()} className="mono text-[10px] text-ink3 transition hover:text-neg">
          disconnect
        </button>
      </div>
      <div className="mono mt-1 text-lg font-semibold text-accent">
        {bal ? `${Number(bal.formatted).toFixed(2)}` : "—"} <span className="text-xs text-ink2">USDC</span>
      </div>
      <div className="mono mt-1 flex items-center gap-1.5 text-[11px] text-ink2">
        <span className="live-dot h-1.5 w-1.5 rounded-full bg-pos" /> {short(address!)}
      </div>
    </div>
  );
}
