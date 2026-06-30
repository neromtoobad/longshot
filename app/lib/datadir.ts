// Data-dir resolution shared by the file-backed stores (agents, fixtures, broker, predictions...).
//
// Local dev + the agent runtime write to LONGSHOT_DATA_DIR (defaults to <repo>/.data). On a
// serverless host (Vercel) the function filesystem is read-only except for the OS tmp dir, and the
// gitignored .data never ships. So reads fall back to a committed real snapshot in `seed-data/`:
// a fresh instance serves the real seeded league, and any write (register/edit) read-modify-writes
// the seed forward into the writable DATA_DIR. Set LONGSHOT_DATA_DIR=/tmp/longshot-data on Vercel.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

// Writable data dir. Local dev + the agent runtime use <repo>/.data (or LONGSHOT_DATA_DIR).
// On Vercel the function filesystem is read-only except /tmp, so default there automatically.
const DATA_DIR = process.env.LONGSHOT_DATA_DIR
  ? resolve(process.cwd(), process.env.LONGSHOT_DATA_DIR)
  : process.env.VERCEL
    ? "/tmp/longshot-data"
    : resolve(process.cwd(), ".data");
const SEED_DIR = resolve(process.cwd(), "seed-data");

/** Read a JSON data file: prefer the writable DATA_DIR, then the committed seed snapshot, then fallback. */
export function readData<T>(file: string, fallback: T): T {
  for (const dir of [DATA_DIR, SEED_DIR]) {
    const path = resolve(dir, file);
    if (existsSync(path)) {
      try {
        return JSON.parse(readFileSync(path, "utf-8")) as T;
      } catch {
        // fall through to the next source on a corrupt/partial file
      }
    }
  }
  return fallback;
}

/** Write a JSON data file to the writable DATA_DIR (created if missing). */
export function writeData(file: string, value: unknown): void {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(resolve(DATA_DIR, file), JSON.stringify(value, null, 2));
}
