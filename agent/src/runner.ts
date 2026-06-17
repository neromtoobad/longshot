// Pool runner (EXECUTION_PLAN Phase 4.3). Runs the predict loop for every agent in a pool ahead of
// each fixture's kickoff. Idempotent (never predict the same fixture twice per agent) and resilient
// (one agent failing doesn't stop the others). Spend is tracked cumulatively per agent across the
// pool so the budget cap holds over many fixtures.

import type { Bytes32 } from "@longshot/shared";
import type { AgentConfig } from "./template.js";
import { runPredictLoop, type PredictDeps, type PredictFixture, type PredictResult } from "./predict.js";
import type { X402Signer } from "./paying/signers.js";
import { hasPredicted as storeHasPredicted, savePrediction, savePurchases, spentByAgent, type AgentRecord } from "./store.js";

export type RunnableAgent = AgentRecord & { config: AgentConfig };

export interface RunPoolOptions {
  fixtures: PredictFixture[];
  baseUrl: string;
  /** Signer per agent — dcwSigner(walletId,address) live, or a stub in test mode. */
  signerFor: (agent: RunnableAgent) => X402Signer;
  deps?: PredictDeps;
  /** Idempotency check; defaults to the local prediction store. */
  hasPredicted?: (agentId: string, fixtureId: string) => Promise<boolean> | boolean;
  /** Record the commitment on-chain (real mode). */
  onPrediction?: (poolId: string, agent: RunnableAgent, fixtureId: string, hash: Bytes32) => Promise<void> | void;
}

export interface RunPoolReport {
  ran: number;
  skipped: number;
  failed: number;
  results: PredictResult[];
}

export async function runPool(
  poolId: string,
  agents: RunnableAgent[],
  opts: RunPoolOptions,
): Promise<RunPoolReport> {
  const hasPredicted = opts.hasPredicted ?? storeHasPredicted;
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
          createdAt: new Date().toISOString(),
        });
        savePurchases(res.purchases);
        await opts.onPrediction?.(poolId, agent, fixture.id, res.predictionHash);
        spentSoFar += res.spent;
        report.results.push(res);
        report.ran++;
      } catch (e) {
        report.failed++;
        console.error(`  ✗ agent ${agent.agentId} / fixture ${fixture.id}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }
  return report;
}
