// The paying client: buy one evidence item through x402 + Gateway, enforcing the budget cap
// BEFORE signing. Returns the data + purchase record (with settlement UUID) on success, or a typed
// BudgetExceeded result when the buy would breach the cap (never throws for budget).

import type { EvidenceSource, Purchase } from "@longshot/shared";
import { checkBudget, type BudgetExceeded } from "../wallet.js";
import { fetchRequirements, payWithRequirements } from "./x402.js";
import { recordPurchase } from "./purchases.js";
import type { X402Signer } from "./signers.js";

export interface BuyEvidenceArgs {
  url: string;
  signer: X402Signer;
  agentId: string;
  fixtureId: string;
  source: EvidenceSource;
  /** Hard budget cap (USDC base units) and spend so far. */
  budget: bigint;
  spent: bigint;
}

export type BuyEvidenceResult =
  | { ok: true; data: unknown; purchase: Purchase; remaining: bigint }
  | BudgetExceeded;

export async function buyEvidence(args: BuyEvidenceArgs): Promise<BuyEvidenceResult> {
  // Learn the price from the 402 first, then gate on budget BEFORE signing/spending.
  const { x402Version, requirements, resource } = await fetchRequirements(args.url);
  const price = BigInt(requirements.amount);

  const check = checkBudget(args.budget, args.spent, price);
  if (!check.ok) return check; // BudgetExceeded — do not sign, do not spend.

  const paid = await payWithRequirements(args.url, x402Version, requirements, resource, args.signer);
  const purchase = recordPurchase({
    agentId: args.agentId,
    fixtureId: args.fixtureId,
    source: args.source,
    priceUSDC: price.toString(),
    settlementUuid: paid.settlementUuid,
    batchTxHash: null,
  });

  return { ok: true, data: paid.data, purchase, remaining: check.remaining };
}
