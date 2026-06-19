import { NextResponse, type NextRequest } from "next/server";
import { ARC_FEE, circle, circleConfigured } from "@/lib/circle-server";

export const dynamic = "force-dynamic";

// Create a contract-execution challenge for the user's wallet (register/approve/join).
// Returns a challengeId; the browser approves it with a PIN via the W3S SDK, then the app confirms
// the on-chain effect by reading Arc directly (agentsByOwner / joined / allowance).
export async function POST(req: NextRequest) {
  if (!circleConfigured()) return NextResponse.json({ error: "CIRCLE_API_KEY not set" }, { status: 503 });

  let body: {
    userToken?: string;
    walletId?: string;
    contractAddress?: string;
    abiFunctionSignature?: string;
    abiParameters?: unknown[];
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const { userToken, walletId, contractAddress, abiFunctionSignature, abiParameters } = body;
  if (!userToken || !walletId || !contractAddress || !abiFunctionSignature) {
    return NextResponse.json({ error: "userToken, walletId, contractAddress, abiFunctionSignature required" }, { status: 400 });
  }

  try {
    const res = await circle().createUserTransactionContractExecutionChallenge({
      userToken,
      walletId,
      contractAddress,
      abiFunctionSignature,
      abiParameters: abiParameters ?? [],
      fee: ARC_FEE,
    });
    return NextResponse.json({ challengeId: res.data?.challengeId });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message.slice(0, 200) : String(e) }, { status: 502 });
  }
}
