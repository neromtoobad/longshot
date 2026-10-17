import { NextResponse, type NextRequest } from "next/server";
import { withGateway } from "@/lib/x402";
import { BROKER_MARKUP_BPS, brokerPriceAtomic, brokerPriceStr, isSource, recordBrokerSale } from "@/lib/broker";
import { evidenceFor } from "@/lib/evidence";

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
  const fixtureId = req.nextUrl.searchParams.get("fixtureId") ?? "";
  let payload: Record<string, unknown> | null = null;

  const wrapped = withGateway(
    async () =>
      NextResponse.json({
        ...payload,
        broker: { markupBps: BROKER_MARKUP_BPS, baseUSDC: base / 1_000_000, markupUSDC: markup / 1_000_000, paymentChainDepth: 2 },
      }),
    brokerPriceStr(source),
    `/api/broker/evidence/${source}`,
    {
      payTo: process.env.BROKER_ADDRESS, // defaults to SELLER_ADDRESS when unset
      onSettled: () => recordBrokerSale(source, base, markup),
      precheck: async () => {
        payload = await evidenceFor(source, fixtureId);
        return payload ? null : NextResponse.json({ error: "no data for this fixture yet" }, { status: 404 });
      },
    },
  );
  return wrapped(req);
}
