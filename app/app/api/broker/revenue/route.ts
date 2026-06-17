import { NextResponse } from "next/server";
import { brokerRevenue } from "@/lib/broker";

export const dynamic = "force-dynamic";

// Broker revenue for /stats: markup kept, base passed through, payment chain depth.
export async function GET() {
  return NextResponse.json(brokerRevenue());
}
