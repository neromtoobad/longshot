"use client";

// Wallet-side network hygiene. Reads in the app go through our own RPC, but transactions go
// through whatever RPC the user's wallet saved for Arc Testnet. Arc moved its public RPC from
// rpc.testnet.arc.network (now dead) to rpc.testnet.arc.io, so wallets that added Arc earlier fail
// every send. Re-adding the chain with the working RPC fixes that: MetaMask prompts to update the
// saved network, and stays silent when it already matches.

import type { Connector } from "wagmi";
import { arcChain } from "./wagmi";

export const ARC_RPC = arcChain.rpcUrls.default.http[0];

const ADD_PARAMS = {
  chainId: `0x${arcChain.id.toString(16)}`,
  chainName: arcChain.name,
  nativeCurrency: arcChain.nativeCurrency,
  rpcUrls: [ARC_RPC],
  blockExplorerUrls: [arcChain.blockExplorers.default.url],
};

type Provider = { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> };

/** Make sure the wallet's Arc Testnet points at the working RPC. Best-effort: never throws. */
export async function ensureArcRpc(connector: Connector | undefined): Promise<void> {
  if (!connector) return;
  try {
    const provider = (await connector.getProvider()) as Provider | undefined;
    await provider?.request({ method: "wallet_addEthereumChain", params: [ADD_PARAMS] });
  } catch {
    // Rejected or unsupported: the send below will surface a clear error if the RPC is still bad.
  }
}

function errorCode(e: unknown): number | undefined {
  let cur: unknown = e;
  for (let i = 0; i < 5 && cur && typeof cur === "object"; i++) {
    const code = (cur as { code?: unknown }).code;
    if (typeof code === "number") return code;
    cur = (cur as { cause?: unknown }).cause;
  }
  return undefined;
}

/** Turn wallet / RPC errors into something a person can act on. */
export function friendlyWalletError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  const code = errorCode(e);
  if (code === 4001 || /rejected|denied/i.test(msg)) return "You rejected the request in your wallet.";
  if (code === -32002 || /requested resource not available|resource unavailable|already pending/i.test(msg)) {
    return (
      "Your wallet has a request waiting, or can't reach Arc. Open your wallet and approve or close any pending " +
      `popup. If nothing is pending, edit the Arc Testnet network in your wallet and set its RPC URL to ${ARC_RPC} ` +
      "(the old rpc.testnet.arc.network address no longer works), then try again."
    );
  }
  if (/insufficient funds|exceeds balance|transfer amount exceeds/i.test(msg)) {
    return "Not enough testnet USDC in your wallet for this step plus gas. Get more at faucet.circle.com.";
  }
  if (/failed to fetch|network error|fetch failed|could not coalesce/i.test(msg)) {
    return `Your wallet couldn't reach Arc. Set the Arc Testnet RPC URL in your wallet to ${ARC_RPC} and try again.`;
  }
  return msg.split("\n")[0].slice(0, 220);
}
