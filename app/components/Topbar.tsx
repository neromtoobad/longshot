"use client";

import Link from "next/link";
import { ConnectWallet } from "./ConnectWallet";

export function Topbar({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <header className="sticky top-0 z-50 flex h-14 items-center gap-3 border-b border-line bg-bg/70 px-4 backdrop-blur-xl">
      <button
        type="button"
        onClick={onToggle}
        aria-label={open ? "Hide menu" : "Show menu"}
        className="rounded-lg p-2 text-ink2 transition hover:bg-surface hover:text-ink"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M3 6h18M3 12h18M3 18h18" />}
        </svg>
      </button>

      <Link href="/" className="flex items-baseline gap-2">
        <span className="font-display text-lg font-extrabold tracking-tight">LONGSHOT</span>
        <span className="mono hidden text-[10px] uppercase tracking-wider text-ink3 sm:inline">prediction league · arc</span>
      </Link>

      <div className="ml-auto">
        <ConnectWallet />
      </div>
    </header>
  );
}
