// Fixture store for the app (file-backed JSON in the runtime data dir). Written by fixtures:sync,
// read by the pool page (Phase 6). Shares LONGSHOT_DATA_DIR with the agent runtime.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Fixture } from "@longshot/shared";

const DATA_DIR = resolve(process.cwd(), process.env.LONGSHOT_DATA_DIR ?? ".data");
const FIXTURES = resolve(DATA_DIR, "fixtures.json");

export function saveFixtures(fixtures: Fixture[]): void {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(FIXTURES, JSON.stringify(fixtures, null, 2));
}

export function allFixtures(): Fixture[] {
  if (!existsSync(FIXTURES)) return [];
  return JSON.parse(readFileSync(FIXTURES, "utf-8")) as Fixture[];
}

export function upcomingFixtures(limit = 5, nowMs: number = Date.now()): Fixture[] {
  return allFixtures()
    .filter((f) => f.status === "scheduled" && new Date(f.kickoff).getTime() > nowMs)
    .sort((a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime())
    .slice(0, limit);
}
