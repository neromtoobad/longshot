import { NextResponse, type NextRequest } from "next/server";
import { ARC, circle, circleConfigured } from "@/lib/circle-server";

export const dynamic = "force-dynamic";

// action "create": initialize a PIN + SCA wallet on Arc (returns a challengeId the W3S SDK executes).
// action "list":   list the user's wallets on Arc (to read the smart-account address after setup).
export async function POST(req: NextRequest) {
  if (!circleConfigured()) return NextResponse.json({ error: "CIRCLE_API_KEY not set" }, { status: 503 });

  let body: { action?: string; userToken?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const { action, userToken } = body;
  if (!userToken) return NextResponse.json({ error: "userToken required" }, { status: 400 });

  const client = circle();
  try {
    if (action === "create") {
      const res = await client.createUserPinWithWallets({ userToken, blockchains: [ARC], accountType: "SCA" });
      return NextResponse.json({ challengeId: res.data?.challengeId });
    }
    if (action === "list") {
      const res = await client.listWallets({ userToken, blockchain: ARC });
      const wallets = (res.data?.wallets ?? []).map((w) => ({ id: w.id, address: w.address, blockchain: w.blockchain }));
      return NextResponse.json({ wallets });
    }
    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message.slice(0, 200) : String(e) }, { status: 502 });
  }
}
