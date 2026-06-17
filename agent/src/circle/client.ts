import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";

let cached: ReturnType<typeof initiateDeveloperControlledWalletsClient> | null = null;

/**
 * The Circle Developer-Controlled Wallets client, built from CIRCLE_API_KEY + the registered
 * CIRCLE_ENTITY_SECRET. The SDK encrypts the entity secret per request; register it once with
 * `pnpm --filter @longshot/agent circle:register` before using this.
 */
export function circleClient() {
  if (cached) return cached;
  const apiKey = process.env.CIRCLE_API_KEY;
  const entitySecret = process.env.CIRCLE_ENTITY_SECRET;
  if (!apiKey || !entitySecret) {
    throw new Error("CIRCLE_API_KEY and CIRCLE_ENTITY_SECRET must be set (see .env).");
  }
  cached = initiateDeveloperControlledWalletsClient({ apiKey, entitySecret });
  return cached;
}
