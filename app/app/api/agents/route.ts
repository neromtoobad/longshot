import { NextResponse, type NextRequest } from "next/server";
import { COMPETITIONS, compileTemplate, competitionForPool, poolFor, type AgentTemplate, type EvidenceSource } from "@longshot/shared";
import { hasAgentKey } from "@longshot/shared/server";
import { readAgents, saveAgent } from "@/lib/store";
import { getMyAgents } from "@/lib/data";
import { joinedPoolIds, registryAgent, verifySave } from "@/lib/verify";

export const dynamic = "force-dynamic";

const SOURCES: EvidenceSource[] = ["form", "odds", "table", "h2h"];

// List the connected owner's agents (with live progress + editable config) for the My Agents page.
export async function GET(req: NextRequest) {
  const owner = req.nextUrl.searchParams.get("owner");
  if (!owner) return NextResponse.json({ error: "owner query param required" }, { status: 400 });
  return NextResponse.json({ agents: getMyAgents(owner) });
}

// Save an agent after the browser has registered and entered it on-chain. The chain is the source
// of truth for who owns it, which wallet it pays from and which pool it is in. The template hash is
// checked too; a mismatch is still accepted (the owner and wallet already prove it is theirs) so an
// agent can always be finished, and the mismatch is recorded.
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const league = COMPETITIONS.find((c) => c.key === body.league);
  if (body.league !== undefined && !league) return NextResponse.json({ error: "unknown league" }, { status: 400 });

  // Keep every source exactly as the builder sent it, "0" included: the on-chain template hash was
  // computed over all four, so dropping the zeros changes the hash.
  const willingnessToPay: Partial<Record<EvidenceSource, string>> = {};
  const wtp = (body.willingnessToPay ?? {}) as Record<string, unknown>;
  for (const s of SOURCES) {
    const v = wtp[s];
    willingnessToPay[s] = typeof v === "string" && /^\d+$/.test(v) ? v : "0";
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
  if (!same(reg.owner, owner)) return NextResponse.json({ error: "this agent is registered to a different wallet" }, { status: 403 });
  if (!same(reg.walletAddress, walletAddress)) return NextResponse.json({ error: "agent wallet does not match the registration" }, { status: 400 });

  // The pool comes from the chain: whichever league this agent actually entered.
  const joined = await joinedPoolIds(onChainAgentId);
  const wanted = league ? poolFor(league.key) : undefined;
  const poolId = wanted && joined.includes(wanted.poolId) ? wanted.poolId : joined[0];
  if (poolId === undefined) {
    return NextResponse.json({ error: "this agent hasn't entered a pool yet; finish the entry step first" }, { status: 400 });
  }
  // A template matching the on-chain commitment can only be the owner's own strategy. Anything else
  // needs the owner's wallet signature, so nobody can save someone else's agent with a new strategy.
  const hashMatches = reg.templateHash === config.templateHash;
  if (!hashMatches && !(await verifySave(onChainAgentId, owner, String(body.issuedAt ?? ""), String(body.signature ?? "")))) {
    return NextResponse.json({ error: "needs-signature", message: "sign with your wallet to save this agent" }, { status: 401 });
  }

  const av = (body.avatar ?? {}) as Record<string, unknown>;
  const avatar = typeof av.style === "string" && typeof av.seed === "string" && av.style && av.seed ? { style: av.style, seed: av.seed } : undefined;

  const agent = saveAgent({
    agentId: `u${onChainAgentId}`,
    owner,
    poolId: String(poolId),
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

  return NextResponse.json({
    agentId: agent.agentId,
    league: competitionForPool(String(poolId)),
    templateHash: config.templateHash,
    hashMatches,
  });
}
