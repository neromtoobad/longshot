import { NextResponse, type NextRequest } from "next/server";
import { circle, circleConfigured } from "@/lib/circle-server";

export const dynamic = "force-dynamic";

// Ensure a Circle user exists for this userId and mint a 60-min session token.
// The userId is generated client-side and persisted there; the token + encryptionKey are returned
// to the browser so the W3S SDK can run the PIN ceremony.
export async function POST(req: NextRequest) {
  if (!circleConfigured()) return NextResponse.json({ error: "CIRCLE_API_KEY not set" }, { status: 503 });

  let userId: string;
  try {
    ({ userId } = (await req.json()) as { userId: string });
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

  const client = circle();
  try {
    await client.createUser({ userId });
  } catch (e) {
    // 155106 = user already initialized; any other error is real.
    const msg = e instanceof Error ? e.message : String(e);
    if (!/already|155106|exist/i.test(msg)) {
      return NextResponse.json({ error: msg.slice(0, 200) }, { status: 502 });
    }
  }

  try {
    const token = await client.createUserToken({ userId });
    return NextResponse.json({ userId, userToken: token.data?.userToken, encryptionKey: token.data?.encryptionKey });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message.slice(0, 200) : String(e) }, { status: 502 });
  }
}
