# LONGSHOT — Claude Code project context

## What this is
A season-long prediction-agent league on Arc testnet across four competitions: Premier League,
Champions League, La Liga, Serie A (one on-chain Pool per league). Users build an agent, enter it
(USDC entry into the Pool escrow), and fund its own wallet. The worker runs every agent before each
kickoff: it buys evidence (odds, form, table, h2h) over x402 + Circle Gateway at sub-cent prices,
predicts the exact score (OpenAI-compatible LLM, or the built-in Poisson model), commits the hash
on-chain, then resolves and scores after full time. Top three per pool split the pot at season end.

Originally a Lepton Agents Hackathon entry (World Cup 2026); rebuilt in Oct 2026 for personal use.

## Layout
- `shared/` types, `leagues.ts` (competitions + season windows), `fixtures.ts` (ESPN ingestion),
  scoring, template compiler, `addresses.json` (deployed contracts + pool ids), `server.ts`
  (server-only: data dir, atomic JSON store, encrypted agent keystore).
- `agent/` `worker.ts` (the loop), `predict.ts` (buy-or-skip under budget), `model/` (llm, stats),
  `wallet.ts` (treasury, Gateway deposits, budget cap), `onchain.ts`, `house.ts`, `scripts/deploy.ts`.
- `app/` Next.js 16. `lib/evidence.ts` builds real ESPN evidence; `/api/evidence/[source]` and
  `/api/broker/evidence/[source]` are x402-gated; `/api/wallets` makes agent keys; `/api/agents`
  saves agents after verifying the on-chain registration.
- `contracts/` Foundry: AgentRegistry, Pool (ReputationBond is legacy, not deployed).

## Hard rules
- USDC is 6 decimals on the ERC-20 interface. Never floats for money in storage.
- Every evidence endpoint stays behind x402. No free data path; an empty answer is a free 404.
- Never let an agent spend past its budget cap (checkBudget before signing).
- Never block a prediction on Gateway settlement; the settlement UUID is the receipt.
- Arc drops txs under ~20 gwei: writes pin a fee floor. Treasury writes go through one queue.
- Arc endpoints moved to arc.io: RPC https://rpc.testnet.arc.io, explorer https://explorer.testnet.arc.io.
- ESPN rejects `dates=START-END` ranges now; pull whole years (`dates=2026&limit=1000`) or months.
- Never commit `.env` or the data dir (it holds encrypted agent keys).

## Deploy
Railway service `longshot`, one volume at `/data` (`LONGSHOT_DATA_DIR=/data`), `node scripts/start.mjs`
runs the app and the worker together. Domain longshot-league.up.railway.app.

## Voice
Code comments: direct, plain. Social copy: lowercase, short sentences, no em dashes, "➠" for lists.
