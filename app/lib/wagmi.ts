import { cookieStorage, createStorage, http } from "wagmi";
import { defineChain } from "viem";
import { getDefaultConfig } from "@rainbow-me/rainbowkit";

// Arc testnet for the browser wallet. Public RPC (no proxy token client-side). Native token is
// USDC. MetaMask (and other injected wallets) add this as a custom network on first connect.
export const arcChain = defineChain({
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.testnet.arc.network"] } },
  blockExplorers: { default: { name: "Arcscan", url: "https://testnet.arcscan.app" } },
  testnet: true,
});

export const USDC_ADDRESS = "0x3600000000000000000000000000000000000000" as const;

// WalletConnect Cloud project id. Needed for WalletConnect + the mobile/QR flows of MetaMask,
// Rainbow, and Coinbase. Injected/extension wallets work without it. Get a free id at
// cloud.walletconnect.com and set NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID. A non-empty placeholder
// keeps the config valid so the app never crashes when it's unset.
const WC_PROJECT_ID = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "longshot_demo_wc_projectid";

// RainbowKit's default multi-wallet config: MetaMask, Rainbow, Coinbase, WalletConnect, and any
// injected browser wallet. getDefaultConfig is SSR-safe (callable from the server layout for
// cookieToInitialState), unlike the lower-level connectorsForWallets.
export function getConfig() {
  return getDefaultConfig({
    appName: "LONGSHOT",
    projectId: WC_PROJECT_ID,
    chains: [arcChain],
    transports: { [arcChain.id]: http("https://rpc.testnet.arc.network") },
    storage: createStorage({ storage: cookieStorage }),
    ssr: true,
  });
}

// NOTE: do not build the config at module load. getDefaultConfig is client-only, so a module-scope
// call would run when a server component imports this file. getConfig() is called client-side in
// providers.tsx (a "use client" component) instead.

declare module "wagmi" {
  interface Register {
    config: ReturnType<typeof getConfig>;
  }
}
