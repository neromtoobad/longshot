import { NextResponse } from "next/server";
import { brokerCatalog } from "@/lib/broker";

export const dynamic = "force-dynamic";

// Free price list: sources, base + broker prices, markup, and per-source reputation.
export async function GET() {
  return NextResponse.json(brokerCatalog());
}
