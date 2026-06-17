// Per-agent wallet module (EXECUTION_PLAN Phase 3.1).
//
// Provisions one Circle Developer-Controlled Wallet (EOA) per agent on Arc testnet, funds it in
// USDC, reads its balance at 6 decimals, and exposes a hard budget cap so an agent can never spend
// past its allocation. Wallets are EOA (not SCA) because Gateway/x402 verify signatures with
// ecrecover. See [[wallet-architecture-decision]].

import type { Blockchain } from "@circle-fin/developer-controlled-wallets";
import { createWalletClient, getAddress, http, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arcTestnet, createArcPublicClient, erc20BalanceOfAbi, USDC_ADDRESS } from "@longshot/shared";
import { circleClient } from "./circle/client.js";

export const ARC_CIRCLE_BLOCKCHAIN: Blockchain = "ARC-TESTNET";

export interface AgentWallet {
  walletId: string;
  address: Address;
  walletSetId: string;
}

/** Provision a fresh Circle DCW EOA wallet on Arc testnet for an agent. */
export async function createAgentWallet(name: string): Promise<AgentWallet> {
  const client = circleClient();

  const setRes = await client.createWalletSet({ name: `longshot:${name}` });
  const walletSetId = setRes.data?.walletSet?.id;
  if (!walletSetId) throw new Error("Circle returned no wallet set id");

  const walletsRes = await client.createWallets({
    walletSetId,
    accountType: "EOA",
    blockchains: [ARC_CIRCLE_BLOCKCHAIN],
    count: 1,
  });
  const wallet = walletsRes.data?.wallets?.[0];
  if (!wallet?.address) throw new Error("Circle returned no wallet");

  return { walletId: wallet.id, address: getAddress(wallet.address), walletSetId };
}

/** Read an address's USDC balance (base units, 6 decimals) via the Arc public client. */
export async function getAgentUsdcBalance(address: Address): Promise<bigint> {
  const client = createArcPublicClient();
  return client.readContract({
    address: USDC_ADDRESS,
    abi: erc20BalanceOfAbi,
    functionName: "balanceOf",
    args: [address],
  });
}

const erc20TransferAbi = [
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

/**
 * Fund an address with USDC from the deployer EOA (raw key from DEPLOYER_PRIVATE_KEY). Used to seed
 * an agent wallet from the owner's budget. Returns the tx hash; caller can await the receipt.
 */
export async function fundFromDeployer(to: Address, amount: bigint): Promise<`0x${string}`> {
  const pk = process.env.DEPLOYER_PRIVATE_KEY;
  const rpc = process.env.RPC;
  if (!pk) throw new Error("DEPLOYER_PRIVATE_KEY not set");
  if (!rpc) throw new Error("process.env.RPC not set (provide it via arc-canteen)");

  const account = privateKeyToAccount((pk.startsWith("0x") ? pk : `0x${pk}`) as `0x${string}`);
  const wallet = createWalletClient({ account, chain: arcTestnet, transport: http(rpc) });

  return wallet.writeContract({
    address: USDC_ADDRESS,
    abi: erc20TransferAbi,
    functionName: "transfer",
    args: [to, amount],
  });
}

// --- gateway deposit (for DCW wallets) -------------------------------------

const GATEWAY_WALLET_ADDRESS = "0x0077777d7EBA4688BDeF3E311b846F25870A19B9";

async function waitForCircleTx(challengeId: string): Promise<string> {
  const client = circleClient();
  for (;;) {
    const res = await client.getTransaction({ id: challengeId });
    const tx = res.data?.transaction;
    if (tx?.state === "CONFIRMED" || tx?.state === "COMPLETE") {
      if (!tx.txHash) throw new Error(`tx ${challengeId} ${tx.state} but no txHash`);
      return tx.txHash;
    }
    if (tx?.state === "FAILED") throw new Error(`tx ${challengeId} failed: ${tx.errorReason}`);
    await new Promise((r) => setTimeout(r, 2000));
  }
}

/**
 * Deposit USDC from a DCW wallet into the Gateway Wallet contract so the agent can pay x402
 * nanopayments (Gateway spends from this deposited balance, not the EOA). approve then deposit,
 * each a Circle contract-execution tx. The other half of provisioning, alongside funding the EOA.
 * NOTE: not yet exercised live (Phase 3.3 proves the buyer with a pre-funded deployer); agents
 * use this in Phase 4.
 */
export async function depositToGateway(
  walletId: string,
  amount: bigint,
): Promise<{ approveTx: string; depositTx: string }> {
  const client = circleClient();
  const fee = { type: "level" as const, config: { feeLevel: "HIGH" as const } };

  const approve = await client.createContractExecutionTransaction({
    walletId,
    contractAddress: USDC_ADDRESS,
    abiFunctionSignature: "approve(address,uint256)",
    abiParameters: [GATEWAY_WALLET_ADDRESS, amount.toString()],
    fee,
  });
  const approveTx = await waitForCircleTx(approve.data?.id ?? "");

  const deposit = await client.createContractExecutionTransaction({
    walletId,
    contractAddress: GATEWAY_WALLET_ADDRESS,
    abiFunctionSignature: "deposit(address,uint256)",
    abiParameters: [USDC_ADDRESS, amount.toString()],
    fee,
  });
  const depositTx = await waitForCircleTx(deposit.data?.id ?? "");

  return { approveTx, depositTx };
}

// --- budget cap ------------------------------------------------------------

export interface BudgetOk {
  ok: true;
  remaining: bigint;
}

export interface BudgetExceeded {
  ok: false;
  reason: "BudgetExceeded";
  budget: bigint;
  spent: bigint;
  requested: bigint;
  remaining: bigint;
}

export type BudgetResult = BudgetOk | BudgetExceeded;

/**
 * Hard budget cap. Returns a typed result (never throws) so the predict loop can decide to skip a
 * buy when funds run out. An agent can never spend past `budget`.
 */
export function checkBudget(budget: bigint, spent: bigint, requested: bigint): BudgetResult {
  const remaining = budget > spent ? budget - spent : 0n;
  if (requested > remaining) {
    return { ok: false, reason: "BudgetExceeded", budget, spent, requested, remaining };
  }
  return { ok: true, remaining: remaining - requested };
}
