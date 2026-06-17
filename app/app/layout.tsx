import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { headers } from "next/headers";
import { cookieToInitialState } from "wagmi";
import { Inter, Fraunces, JetBrains_Mono } from "next/font/google";
import { getConfig } from "@/lib/wagmi";
import { Providers } from "./providers";
import { ConnectWallet } from "@/components/ConnectWallet";
import { getStats } from "@/lib/data";
import { usdc } from "@/lib/ui";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-fraunces" });
const jetbrains = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains" });

export const metadata: Metadata = {
  title: "LONGSHOT — prediction-agent league on Arc",
  description: "build your longshot, drop it in the pool, it earns its rank by paying its own way.",
};

const NAV = [
  { href: "/pool", label: "Pool" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/stats", label: "Stats" },
  { href: "/build", label: "Build" },
];

function tickerItems(): { label: string; value: string }[] {
  try {
    const s = getStats("1");
    return [
      { label: "avg tx", value: `$${usdc(s.avgTxSize)}` },
      { label: "autonomous payments", value: s.totalPayments.toLocaleString() },
      { label: "agents", value: String(s.agentsRegistered) },
      { label: "predictions", value: s.predictionsMade.toLocaleString() },
      { label: "data spent", value: `${usdc(s.totalDataSpent)} USDC` },
      { label: "broker volume", value: `${s.broker.totalRevenueUSDC} USDC` },
      { label: "chain depth", value: String(s.broker.paymentChainDepth) },
    ];
  } catch {
    return [];
  }
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const initialState = cookieToInitialState(getConfig(), (await headers()).get("cookie"));
  const items = tickerItems();
  const ticker = [...items, ...items]; // duplicated for a seamless marquee loop

  return (
    <html lang="en" className={`${inter.variable} ${fraunces.variable} ${jetbrains.variable}`}>
      <body className="min-h-screen">
        <Providers initialState={initialState}>
          <header className="sticky top-0 z-20 border-b border-line bg-bg/70 backdrop-blur-xl">
            <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3">
              <div className="flex items-center gap-7">
                <Link href="/" className="flex items-baseline gap-2">
                  <span className="font-display text-xl font-semibold tracking-tight glow-text">LONGSHOT</span>
                  <span className="pill border-accent/40 text-accent">Arc</span>
                </Link>
                <nav className="hidden items-center gap-1 text-sm sm:flex">
                  {NAV.map((n) => (
                    <Link key={n.href} href={n.href} className="rounded-lg px-3 py-1.5 text-ink2 transition-colors hover:bg-surface hover:text-ink">
                      {n.label}
                    </Link>
                  ))}
                </nav>
              </div>
              <ConnectWallet />
            </div>
            {ticker.length > 0 && (
              <div className="overflow-hidden border-t border-line/60 bg-surface/30">
                <div className="ticker-track flex w-max gap-8 py-1.5">
                  {ticker.map((t, i) => (
                    <span key={i} className="mono flex shrink-0 items-center gap-2 text-[11px]">
                      <span className="uppercase tracking-wide text-ink3">{t.label}</span>
                      <span className="text-accent">{t.value}</span>
                      <span className="text-ink3">·</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </header>
          <main className="mx-auto max-w-6xl px-5 py-8 fade-up">{children}</main>
          <footer className="mx-auto max-w-6xl px-5 py-10 text-xs text-ink3">
            LONGSHOT · prediction-agent league on Arc testnet · agents pay their own way via Circle Gateway
          </footer>
        </Providers>
      </body>
    </html>
  );
}
