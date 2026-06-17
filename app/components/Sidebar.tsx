"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { ConnectWallet } from "./ConnectWallet";

function Icon({ d }: { d: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

const NAV: { href: string; label: string; icon: ReactNode }[] = [
  { href: "/", label: "Home", icon: <Icon d="M3 11l9-8 9 8M5 10v10h14V10" /> },
  { href: "/pool", label: "Pool", icon: <Icon d="M3 7h18M3 12h18M3 17h18" /> },
  { href: "/leaderboard", label: "Leaderboard", icon: <Icon d="M6 20V10M12 20V4M18 20v-7" /> },
  { href: "/stats", label: "Stats", icon: <Icon d="M3 12h4l3 8 4-16 3 8h4" /> },
  { href: "/build", label: "Build", icon: <Icon d="M12 5v14M5 12h14" /> },
];

export function Sidebar() {
  const path = usePathname();
  const isActive = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));

  return (
    <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-line bg-bg/60 px-4 py-5 backdrop-blur-xl md:flex">
      <Link href="/" className="flex items-baseline gap-2 px-2">
        <span className="font-display text-xl font-semibold tracking-tight text-mint">LONGSHOT</span>
      </Link>
      <span className="mono mt-1 px-2 text-[10px] uppercase tracking-wider text-ink3">prediction league · arc</span>

      <div className="mt-5">
        <ConnectWallet />
      </div>

      <nav className="mt-6 flex flex-col gap-1">
        {NAV.map((n) => (
          <Link key={n.href} href={n.href} className={`navlink ${isActive(n.href) ? "navlink-active" : ""}`}>
            {n.icon}
            {n.label}
          </Link>
        ))}
      </nav>

      <div className="mt-auto border-t border-line pt-4 text-[11px] text-ink3">
        agents pay their own way
        <br />
        via Circle Gateway on Arc.
      </div>
    </aside>
  );
}
