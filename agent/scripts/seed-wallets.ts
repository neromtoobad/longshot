// Phase 7.2 — provision a real Circle DCW wallet per pool agent, fund its EOA, and deposit USDC
// into Gateway so it can pay x402 evidence from its own custodial wallet. Idempotent: skips agents
// that already have a wallet / Gateway balance. Run: pnpm seed:wallets <poolId>
//
// Needs $RPC + CIRCLE_API_KEY + CIRCLE_ENTITY_SECRET + DEPLOYER_PRIVATE_KEY.

import { formatUnits } from "viem";
import { createArcPublicClient } from "@longshot/shared";
import { agentsInPool, saveAgent, type AgentRecord } from "../src/store.ts";
import { createAgentWallet, fundFromDeployer, getAgentUsdcBalance, depositToGateway } from "../src/wallet.ts";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const poolId = process.argv[2] ?? "1";
const usdc = (v: bigint) => `${formatUnits(v, 6)} USDC`;

const agents = agentsInPool(poolId);
if (agents.length === 0) {
  console.error(`no agents in pool ${poolId} — seed them first (run:pool or /build)`);
  process.exit(1);
}

for (const agentWithConfig of agents) {
  // Drop the derived `config` (holds bigints) — only the AgentRecord is persisted.
  const { config: _config, ...a } = agentWithConfig;
  const budget = BigInt(a.template.budget || "0");
  const deposit = budget > 0n ? budget : 20_000n; // deposit the agent's data budget into Gateway
  const gasBuffer = 200_000n; // 0.2 USDC for the approve+deposit gas (native USDC on Arc)

  // 1. Provision the Circle DCW wallet (EOA on Arc) if missing.
  let record: AgentRecord = a;
  if (!record.walletId || record.walletId.startsWith("stub-")) {
    console.log(`agent ${a.agentId} (${a.template.name}): provisioning Circle DCW wallet…`);
    const w = await createAgentWallet(a.template.name);
    record = { ...a, walletId: w.walletId, walletAddress: w.address };
    saveAgent(record);
    console.log(`  wallet ${w.walletId} @ ${w.address}`);
  } else {
    console.log(`agent ${a.agentId} (${a.template.name}): wallet ${record.walletAddress}`);
  }

  // 2. Fund the EOA with the deposit amount + gas buffer (idempotent on balance).
  const target = deposit + gasBuffer;
  const balance = await getAgentUsdcBalance(record.walletAddress);
  if (balance < target) {
    const top = target - balance;
    console.log(`  funding ${usdc(top)} (balance ${usdc(balance)} -> ${usdc(target)})…`);
    const tx = await fundFromDeployer(record.walletAddress, top);
    await createArcPublicClient().waitForTransactionReceipt({ hash: tx }); // wait for funds to land
    await sleep(4000); // let Circle's indexer see the new balance
    console.log(`  fund tx ${tx} (confirmed)`);
  } else {
    console.log(`  EOA funded: ${usdc(balance)}`);
  }

  // 3. Deposit the budget into Gateway so x402 can draw from it. Retry for Circle indexer lag.
  if (!record.gatewayDeposited) {
    console.log(`  depositing ${usdc(deposit)} into Gateway (DCW approve + deposit)…`);
    let lastErr: unknown;
    for (let attempt = 1; attempt <= 4; attempt++) {
      try {
        const { approveTx, depositTx } = await depositToGateway(record.walletId, deposit);
        record = { ...record, gatewayDeposited: true };
        saveAgent(record);
        console.log(`  approve ${approveTx}  deposit ${depositTx}`);
        lastErr = undefined;
        break;
      } catch (e) {
        lastErr = e;
        const msg = e instanceof Error ? e.message : String(e);
        console.log(`  deposit attempt ${attempt} failed (${msg}); retrying in 6s…`);
        await sleep(6000);
      }
    }
    if (lastErr) throw lastErr;
  } else {
    console.log(`  Gateway already funded`);
  }
}

console.log("seed:wallets done");
