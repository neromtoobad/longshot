import { NextResponse, type NextRequest } from "next/server";
import { withGateway } from "@/lib/x402";
import {
  BROKER_MARKUP_BPS,
  brokerPriceAtomic,
  brokerPriceStr,
  evidenceFor,
  isSource,
  recordBrokerSale,
} from "@/lib/broker";

export const dynamic = "force-dynamic";

// Brokered evidence: same data as the direct source, sold at base + markup. On settlement the
// broker records the split (markup = revenue, base = passthrough to the source). The agent pays
// the broker; the broker price string drives the x402 paywall per source.
export async function GET(req: NextRequest, ctx: { params: Promise<{ source: string }> }) {
  const { source } = await ctx.params;
  if (!isSource(source)) {
    return NextResponse.json({ error: `unknown source '${source}'` }, { status: 404 });
  }

  const { base, markup } = brokerPriceAtomic(source);

  const handler = async (r: NextRequest) => {
    const fixtureId = new URL(r.url).searchParams.get("fixtureId") ?? "unknown";
    return NextResponse.json({
      ...evidenceFor(source, fixtureId),
      broker: {
        markupBps: BROKER_MARKUP_BPS,
        baseUSDC: base / 1_000_000,
        markupUSDC: markup / 1_000_000,
        paymentChainDepth: 2,
      },
    });
  };

  const wrapped = withGateway(handler, brokerPriceStr(source), `/api/broker/evidence/${source}`, {
    payTo: process.env.BROKER_ADDRESS, // defaults to SELLER_ADDRESS when unset
    onSettled: () => recordBrokerSale(source, base, markup),
  });
  return wrapped(req);
}
