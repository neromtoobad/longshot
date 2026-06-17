// Phase 7.2 — register pool agents on-chain (AgentRegistry) and join the pool with real USDC entry
// escrow (Pool.join, deployer pays as owner of record). Idempotent. Run: pnpm seed:onchain <poolId>
//
// Needs $RPC + DEPLOYER_PRIVATE_KEY. Run seed:wallets first so agents have real wallet addresses.

import { agentsInPool, saveAgent } from "../src/store.ts";
import { registerAgent, joinPool, isJoined } from "../src/onchain.ts";

const poolId = process.argv[2] ?? "1";
const ENTRY_FEE = 1_000_000n; // 1 USDC — the World Cup pool's entry (see shared/addresses.arc.json)

const agents = agentsInPool(poolId);
if (agents.length === 0) {
  console.error(`no agents in pool ${poolId}`);
  process.exit(1);
}

for (const a of agents) {
  const { config, ...rec } = a;
  if (rec.walletAddress.startsWith("0x0000")) {
    console.error(`agent ${rec.agentId} has no real wallet — run seed:wallets first`);
    process.exit(1);
  }

  let onChainAgentId = rec.onChainAgentId;
  if (!onChainAgentId) {
    const { agentId, tx } = await registerAgent(rec.template.name, config.templateHash, rec.walletAddress);
    onChainAgentId = agentId.toString();
    saveAgent({ ...rec, onChainAgentId });
    console.log(`registered ${rec.template.name} -> on-chain agentId ${onChainAgentId} (tx ${tx})`);
  } else {
    console.log(`${rec.template.name} already registered as agentId ${onChainAgentId}`);
  }

  if (await isJoined(BigInt(poolId), BigInt(onChainAgentId))) {
    console.log(`  already joined pool ${poolId}`);
  } else {
    const tx = await joinPool(BigInt(poolId), BigInt(onChainAgentId), ENTRY_FEE);
    console.log(`  joined pool ${poolId}, entry ${Number(ENTRY_FEE) / 1e6} USDC escrowed (tx ${tx})`);
  }
}

console.log("seed:onchain done");
