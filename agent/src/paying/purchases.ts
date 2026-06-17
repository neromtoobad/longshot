// Purchase records: every evidence buy is logged with its settlement UUID (the receipt). The
// on-chain batch tx hash is filled in later by reconcile(). In-memory for MVP; Phase 6.5 /stats
// reads these (swap for persistence then).

import type { EvidenceSource, Purchase, UsdcBaseUnits } from "@longshot/shared";

const store: Purchase[] = [];
let counter = 0;

export function recordPurchase(input: {
  agentId: string;
  fixtureId: string;
  source: EvidenceSource;
  priceUSDC: UsdcBaseUnits;
  settlementUuid: string | null;
  batchTxHash: `0x${string}` | null;
}): Purchase {
  const purchase: Purchase = {
    id: `purchase-${++counter}`,
    agentId: input.agentId,
    fixtureId: input.fixtureId,
    source: input.source,
    priceUSDC: input.priceUSDC,
    settlementUuid: input.settlementUuid ?? "",
    batchTxHash: input.batchTxHash,
    createdAt: new Date().toISOString(),
  };
  store.push(purchase);
  return purchase;
}

export function allPurchases(): readonly Purchase[] {
  return store;
}

export function totalSpent(agentId?: string): bigint {
  return store
    .filter((p) => !agentId || p.agentId === agentId)
    .reduce((sum, p) => sum + BigInt(p.priceUSDC), 0n);
}

const FACILITATOR_URL =
  process.env.GATEWAY_FACILITATOR_URL ?? "https://gateway-api-testnet.circle.com";

/**
 * Poll the facilitator for a settlement until it lands on-chain, then record the batch tx hash.
 * Returns the final status. Safe to run well after the prediction — settlement is async/batched.
 */
export async function reconcile(
  settlementUuid: string,
  opts: { attempts?: number; delayMs?: number } = {},
): Promise<{ status: string; batchTxHash: `0x${string}` | null }> {
  const attempts = opts.attempts ?? 20;
  const delayMs = opts.delayMs ?? 3000;

  for (let i = 0; i < attempts; i++) {
    const res = await fetch(`${FACILITATOR_URL}/v1/x402/transfers/${settlementUuid}`);
    const body = (await res.json()) as Record<string, unknown>;
    const status = String(body.status ?? body.state ?? "unknown");
    const txHash = (body.transactionHash ?? body.batchTransactionHash ?? null) as
      | `0x${string}`
      | null;

    if (status === "completed" || status === "confirmed") {
      const record = store.find((p) => p.settlementUuid === settlementUuid);
      if (record && txHash) record.batchTxHash = txHash;
      return { status, batchTxHash: txHash };
    }
    if (i < attempts - 1) await new Promise((r) => setTimeout(r, delayMs));
  }
  return { status: "pending", batchTxHash: null };
}
