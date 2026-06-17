// x402 signers. The paying client builds an EIP-712 TransferWithAuthorization and hands it to a
// signer. Two implementations: a raw private key (viem) and a Circle DCW wallet (signTypedData via
// the SDK — no raw key). Agents use the DCW signer; the raw-key signer is for tooling/tests.

import { privateKeyToAccount } from "viem/accounts";
import type { Address, TypedDataDomain } from "viem";
import { circleClient } from "../circle/client.js";

export interface TypedData {
  domain: TypedDataDomain;
  types: Record<string, { name: string; type: string }[]>;
  primaryType: string;
  message: Record<string, unknown>;
}

export interface X402Signer {
  address: Address;
  signTypedData(typed: TypedData): Promise<`0x${string}`>;
}

export function rawKeySigner(privateKey: string): X402Signer {
  const account = privateKeyToAccount(
    (privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`) as `0x${string}`,
  );
  return {
    address: account.address,
    signTypedData: (typed) =>
      account.signTypedData(typed as Parameters<typeof account.signTypedData>[0]),
  };
}

const EIP712_DOMAIN_TYPE = [
  { name: "name", type: "string" },
  { name: "version", type: "string" },
  { name: "chainId", type: "uint256" },
  { name: "verifyingContract", type: "address" },
];

function serializeBigInts(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(serializeBigInts);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, serializeBigInts(v)]));
  }
  return value;
}

/** Sign x402 authorizations with a Circle Developer-Controlled Wallet (custodial, no raw key). */
export function dcwSigner(walletId: string, address: Address): X402Signer {
  return {
    address,
    async signTypedData(typed) {
      const data = JSON.stringify({
        types: { EIP712Domain: EIP712_DOMAIN_TYPE, ...typed.types },
        domain: typed.domain,
        primaryType: typed.primaryType,
        message: serializeBigInts(typed.message),
      });
      const res = await circleClient().signTypedData({ walletId, data });
      const signature = res.data?.signature;
      if (!signature) throw new Error("Circle signTypedData returned no signature");
      return signature as `0x${string}`;
    },
  };
}
