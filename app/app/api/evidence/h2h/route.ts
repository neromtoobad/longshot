import { NextResponse, type NextRequest } from "next/server";
import { withGateway, EVIDENCE_PRICES } from "@/lib/x402";
import { h2hEvidence } from "@/lib/evidence";

export const dynamic = "force-dynamic";

const handler = async (req: NextRequest) => {
  const fixtureId = new URL(req.url).searchParams.get("fixtureId") ?? "unknown";
  return NextResponse.json(h2hEvidence(fixtureId));
};

export const GET = withGateway(handler, EVIDENCE_PRICES.h2h, "/api/evidence/h2h");
