// Agent wallets. Every agent has its own EOA on Arc testnet (key in the encrypted keystore in the
// data dir). Its owner funds it with plain USDC; the worker then deposits that USDC into the Circle
// Gateway Wallet from the agent's own key, and the agent pays for evidence out of its Gateway
// balance with signed x402 authorizations (batched, gasless). A hard budget cap stops an agent
// spending past its allocation no matter what its balance is.

import { createWalletClient, http, parseUnits, type Address, type Hash } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { ADDRESSES, arcRpcUrl, arcTestnet, createArcPublicClient, erc20BalanceOfAbi, USDC_ADDRESS } from "@longshot/shared";
import { loadAgentKey } from "@longshot/shared/server";

const erc20Abi = [
  ...erc20BalanceOfAbi,
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
  },
] as const;

// Circle Gateway Wallet (same address on every testnet). ABI from @circle-fin/x402-batching.
const gatewayAbi = [
  {
    type: "function",
    name: "deposit",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token", type: "address" },
      { name: "value", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "availableBalance",
    stateMutability: "view",
    inputs: [
      { name: "token", type: "address" },
      { name: "depositor", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
  },
] as const;

/** Arc drops transactions priced under ~20 gwei, so pin a floor on every write. */
const MIN_FEE = parseUnits("25", 9);

function walletFor(pk: `0x${string}`) {
  return createWalletClient({ account: privateKeyToAccount(pk), chain: arcTestnet, transport: http(arcRpcUrl()) });
}

export function treasuryKey(): `0x${string}` {
  const pk = process.env.DEPLOYER_PRIVATE_KEY;
  if (!pk) throw new Error("DEPLOYER_PRIVATE_KEY (treasury) not set");
  return (pk.startsWith("0x") ? pk : `0x${pk}`) as `0x${string}`;
}

export function treasuryAddress(): Address {
  return privateKeyToAccount(treasuryKey()).address;
}

async function fees() {
  const est = await createArcPublicClient().estimateFeesPerGas();
  const maxFeePerGas = est.maxFeePerGas > MIN_FEE ? est.maxFeePerGas : MIN_FEE;
  const maxPriorityFeePerGas = est.maxPriorityFeePerGas > MIN_FEE ? est.maxPriorityFeePerGas : MIN_FEE;
  return { maxFeePerGas: maxFeePerGas * 2n, maxPriorityFeePerGas };
}

async function confirm(hash: Hash): Promise<Hash> {
  const r = await createArcPublicClient().waitForTransactionReceipt({ hash });
  if (r.status !== "success") throw new Error(`tx reverted: ${hash}`);
  return hash;
}

/** Plain USDC balance (ERC-20 view, 6 decimals). */
export async function usdcBalance(address: Address): Promise<bigint> {
  return createArcPublicClient().readContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [address],
  });
}

/** Spendable Gateway balance for an address (6 decimals). Lags pending batches by a few minutes. */
export async function gatewayBalance(address: Address): Promise<bigint> {
  return createArcPublicClient().readContract({
    address: ADDRESSES.gatewayWallet,
    abi: gatewayAbi,
    functionName: "availableBalance",
    args: [USDC_ADDRESS, address],
  });
}

/** Send USDC from the treasury (house agents top-ups, seeding). */
export async function fundFromTreasury(to: Address, amount: bigint): Promise<Hash> {
  const hash = await walletFor(treasuryKey()).writeContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: "transfer",
    args: [to, amount],
    ...(await fees()),
  });
  return confirm(hash);
}

/**
 * Move an agent wallet's USDC into Gateway from the agent's own key (approve, then deposit).
 * Keeps `gasReserve` behind for future approve/deposit gas (gas on Arc is paid in USDC).
 */
export async function depositAgentToGateway(
  agentAddress: Address,
  gasReserve = parseUnits("0.02", 6),
): Promise<{ amount: bigint; tx?: Hash }> {
  const balance = await usdcBalance(agentAddress);
  if (balance <= gasReserve) return { amount: 0n };
  const amount = balance - gasReserve;

  const wallet = walletFor(loadAgentKey(agentAddress));
  const allowance = await createArcPublicClient().readContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: "allowance",
    args: [agentAddress, ADDRESSES.gatewayWallet],
  });
  if (allowance < amount) {
    await confirm(
      await wallet.writeContract({
        address: USDC_ADDRESS,
        abi: erc20Abi,
        functionName: "approve",
        args: [ADDRESSES.gatewayWallet, 2n ** 255n],
        ...(await fees()),
      }),
    );
  }
  const tx = await wallet.writeContract({
    address: ADDRESSES.gatewayWallet,
    abi: gatewayAbi,
    functionName: "deposit",
    args: [USDC_ADDRESS, amount],
    gas: 120_000n,
    ...(await fees()),
  });
  await confirm(tx);
  return { amount, tx };
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
