// Marketplace evidence path: a LONGSHOT agent buys REAL data from the Circle Agent Marketplace via
// the Circle CLI (`circle services pay`), paying an x402 nanopayment on the service's chain (Base by
// default). This complements the on-Arc evidence endpoints — the pool/scoring stay on Arc; marketplace
// buys settle in USDC on Base/Ethereum through the agent wallet the Circle CLI is logged into.
//
// Gracefully reports (never throws) when the CLI isn't logged in, so the predict flow can skip it.

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);

// Default: Parallel web search on Base ($0.01) — body is { query }. Override via env.
export const MARKETPLACE_SERVICE_URL = process.env.MARKETPLACE_SERVICE_URL ?? "https://parallelmpp.dev/api/search";
export const MARKETPLACE_CHAIN = process.env.MARKETPLACE_CHAIN ?? "BASE";

export interface MarketplaceResult {
  ok: boolean;
  reason?: string;
  serviceUrl: string;
  chain: string;
  data?: unknown; // the paid API response
  text?: string; // best-effort text to feed the model
}

async function circle(args: string[], timeoutMs: number): Promise<{ ok: boolean; stdout: string; err?: string }> {
  try {
    const { stdout } = await exec("circle", args, { timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024 });
    return { ok: true, stdout };
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; message?: string };
    return { ok: false, stdout: err.stdout ?? "", err: (err.stderr || err.message || String(e)).slice(0, 300) };
  }
}

/** Is the Circle CLI logged in with a non-expired agent-wallet session? */
export async function marketplaceReady(): Promise<boolean> {
  const { ok, stdout } = await circle(["wallet", "status", "--output", "json"], 15_000);
  if (!ok) return false;
  try {
    const j = JSON.parse(stdout) as { data?: { status?: string }; status?: string };
    const status = String(j.data?.status ?? j.status ?? "").toUpperCase();
    return status !== "" && status !== "EXPIRED";
  } catch {
    return /\b(active|valid)\b/i.test(stdout) && !/expired/i.test(stdout);
  }
}

/** Buy real research for a query from the Circle Agent Marketplace (x402 nanopayment). */
export async function fetchMarketplaceResearch(
  query: string,
  opts: { serviceUrl?: string; chain?: string } = {},
): Promise<MarketplaceResult> {
  const serviceUrl = opts.serviceUrl ?? MARKETPLACE_SERVICE_URL;
  const chain = opts.chain ?? MARKETPLACE_CHAIN;

  if (!(await marketplaceReady())) {
    return { ok: false, reason: "Circle agent wallet not logged in / session expired — run `circle wallet login`", serviceUrl, chain };
  }

  const { ok, stdout, err } = await circle(
    ["services", "pay", serviceUrl, "--chain", chain, "--data", JSON.stringify({ query }), "--output", "json"],
    90_000,
  );
  if (!ok) return { ok: false, reason: err ?? "payment failed", serviceUrl, chain };

  let data: unknown;
  try {
    data = JSON.parse(stdout);
  } catch {
    data = stdout;
  }
  const text = (typeof data === "string" ? data : JSON.stringify(data)).slice(0, 4000);
  return { ok: true, serviceUrl, chain, data, text };
}
