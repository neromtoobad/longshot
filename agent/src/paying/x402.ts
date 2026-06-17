// x402 + Gateway paying client (buyer side). Mirrors @circle-fin/x402-batching's BatchEvmScheme,
// but with a pluggable signer so Circle DCW wallets (signTypedData) can pay — the SDK's
// GatewayClient is raw-key only. The settlement UUID returned in PAYMENT-RESPONSE is the receipt;
// we never block on the on-chain submitBatch (it can lag ~10 min). Reconcile later.

import { getAddress } from "viem";
import type { X402Signer } from "./signers.js";

const CIRCLE_BATCHING_NAME = "GatewayWalletBatched";
const CIRCLE_BATCHING_VERSION = "1";
// Gateway requires the signed authorization to stay valid through batching (7 days + buffer).
const AUTH_VALIDITY_WINDOW_SECONDS = 7 * 24 * 60 * 60 + 100;

const authorizationTypes = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
};

export interface PaymentRequirements {
  scheme: string;
  network: string;
  asset: string;
  amount: string;
  payTo: string;
  maxTimeoutSeconds: number;
  extra: { name: string; version: string; verifyingContract: string };
}

function b64decode(s: string): string {
  return Buffer.from(s, "base64").toString("utf-8");
}
function b64encode(s: string): string {
  return Buffer.from(s).toString("base64");
}
function randomNonce(): `0x${string}` {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return `0x${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

/** GET the resource unpaid and parse the x402 payment requirements from the 402 response. */
export async function fetchRequirements(
  url: string,
): Promise<{ x402Version: number; requirements: PaymentRequirements; resource: unknown }> {
  const res = await fetch(url);
  if (res.status !== 402) {
    throw new Error(`expected 402 from ${url}, got ${res.status}`);
  }
  const header = res.headers.get("payment-required");
  if (!header) throw new Error("402 response missing PAYMENT-REQUIRED header");
  const decoded = JSON.parse(b64decode(header)) as {
    x402Version: number;
    resource: unknown;
    accepts: PaymentRequirements[];
  };
  return {
    x402Version: decoded.x402Version,
    requirements: decoded.accepts[0],
    resource: decoded.resource,
  };
}

export interface PaidResult {
  data: unknown;
  settlementUuid: string | null;
  payer: string | null;
  priceAtomic: bigint;
}

/** Sign the x402 authorization and re-request the resource with the payment-signature header. */
export async function payWithRequirements(
  url: string,
  x402Version: number,
  requirements: PaymentRequirements,
  resource: unknown,
  signer: X402Signer,
): Promise<PaidResult> {
  const now = Math.floor(Date.now() / 1000);
  const validityWindow = Math.max(requirements.maxTimeoutSeconds, AUTH_VALIDITY_WINDOW_SECONDS);
  const authorization = {
    from: signer.address,
    to: getAddress(requirements.payTo),
    value: requirements.amount,
    validAfter: (now - 600).toString(),
    validBefore: (now + validityWindow).toString(),
    nonce: randomNonce(),
  };
  const chainId = parseInt(requirements.network.split(":")[1], 10);

  const signature = await signer.signTypedData({
    domain: {
      name: CIRCLE_BATCHING_NAME,
      version: CIRCLE_BATCHING_VERSION,
      chainId,
      verifyingContract: getAddress(requirements.extra.verifyingContract),
    },
    types: authorizationTypes,
    primaryType: "TransferWithAuthorization",
    message: {
      from: getAddress(authorization.from),
      to: getAddress(authorization.to),
      value: BigInt(authorization.value),
      validAfter: BigInt(authorization.validAfter),
      validBefore: BigInt(authorization.validBefore),
      nonce: authorization.nonce,
    },
  });

  // The facilitator requires `resource` (from the 402) and `accepted` (the requirement being paid)
  // alongside the signed authorization.
  const header = b64encode(
    JSON.stringify({
      x402Version,
      payload: { authorization, signature },
      resource,
      accepted: requirements,
    }),
  );
  const res = await fetch(url, { headers: { "payment-signature": header } });
  if (res.status !== 200) {
    throw new Error(`payment rejected (${res.status}): ${await res.text()}`);
  }
  const data = await res.json();

  let settlementUuid: string | null = null;
  let payer: string | null = null;
  const respHeader = res.headers.get("payment-response");
  if (respHeader) {
    const settle = JSON.parse(b64decode(respHeader)) as { transaction?: string; payer?: string };
    settlementUuid = settle.transaction ?? null;
    payer = settle.payer ?? null;
  }

  return { data, settlementUuid, payer, priceAtomic: BigInt(requirements.amount) };
}
