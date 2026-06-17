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
        className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accentink shadow-[0_0_20px_-4px] shadow-accent/50 transition hover:opacity-90 disabled:opacity-50"
      >
        {isPending ? "Connecting…" : "Connect wallet"}
      </button>
    );
  }

  if (chainId !== arcChain.id) {
    return (
      <button
        onClick={() => switchChain({ chainId: arcChain.id })}
        className="rounded-lg border border-amber/50 bg-amber/10 px-4 py-2 text-sm font-medium text-amber"
      >
        Switch to Arc
      </button>
    );
  }

  return (
    <button
      onClick={() => disconnect()}
      title="Disconnect"
      className="group flex items-center gap-2 rounded-lg border border-line2 bg-surface px-3 py-1.5 text-sm transition hover:border-neg/50"
    >
      <span className="h-2 w-2 rounded-full bg-pos shadow-[0_0_8px] shadow-pos" />
      <span className="mono text-xs text-ink2">
        {bal ? `${Number(bal.formatted).toFixed(2)} USDC` : "—"}
      </span>
      <span className="mono text-xs text-ink group-hover:hidden">{short(address!)}</span>
      <span className="mono hidden text-xs text-neg group-hover:inline">disconnect</span>
    </button>
  );
}
