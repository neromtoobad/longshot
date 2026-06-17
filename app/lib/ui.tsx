import type { ReactNode } from "react";

export function PageHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 max-w-2xl text-sm text-ink2">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

export function Card({ children, className = "", hover = false }: { children: ReactNode; className?: string; hover?: boolean }) {
  return <div className={`glass ${hover ? "glass-hover" : ""} p-5 ${className}`}>{children}</div>;
}

export function Stat({
  label,
  value,
  sub,
  accent = false,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  accent?: boolean;
}) {
  return (
    <div className="glass p-5">
      <div className="mono text-[10px] uppercase tracking-wider text-ink3">{label}</div>
      <div className={`mono mt-2 text-3xl font-semibold leading-none ${accent ? "text-accent glow-text" : "text-ink"}`}>
        {value}
      </div>
      {sub && <div className="mt-2 text-xs text-ink2">{sub}</div>}
    </div>
  );
}

export function Pill({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "pos" | "neg" | "accent" | "accent2" | "gold" }) {
  const toneClass = {
    muted: "text-ink2 border-line2",
    pos: "text-pos border-pos/40",
    neg: "text-neg border-neg/40",
    accent: "text-accent border-accent/40",
    accent2: "text-accent2 border-accent2/40",
    gold: "text-gold border-gold/40",
  }[tone];
  return <span className={`pill ${toneClass}`}>{children}</span>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="glass p-10 text-center text-sm text-ink2">{children}</div>;
}

/** Format USDC base units (6 decimals) for display. */
export function usdc(baseUnits: string | bigint): string {
  const n = Number(BigInt(baseUnits)) / 1_000_000;
  return n.toLocaleString("en-US", { minimumFractionDigits: n < 1 ? 4 : 2, maximumFractionDigits: 6 });
}
