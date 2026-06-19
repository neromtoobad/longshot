import "server-only";

// Server-side Circle User-Controlled Wallets client. Holds CIRCLE_API_KEY (never sent to the
// browser) and wraps the friendly SDK calls the API routes need. Signatures verified against the
// installed @circle-fin/user-controlled-wallets v10.6.0 type defs.

import { Blockchain, initiateUserControlledWalletsClient } from "@circle-fin/user-controlled-wallets";

export const ARC: Blockchain = Blockchain.ArcTestnet; // "ARC-TESTNET"
export const ARC_FEE = { type: "level" as const, config: { feeLevel: "MEDIUM" as const } };

export function circleConfigured(): boolean {
  return Boolean(process.env.CIRCLE_API_KEY);
}

let _client: ReturnType<typeof initiateUserControlledWalletsClient> | null = null;

export function circle() {
  const apiKey = process.env.CIRCLE_API_KEY;
  if (!apiKey) throw new Error("CIRCLE_API_KEY not set");
  if (!_client) _client = initiateUserControlledWalletsClient({ apiKey });
  return _client;
}
