// Server-only helpers (node:fs, node:crypto). Import from "@longshot/shared/server", never from
// client components.
//
// Agent wallets are plain EOAs whose private keys live in the shared data dir, encrypted at rest
// with AES-256-GCM under LONGSHOT_WALLET_SECRET. Testnet only. The app creates a key when a user
// builds an agent; the worker loads it to sign x402 authorizations and Gateway deposits.

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import type { Address } from "./types.js";

let cachedDir: string | null = null;

/**
 * The writable data dir shared by the app and the worker: $LONGSHOT_DATA_DIR, else <repo>/.data
 * (the repo root is found by walking up to pnpm-workspace.yaml, so app/ and agent/ agree).
 */
export function dataDir(): string {
  if (cachedDir) return cachedDir;
  if (process.env.LONGSHOT_DATA_DIR) return (cachedDir = resolve(process.cwd(), process.env.LONGSHOT_DATA_DIR));
  let dir = process.cwd();
  while (!existsSync(resolve(dir, "pnpm-workspace.yaml")) && dirname(dir) !== dir) dir = dirname(dir);
  const root = existsSync(resolve(dir, "pnpm-workspace.yaml")) ? dir : process.cwd();
  return (cachedDir = resolve(root, ".data"));
}

export function readJsonFile<T>(file: string, fallback: T): T {
  const path = resolve(dataDir(), file);
  if (!existsSync(/*turbopackIgnore: true*/ path)) return fallback;
  try {
    return JSON.parse(readFileSync(/*turbopackIgnore: true*/ path, "utf-8")) as T;
  } catch {
    return fallback;
  }
}

/** Atomic write (tmp file + rename) so a reader never sees a half-written file. */
export function writeJsonFile(file: string, value: unknown): void {
  const dir = dataDir();
  if (!existsSync(/*turbopackIgnore: true*/ dir)) mkdirSync(/*turbopackIgnore: true*/ dir, { recursive: true });
  const path = resolve(dir, file);
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(/*turbopackIgnore: true*/ tmp, JSON.stringify(value, null, 2));
  renameSync(/*turbopackIgnore: true*/ tmp, path);
}

// --- keystore ---------------------------------------------------------------

interface KeyEntry {
  address: Address;
  /** base64(iv | tag | ciphertext) */
  enc: string;
  createdAt: string;
}

const KEYSTORE = "keys.json";

function secretKey(): Buffer {
  const secret = process.env.LONGSHOT_WALLET_SECRET;
  if (!secret) throw new Error("LONGSHOT_WALLET_SECRET is not set");
  return createHash("sha256").update(secret).digest();
}

function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", secretKey(), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ct]).toString("base64");
}

function decrypt(enc: string): string {
  const buf = Buffer.from(enc, "base64");
  const decipher = createDecipheriv("aes-256-gcm", secretKey(), buf.subarray(0, 12));
  decipher.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString("utf8");
}

/** Create and store a fresh agent wallet. Returns its address. */
export function createAgentKey(): Address {
  const pk = generatePrivateKey();
  const address = privateKeyToAccount(pk).address;
  const keys = readJsonFile<KeyEntry[]>(KEYSTORE, []);
  keys.push({ address, enc: encrypt(pk), createdAt: new Date().toISOString() });
  writeJsonFile(KEYSTORE, keys);
  return address;
}

/** Load the private key for an agent wallet address. Throws if unknown. */
export function loadAgentKey(address: string): `0x${string}` {
  const entry = readJsonFile<KeyEntry[]>(KEYSTORE, []).find(
    (k) => k.address.toLowerCase() === address.toLowerCase(),
  );
  if (!entry) throw new Error(`no key for agent wallet ${address}`);
  return decrypt(entry.enc) as `0x${string}`;
}

export function hasAgentKey(address: string): boolean {
  return readJsonFile<KeyEntry[]>(KEYSTORE, []).some(
    (k) => k.address.toLowerCase() === address.toLowerCase(),
  );
}
