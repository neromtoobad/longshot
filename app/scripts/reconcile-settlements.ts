// Reconcile every recorded x402 purchase against Circle's Gateway facilitator: confirm the
// settlement landed (status), and capture the verifiable transfer (from agent wallet -> seller,
// amount, network). Writes .data/settlements.json for the /stats settlement-proof panel.
//
// Run: pnpm reconcile (from app). Public facilitator, no auth. Safe to re-run.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const DATA_DIR = resolve(process.cwd(), process.env.LONGSHOT_DATA_DIR ?? "../.data");
const FACILITATOR = process.env.GATEWAY_FACILITATOR_URL ?? "https://gateway-api-testnet.circle.com";

interface Purchase {
  agentId: string;
  source: string;
  priceUSDC: string;
  settlementUuid: string;
  fixtureId: string;
}
interface Settlement {
  uuid: string;
  status: string;
  fromAddress: string | null;
  toAddress: string | null;
  amount: string | null;
  network: string | null;
  settledAt: string | null;
  batchTxHash: string | null;
}

function read<T>(file: string, fallback: T): T {
  const p = resolve(DATA_DIR, file);
  return existsSync(p) ? (JSON.parse(readFileSync(p, "utf8")) as T) : fallback;
}

const purchases = read<Purchase[]>("purchases.json", []);
const uuids = [...new Set(purchases.map((p) => p.settlementUuid).filter((u) => u && !u.startsWith("test-")))];
console.log(`reconciling ${uuids.length} real settlements against ${FACILITATOR} ...`);

const out: Settlement[] = [];
let completed = 0;
for (const uuid of uuids) {
  try {
    const res = await fetch(`${FACILITATOR}/v1/x402/transfers/${uuid}`);
    if (!res.ok) {
      out.push({ uuid, status: `http_${res.status}`, fromAddress: null, toAddress: null, amount: null, network: null, settledAt: null, batchTxHash: null });
      continue;
    }
    const b = (await res.json()) as Record<string, unknown>;
    const status = String(b.status ?? b.state ?? "unknown");
    if (status === "completed" || status === "confirmed") completed++;
    out.push({
      uuid,
      status,
      fromAddress: (b.fromAddress as string) ?? null,
      toAddress: (b.toAddress as string) ?? null,
      amount: (b.amount as string) ?? null,
      network: (b.sendingNetwork as string) ?? (b.recipientNetwork as string) ?? null,
      settledAt: (b.updatedAt as string) ?? null,
      batchTxHash: ((b.transactionHash ?? b.batchTransactionHash) as string) ?? null,
    });
    console.log(`  ${uuid.slice(0, 8)}  ${status}  ${b.fromAddress ? String(b.fromAddress).slice(0, 8) : "?"}->${b.toAddress ? String(b.toAddress).slice(0, 8) : "?"}  ${Number(b.amount ?? 0) / 1e6} USDC`);
  } catch (e) {
    out.push({ uuid, status: "error", fromAddress: null, toAddress: null, amount: null, network: null, settledAt: null, batchTxHash: null });
    console.error(`  ${uuid.slice(0, 8)} error: ${e instanceof Error ? e.message : String(e)}`);
  }
}

if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
writeFileSync(resolve(DATA_DIR, "settlements.json"), JSON.stringify(out, null, 2));
console.log(`done: ${completed}/${uuids.length} completed on-chain. wrote settlements.json`);
