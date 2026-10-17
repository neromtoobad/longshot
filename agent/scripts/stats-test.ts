// The statistical model reacts to the evidence it is given. Offline, deterministic.
// Run: pnpm --filter @longshot/agent stats:test

import assert from "node:assert/strict";
import { statsPredict } from "../src/model/stats.ts";

const none = statsPredict({ home: "Everton", away: "Chelsea", evidence: {}, riskAppetite: "medium" });
assert.ok(none.homeScore >= none.awayScore, "with no data it leans on home advantage");

// Market makes the away side clear favourites: the prediction should follow it.
const odds = {
  impliedProbabilities: { home: 0.25, draw: 0.25, away: 0.5 },
  totals: { line: 2.5, overProbability: 0.6 },
};
const withOdds = statsPredict({ home: "Everton", away: "Chelsea", evidence: { odds }, riskAppetite: "low" });
assert.ok(withOdds.awayScore > withOdds.homeScore, `odds favour the away side: got ${withOdds.homeScore}-${withOdds.awayScore}`);

// Strong home form + weak away form pushes the home side.
const form = {
  home: { played: 5, goalsFor: 13, goalsAgainst: 3 },
  away: { played: 5, goalsFor: 3, goalsAgainst: 11 },
};
const withForm = statsPredict({ home: "A", away: "B", evidence: { form }, riskAppetite: "medium" });
assert.ok(withForm.homeScore > withForm.awayScore, "form favours home");

for (const [label, p] of Object.entries({ none, withOdds, withForm })) {
  console.log(`${label.padEnd(9)} ${p.homeScore}-${p.awayScore} (${p.confidence}) ${p.rationale}`);
}
console.log("stats:test PASS");
