import { NextResponse, type NextRequest } from "next/server";
import { withGateway, EVIDENCE_PRICES } from "@/lib/x402";
import { formEvidence } from "@/lib/evidence";

export const dynamic = "force-dynamic";

const handler = async (req: NextRequest) => {
  const fixtureId = new URL(req.url).searchParams.get("fixtureId") ?? "unknown";
  return NextResponse.json(formEvidence(fixtureId));
};

export const GET = withGateway(handler, EVIDENCE_PRICES.form, "/api/evidence/form");
