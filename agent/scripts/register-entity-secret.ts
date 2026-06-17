// One-time bootstrap: register the Circle entity secret for developer-controlled wallets.
//
// The entity secret (CIRCLE_ENTITY_SECRET, 64 lowercase hex = 32 bytes) is generated locally and
// must be registered ONCE with Circle, bound to CIRCLE_API_KEY. Registration returns a recovery
// file — save it; it is required to recover wallets if the secret is lost. One entity secret per
// API key; changing it later requires rotating in the Circle Console.
//
// Run: pnpm --filter @longshot/agent circle:register   (loads ../.env)

import { registerEntitySecretCiphertext } from "@circle-fin/developer-controlled-wallets";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const RECOVERY_PATH = resolve(process.cwd(), "..", "circle-recovery.dat"); // repo root, gitignored

async function main() {
  const apiKey = process.env.CIRCLE_API_KEY;
  const entitySecret = process.env.CIRCLE_ENTITY_SECRET;

  if (!apiKey) throw new Error("CIRCLE_API_KEY is missing from .env");
  if (!entitySecret || !/^[0-9a-f]{64}$/.test(entitySecret)) {
    throw new Error("CIRCLE_ENTITY_SECRET must be 64 lowercase hex chars (32 bytes).");
  }

  const res = await registerEntitySecretCiphertext({ apiKey, entitySecret });
  const recovery = res.data?.recoveryFile;
  if (!recovery) throw new Error("Circle returned no recovery file.");

  await writeFile(RECOVERY_PATH, recovery, "utf8");
  console.log("✓ entity secret registered with Circle and bound to this API key.");
  console.log(`✓ recovery file saved to ${RECOVERY_PATH} (gitignored — keep it safe).`);
}

main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  if (/already been set/i.test(msg)) {
    console.error(
      "This API key already has a different entity secret registered. Either paste the original " +
        "secret into CIRCLE_ENTITY_SECRET, or rotate it in the Circle Console and re-run.",
    );
  } else {
    console.error("register failed:", msg);
  }
  process.exit(1);
});
