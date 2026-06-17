// Phase 5.3 test: points math + ROI + leaderboard ranking. Pure, no network.
// Run: pnpm score:test

import assert from "node:assert/strict";
import { scorePrediction, roi, buildScoreRows, buildLeaderboard } from "../src/scoring.js";

// points: exact=3, result=1, GD=1 (sum)
assert.equal(scorePrediction({ homeScore: 2, awayScore: 1 }, { homeScore: 2, awayScore: 1 }), 5, "exact = 5");
assert.equal(scorePrediction({ homeScore: 2, awayScore: 1 }, { homeScore: 3, awayScore: 2 }), 2, "result + GD = 2");
assert.equal(scorePrediction({ homeScore: 0, awayScore: 0 }, { homeScore: 1, awayScore: 1 }), 2, "draw result + GD = 2");
assert.equal(scorePrediction({ homeScore: 2, awayScore: 0 }, { homeScore: 0, awayScore: 2 }), 0, "wrong everything = 0");
assert.equal(scorePrediction({ homeScore: 1, awayScore: 0 }, { homeScore: 3, awayScore: 0 }), 1, "result only = 1");

// ROI
assert.equal(roi(7, 10_000n), 700, "7 pts / 0.01 USDC = 700");
assert.equal(roi(5, 0n), Number.POSITIVE_INFINITY, "free-data win = Infinity");
assert.equal(roi(0, 0n), 0, "no spend, no score = 0");

// score rows with running cumulative
const rows = buildScoreRows([
  { agentId: "1", fixtureId: "f1", pred: { homeScore: 2, awayScore: 1 }, actual: { homeScore: 2, awayScore: 1 } }, // 5
  { agentId: "1", fixtureId: "f2", pred: { homeScore: 1, awayScore: 0 }, actual: { homeScore: 3, awayScore: 0 } }, // 1 -> cum 6
  { agentId: "2", fixtureId: "f1", pred: { homeScore: 0, awayScore: 0 }, actual: { homeScore: 2, awayScore: 1 } }, // 0
  { agentId: "2", fixtureId: "f2", pred: { homeScore: 3, awayScore: 0 }, actual: { homeScore: 3, awayScore: 0 } }, // 5 -> cum 5
]);
assert.equal(rows[1].cumulative, 6, "agent 1 cumulative");
assert.equal(rows[3].cumulative, 5, "agent 2 cumulative");

// leaderboard: agent 1 (6 pts, spent 0.01) ranks above agent 2 (5 pts, spent 0); ROI sort flips it
const lb = buildLeaderboard(rows, { "1": 10_000n, "2": 0n });
assert.equal(lb[0].agentId, "1", "agent 1 leads by score");
assert.equal(lb[0].cumulativeScore, 6);
assert.equal(lb[0].roi, 600);
assert.equal(lb[1].roi, Number.POSITIVE_INFINITY, "agent 2 has infinite ROI (free data)");

const byRoi = [...lb].sort((a, b) => b.roi - a.roi);
assert.equal(byRoi[0].agentId, "2", "ROI toggle puts the free-data agent on top");

console.log("score rows:", rows.map((r) => `${r.agentId}/${r.fixtureId}=${r.points}(cum ${r.cumulative})`).join("  "));
console.log("leaderboard (by score):", lb.map((r) => `${r.agentId}:${r.cumulativeScore}pts roi=${r.roi}`).join("  "));
console.log("score:test PASS");
