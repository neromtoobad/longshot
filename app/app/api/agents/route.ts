import { NextResponse, type NextRequest } from "next/server";
import { compileTemplate, type AgentTemplate, type EvidenceSource } from "@longshot/shared";
import { saveAgent } from "@/lib/store";

export const dynamic = "force-dynamic";

const SOURCES: EvidenceSource[] = ["form", "odds", "injuries", "h2h"];

// Register an agent from a template: validate + compile (templateHash), then save it as a pool
// entrant. On-chain registerAgent + Circle wallet provisioning + entry payment happen at matchday
// (Phase 7) — the agent is created here and becomes runnable.
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const willingnessToPay: Partial<Record<EvidenceSource, string>> = {};
  const wtp = (body.willingnessToPay ?? {}) as Record<string, unknown>;
  for (const s of SOURCES) {
    const v = wtp[s];
    if (typeof v === "string" && v !== "") willingnessToPay[s] = v;
  }

  const template: AgentTemplate = {
    name: String(body.name ?? ""),
    prompt: String(body.prompt ?? ""),
    persona: String(body.persona ?? ""),
    riskAppetite: (body.riskAppetite as AgentTemplate["riskAppetite"]) ?? "medium",
    dataPreference: { preferBroker: Boolean(body.preferBroker), willingnessToPay },
    modelProvider: "venice",
    budget: String(body.budget ?? "0"),
  };

  let config;
  try {
    config = compileTemplate(template);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }

  const agent = saveAgent({
    owner: typeof body.owner === "string" && body.owner ? body.owner : "0x0000000000000000000000000000000000000000",
    poolId: String(body.poolId ?? "1"),
    walletId: "", // provisioned at matchday
    walletAddress: "",
    template: {
      name: template.name,
      persona: template.persona,
      prompt: template.prompt,
      riskAppetite: template.riskAppetite,
      dataPreference: template.dataPreference,
      modelProvider: "venice",
      budget: template.budget,
    },
  });

  return NextResponse.json({ agentId: agent.agentId, templateHash: config.templateHash });
}
