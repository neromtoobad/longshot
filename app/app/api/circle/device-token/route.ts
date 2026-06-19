import { NextResponse, type NextRequest } from "next/server";
import { circle, circleConfigured } from "@/lib/circle-server";

export const dynamic = "force-dynamic";

// Social login step 1: exchange the SDK's deviceId for a device token + encryption key, which the
// W3S SDK then uses (with the Google client ID) to run the OAuth flow.
export async function POST(req: NextRequest) {
  if (!circleConfigured()) return NextResponse.json({ error: "CIRCLE_API_KEY not set" }, { status: 503 });

  let deviceId: string;
  try {
    ({ deviceId } = (await req.json()) as { deviceId: string });
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  if (!deviceId) return NextResponse.json({ error: "deviceId required" }, { status: 400 });

  try {
    const res = await circle().createDeviceTokenForSocialLogin({ deviceId });
    return NextResponse.json({ deviceToken: res.data?.deviceToken, deviceEncryptionKey: res.data?.deviceEncryptionKey });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message.slice(0, 200) : String(e) }, { status: 502 });
  }
}
