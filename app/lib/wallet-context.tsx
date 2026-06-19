"use client";

// Unified wallet layer: a Circle Modular smart account (passkey, gasless) OR a wagmi/MetaMask EOA.
// One useWallet() hook drives the topbar connect and the build flow. Adapted from the
// circlefin/arc-prediction-markets reference (Apache-2.0), wired to this app's wagmi config.

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { encodeFunctionData, type Abi, type Address, type Hex } from "viem";
import { toWebAuthnAccount, createBundlerClient } from "viem/account-abstraction";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { toWebAuthnCredential, toCircleSmartAccount, WebAuthnMode } from "@circle-fin/modular-wallets-core";
import {
  estimateUserOpFees,
  getCirclePublicClient,
  getModularTransport,
  getPasskeyTransport,
  isCircleConfigured,
} from "./circle";
import { arcChain } from "./wagmi";

const STORAGE_KEY = "longshot-circle-credential";

export type WalletType = "metamask" | "circle" | null;

interface BundlerClient {
  sendUserOperation: (args: { calls: { to: Hex; data: Hex; value?: bigint }[]; paymaster: true }) => Promise<Hex>;
  waitForUserOperationReceipt: (args: { hash: Hex }) => Promise<{ receipt: { transactionHash: Hex } }>;
}

interface WalletContextValue {
  address: Address | undefined;
  isConnected: boolean;
  walletType: WalletType;
  bundlerClient: BundlerClient | null;
  circleAvailable: boolean;
  connectMetaMask: () => void;
  connectCircle: () => Promise<void>;
  disconnect: () => void;
  isConnecting: boolean;
  circleError: string | null;
}

const WalletContext = createContext<WalletContextValue | null>(null);

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used within WalletProvider");
  return ctx;
}

/** Encode a contract call into a UserOperation/transaction call object. */
export function encodeCall(params: { address: Address; abi: Abi; functionName: string; args?: readonly unknown[] }): {
  to: Hex;
  data: Hex;
} {
  return {
    to: params.address as Hex,
    data: encodeFunctionData({ abi: params.abi, functionName: params.functionName, args: params.args as unknown[] }),
  };
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const { address: wagmiAddress, isConnected: wagmiConnected } = useAccount();
  const { connect, connectors, isPending: wagmiPending } = useConnect();
  const { disconnect: wagmiDisconnect } = useDisconnect();

  const [circleAddress, setCircleAddress] = useState<Address | undefined>();
  const [bundlerClient, setBundlerClient] = useState<BundlerClient | null>(null);
  const [circleConnecting, setCircleConnecting] = useState(false);
  const [circleError, setCircleError] = useState<string | null>(null);
  const restoringRef = useRef(false);

  const walletType: WalletType = wagmiConnected ? "metamask" : circleAddress ? "circle" : null;
  const address = walletType === "metamask" ? wagmiAddress : circleAddress;
  const isConnected = walletType !== null;

  const initCircleAccount = useCallback(async (credential: Awaited<ReturnType<typeof toWebAuthnCredential>>) => {
    const owner = toWebAuthnAccount({ credential });
    const smartAccount = await toCircleSmartAccount({ client: getCirclePublicClient(), owner });
    const client = createBundlerClient({
      account: smartAccount,
      chain: arcChain,
      transport: getModularTransport(),
      paymaster: true,
      userOperation: { estimateFeesPerGas: estimateUserOpFees },
    });
    setCircleAddress(smartAccount.address);
    setBundlerClient(client as unknown as BundlerClient);
  }, []);

  const connectCircle = useCallback(async () => {
    setCircleConnecting(true);
    setCircleError(null);
    try {
      if (!isCircleConfigured()) {
        throw new Error("Circle smart wallet needs setup — add NEXT_PUBLIC_CIRCLE_CLIENT_KEY and NEXT_PUBLIC_CIRCLE_CLIENT_URL to app/.env.local.");
      }
      if (wagmiConnected) wagmiDisconnect();

      let credential: Awaited<ReturnType<typeof toWebAuthnCredential>>;
      // Try logging into an existing passkey; otherwise register a new one.
      try {
        credential = await toWebAuthnCredential({ transport: getPasskeyTransport(), mode: WebAuthnMode.Login });
      } catch {
        const username = `longshot_${crypto.randomUUID().slice(0, 8)}`;
        credential = await toWebAuthnCredential({ transport: getPasskeyTransport(), mode: WebAuthnMode.Register, username });
      }

      await initCircleAccount(credential);
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ credentialId: credential.id }));
    } catch (err) {
      console.error("Circle wallet connection failed:", err);
      setCircleError(err instanceof Error ? err.message : "Failed to connect passkey wallet");
    } finally {
      setCircleConnecting(false);
    }
  }, [wagmiConnected, wagmiDisconnect, initCircleAccount]);

  const connectMetaMask = useCallback(() => {
    if (circleAddress) {
      setCircleAddress(undefined);
      setBundlerClient(null);
      localStorage.removeItem(STORAGE_KEY);
    }
    const connector = connectors[0];
    if (connector) connect({ connector });
  }, [circleAddress, connect, connectors]);

  const disconnect = useCallback(() => {
    if (walletType === "metamask") {
      wagmiDisconnect();
    } else if (walletType === "circle") {
      setCircleAddress(undefined);
      setBundlerClient(null);
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [walletType, wagmiDisconnect]);

  // Restore a Circle passkey session on mount.
  useEffect(() => {
    if (restoringRef.current || !isCircleConfigured()) return;
    const raw = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    if (!raw || wagmiConnected) return;

    restoringRef.current = true;
    const { credentialId } = JSON.parse(raw) as { credentialId: string };
    (async () => {
      try {
        setCircleConnecting(true);
        const credential = await toWebAuthnCredential({ transport: getPasskeyTransport(), mode: WebAuthnMode.Login, credentialId });
        await initCircleAccount(credential);
      } catch (err) {
        console.error("Failed to restore Circle session:", err);
        localStorage.removeItem(STORAGE_KEY);
      } finally {
        setCircleConnecting(false);
        restoringRef.current = false;
      }
    })();
  }, [wagmiConnected, initCircleAccount]);

  return (
    <WalletContext.Provider
      value={{
        address,
        isConnected,
        walletType,
        bundlerClient,
        circleAvailable: isCircleConfigured(),
        connectMetaMask,
        connectCircle,
        disconnect,
        isConnecting: wagmiPending || circleConnecting,
        circleError,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}
