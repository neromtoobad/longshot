import { NextResponse, type NextRequest } from "next/server";
import { brokerCatalog } from "@/lib/broker";
import { availability } from "@/lib/evidence";

export const dynamic = "force-dynamic";

// Free price list: sources, base + broker prices, markup, and per-source reputation. With
// ?fixtureId= it also says which sources can be served for that match right now.
export async function GET(req: NextRequest) {
  const fixtureId = req.nextUrl.searchParams.get("fixtureId");
  return NextResponse.json(brokerCatalog(fixtureId ? await availability(fixtureId) : undefined));
}
