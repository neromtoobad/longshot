import { NextResponse, type NextRequest } from "next/server";
import { compileTemplate, type AgentTemplate, type EvidenceSource } from "@longshot/shared";
import { saveAgent } from "@/lib/store";
import { getMyAgents } from "@/lib/data";

export const dynamic = "force-dynamic";

const SOURCES: EvidenceSource[] = ["form", "odds", "injuries", "h2h"];

// List the connected owner's agents (with live progress + editable config) for the My Agents page.
export async function GET(req: NextRequest) {
  const owner = req.nextUrl.searchParams.get("owner");
  if (!owner) return NextResponse.json({ error: "owner query param required" }, { status: 400 });
  return NextResponse.json({ agents: getMyAgents(owner) });
}

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

  // Cosmetic avatar (style + seed) — kept off the template hash; stored only for display.
  const av = (body.avatar ?? {}) as Record<string, unknown>;
  const avatar =
    typeof av.style === "string" && typeof av.seed === "string" && av.style && av.seed
      ? { style: av.style, seed: av.seed }
      : undefined;

  const agent = saveAgent({
    agentId: typeof body.onChainAgentId === "string" && body.onChainAgentId ? body.onChainAgentId : undefined,
    owner: typeof body.owner === "string" && body.owner ? body.owner : "0x0000000000000000000000000000000000000000",
    poolId: String(body.poolId ?? "1"),
    walletId: "", // DCW data-wallet provisioned at matchday
    walletAddress: "",
    onChainAgentId: typeof body.onChainAgentId === "string" ? body.onChainAgentId : undefined,
    avatar,
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
