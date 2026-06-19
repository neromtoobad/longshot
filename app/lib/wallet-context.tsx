"use client";

// Unified wallet layer: a Circle User-Controlled Wallet (PIN-authenticated MPC smart account on
// Arc) OR a wagmi/MetaMask EOA. One useWallet() hook drives the topbar connect and the build flow.
//
// Circle flow (per @circle-fin/user-controlled-wallets v10.6 + w3s-pw-web-sdk):
//   session (createUser + createUserToken) -> W3SSdk getDeviceId + setAuthentication
//   -> list/create PIN wallet -> execute contract challenges, each approved by the user's PIN
//   in Circle's hosted UI. On-chain effects are confirmed by reading Arc directly.

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { Address } from "viem";
import { useAccount, useConnect, useDisconnect } from "wagmi";

const USERID_KEY = "longshot-circle-userid";
const APP_ID = process.env.NEXT_PUBLIC_CIRCLE_APP_ID ?? "";
const APP_ID_OK = Boolean(APP_ID) && APP_ID !== "your_circle_app_id_here";

export type WalletType = "metamask" | "circle" | null;

export interface CircleCall {
  contractAddress: string;
  abiFunctionSignature: string;
  abiParameters: (string | number)[];
}

// Minimal shape of the W3S web SDK we use (avoids a hard type dep at module scope).
interface W3SSdkLike {
  getDeviceId: () => Promise<string>;
  setAuthentication: (a: { userToken: string; encryptionKey: string }) => void;
  execute: (challengeId: string, cb: (error?: { message?: string } | null, result?: unknown) => void) => void;
}

interface WalletContextValue {
  address: Address | undefined;
  isConnected: boolean;
  walletType: WalletType;
  circleAvailable: boolean;
  connectMetaMask: () => void;
  connectCircle: () => Promise<void>;
  disconnect: () => void;
  /** Run a contract call from the Circle wallet (PIN-approved). Resolves when the challenge is approved. */
  executeCircleCall: (call: CircleCall) => Promise<void>;
  isConnecting: boolean;
  circleError: string | null;
}

const WalletContext = createContext<WalletContextValue | null>(null);

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used within WalletProvider");
  return ctx;
}

function executeChallenge(sdk: W3SSdkLike, challengeId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    sdk.execute(challengeId, (error) => {
      if (error) reject(new Error(error.message || "challenge rejected"));
      else resolve();
    });
  });
}

async function api<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = (await res.json()) as T & { error?: string };
  if (!res.ok || json.error) throw new Error(json.error || `request failed (${res.status})`);
  return json;
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const { address: wagmiAddress, isConnected: wagmiConnected } = useAccount();
  const { connect, connectors, isPending: wagmiPending } = useConnect();
  const { disconnect: wagmiDisconnect } = useDisconnect();

  const [circleAddress, setCircleAddress] = useState<Address | undefined>();
  const [circleConnecting, setCircleConnecting] = useState(false);
  const [circleError, setCircleError] = useState<string | null>(null);
  const sdkRef = useRef<W3SSdkLike | null>(null);
  const tokenRef = useRef<{ userToken: string; encryptionKey: string } | null>(null);
  const walletIdRef = useRef<string | null>(null);

  const walletType: WalletType = wagmiConnected ? "metamask" : circleAddress ? "circle" : null;
  const address = walletType === "metamask" ? wagmiAddress : circleAddress;
  const isConnected = walletType !== null;

  const initSdk = useCallback(async (userToken: string, encryptionKey: string) => {
    const mod = await import("@circle-fin/w3s-pw-web-sdk");
    const sdk = new mod.W3SSdk({ appSettings: { appId: APP_ID } }) as unknown as W3SSdkLike;
    await sdk.getDeviceId(); // establishes the iframe session — required before execute()
    sdk.setAuthentication({ userToken, encryptionKey });
    sdkRef.current = sdk;
    tokenRef.current = { userToken, encryptionKey };
    return sdk;
  }, []);

  const connectCircle = useCallback(async () => {
    setCircleConnecting(true);
    setCircleError(null);
    try {
      if (!APP_ID_OK) throw new Error("Smart wallet needs setup — add NEXT_PUBLIC_CIRCLE_APP_ID to app/.env.local.");
      if (wagmiConnected) wagmiDisconnect();

      let userId = localStorage.getItem(USERID_KEY);
      if (!userId) {
        userId = `ls_${crypto.randomUUID()}`;
        localStorage.setItem(USERID_KEY, userId);
      }

      const session = await api<{ userToken: string; encryptionKey: string }>("/api/circle/session", { userId });
      const sdk = await initSdk(session.userToken, session.encryptionKey);

      type W = { id: string; address: string };
      let { wallets } = await api<{ wallets: W[] }>("/api/circle/wallet", { action: "list", userToken: session.userToken });

      if (wallets.length === 0) {
        const { challengeId } = await api<{ challengeId: string }>("/api/circle/wallet", { action: "create", userToken: session.userToken });
        await executeChallenge(sdk, challengeId); // hosted UI: user sets a PIN + security questions; wallet is created
        // poll until the new wallet is queryable
        for (let i = 0; i < 20 && wallets.length === 0; i++) {
          await new Promise((r) => setTimeout(r, 1500));
          ({ wallets } = await api<{ wallets: W[] }>("/api/circle/wallet", { action: "list", userToken: session.userToken }));
        }
      }
      if (wallets.length === 0) throw new Error("wallet not ready yet — try connecting again in a moment");

      walletIdRef.current = wallets[0].id;
      setCircleAddress(wallets[0].address as Address);
    } catch (err) {
      console.error("Circle wallet connection failed:", err);
      setCircleError(err instanceof Error ? err.message : "Failed to connect smart wallet");
    } finally {
      setCircleConnecting(false);
    }
  }, [wagmiConnected, wagmiDisconnect, initSdk]);

  const executeCircleCall = useCallback(async (call: CircleCall) => {
    const sdk = sdkRef.current;
    const token = tokenRef.current;
    const walletId = walletIdRef.current;
    if (!sdk || !token || !walletId) throw new Error("smart wallet not ready");
    const { challengeId } = await api<{ challengeId: string }>("/api/circle/execute", {
      userToken: token.userToken,
      walletId,
      contractAddress: call.contractAddress,
      abiFunctionSignature: call.abiFunctionSignature,
      abiParameters: call.abiParameters,
    });
    if (!challengeId) throw new Error("no challenge returned");
    await executeChallenge(sdk, challengeId);
  }, []);

  const connectMetaMask = useCallback(() => {
    if (circleAddress) {
      setCircleAddress(undefined);
      sdkRef.current = null;
      tokenRef.current = null;
      walletIdRef.current = null;
    }
    const connector = connectors[0];
    if (connector) connect({ connector });
  }, [circleAddress, connect, connectors]);

  const disconnect = useCallback(() => {
    if (walletType === "metamask") {
      wagmiDisconnect();
    } else {
      setCircleAddress(undefined);
      sdkRef.current = null;
      tokenRef.current = null;
      walletIdRef.current = null;
    }
  }, [walletType, wagmiDisconnect]);

  // Restore a Circle session on reload (mint a fresh token, re-read the wallet) if a userId exists.
  useEffect(() => {
    if (!APP_ID_OK || wagmiConnected || circleAddress || sdkRef.current) return;
    const userId = typeof window !== "undefined" ? localStorage.getItem(USERID_KEY) : null;
    if (!userId) return;
    let cancelled = false;
    (async () => {
      try {
        const session = await api<{ userToken: string; encryptionKey: string }>("/api/circle/session", { userId });
        if (cancelled) return;
        await initSdk(session.userToken, session.encryptionKey);
        type W = { id: string; address: string };
        const { wallets } = await api<{ wallets: W[] }>("/api/circle/wallet", { action: "list", userToken: session.userToken });
        if (cancelled || wallets.length === 0) return;
        walletIdRef.current = wallets[0].id;
        setCircleAddress(wallets[0].address as Address);
      } catch {
        /* stay disconnected; user can reconnect */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [wagmiConnected, circleAddress, initSdk]);

  return (
    <WalletContext.Provider
      value={{
        address,
        isConnected,
        walletType,
        circleAvailable: APP_ID_OK,
        connectMetaMask,
        connectCircle,
        disconnect,
        executeCircleCall,
        isConnecting: wagmiPending || circleConnecting,
        circleError,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}
