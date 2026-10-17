// Pool runner. Runs the predict loop for every agent in a pool over a set of upcoming fixtures.
// Idempotent (never predicts the same fixture twice per agent) and resilient (one agent failing
// doesn't stop the others). Spend is tracked cumulatively per agent across the pool so the budget
// cap holds over a whole season.

import type { Bytes32 } from "@longshot/shared";
import type { AgentConfig } from "./template.js";
import { runPredictLoop, type PredictDeps, type PredictFixture, type PredictResult } from "./predict.js";
import type { X402Signer } from "./paying/signers.js";
import { hasPredicted as storeHasPredicted, savePrediction, savePurchases, spentByAgent, type AgentRecord } from "./store.js";

export type RunnableAgent = AgentRecord & { config: AgentConfig };

export interface RunPoolOptions {
  fixtures: PredictFixture[];
  baseUrl: string;
  signerFor: (agent: RunnableAgent) => X402Signer;
  deps?: PredictDeps;
  hasPredicted?: (agentId: string, fixtureId: string) => Promise<boolean> | boolean;
  /** Commit the prediction on-chain; returns the tx hash (stored on the prediction). */
  onPrediction?: (poolId: string, agent: RunnableAgent, fixtureId: string, hash: Bytes32) => Promise<string | void> | string | void;
  log?: (msg: string) => void;
}

export interface RunPoolReport {
  ran: number;
  skipped: number;
  failed: number;
  results: PredictResult[];
}

export async function runPool(poolId: string, agents: RunnableAgent[], opts: RunPoolOptions): Promise<RunPoolReport> {
  const hasPredicted = opts.hasPredicted ?? storeHasPredicted;
  const log = opts.log ?? console.log;
  const report: RunPoolReport = { ran: 0, skipped: 0, failed: 0, results: [] };

  for (const agent of agents) {
    let spentSoFar = spentByAgent(agent.agentId);
    for (const fixture of opts.fixtures) {
      if (await hasPredicted(agent.agentId, fixture.id)) {
        report.skipped++;
        continue;
      }
      try {
        const res = await runPredictLoop({
          config: agent.config,
          agentId: agent.agentId,
          fixture,
          signer: opts.signerFor(agent),
          baseUrl: opts.baseUrl,
          spentSoFar,
          deps: opts.deps,
        });
        let commitTx: string | undefined;
        try {
          commitTx = (await opts.onPrediction?.(poolId, agent, fixture.id, res.predictionHash)) || undefined;
        } catch (e) {
          log(`  ! commit failed for agent ${agent.agentId} / ${fixture.id}: ${e instanceof Error ? e.message.slice(0, 120) : e}`);
        }
        savePrediction({
          agentId: agent.agentId,
          fixtureId: fixture.id,
          poolId,
          homeScore: res.prediction.homeScore,
          awayScore: res.prediction.awayScore,
          confidence: res.prediction.confidence,
          rationale: res.prediction.rationale,
          predictionHash: res.predictionHash,
          spent: res.spent.toString(),
          decisions: res.decisions,
          commitTx,
          createdAt: new Date().toISOString(),
        });
        savePurchases(res.purchases);
        spentSoFar += res.spent;
        report.results.push(res);
        report.ran++;
        const bought = res.purchases.map((p) => p.source).join("+") || "nothing";
        log(`  ${agent.template.name}: ${fixture.home} ${res.prediction.homeScore}-${res.prediction.awayScore} ${fixture.away} (bought ${bought})`);
      } catch (e) {
        report.failed++;
        log(`  ✗ agent ${agent.agentId} / fixture ${fixture.id}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }
  return report;
}
