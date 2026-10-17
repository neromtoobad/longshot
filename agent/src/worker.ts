// The always-on worker. Every tick it:
//   1. syncs fixtures and results for every league from ESPN
//   2. seeds the house agents into any pool that lacks them (treasury pays their entry)
//   3. moves USDC sitting in agent wallets into Gateway; tops up house agents from the treasury
//   4. runs every agent on fixtures kicking off within the prediction window, buying evidence
//      over x402 and committing each prediction hash on-chain before kickoff
//   5. posts final scores on-chain for predicted fixtures and syncs agents' cumulative scores
//   6. reconciles recent x402 settlements against Circle's Gateway facilitator
// State lives in the shared data dir (worker.json), so a restart picks up where it left off.
//
// Run: pnpm --filter @longshot/agent worker   (needs the app serving the evidence endpoints)

import { formatUnits, parseUnits, type Address } from "viem";
import {
  COMPETITIONS,
  buildLeaderboard,
  buildScoreRows,
  fetchLeagueFixtures,
  inSeason,
  isDeployed,
  poolFor,
  type Competition,
  type Fixture,
  type ScoredEntry,
} from "@longshot/shared";
import { createAgentKey, hasAgentKey } from "@longshot/shared/server";
import { compileTemplate } from "./template.js";
import { HOUSE_AGENTS } from "./house.js";
import { agentSigner } from "./paying/signers.js";
import { runPool, type RunnableAgent } from "./runner.js";
import {
  agentsInPool,
  allAgents,
  allPredictions,
  readFixtures,
  readWorkerState,
  saveAgent,
  saveFixtures,
  writeWorkerState,
  type WorkerState,
} from "./store.js";
import { reconcileSettlements } from "./reconcile.js";
import { depositAgentToGateway, fundFromTreasury, gatewayBalance, treasuryAddress, usdcBalance } from "./wallet.js";
import {
  isJoined,
  joinPool,
  recordPredictionOnChain,
  recordScoreOnChain,
  registerAgent,
  resolveFixtureOnChain,
  resultOnChain,
  scoreOnChain,
} from "./onchain.js";

const TICK_MS = Number(process.env.WORKER_TICK_SECONDS ?? 300) * 1000;
/** Predict fixtures kicking off within this window (and at least LEAD minutes out). */
const AHEAD_HOURS = Number(process.env.PREDICT_AHEAD_HOURS ?? 30);
const LEAD_MINUTES = Number(process.env.PREDICT_LEAD_MINUTES ?? 10);
const BASE_URL = process.env.APP_BASE_URL ?? `http://127.0.0.1:${process.env.PORT ?? 3000}`;

const HOUSE_FLOAT = parseUnits(process.env.HOUSE_FLOAT_USDC ?? "0.3", 6);
const HOUSE_MIN = parseUnits("0.05", 6);
const TREASURY_RESERVE = parseUnits(process.env.TREASURY_RESERVE_USDC ?? "1", 6);
const DEPOSIT_THRESHOLD = parseUnits("0.03", 6);

function log(state: WorkerState, msg: string) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  state.log.push({ at: new Date().toISOString(), msg });
}

const errMsg = (e: unknown) => (e instanceof Error ? e.message.split("\n")[0].slice(0, 200) : String(e));

// --- 1. fixtures -------------------------------------------------------------------

async function syncFixtures(state: WorkerState) {
  const now = new Date();
  const year = now.getUTCFullYear();
  const historyDue =
    !state.lastHistorySyncAt || now.getTime() - new Date(state.lastHistorySyncAt).getTime() > 24 * 3600 * 1000;
  const years = historyDue ? [year - 1, year, year + 1] : [year, year + 1];

  const existing = readFixtures();
  const byId = new Map(existing.map((f) => [f.id, f]));
  let fetched = 0;
  for (const c of COMPETITIONS) {
    const pool = poolFor(c.key);
    try {
      const list = await fetchLeagueFixtures({ competition: c, poolId: pool ? String(pool.poolId) : "", years });
      for (const f of list) byId.set(f.id, f);
      fetched += list.length;
    } catch (e) {
      log(state, `fixtures ${c.short}: ${errMsg(e)}`);
    }
  }
  saveFixtures([...byId.values()].sort((a, b) => a.kickoff.localeCompare(b.kickoff)));
  state.lastSyncAt = now.toISOString();
  if (historyDue) state.lastHistorySyncAt = now.toISOString();
  return fetched;
}

// --- 2. house agents ----------------------------------------------------------------

async function seedHouse(state: WorkerState) {
  for (const c of COMPETITIONS) {
    const pool = poolFor(c.key);
    if (!pool) continue;
    const poolId = String(pool.poolId);
    for (const h of HOUSE_AGENTS) {
      const agentId = `house-${c.key}-${h.slug}`;
      let rec = allAgents().find((a) => a.agentId === agentId);
      if (!rec) {
        rec = {
          agentId,
          owner: treasuryAddress(),
          poolId,
          walletAddress: createAgentKey(),
          template: h.template,
          house: true,
          avatar: { style: h.avatar.style, seed: `${h.avatar.seed}-${c.key}` },
          createdAt: new Date().toISOString(),
        };
        saveAgent(rec);
      }
      try {
        if (!rec.onChainAgentId) {
          const { templateHash } = compileTemplate(rec.template);
          const { agentId: onChain } = await registerAgent(`${h.template.name} (${c.short})`, templateHash, rec.walletAddress as Address);
          rec = { ...rec, onChainAgentId: onChain.toString() };
          saveAgent(rec);
          log(state, `registered ${h.template.name} for ${c.short} as agent #${onChain}`);
        }
        if (!(await isJoined(BigInt(poolId), BigInt(rec.onChainAgentId!)))) {
          const fee = BigInt(pool.entryFeeUSDC);
          const bal = await usdcBalance(treasuryAddress());
          if (bal < fee + TREASURY_RESERVE / 2n) {
            log(state, `treasury low (${formatUnits(bal, 6)} USDC): ${h.template.name} not entered in ${c.short} yet`);
            continue;
          }
          await joinPool(BigInt(poolId), BigInt(rec.onChainAgentId!), fee);
          log(state, `entered ${h.template.name} in ${c.short} (${formatUnits(fee, 6)} USDC)`);
        }
      } catch (e) {
        log(state, `house ${agentId}: ${errMsg(e)}`);
      }
    }
  }
}

// --- 3. funding ---------------------------------------------------------------------

async function fundAgents(state: WorkerState) {
  for (const a of allAgents()) {
    if (!a.walletAddress || !hasAgentKey(a.walletAddress)) continue;
    const addr = a.walletAddress as Address;
    try {
      // House agents that buy data are topped up from the treasury when their float runs low.
      if (a.house && BigInt(a.template.budget) > 0n) {
        const [gw, wallet] = await Promise.all([gatewayBalance(addr), usdcBalance(addr)]);
        if (gw < HOUSE_MIN && wallet < DEPOSIT_THRESHOLD) {
          const treasury = await usdcBalance(treasuryAddress());
          if (treasury > HOUSE_FLOAT + TREASURY_RESERVE) {
            await fundFromTreasury(addr, HOUSE_FLOAT);
            log(state, `topped up ${a.template.name} (${a.agentId}) with ${formatUnits(HOUSE_FLOAT, 6)} USDC`);
          }
        }
      }
      if ((await usdcBalance(addr)) > DEPOSIT_THRESHOLD) {
        const { amount } = await depositAgentToGateway(addr);
        if (amount > 0n) log(state, `${a.template.name} (${a.agentId}) deposited ${formatUnits(amount, 6)} USDC into Gateway`);
      }
    } catch (e) {
      log(state, `funding ${a.agentId}: ${errMsg(e)}`);
    }
  }
}

// --- 4. predictions -----------------------------------------------------------------

function dueFixtures(c: Competition, fixtures: Fixture[], nowMs: number): Fixture[] {
  return fixtures.filter((f) => {
    if (f.competition !== c.key || f.status !== "scheduled" || f.postponed) return false;
    if (!inSeason(c, f.kickoff)) return false;
    const t = new Date(f.kickoff).getTime();
    return t > nowMs + LEAD_MINUTES * 60_000 && t < nowMs + AHEAD_HOURS * 3600_000;
  });
}

async function predict(state: WorkerState) {
  const fixtures = readFixtures();
  const now = Date.now();
  for (const c of COMPETITIONS) {
    const pool = poolFor(c.key);
    if (!pool) continue;
    const poolId = String(pool.poolId);
    const due = dueFixtures(c, fixtures, now);
    if (!due.length) continue;
    const agents = agentsInPool(poolId).filter(
      (a) => a.onChainAgentId && a.walletAddress && hasAgentKey(a.walletAddress),
    ) as RunnableAgent[];
    // Only agents actually entered in the pool on-chain can commit predictions.
    const entered: RunnableAgent[] = [];
    for (const a of agents) {
      try {
        if (await isJoined(BigInt(poolId), BigInt(a.onChainAgentId!))) entered.push(a);
      } catch {
        /* RPC blip: try next tick */
      }
    }
    if (!entered.length) continue;
    const report = await runPool(poolId, entered, {
      fixtures: due.map((f) => ({ id: f.id, home: f.home, away: f.away, competition: c.name, kickoff: f.kickoff })),
      baseUrl: BASE_URL,
      signerFor: (a) => agentSigner(a.walletAddress),
      onPrediction: (pid, agent, fixtureId, hash) =>
        recordPredictionOnChain(BigInt(pid), BigInt(agent.onChainAgentId!), BigInt(fixtureId), hash),
      log: (m) => log(state, `${c.short} ${m.trim()}`),
    });
    if (report.ran || report.failed) {
      log(state, `${c.short}: ${report.ran} predictions, ${report.failed} failed, ${due.length} fixtures due`);
    }
  }
}

// --- 5. results + scores -------------------------------------------------------------

async function resolveAndScore(state: WorkerState) {
  const fixtures = new Map(readFixtures().map((f) => [f.id, f]));
  const predictions = allPredictions();
  for (const c of COMPETITIONS) {
    const pool = poolFor(c.key);
    if (!pool) continue;
    const poolId = String(pool.poolId);
    const preds = predictions.filter((p) => p.poolId === poolId && p.commitTx);
    const predictedIds = new Set(preds.map((p) => p.fixtureId));
    let changed = false;

    for (const id of predictedIds) {
      const f = fixtures.get(id);
      const key = `${poolId}:${id}`;
      if (!f || f.status !== "final" || f.homeScore === null || f.awayScore === null || state.resolved[key]) continue;
      try {
        const onChain = await resultOnChain(BigInt(poolId), BigInt(id));
        if (!onChain.resolved) {
          await resolveFixtureOnChain(BigInt(poolId), BigInt(id), f.homeScore, f.awayScore);
          log(state, `${c.short} result on-chain: ${f.home} ${f.homeScore}-${f.awayScore} ${f.away}`);
        }
        state.resolved[key] = true;
        changed = true;
      } catch (e) {
        log(state, `resolve ${key}: ${errMsg(e)}`);
      }
    }

    if (!changed && state.scoredAt[poolId]) continue;
    // Cumulative points per agent from on-chain-committed predictions on resolved fixtures.
    const entries: ScoredEntry[] = [];
    for (const p of preds) {
      const f = fixtures.get(p.fixtureId);
      if (!f || !state.resolved[`${poolId}:${p.fixtureId}`]) continue;
      entries.push({
        agentId: p.agentId,
        fixtureId: p.fixtureId,
        pred: { homeScore: p.homeScore, awayScore: p.awayScore },
        actual: { homeScore: f.homeScore!, awayScore: f.awayScore! },
      });
    }
    const board = buildLeaderboard(buildScoreRows(entries), {});
    for (const row of board) {
      const agent = allAgents().find((a) => a.agentId === row.agentId);
      if (!agent?.onChainAgentId) continue;
      try {
        const current = await scoreOnChain(BigInt(poolId), BigInt(agent.onChainAgentId));
        if (current !== BigInt(row.cumulativeScore)) {
          await recordScoreOnChain(BigInt(poolId), BigInt(agent.onChainAgentId), BigInt(row.cumulativeScore));
        }
      } catch (e) {
        log(state, `score ${agent.agentId}: ${errMsg(e)}`);
      }
    }
    state.scoredAt[poolId] = new Date().toISOString();
  }
}

// --- loop ----------------------------------------------------------------------------

async function waitForApp() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`${BASE_URL}/api/broker/catalog`);
      if (r.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  console.warn(`app at ${BASE_URL} did not answer; continuing anyway`);
}

async function step(state: WorkerState, name: string, fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch (e) {
    state.lastError = `${name}: ${errMsg(e)}`;
    log(state, `✗ ${state.lastError}`);
  }
  writeWorkerState(state);
}

export async function tick() {
  const state = readWorkerState();
  await step(state, "fixtures", async () => {
    const n = await syncFixtures(state);
    if (!state.lastTickAt) log(state, `synced ${n} fixtures across ${COMPETITIONS.length} leagues`);
  });
  if (!isDeployed()) {
    log(state, "contracts not deployed yet (shared/src/addresses.json); only syncing fixtures");
  } else if (!process.env.DEPLOYER_PRIVATE_KEY || !process.env.LONGSHOT_WALLET_SECRET) {
    log(state, "DEPLOYER_PRIVATE_KEY / LONGSHOT_WALLET_SECRET missing; only syncing fixtures");
  } else {
    await step(state, "house", () => seedHouse(state));
    await step(state, "funding", () => fundAgents(state));
    await step(state, "predict", () => predict(state));
    await step(state, "resolve", () => resolveAndScore(state));
  }
  await step(state, "reconcile", () => reconcileSettlements());
  state.lastTickAt = new Date().toISOString();
  writeWorkerState(state);
}

async function main() {
  const once = process.argv.includes("--once");
  await waitForApp();
  console.log(`longshot worker: tick every ${TICK_MS / 1000}s, predicting ${AHEAD_HOURS}h ahead, app ${BASE_URL}`);
  for (;;) {
    const started = Date.now();
    await tick();
    if (once) break;
    await new Promise((r) => setTimeout(r, Math.max(10_000, TICK_MS - (Date.now() - started))));
  }
}

const isMain = process.argv[1] && /worker\.(ts|js)$/.test(process.argv[1]);
if (isMain) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
