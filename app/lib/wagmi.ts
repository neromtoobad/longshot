import { cookieStorage, createConfig, createStorage, http } from "wagmi";
import { injected, metaMask } from "wagmi/connectors";
import { defineChain } from "viem";

// Arc testnet for the browser wallet. Public RPC (no proxy token client-side). Native token is
// USDC. MetaMask adds this as a custom network on first connect.
export const arcChain = defineChain({
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.testnet.arc.network"] } },
  blockExplorers: { default: { name: "Arcscan", url: "https://testnet.arcscan.app" } },
  testnet: true,
});

export const USDC_ADDRESS = "0x3600000000000000000000000000000000000000" as const;

export function getConfig() {
  return createConfig({
    chains: [arcChain],
    connectors: [metaMask(), injected()],
    storage: createStorage({ storage: cookieStorage }),
    ssr: true,
    transports: { [arcChain.id]: http("https://rpc.testnet.arc.network") },
  });
}

export const wagmiConfig = getConfig();

declare module "wagmi" {
  interface Register {
    config: ReturnType<typeof getConfig>;
  }
}
