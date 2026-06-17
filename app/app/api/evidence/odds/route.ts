import { NextResponse, type NextRequest } from "next/server";
import { withGateway, EVIDENCE_PRICES } from "@/lib/x402";
import { oddsEvidence } from "@/lib/evidence";

export const dynamic = "force-dynamic";

const handler = async (req: NextRequest) => {
  const fixtureId = new URL(req.url).searchParams.get("fixtureId") ?? "unknown";
  return NextResponse.json(oddsEvidence(fixtureId));
};

export const GET = withGateway(handler, EVIDENCE_PRICES.odds, "/api/evidence/odds");
