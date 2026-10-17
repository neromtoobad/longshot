// Reconcile x402 purchases against Circle's Gateway facilitator: confirm each settlement landed and
// capture the transfer (agent wallet -> seller, amount, network, batch tx). Writes settlements.json
// for the stats page. Only re-checks settlements that are not yet final, a bounded batch per call.

import { readJsonFile, writeJsonFile } from "@longshot/shared/server";
import { allStoredPurchases } from "./store.js";

const FACILITATOR = process.env.GATEWAY_FACILITATOR_URL ?? "https://gateway-api-testnet.circle.com";

export interface Settlement {
  uuid: string;
  status: string;
  fromAddress: string | null;
  toAddress: string | null;
  amount: string | null;
  network: string | null;
  settledAt: string | null;
  batchTxHash: string | null;
  checkedAt?: string;
}

const FINAL = new Set(["completed", "confirmed", "failed"]);

export async function reconcileSettlements(limit = 60): Promise<{ checked: number; completed: number }> {
  const known = new Map(readJsonFile<Settlement[]>("settlements.json", []).map((s) => [s.uuid, s]));
  const pending = [...new Set(allStoredPurchases().map((p) => p.settlementUuid).filter(Boolean))]
    .filter((u) => !FINAL.has(known.get(u)?.status ?? ""))
    .slice(0, limit);
  let completed = 0;
  for (const uuid of pending) {
    try {
      const res = await fetch(`${FACILITATOR}/v1/x402/transfers/${uuid}`, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) continue;
      const b = (await res.json()) as Record<string, unknown>;
      const status = String(b.status ?? b.state ?? "unknown");
      if (status === "completed" || status === "confirmed") completed++;
      known.set(uuid, {
        uuid,
        status,
        fromAddress: (b.fromAddress as string) ?? null,
        toAddress: (b.toAddress as string) ?? null,
        amount: (b.amount as string) ?? null,
        network: (b.sendingNetwork as string) ?? (b.recipientNetwork as string) ?? null,
        settledAt: (b.updatedAt as string) ?? null,
        batchTxHash: ((b.transactionHash ?? b.batchTransactionHash) as string) ?? null,
        checkedAt: new Date().toISOString(),
      });
    } catch {
      /* try again next tick */
    }
  }
  if (pending.length) writeJsonFile("settlements.json", [...known.values()]);
  return { checked: pending.length, completed };
}
