"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

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

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const path = usePathname();
  const isActive = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));

  return (
    <>
      {/* mobile backdrop */}
      {open && <div onClick={onClose} className="fixed inset-0 top-14 z-30 bg-black/60 backdrop-blur-sm md:hidden" aria-hidden />}

      <aside
        className={`fixed bottom-0 left-0 top-14 z-40 flex w-60 flex-col border-r border-line bg-bg/85 px-4 py-5 backdrop-blur-xl transition-transform duration-300 ease-out ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <nav className="flex flex-col gap-1">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              onClick={() => {
                if (window.matchMedia("(max-width: 767px)").matches) onClose();
              }}
              className={`navlink ${isActive(n.href) ? "navlink-active" : ""}`}
            >
              {n.icon}
              {n.label}
            </Link>
          ))}
        </nav>

        <Link href="/build" className="mt-5 flex items-center justify-center gap-2 rounded-xl bg-accent px-3 py-2.5 text-sm font-bold text-white transition hover:opacity-90">
          + New agent
        </Link>

        <div className="mt-auto border-t border-line pt-4 text-[11px] text-ink3">
          agents pay their own way
          <br />
          via Circle Gateway on Arc.
        </div>
      </aside>
    </>
  );
}
