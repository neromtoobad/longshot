// Circle Modular Wallets — passkey-authenticated ERC-4337 smart accounts on Arc testnet.
// User signs with a device passkey (WebAuthn); transactions are gasless via Circle's Gas Station
// paymaster. Adapted from the circlefin/arc-prediction-markets reference (Apache-2.0).
//
// Needs two values from the Circle Console (Modular Wallets > Console Setup), in app/.env.local:
//   NEXT_PUBLIC_CIRCLE_CLIENT_KEY   — the console client key
//   NEXT_PUBLIC_CIRCLE_CLIENT_URL   — the client RPC base (e.g. https://modular-sdk.circle.com/v1/rpc/w3s/<id>)
// Until both are set, the passkey option is shown as "needs setup" and MetaMask still works.

import { createPublicClient, http, parseGwei, type CustomTransport, type PublicClient } from "viem";
import { toPasskeyTransport, toModularTransport } from "@circle-fin/modular-wallets-core";
import { arcChain } from "./wagmi";

const ARC_RPC_URL = "https://rpc.testnet.arc.network";

const clientKey = process.env.NEXT_PUBLIC_CIRCLE_CLIENT_KEY ?? "";
const clientUrl = process.env.NEXT_PUBLIC_CIRCLE_CLIENT_URL ?? "";

const PLACEHOLDERS = ["", "your_circle_client_key_here", "your_circle_client_url_here"];

export function isCircleConfigured(): boolean {
  return !PLACEHOLDERS.includes(clientKey) && !PLACEHOLDERS.includes(clientUrl);
}

let _passkeyTransport: CustomTransport | null = null;
let _modularTransport: CustomTransport | null = null;
let _circlePublicClient: PublicClient | null = null;
let _directPublicClient: PublicClient | null = null;

function assertConfigured(): void {
  if (!isCircleConfigured()) {
    throw new Error(
      "Circle smart wallet is not configured. Set NEXT_PUBLIC_CIRCLE_CLIENT_KEY and NEXT_PUBLIC_CIRCLE_CLIENT_URL in app/.env.local.",
    );
  }
}

export function getPasskeyTransport(): CustomTransport {
  assertConfigured();
  if (!_passkeyTransport) _passkeyTransport = toPasskeyTransport(clientUrl, clientKey);
  return _passkeyTransport;
}

export function getModularTransport(): CustomTransport {
  assertConfigured();
  // Arc testnet path segment per Circle's modular-wallet chain table.
  if (!_modularTransport) _modularTransport = toModularTransport(`${clientUrl}/arcTestnet`, clientKey);
  return _modularTransport;
}

export function getCirclePublicClient(): PublicClient {
  assertConfigured();
  if (!_circlePublicClient) {
    _circlePublicClient = createPublicClient({ chain: arcChain, transport: getModularTransport() });
  }
  return _circlePublicClient;
}

// Direct (non-bundler) RPC client for reading on-chain state (e.g. baseFeePerGas).
function getDirectPublicClient(): PublicClient {
  if (!_directPublicClient) {
    _directPublicClient = createPublicClient({ chain: arcChain, transport: http(ARC_RPC_URL) });
  }
  return _directPublicClient;
}

// --- UserOperation gas pricing -------------------------------------------------
// Circle's bundler can diverge from the network's eth_gasPrice; ask the bundler first via
// pimlico_getUserOperationGasPrice, then fall back to baseFeePerGas * 2 + min priority.

const MIN_PRIORITY_FEE = parseGwei("1");
const FALLBACK_BASE_FEE = parseGwei("48");

interface PimlicoTier {
  maxFeePerGas: string;
  maxPriorityFeePerGas: string;
}
interface PimlicoGasPrice {
  slow?: PimlicoTier;
  standard?: PimlicoTier;
  fast?: PimlicoTier;
}
interface BundlerRequester {
  request: (args: { method: string }) => Promise<unknown>;
}

export async function estimateUserOpFees({
  bundlerClient,
}: {
  bundlerClient: unknown;
}): Promise<{ maxFeePerGas: bigint; maxPriorityFeePerGas: bigint }> {
  const fees = (await (bundlerClient as BundlerRequester)
    .request({ method: "pimlico_getUserOperationGasPrice" })
    .catch(() => null)) as PimlicoGasPrice | null;

  const tier = fees?.fast ?? fees?.standard ?? fees?.slow;
  if (tier) {
    const priority = BigInt(tier.maxPriorityFeePerGas);
    return {
      maxFeePerGas: BigInt(tier.maxFeePerGas),
      maxPriorityFeePerGas: priority < MIN_PRIORITY_FEE ? MIN_PRIORITY_FEE : priority,
    };
  }

  const block = await getDirectPublicClient().getBlock();
  const baseFee = block.baseFeePerGas ?? FALLBACK_BASE_FEE;
  return { maxFeePerGas: baseFee * 2n + MIN_PRIORITY_FEE, maxPriorityFeePerGas: MIN_PRIORITY_FEE };
}
