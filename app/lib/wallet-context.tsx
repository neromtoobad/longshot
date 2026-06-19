"use client";

// Unified wallet layer over three connect options:
//   • Circle User-Controlled Wallet — PIN (createUserPinWithWallets + hosted PIN UI)
//   • Circle User-Controlled Wallet — Google sign-in (OAuth via the W3S SDK), PIN set once for signing
//   • wagmi / MetaMask EOA
// One useWallet() hook drives the topbar connect and the build flow. Wallet creation and contract
// execution (register/approve/join) run through Circle challenges; on-chain effects are confirmed by
// reading Arc directly. Method signatures verified against @circle-fin/user-controlled-wallets v10.6
// and @circle-fin/w3s-pw-web-sdk v1.1.

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { Address } from "viem";
import { useAccount, useConnect, useDisconnect } from "wagmi";

const USERID_KEY = "longshot-circle-userid";
const SOCIAL_KEY = "longshot-circle-social"; // survives the OAuth redirect
const APP_ID = process.env.NEXT_PUBLIC_CIRCLE_APP_ID ?? "";
const APP_ID_OK = Boolean(APP_ID) && APP_ID !== "your_circle_app_id_here";
const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_CIRCLE_GOOGLE_CLIENT_ID ?? "";
const GOOGLE_OK = APP_ID_OK && Boolean(GOOGLE_CLIENT_ID) && GOOGLE_CLIENT_ID !== "your_google_client_id_here";

export type WalletType = "metamask" | "circle" | null;

export interface CircleCall {
  contractAddress: string;
  abiFunctionSignature: string;
  abiParameters: (string | number)[];
}

interface SocialResult {
  userToken: string;
  encryptionKey: string;
}
interface W3SSdkLike {
  getDeviceId: () => Promise<string>;
  setAuthentication: (a: { userToken: string; encryptionKey: string }) => void;
  execute: (challengeId: string, cb: (error?: { message?: string } | null, result?: unknown) => void) => void;
  performLogin: (provider: string) => Promise<void>;
}

interface WalletContextValue {
  address: Address | undefined;
  isConnected: boolean;
  walletType: WalletType;
  circleAvailable: boolean;
  socialAvailable: boolean;
  connectMetaMask: () => void;
  connectCircle: () => Promise<void>;
  connectGoogle: () => Promise<void>;
  disconnect: () => void;
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

  // Once authenticated (PIN or social), set the SDK auth, ensure a wallet exists, and read its address.
  const finishWallet = useCallback(async (sdk: W3SSdkLike, userToken: string, encryptionKey: string, opts?: { create?: boolean }) => {
    sdk.setAuthentication({ userToken, encryptionKey });
    tokenRef.current = { userToken, encryptionKey };

    type W = { id: string; address: string };
    let { wallets } = await api<{ wallets: W[] }>("/api/circle/wallet", { action: "list", userToken });
    if (wallets.length === 0) {
      if (opts?.create === false) return; // session restore: never auto-open the PIN/create UI
      const { challengeId } = await api<{ challengeId: string }>("/api/circle/wallet", { action: "create", userToken });
      await executeChallenge(sdk, challengeId); // hosted UI: set a PIN + security questions; wallet is created
      for (let i = 0; i < 20 && wallets.length === 0; i++) {
        await new Promise((r) => setTimeout(r, 1500));
        ({ wallets } = await api<{ wallets: W[] }>("/api/circle/wallet", { action: "list", userToken }));
      }
    }
    if (wallets.length === 0) throw new Error("wallet not ready yet — try again in a moment");
    walletIdRef.current = wallets[0].id;
    setCircleAddress(wallets[0].address as Address);
  }, []);

  const loadSdk = useCallback(async (configs: Record<string, unknown>, onLogin?: (e: unknown, r?: SocialResult) => void) => {
    const mod = await import("@circle-fin/w3s-pw-web-sdk");
    const sdk = (onLogin
      ? new mod.W3SSdk(configs as never, onLogin as never)
      : new mod.W3SSdk(configs as never)) as unknown as W3SSdkLike;
    sdkRef.current = sdk;
    return { mod, sdk };
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
      const { sdk } = await loadSdk({ appSettings: { appId: APP_ID } });
      await sdk.getDeviceId();
      await finishWallet(sdk, session.userToken, session.encryptionKey);
    } catch (err) {
      console.error("Circle PIN connect failed:", err);
      setCircleError(err instanceof Error ? err.message : "Failed to connect smart wallet");
    } finally {
      setCircleConnecting(false);
    }
  }, [wagmiConnected, wagmiDisconnect, loadSdk, finishWallet]);

  // Fires after the Google OAuth redirect returns. Stored device tokens were used to init the SDK.
  const onSocialLogin = useCallback(
    (error: unknown, result?: SocialResult) => {
      sessionStorage.removeItem(SOCIAL_KEY);
      if (error || !result?.userToken) {
        setCircleError(error instanceof Error ? error.message : "Google sign-in failed");
        setCircleConnecting(false);
        return;
      }
      const sdk = sdkRef.current;
      if (!sdk) return;
      finishWallet(sdk, result.userToken, result.encryptionKey)
        .catch((e) => setCircleError(e instanceof Error ? e.message : "wallet setup failed"))
        .finally(() => setCircleConnecting(false));
    },
    [finishWallet],
  );

  const connectGoogle = useCallback(async () => {
    setCircleConnecting(true);
    setCircleError(null);
    try {
      if (!GOOGLE_OK) throw new Error("Google sign-in needs setup — add NEXT_PUBLIC_CIRCLE_GOOGLE_CLIENT_ID and configure it in the Circle Console.");
      if (wagmiConnected) wagmiDisconnect();

      // 1) a basic SDK gives us a deviceId; 2) exchange it for a device token; 3) re-init with the
      // Google login config + callback; 4) performLogin redirects to Google and back to onLoginComplete.
      const { sdk: probe } = await loadSdk({ appSettings: { appId: APP_ID } });
      const deviceId = await probe.getDeviceId();
      const dt = await api<{ deviceToken: string; deviceEncryptionKey: string }>("/api/circle/device-token", { deviceId });
      sessionStorage.setItem(SOCIAL_KEY, JSON.stringify(dt));

      const { sdk } = await loadSdk(
        {
          appSettings: { appId: APP_ID },
          loginConfigs: { deviceToken: dt.deviceToken, deviceEncryptionKey: dt.deviceEncryptionKey, google: { clientId: GOOGLE_CLIENT_ID, redirectUri: window.location.origin, selectAccountPrompt: true } },
        },
        onSocialLogin,
      );
      await sdk.performLogin("Google"); // SocialLoginProvider.GOOGLE; full-page redirect, resumes via onSocialLogin
    } catch (err) {
      console.error("Circle Google connect failed:", err);
      setCircleError(err instanceof Error ? err.message : "Failed to start Google sign-in");
      setCircleConnecting(false);
    }
  }, [wagmiConnected, wagmiDisconnect, loadSdk, onSocialLogin]);

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

  const clearCircle = () => {
    setCircleAddress(undefined);
    sdkRef.current = null;
    tokenRef.current = null;
    walletIdRef.current = null;
  };

  const connectMetaMask = useCallback(() => {
    if (circleAddress) clearCircle();
    const connector = connectors[0];
    if (connector) connect({ connector });
  }, [circleAddress, connect, connectors]);

  const disconnect = useCallback(() => {
    if (walletType === "metamask") wagmiDisconnect();
    else clearCircle();
  }, [walletType, wagmiDisconnect]);

  // On mount: finish a Google redirect if one is pending, else restore a PIN session.
  useEffect(() => {
    if (wagmiConnected || circleAddress || sdkRef.current) return;
    const social = typeof window !== "undefined" ? sessionStorage.getItem(SOCIAL_KEY) : null;
    if (social && GOOGLE_OK) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCircleConnecting(true);
      const dt = JSON.parse(social) as { deviceToken: string; deviceEncryptionKey: string };
      loadSdk(
        {
          appSettings: { appId: APP_ID },
          loginConfigs: { deviceToken: dt.deviceToken, deviceEncryptionKey: dt.deviceEncryptionKey, google: { clientId: GOOGLE_CLIENT_ID, redirectUri: window.location.origin } },
        },
        onSocialLogin,
      ).catch(() => setCircleConnecting(false));
      return;
    }
    if (!APP_ID_OK) return;
    const userId = typeof window !== "undefined" ? localStorage.getItem(USERID_KEY) : null;
    if (!userId) return;
    let cancelled = false;
    (async () => {
      try {
        const session = await api<{ userToken: string; encryptionKey: string }>("/api/circle/session", { userId });
        if (cancelled) return;
        const { sdk } = await loadSdk({ appSettings: { appId: APP_ID } });
        await sdk.getDeviceId();
        await finishWallet(sdk, session.userToken, session.encryptionKey, { create: false });
      } catch {
        /* stay disconnected; user can reconnect */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [wagmiConnected, circleAddress, loadSdk, finishWallet, onSocialLogin]);

  return (
    <WalletContext.Provider
      value={{
        address,
        isConnected,
        walletType,
        circleAvailable: APP_ID_OK,
        socialAvailable: GOOGLE_OK,
        connectMetaMask,
        connectCircle,
        connectGoogle,
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
