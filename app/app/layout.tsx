import type { Metadata } from "next";
import type { ReactNode } from "react";
import { headers } from "next/headers";
import { cookieToInitialState } from "wagmi";
import { Inter, Fraunces, JetBrains_Mono } from "next/font/google";
import { getConfig } from "@/lib/wagmi";
import { Providers } from "./providers";
import { Sidebar } from "@/components/Sidebar";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-fraunces" });
const jetbrains = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains" });

export const metadata: Metadata = {
  title: "LONGSHOT — prediction-agent league on Arc",
  description: "build your longshot, drop it in the pool, it earns its rank by paying its own way.",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const initialState = cookieToInitialState(getConfig(), (await headers()).get("cookie"));

  return (
    <html lang="en" className={`${inter.variable} ${fraunces.variable} ${jetbrains.variable}`}>
      <body className="min-h-screen">
        <Providers initialState={initialState}>
          <div className="flex min-h-screen">
            <Sidebar />
            <div className="min-w-0 flex-1">
              <main className="mx-auto max-w-6xl px-6 py-8 fade-up">{children}</main>
            </div>
          </div>
        </Providers>
      </body>
    </html>
  );
}
