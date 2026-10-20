import { NextResponse, type NextRequest } from "next/server";
import { ADDRESSES, competitionForPool, createArcPublicClient, erc20BalanceOfAbi } from "@longshot/shared";
import { hasAgentKey } from "@longshot/shared/server";
import { readAgents } from "@/lib/store";
import { agentIdsByOwner, joinedPoolIds, registryAgent } from "@/lib/verify";

export const dynamic = "force-dynamic";

// Agents an owner registered on-chain (with a wallet this server created) that never got saved,
// e.g. because a wallet popup failed halfway through minting. My Agents offers to finish them.
export async function GET(req: NextRequest) {
  const owner = req.nextUrl.searchParams.get("owner");
  if (!owner || !/^0x[0-9a-fA-F]{40}$/.test(owner)) return NextResponse.json({ error: "owner required" }, { status: 400 });

  const saved = new Set(readAgents().map((a) => a.onChainAgentId).filter(Boolean));
  const out = [];
  for (const id of await agentIdsByOwner(owner)) {
    const agentId = id.toString();
    if (saved.has(agentId)) continue;
    const reg = await registryAgent(agentId);
    if (!reg || !hasAgentKey(reg.walletAddress)) continue;
    const joined = await joinedPoolIds(agentId);
    let walletUSDC = "0";
    try {
      walletUSDC = (
        await createArcPublicClient().readContract({
          address: ADDRESSES.usdc,
          abi: erc20BalanceOfAbi,
          functionName: "balanceOf",
          args: [reg.walletAddress],
        })
      ).toString();
    } catch {
      /* leave 0 */
    }
    out.push({
      onChainAgentId: agentId,
      name: reg.name,
      walletAddress: reg.walletAddress,
      templateHash: reg.templateHash,
      league: joined.length ? competitionForPool(String(joined[0])) ?? null : null,
      walletUSDC,
    });
  }
  return NextResponse.json({ pending: out });
}
