import { NextResponse, type NextRequest } from "next/server";
import { verifyMessage } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { matchPreset } from "@/lib/archetypes";
import { readAgents, saveAgent } from "@/lib/store";
import { registryAgent } from "@/lib/verify";

export const dynamic = "force-dynamic";

// Operator repair: reset an agent's stored strategy to the builder preset its on-chain template
// hash proves. Only the treasury can call it (signed, 10-minute window), and it can only restore
// the committed strategy, never set an arbitrary one.
export async function POST(req: NextRequest) {
  const pk = process.env.DEPLOYER_PRIVATE_KEY;
  if (!pk) return NextResponse.json({ error: "not configured" }, { status: 500 });
  const treasury = privateKeyToAccount((pk.startsWith("0x") ? pk : `0x${pk}`) as `0x${string}`).address;

  const body = (await req.json().catch(() => ({}))) as { agentId?: string; issuedAt?: string; signature?: string };
  const agentId = String(body.agentId ?? "");
  const issuedAt = String(body.issuedAt ?? "");
  const t = new Date(issuedAt).getTime();
  if (!agentId || !Number.isFinite(t) || Math.abs(Date.now() - t) > 10 * 60 * 1000) {
    return NextResponse.json({ error: "agentId and a fresh issuedAt are required" }, { status: 400 });
  }
  let ok = false;
  try {
    ok = await verifyMessage({
      address: treasury,
      message: `LONGSHOT admin: restore agent ${agentId}\nissued ${issuedAt}`,
      signature: String(body.signature ?? "") as `0x${string}`,
    });
  } catch {
    ok = false;
  }
  if (!ok) return NextResponse.json({ error: "treasury signature required" }, { status: 401 });

  const agent = readAgents().find((a) => a.agentId === agentId);
  if (!agent?.onChainAgentId) return NextResponse.json({ error: "unknown agent" }, { status: 404 });
  const reg = await registryAgent(agent.onChainAgentId);
  if (!reg) return NextResponse.json({ error: "not registered on-chain" }, { status: 404 });
  const preset = matchPreset(reg.templateHash, reg.name);
  if (!preset) return NextResponse.json({ error: "on-chain template does not match a builder preset" }, { status: 422 });

  saveAgent({ ...agent, template: { ...agent.template, ...preset, modelProvider: "default" } });
  return NextResponse.json({ ok: true, agentId, restored: { name: preset.name, budget: preset.budget } });
}
