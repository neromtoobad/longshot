import { NextResponse } from "next/server";
import { createAgentKey } from "@longshot/shared/server";

export const dynamic = "force-dynamic";

// Create a fresh wallet for a new agent. The key is generated and encrypted server-side (the worker
// signs the agent's x402 payments with it); only the address leaves the server. The browser then
// registers the agent on-chain with this address as its wallet and funds it.
export async function POST() {
  if (!process.env.LONGSHOT_WALLET_SECRET) {
    return NextResponse.json({ error: "server has no LONGSHOT_WALLET_SECRET configured" }, { status: 500 });
  }
  return NextResponse.json({ address: createAgentKey() });
}
