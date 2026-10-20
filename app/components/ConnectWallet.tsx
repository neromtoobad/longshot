"use client";

import { useState } from "react";
import { useAccount, useDisconnect, useReadContract, useSwitchChain } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { arcChain } from "@/lib/wagmi";
import { ensureArcRpc } from "@/lib/arc-wallet";
import { USDC_ADDRESS, usdcAbi } from "@/lib/contracts";

function short(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function ConnectWallet() {
  const { address, isConnected, chainId, connector } = useAccount();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();
  const { openConnectModal, connectModalOpen } = useConnectModal();
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

  if (isConnected && chainId !== arcChain.id) {
    return (
      <button onClick={async () => { await ensureArcRpc(connector); switchChain({ chainId: arcChain.id }); }} className="rounded-xl border border-gold/50 bg-gold/10 px-4 py-2 text-sm font-medium text-gold">
        Switch to Arc
      </button>
    );
  }

  if (isConnected && address) {
    return (
      <div className="relative">
        <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 rounded-xl border border-line2 bg-surface px-3 py-2 text-sm transition hover:border-accent/50">
          <span className="num font-semibold text-accent2">{usdc}</span>
          <span className="hidden text-xs text-ink2 sm:inline">USDC</span>
          <span className="mono text-[11px] text-ink3">{short(address)}</span>
        </button>
        {open && (
          <div className="absolute right-0 z-50 mt-2 w-64 rounded-xl border border-line bg-surface p-3 shadow-xl">
            <div className="mono text-[10px] uppercase tracking-wider text-ink3">{connector?.name ?? "wallet"} · Arc testnet</div>
            <div className="mono mt-1 break-all text-[11px] text-ink2">{address}</div>
            <a
              href="https://faucet.circle.com"
              target="_blank"
              rel="noreferrer"
              className="mt-2 block rounded-lg bg-accent/10 px-2 py-1.5 text-[11px] text-accent2 hover:bg-accent/20"
            >
              Need testnet USDC? faucet.circle.com ↗
            </a>
            <button onClick={() => { disconnect(); setOpen(false); }} className="mt-2 w-full rounded-lg px-3 py-2 text-left text-sm text-ink2 transition hover:bg-surface2 hover:text-neg">
              Disconnect
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <button
      onClick={() => openConnectModal?.()}
      disabled={connectModalOpen}
      className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-accentink transition hover:opacity-90 disabled:opacity-50"
    >
      Connect wallet
    </button>
  );
}
