import { NextResponse, type NextRequest } from "next/server";
import type { EvidenceSource } from "@longshot/shared";
import { withGateway, EVIDENCE_PRICES } from "@/lib/x402";
import { evidenceFor } from "@/lib/evidence";
import { isSource } from "@/lib/broker";

export const dynamic = "force-dynamic";

// Direct evidence: GET /api/evidence/{form|odds|table|h2h}?fixtureId=... behind an x402 paywall.
// The payload is built first; if ESPN has nothing for this fixture the caller gets a free 404.
export async function GET(req: NextRequest, ctx: { params: Promise<{ source: string }> }) {
  const { source } = await ctx.params;
  if (!isSource(source)) return NextResponse.json({ error: `unknown source '${source}'` }, { status: 404 });

  let payload: Record<string, unknown> | null = null;
  const fixtureId = req.nextUrl.searchParams.get("fixtureId") ?? "";

  const wrapped = withGateway(
    async () => NextResponse.json(payload),
    EVIDENCE_PRICES[source as EvidenceSource],
    `/api/evidence/${source}`,
    {
      precheck: async () => {
        payload = await evidenceFor(source, fixtureId);
        return payload ? null : NextResponse.json({ error: "no data for this fixture yet" }, { status: 404 });
      },
    },
  );
  return wrapped(req);
}
