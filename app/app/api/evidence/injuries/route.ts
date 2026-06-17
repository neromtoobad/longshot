import { NextResponse, type NextRequest } from "next/server";
import { withGateway, EVIDENCE_PRICES } from "@/lib/x402";
import { injuriesEvidence } from "@/lib/evidence";

export const dynamic = "force-dynamic";

const handler = async (req: NextRequest) => {
  const fixtureId = new URL(req.url).searchParams.get("fixtureId") ?? "unknown";
  return NextResponse.json(injuriesEvidence(fixtureId));
};

export const GET = withGateway(handler, EVIDENCE_PRICES.injuries, "/api/evidence/injuries");
