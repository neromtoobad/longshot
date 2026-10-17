// Deploy AgentRegistry + Pool to Arc testnet from the treasury key, point the Pool's runner at the
// treasury, create one season pool per competition, and write shared/src/addresses.json.
// Idempotent: contracts already in addresses.json are reused, and pools already created are kept.
//
// Build first: (cd contracts && forge build). Then: pnpm --filter @longshot/agent deploy:all

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createWalletClient, formatUnits, http, parseUnits, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { ADDRESSES, COMPETITIONS, USDC_ADDRESS, arcRpcUrl, arcTestnet, createArcPublicClient, type Addresses } from "@longshot/shared";
import { treasuryKey } from "../src/wallet.ts";

const ADDR_PATH = resolve(import.meta.dirname, "../../shared/src/addresses.json");
const OUT = resolve(import.meta.dirname, "../../contracts/out");
const ZERO = "0x0000000000000000000000000000000000000000";

const ENTRY_FEE = parseUnits(process.env.POOL_ENTRY_USDC ?? "0.5", 6);
const BUDGET = parseUnits(process.env.POOL_BUDGET_USDC ?? "2", 6);
const SPLIT = [6000, 3000, 1000];

function artifact(name: string): { abi: unknown[]; bytecode: Hex } {
  const json = JSON.parse(readFileSync(resolve(OUT, `${name}.sol/${name}.json`), "utf-8"));
  return { abi: json.abi, bytecode: json.bytecode.object as Hex };
}

const account = privateKeyToAccount(treasuryKey());
const wallet = createWalletClient({ account, chain: arcTestnet, transport: http(arcRpcUrl()) });
const pub = createArcPublicClient();
const MIN_FEE = parseUnits("25", 9);

async function fees() {
  const est = await pub.estimateFeesPerGas();
  return {
    maxFeePerGas: (est.maxFeePerGas > MIN_FEE ? est.maxFeePerGas : MIN_FEE) * 2n,
    maxPriorityFeePerGas: est.maxPriorityFeePerGas > MIN_FEE ? est.maxPriorityFeePerGas : MIN_FEE,
  };
}

async function deploy(name: string, args: unknown[]): Promise<{ address: Address; tx: Hex }> {
  const { abi, bytecode } = artifact(name);
  const tx = await wallet.deployContract({ abi, bytecode, args, ...(await fees()) } as never);
  const receipt = await pub.waitForTransactionReceipt({ hash: tx });
  if (!receipt.contractAddress) throw new Error(`${name} deploy produced no address (${tx})`);
  console.log(`  ${name}: ${receipt.contractAddress}  (tx ${tx})`);
  return { address: receipt.contractAddress, tx };
}

const balance = await pub.readContract({
  address: USDC_ADDRESS,
  abi: [{ type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] }],
  functionName: "balanceOf",
  args: [account.address],
});
console.log(`treasury ${account.address}: ${formatUnits(balance as bigint, 6)} USDC`);
if ((balance as bigint) < parseUnits("1", 6)) {
  console.error("treasury needs testnet USDC first: https://faucet.circle.com (Arc Testnet)");
  process.exit(1);
}

const out: Addresses = JSON.parse(JSON.stringify(ADDRESSES));

if (out.contracts.AgentRegistry === ZERO) {
  const r = await deploy("AgentRegistry", []);
  out.contracts.AgentRegistry = r.address;
  out.deploy.AgentRegistryTx = r.tx;
}
if (out.contracts.Pool === ZERO) {
  const p = await deploy("Pool", [USDC_ADDRESS]);
  out.contracts.Pool = p.address;
  out.deploy.PoolTx = p.tx;
}
out.deploy.deployer = account.address;
writeFileSync(ADDR_PATH, JSON.stringify(out, null, 2) + "\n");

const poolAbi = artifact("Pool").abi;
const runner = (await pub.readContract({ address: out.contracts.Pool, abi: poolAbi, functionName: "runner" } as never)) as Address;
if (runner.toLowerCase() !== account.address.toLowerCase()) {
  const tx = await wallet.writeContract({ address: out.contracts.Pool, abi: poolAbi, functionName: "setRunner", args: [account.address], ...(await fees()) } as never);
  await pub.waitForTransactionReceipt({ hash: tx });
  console.log(`  runner -> treasury (tx ${tx})`);
}

for (const c of COMPETITIONS) {
  if (out.pools[c.key]) {
    console.log(`  pool ${c.short}: #${out.pools[c.key]!.poolId} (exists)`);
    continue;
  }
  const name = `${c.name} ${c.season}`;
  const tx = await wallet.writeContract({
    address: out.contracts.Pool,
    abi: poolAbi,
    functionName: "createPool",
    args: [name, ENTRY_FEE, BUDGET, SPLIT],
    ...(await fees()),
  } as never);
  await pub.waitForTransactionReceipt({ hash: tx });
  const poolId = Number(await pub.readContract({ address: out.contracts.Pool, abi: poolAbi, functionName: "totalPools" } as never));
  out.pools[c.key] = {
    poolId,
    entryFeeUSDC: ENTRY_FEE.toString(),
    budgetPerAgentUSDC: BUDGET.toString(),
    prizeSplitBps: SPLIT,
    createTx: tx,
  };
  writeFileSync(ADDR_PATH, JSON.stringify(out, null, 2) + "\n");
  console.log(`  pool ${c.short}: #${poolId} "${name}" (tx ${tx})`);
}

console.log(`wrote ${ADDR_PATH}`);
