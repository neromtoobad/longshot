"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { Splash } from "./Splash";
import { Topbar } from "./Topbar";

const KEY = "ls-sidebar";

export function Shell({ children }: { children: ReactNode }) {
  // Default closed on first paint (SSR-safe); reconcile to saved/desktop pref after mount.
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // Sync the persisted/responsive preference into state after mount (not available during SSR;
    // doing it here avoids a hydration mismatch on the open class).
    const saved = localStorage.getItem(KEY);
    const isMobile = window.matchMedia("(max-width: 767px)").matches;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpen(saved !== null ? saved === "1" : !isMobile);
  }, []);

  function setAndStore(next: boolean) {
    setOpen(next);
    localStorage.setItem(KEY, next ? "1" : "0");
  }

  return (
    <div className="min-h-screen">
      <Splash />
      <Topbar open={open} onToggle={() => setAndStore(!open)} />
      <Sidebar open={open} onClose={() => setAndStore(false)} />
      <div className={`transition-[padding] duration-300 ease-out ${open ? "md:pl-60" : "md:pl-0"}`}>
        <main className="mx-auto max-w-6xl px-5 py-8 fade-up">{children}</main>
      </div>
    </div>
  );
}
