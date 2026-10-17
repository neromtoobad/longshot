import { NextResponse, type NextRequest } from "next/server";
import { COMPETITIONS, compileTemplate, poolFor, type AgentTemplate, type EvidenceSource } from "@longshot/shared";
import { hasAgentKey } from "@longshot/shared/server";
import { readAgents, saveAgent } from "@/lib/store";
import { getMyAgents } from "@/lib/data";
import { registryAgent } from "@/lib/verify";

export const dynamic = "force-dynamic";

const SOURCES: EvidenceSource[] = ["form", "odds", "table", "h2h"];

// List the connected owner's agents (with live progress + editable config) for the My Agents page.
export async function GET(req: NextRequest) {
  const owner = req.nextUrl.searchParams.get("owner");
  if (!owner) return NextResponse.json({ error: "owner query param required" }, { status: 400 });
  return NextResponse.json({ agents: getMyAgents(owner) });
}

// Save an agent after the browser has registered it on-chain. The registry is the source of truth:
// the owner, the agent wallet and the template hash must all match what was registered.
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const league = COMPETITIONS.find((c) => c.key === body.league);
  const pool = league ? poolFor(league.key) : undefined;
  if (!league || !pool) return NextResponse.json({ error: "unknown league" }, { status: 400 });

  const willingnessToPay: Partial<Record<EvidenceSource, string>> = {};
  const wtp = (body.willingnessToPay ?? {}) as Record<string, unknown>;
  for (const s of SOURCES) {
    const v = wtp[s];
    if (typeof v === "string" && v !== "" && v !== "0") willingnessToPay[s] = v;
  }

  const template: AgentTemplate = {
    name: String(body.name ?? ""),
    prompt: String(body.prompt ?? ""),
    persona: String(body.persona ?? ""),
    riskAppetite: (body.riskAppetite as AgentTemplate["riskAppetite"]) ?? "medium",
    dataPreference: { preferBroker: Boolean(body.preferBroker), willingnessToPay },
    modelProvider: "default",
    budget: String(body.budget ?? "0"),
  };

  let config;
  try {
    config = compileTemplate(template);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }

  const onChainAgentId = typeof body.onChainAgentId === "string" ? body.onChainAgentId : "";
  const owner = typeof body.owner === "string" ? body.owner : "";
  const walletAddress = typeof body.walletAddress === "string" ? body.walletAddress : "";
  if (!onChainAgentId || !owner || !walletAddress) {
    return NextResponse.json({ error: "onChainAgentId, owner and walletAddress are required" }, { status: 400 });
  }
  if (!hasAgentKey(walletAddress)) return NextResponse.json({ error: "unknown agent wallet" }, { status: 400 });
  if (readAgents().some((a) => a.onChainAgentId === onChainAgentId)) {
    return NextResponse.json({ error: "agent already saved" }, { status: 409 });
  }

  const reg = await registryAgent(onChainAgentId);
  if (!reg) return NextResponse.json({ error: `agent #${onChainAgentId} is not registered on-chain` }, { status: 400 });
  const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
  if (!same(reg.owner, owner) || !same(reg.walletAddress, walletAddress) || reg.templateHash !== config.templateHash) {
    return NextResponse.json({ error: "on-chain registration does not match this agent" }, { status: 400 });
  }

  const av = (body.avatar ?? {}) as Record<string, unknown>;
  const avatar = typeof av.style === "string" && typeof av.seed === "string" && av.style && av.seed ? { style: av.style, seed: av.seed } : undefined;

  const agent = saveAgent({
    agentId: `u${onChainAgentId}`,
    owner,
    poolId: String(pool.poolId),
    walletAddress,
    onChainAgentId,
    avatar,
    createdAt: new Date().toISOString(),
    template: {
      name: template.name,
      persona: template.persona,
      prompt: template.prompt,
      riskAppetite: template.riskAppetite,
      dataPreference: template.dataPreference,
      modelProvider: "default",
      budget: template.budget,
    },
  });

  return NextResponse.json({ agentId: agent.agentId, templateHash: config.templateHash });
}
