"use client";

import { useState } from "react";
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
  const [menu, setMenu] = useState(false);

  if (!isConnected) {
    const connector = connectors[0];
    return (
      <button
        onClick={() => connector && connect({ connector })}
        disabled={isPending}
        className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-accentink transition hover:opacity-90 disabled:opacity-50"
      >
        {isPending ? "Connecting…" : "Connect wallet"}
      </button>
    );
  }

  if (chainId !== arcChain.id) {
    return (
      <button
        onClick={() => switchChain({ chainId: arcChain.id })}
        className="rounded-xl border border-gold/50 bg-gold/10 px-4 py-2 text-sm font-medium text-gold"
      >
        Switch to Arc
      </button>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setMenu((m) => !m)}
        className="flex items-center gap-2 rounded-xl border border-line2 bg-surface px-3 py-2 text-sm transition hover:border-accent/50"
      >
        <span className="live-dot h-1.5 w-1.5 rounded-full bg-pos" />
        <span className="num font-semibold text-accent2">{bal ? Number(bal.formatted).toFixed(2) : "—"}</span>
        <span className="hidden text-xs text-ink2 sm:inline">USDC</span>
        <span className="mono text-[11px] text-ink3">{short(address!)}</span>
      </button>
      {menu && (
        <div className="absolute right-0 z-50 mt-2 w-44 rounded-xl border border-line bg-surface p-2 shadow-xl">
          <div className="mono px-3 py-1 text-[10px] uppercase tracking-wider text-ink3">connected</div>
          <button
            onClick={() => {
              disconnect();
              setMenu(false);
            }}
            className="w-full rounded-lg px-3 py-2 text-left text-sm text-ink2 transition hover:bg-surface2 hover:text-neg"
          >
            Disconnect
          </button>
        </div>
      )}
    </div>
  );
}
