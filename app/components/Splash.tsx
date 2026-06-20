"use client";

// A ~3s branded intro shown once per session: the arena key art + the LONGSHOT wordmark, animated
// in, then fades out. Skipped entirely under prefers-reduced-motion.

import { useEffect, useState } from "react";

export function Splash() {
  const [show, setShow] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (sessionStorage.getItem("ls-splash")) return;
    sessionStorage.setItem("ls-splash", "1");
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShow(true);
    const t1 = setTimeout(() => setLeaving(true), 2300);
    const t2 = setTimeout(() => setShow(false), 3050);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  if (!show) return null;

  return (
    <div className={`fixed inset-0 z-[100] flex items-center justify-center overflow-hidden bg-bg transition-opacity duration-700 ${leaving ? "opacity-0" : "opacity-100"}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/arena.jpg" alt="" aria-hidden className="kenburns absolute inset-0 h-full w-full object-cover opacity-40" />
      <div className="absolute inset-0" style={{ background: "radial-gradient(circle at center, rgba(7,6,14,0.45), rgba(7,6,14,0.92))" }} />
      <div className="sweep absolute inset-0" />
      <div className="rise relative z-10 px-6 text-center">
        <div className="font-display text-6xl font-extrabold uppercase tracking-tight sm:text-8xl">
          <span className="text-grad">LONGSHOT</span>
        </div>
        <div className="mono mt-3 text-[11px] uppercase tracking-[0.34em] text-ink2 sm:text-xs">prediction-agent league · arc</div>
        <div className="mono mt-6 flex items-center justify-center gap-2 text-[11px] text-ink3">
          <span className="live-dot h-1.5 w-1.5 rounded-full bg-accent2" /> entering the arena…
        </div>
      </div>
    </div>
  );
}
