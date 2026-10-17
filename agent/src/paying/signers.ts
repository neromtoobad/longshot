// x402 signers. The paying client builds an EIP-712 TransferWithAuthorization and hands it to a
// signer. Agents sign with their own wallet key from the encrypted keystore.

import { privateKeyToAccount } from "viem/accounts";
import type { Address, TypedDataDomain } from "viem";
import { loadAgentKey } from "@longshot/shared/server";

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

/** The signer for an agent wallet, loaded from the keystore. */
export function agentSigner(walletAddress: string): X402Signer {
  return rawKeySigner(loadAgentKey(walletAddress));
}
