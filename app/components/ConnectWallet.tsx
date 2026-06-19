"use client";

import { useState } from "react";
import { useAccount, useReadContract, useSwitchChain } from "wagmi";
import { arcChain } from "@/lib/wagmi";
import { USDC_ADDRESS, usdcAbi } from "@/lib/contracts";
import { useWallet } from "@/lib/wallet-context";

function short(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function ConnectWallet() {
  const { address, isConnected, walletType, circleAvailable, connectCircle, connectMetaMask, disconnect, isConnecting, circleError } = useWallet();
  const { chainId } = useAccount();
  const { switchChain } = useSwitchChain();
  const [open, setOpen] = useState(false);

  const { data: balance } = useReadContract({
    address: USDC_ADDRESS,
    abi: usdcAbi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: arcChain.id,
    query: { enabled: Boolean(address), refetchInterval: 12_000 },
  });
  const usdc = balance !== undefined ? (Number(balance as bigint) / 1_000_000).toFixed(2) : "—";

  // MetaMask on the wrong chain → prompt a switch (Circle smart accounts are always on Arc).
  if (isConnected && walletType === "metamask" && chainId !== arcChain.id) {
    return (
      <button onClick={() => switchChain({ chainId: arcChain.id })} className="rounded-xl border border-gold/50 bg-gold/10 px-4 py-2 text-sm font-medium text-gold">
        Switch to Arc
      </button>
    );
  }

  if (isConnected && address) {
    return (
      <div className="relative">
        <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 rounded-xl border border-line2 bg-surface px-3 py-2 text-sm transition hover:border-accent/50">
          <span>{walletType === "circle" ? "⚡" : "🦊"}</span>
          <span className="num font-semibold text-accent2">{usdc}</span>
          <span className="hidden text-xs text-ink2 sm:inline">USDC</span>
          <span className="mono text-[11px] text-ink3">{short(address)}</span>
        </button>
        {open && (
          <div className="absolute right-0 z-50 mt-2 w-56 rounded-xl border border-line bg-surface p-3 shadow-xl">
            <div className="mono text-[10px] uppercase tracking-wider text-ink3">{walletType === "circle" ? "circle smart wallet" : "metamask"}</div>
            <div className="mono mt-1 break-all text-[11px] text-ink2">{address}</div>
            {walletType === "circle" && <div className="mt-2 rounded-lg bg-accent/10 px-2 py-1 text-[11px] text-accent2">PIN · Circle smart wallet on Arc</div>}
            <button onClick={() => { disconnect(); setOpen(false); }} className="mt-2 w-full rounded-lg px-3 py-2 text-left text-sm text-ink2 transition hover:bg-surface2 hover:text-neg">
              Disconnect
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} disabled={isConnecting} className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-accentink transition hover:opacity-90 disabled:opacity-50">
        {isConnecting ? "Connecting…" : "Connect wallet"}
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-64 rounded-xl border border-line bg-surface p-2 shadow-xl">
          <button
            onClick={() => { connectCircle(); if (circleAvailable) setOpen(false); }}
            className="flex w-full items-start gap-3 rounded-lg p-3 text-left transition hover:bg-surface2"
          >
            <span className="text-lg">⚡</span>
            <span>
              <span className="block text-sm font-semibold">Smart Wallet</span>
              <span className="block text-[11px] text-ink2">{circleAvailable ? "PIN · Circle smart wallet on Arc" : "Circle — needs setup (App ID)"}</span>
            </span>
          </button>
          <button
            onClick={() => { connectMetaMask(); setOpen(false); }}
            className="flex w-full items-start gap-3 rounded-lg p-3 text-left transition hover:bg-surface2"
          >
            <span className="text-lg">🦊</span>
            <span>
              <span className="block text-sm font-semibold">MetaMask</span>
              <span className="block text-[11px] text-ink2">browser wallet · pays its own gas</span>
            </span>
          </button>
          {circleError && <p className="px-3 py-1 text-[11px] text-neg">{circleError}</p>}
        </div>
      )}
    </div>
  );
}
