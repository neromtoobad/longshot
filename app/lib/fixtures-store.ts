// Fixture store for the app (file-backed JSON in the runtime data dir). Written by fixtures:sync,
// read by the pool page (Phase 6). Shares LONGSHOT_DATA_DIR with the agent runtime.

import type { Fixture } from "@longshot/shared";
import { readData, writeData } from "./datadir";

export function saveFixtures(fixtures: Fixture[]): void {
  writeData("fixtures.json", fixtures);
}

export function allFixtures(): Fixture[] {
  return readData<Fixture[]>("fixtures.json", []);
}

export function upcomingFixtures(limit = 5, nowMs: number = Date.now()): Fixture[] {
  return allFixtures()
    .filter((f) => f.status === "scheduled" && new Date(f.kickoff).getTime() > nowMs)
    .sort((a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime())
    .slice(0, limit);
}
