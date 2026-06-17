// x402 + Circle Gateway seller wrapper for Next route handlers.
//
// Adapted from circlefin/arc-nanopayments (lib/x402.ts), minus the Supabase persistence — the
// buyer (Phase 3.3 paying client) records purchases keyed by settlement UUID for /stats. The
// 402 + Gateway verify/settle flow here is real, not stubbed. Prices must be genuinely sub-cent
// ($0.001-$0.005); see CLAUDE.md hard rule.

import { BatchFacilitatorClient } from "@circle-fin/x402-batching/server";
import { NextResponse, type NextRequest } from "next/server";

const ARC_TESTNET_NETWORK = "eip155:5042002";
const ARC_TESTNET_USDC = "0x3600000000000000000000000000000000000000";
const ARC_TESTNET_GATEWAY_WALLET = "0x0077777d7EBA4688BDeF3E311b846F25870A19B9";

function sellerAddress(): `0x${string}` {
  const addr = process.env.SELLER_ADDRESS;
  if (!addr) throw new Error("SELLER_ADDRESS is not set (the wallet that receives data payments).");
  return addr as `0x${string}`;
}

interface PaymentPayload {
  x402Version: number;
  resource?: { url: string; description: string; mimeType: string };
  accepted?: Record<string, unknown>;
  payload: Record<string, unknown>;
  extensions?: Record<string, unknown>;
}

/** Atomic USDC (6 decimals) from a "$0.00X" string. "$0.003" -> 3000. */
function priceToAtomic(price: string): number {
  return Math.round(parseFloat(price.replace("$", "")) * 1_000_000);
}

function buildPaymentRequirements(price: string) {
  return {
    scheme: "exact" as const,
    network: ARC_TESTNET_NETWORK,
    asset: ARC_TESTNET_USDC,
    amount: priceToAtomic(price).toString(),
    payTo: sellerAddress(),
    maxTimeoutSeconds: 345600,
    extra: {
      name: "GatewayWalletBatched",
      version: "1",
      verifyingContract: ARC_TESTNET_GATEWAY_WALLET,
    },
  };
}

// BatchFacilitatorClient defaults to the MAINNET facilitator; pin it to Arc testnet.
const FACILITATOR_URL = process.env.GATEWAY_FACILITATOR_URL ?? "https://gateway-api-testnet.circle.com";
const facilitator = new BatchFacilitatorClient({ url: FACILITATOR_URL });

/**
 * Wrap a Next route handler behind an x402 + Gateway paywall. Unpaid requests get a 402 with the
 * payment requirements in the PAYMENT-REQUIRED header; paid requests are verified + settled via
 * Circle's facilitator, then the handler runs and the settlement is echoed in PAYMENT-RESPONSE.
 */
export function withGateway(
  handler: (req: NextRequest) => Promise<NextResponse>,
  price: string,
  endpoint: string,
) {
  return async (req: NextRequest) => {
    const requirements = buildPaymentRequirements(price);
    const paymentSignature = req.headers.get("payment-signature");

    if (!paymentSignature) {
      const paymentRequired = {
        x402Version: 2,
        resource: {
          url: endpoint,
          description: `LONGSHOT evidence (${price} USDC)`,
          mimeType: "application/json",
        },
        accepts: [requirements],
      };
      return new NextResponse(JSON.stringify({ error: "Payment required", price }), {
        status: 402,
        headers: {
          "Content-Type": "application/json",
          "PAYMENT-REQUIRED": Buffer.from(JSON.stringify(paymentRequired)).toString("base64"),
        },
      });
    }

    try {
      const payload: PaymentPayload = JSON.parse(
        Buffer.from(paymentSignature, "base64").toString("utf-8"),
      );

      const verifyResult = await facilitator.verify(payload, requirements);
      if (!verifyResult.isValid) {
        return NextResponse.json(
          { error: "Payment verification failed", reason: verifyResult.invalidReason },
          { status: 402 },
        );
      }

      const settleResult = await facilitator.settle(payload, requirements);
      if (!settleResult.success) {
        return NextResponse.json(
          { error: "Payment settlement failed", reason: settleResult.errorReason },
          { status: 402 },
        );
      }

      const payer = settleResult.payer ?? verifyResult.payer ?? "unknown";
      const amountUsdc = (Number(requirements.amount) / 1e6).toString();
      console.log(`[x402] settled ${endpoint}: ${amountUsdc} USDC from ${payer} (${settleResult.transaction})`);

      const response = await handler(req);
      response.headers.set(
        "PAYMENT-RESPONSE",
        Buffer.from(
          JSON.stringify({
            success: true,
            transaction: settleResult.transaction,
            network: requirements.network,
            payer,
          }),
        ).toString("base64"),
      );
      return response;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[x402] processing error on ${endpoint}:`, message);
      return NextResponse.json({ error: "Payment processing error", message }, { status: 500 });
    }
  };
}

export const EVIDENCE_PRICES = {
  form: "$0.003",
  odds: "$0.005",
  injuries: "$0.002",
  h2h: "$0.002",
} as const;
