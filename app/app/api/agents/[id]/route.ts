import { NextResponse, type NextRequest } from "next/server";
import type { EvidenceSource } from "@longshot/shared";
import { updateAgent } from "@/lib/store";

export const dynamic = "force-dynamic";

const SOURCES: EvidenceSource[] = ["form", "odds", "injuries", "h2h"];

// Edit an owned agent's strategy. Owner-gated in the store (owner must match the stored owner).
// NOTE: testnet trust model — the body asserts `owner`; production should verify a wallet signature.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const owner = typeof body.owner === "string" ? body.owner : "";
  if (!owner) return NextResponse.json({ error: "owner required" }, { status: 400 });

  const wtpIn = (body.willingnessToPay ?? undefined) as Record<string, unknown> | undefined;
  let willingnessToPay: Partial<Record<EvidenceSource, string>> | undefined;
  if (wtpIn) {
    willingnessToPay = {};
    for (const s of SOURCES) {
      const v = wtpIn[s];
      willingnessToPay[s] = typeof v === "string" ? v : "0";
    }
  }

  const av = (body.avatar ?? {}) as Record<string, unknown>;
  const avatar = typeof av.style === "string" && typeof av.seed === "string" && av.style && av.seed ? { style: av.style, seed: av.seed } : undefined;

  const updated = updateAgent(id, owner, {
    name: typeof body.name === "string" ? body.name : undefined,
    persona: typeof body.persona === "string" ? body.persona : undefined,
    prompt: typeof body.prompt === "string" ? body.prompt : undefined,
    riskAppetite: typeof body.riskAppetite === "string" ? body.riskAppetite : undefined,
    preferBroker: typeof body.preferBroker === "boolean" ? body.preferBroker : undefined,
    budget: typeof body.budget === "string" ? body.budget : undefined,
    willingnessToPay,
    avatar,
  });

  if (!updated) return NextResponse.json({ error: "agent not found or you don't own it" }, { status: 403 });
  return NextResponse.json({ ok: true, agentId: updated.agentId });
}
