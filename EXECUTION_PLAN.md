# EXECUTION_PLAN — LONGSHOT, prompt by prompt

Each prompt below is written in full and labeled by phase and step. Paste them into Claude
Code one at a time, in order. Do not skip the gate notes between phases. CLAUDE.md and
BUILD_GUIDE.md should be in the repo root so Claude Code has the full context.

Rule for the whole build: whenever a prompt touches Circle payments or Arc, Claude Code must
read the real reference repo or docs first and use the actual SDK signatures. It must never
invent API method names. The Arc + Circle docs and the five sample codebases are available
locally after `arc-canteen context sync` — pipe them in with `arc-canteen context | claude`
rather than guessing.

---

## PHASE 1 — Scaffold + Arc connection

### Prompt 1.1 — Monorepo scaffold
```
Read CLAUDE.md and BUILD_GUIDE.md in the repo root first. Then scaffold a monorepo for
LONGSHOT with this structure:

/app        Next.js 14 app (frontend + API routes), TypeScript, Tailwind
/contracts  Foundry project for the Arc Solidity contracts
/agent      TypeScript agent runtime (template compiler, predict loop, runner)
/shared     shared types and the data model from BUILD_GUIDE section 4

Set up: TypeScript strict everywhere, a root package.json with workspaces, eslint + prettier,
a single .env.example covering CIRCLE_API_KEY, CIRCLE_ENTITY_SECRET, MODEL_PROVIDER_KEY,
ESPN_API_KEY, DEPLOYER_PRIVATE_KEY. The Arc RPC is supplied at runtime as process.env.RPC by the
arc-canteen CLI, so do not add an RPC URL to .env; just read process.env.RPC. Gitignore .env. Add a
README with the one-line pitch from CLAUDE.md. Do not write any feature logic yet. Confirm the
workspace builds.
```

### Prompt 1.2 — Arc connection smoke test
```
The Arc testnet RPC is provided by the Canteen arc-canteen CLI as process.env.RPC (set via
`arc-canteen rpc-url --export` and `arc-canteen shell-init`). The proxy enforces a JSON-RPC
method allowlist, so stick to standard read methods for this check. Wire an Arc client in
/shared that reads process.env.RPC. Write a script `pnpm arc:check` that connects, prints the
chain id (eth_chainId) and latest block (eth_blockNumber), and reads the USDC balance of
DEPLOYER_PRIVATE_KEY's address at 6 decimals (eth_call balanceOf). Run it and show me the output.
If a method is blocked by the allowlist, tell me which one rather than working around it.
```
Tip: you can also sanity-check outside the app with `arc-canteen rpc eth_chainId` and
`arc-canteen rpc eth_blockNumber` directly in the terminal.

Gate: do not start Phase 2 until `arc:check` prints a real chain id, block, and USDC balance.

---

## PHASE 2 — Contracts on Arc

### Prompt 2.1 — AgentRegistry
```
In /contracts, write AgentRegistry.sol for Arc (EVM). It maps an agentId to
{owner, name, templateHash (bytes32), walletAddress, poolId}. Functions: registerAgent(name,
templateHash, walletAddress) returns agentId and emits AgentRegistered; getAgent(agentId);
agentsByOwner(owner). Keep it minimal and gas-aware. Write Foundry tests covering register,
duplicate handling, and lookups. Run the tests and show results.
```

### Prompt 2.2 — Pool escrow + resolution + payout
```
Read circlefin/arc-escrow and circlefin/arc-prediction-markets for patterns first. Then in
/contracts write Pool.sol for Arc, settling in USDC (6 decimals). It must support:
- createPool(tournament, entryFeeUSDC, budgetPerAgentUSDC, prizeSplitBps[]) returns poolId
- join(poolId, agentId): pulls entryFeeUSDC from the caller via USDC transferFrom into escrow,
  adds the agent to the pool, reverts if the pool is closed or the agent already joined
- recordPrediction(poolId, agentId, fixtureId, predictionHash): stores a commitment, only the
  agent owner or an authorized runner can call, only before kickoff
- resolveFixture(poolId, fixtureId, homeScore, awayScore): resolver-only, stores the result
- finalize(poolId): resolver-only, ranks agents by their recorded score total, pays the top N
  from escrow per prizeSplitBps, marks the pool finalized
Use a settable resolver address (owner-set) for MVP and leave a clear TODO marking UMA via
arc-prediction-markets as the trust upgrade. Enforce that no payout exceeds escrow. Write
Foundry tests for: join + escrow accounting, double-join revert, resolve, and a full finalize
with a 3-agent payout split. Run tests, show results.
```

### Prompt 2.3 — Deploy to Arc testnet
```
Write a Foundry deploy script that deploys AgentRegistry and Pool to the Arc testnet using
DEPLOYER_PRIVATE_KEY and the real Arc RPC. Pass the USDC token address from the Arc network
config (read it, do not guess). After deploy, write the addresses to /shared/addresses.arc.json
and print them. Then create one test pool for the World Cup with a small entry fee and a
3-way prize split, and show the tx hash.
```

Gate: contracts deployed, addresses saved, one World Cup pool created on-chain.

---

## PHASE 3 — Payment layer (Circle)

### Prompt 3.1 — Per-agent Circle wallet provisioning
```
Read developers.circle.com/agent-stack and developers.circle.com/wallets, plus the wallet
setup in circlefin/arc-nanopayments. Use the actual Circle SDK / Circle CLI calls. In /agent,
build a wallet module that: provisions a new Circle wallet for an agent, funds it from the
owner's budget in USDC, reads its balance, and exposes a hard budget cap so the agent can
never spend past its allocation. Write a script `pnpm wallet:demo` that provisions a wallet,
funds it with a tiny test amount, and prints the balance. Run it.
```

### Prompt 3.2 — x402 evidence endpoints (seller side)
```
First run the-canteen-dev/circle-agent locally (`npm install && npm start`) and pay its
/hello-world endpoint once so you've seen a real settlement. Then read its server.ts and the
seller side of circlefin/arc-nanopayments. Use the same `createGatewayMiddleware` pattern (the
real Gateway middleware, the real facilitator URL, the real GatewayWallet config — do not invent
them). In /app, add API routes each sitting behind an x402 HTTP 402 paywall that settles in USDC
on Arc via Gateway at a sub-cent price:
- /api/evidence/form     recent form for both teams
- /api/evidence/odds     current odds / implied probabilities
- /api/evidence/injuries injury and availability news
- /api/evidence/h2h      head-to-head history
Back them with real fixture-linked data (wired fully in Phase 5); stub payloads with clearly
marked placeholders if the data layer isn't ready, but the 402 + Gateway payment flow must be
real, not stubbed. Each route returns the price on 402, accepts the signed authorization, hands
back data. No free path. Add a test that an unpaid request gets 402 and a paid request gets 200.
```

### Prompt 3.3 — Paying client with Gateway batching + budget cap
```
Model this on circle-agent's buyer.ts and the paying-agent in circlefin/arc-nanopayments. In
/agent, build a paying client that takes an evidence URL and the agent's wallet and: signs the
EIP-712 TransferWithAuthorization scoped to the GatewayWallet, posts it through the x402 flow,
and gets back a settlement UUID. Treat that UUID as the receipt — do NOT block on the on-chain
submitBatch landing (it can lag ~10 min on Arc testnet). Record every purchase {agentId,
fixtureId, source, priceUSDC, settlementUuid, batchTxHash?} with batchTxHash filled in later by
reconciliation. Enforce the budget cap before signing (return a typed BudgetExceeded result, do
not throw). Add a separate reconcile step that, given a settlement UUID, polls
GET /v1/x402/transfers/:id until completed and records the batch tx hash. Write a test that buys
3 evidence items for a fake fixture under the cap, confirms 3 settlement UUIDs come back without
waiting for on-chain, and confirms the 4th purchase is blocked once the cap is hit.
```

### Prompt 3.4 — Data Broker (RFB 3)
```
Build a Data Broker service in /app (API routes) that aggregates the four evidence sources,
resells them via its own x402 endpoints at a small markup, takes a configurable cut in bps,
and tracks simple per-source reputation (hit rate of the data it served vs outcomes). Expose
/api/broker/catalog (sources + live prices + reputation) and route agent purchases through the
broker when the agent's template prefers it. Record broker revenue separately for the /stats
panel. Keep the direct-to-source path too, so agents can choose broker vs direct — that choice
is part of the agentic story. Add a test for a brokered purchase that splits the markup.
```

Gate: an agent wallet can buy real (or clearly-stubbed) evidence through x402 + Gateway,
batched, capped, with broker revenue tracked.

---

## PHASE 4 — Agent runtime

### Prompt 4.1 — Template schema + compiler
```
In /agent, define the agent template. It is a single editable prompt plus a small structured
header the user can tune: persona (free text), riskAppetite (low/medium/high), dataPreference
(which evidence sources it values and a willingness-to-pay per source), modelProvider, and
budget. Write a compiler that turns a saved template into a runnable AgentConfig and a
templateHash (bytes32, matching AgentRegistry). Validate inputs. Reuse CROSSFIRE's model
provider integration for the model call layer. Write a test that compiles two distinct
templates into two distinct configs and hashes.
```

### Prompt 4.2 — Predict loop
```
In /agent, implement the predict loop for one agent and one upcoming fixture:
1. List candidate evidence (form, odds, injuries, h2h) with current prices from the broker
   catalog.
2. Using the agent's riskAppetite, dataPreference, willingness-to-pay, and remaining budget,
   rank the evidence by expected value vs price and decide what to buy. This buy-or-skip
   decision is the core agentic behavior — log the reasoning.
3. Buy the chosen evidence through the paying client (Phase 3.3), respecting the cap.
4. Assemble the bought evidence + the agent's persona into the model context, call the model,
   and emit a structured prediction {homeScore, awayScore, confidence (0-1), rationale}.
5. Record the prediction and call Pool.recordPrediction with the predictionHash. Log spend.
Write a test that runs the loop end to end against a fake fixture with the payment layer in
test mode, asserting that spend respects the cap and a structured prediction is produced.
```

### Prompt 4.3 — Runner / scheduler
```
In /agent, build a runner that, given a pool and its upcoming fixtures, runs the predict loop
for every agent in the pool ahead of each fixture's kickoff. Make it idempotent (never predict
the same fixture twice for the same agent) and resilient (one agent failing does not stop the
others). Add `pnpm run:pool <poolId>` to run a single matchday round on demand. This is what
you will trigger before each real World Cup matchday.
```

Gate: `pnpm run:pool` produces real predictions and real (test-mode) spend for every seeded
agent on a real upcoming fixture.

---

## PHASE 5 — Data + resolution

### Prompt 5.1 — Fixtures ingestion
```
Reuse CROSSFIRE's ESPN World Cup fixture ingestion. In /app, build a fixtures service that
pulls the World Cup schedule, normalizes to the fixture model in BUILD_GUIDE section 4, and
stores upcoming and in-play fixtures for the World Cup pool. Add `pnpm fixtures:sync`. Run it
and show me the next 5 upcoming fixtures inside the Jun 17-29 window.
```

### Prompt 5.2 — Results resolver + on-chain settlement
```
Build a results resolver that pulls final scores for completed fixtures from the data source,
calls Pool.resolveFixture(poolId, fixtureId, home, away) from the resolver key, and triggers
scoring. Make it idempotent. Add `pnpm resolve:pool <poolId>`. For MVP this is a signed
resolver; leave a TODO referencing arc-prediction-markets / UMA as the decentralization
upgrade. Show a dry run against a finished fixture.
```

### Prompt 5.3 — Scoring + ROI
```
Implement scoring per BUILD_GUIDE section 3: exact score = 3 pts, correct result (W/D/L) = 1,
correct goal difference = 1. Compute each agent's cumulative score and ROI = cumulative score
/ total USDC spent on data. Persist a score row per agent per fixture. Expose a function the
leaderboard and finalize() can both read. Write a test over a small fixture set verifying the
points math and the ROI calc.
```

Gate: real fixtures sync, a finished fixture resolves on-chain, agents get scored, ROI computes.

---

## PHASE 6 — Frontend (reuse CROSSFIRE patterns)

### Prompt 6.1 — Register / template editor
```
Read /mnt/skills/public/frontend-design/SKILL.md first for the styling constraints. Build the
agent register page: an editable template editor (the prompt + the structured header from
Phase 4.1) with a live persona preview, a budget input, a pool selector (World Cup live,
others shown as coming soon), and a "create + join" action that compiles the template,
registers the agent on-chain, provisions its Circle wallet, and pays the pool entry. Match the
visual language of CROSSFIRE. Handle the wallet/payment states clearly.
```

### Prompt 6.2 — Pool page
```
Build the pool page for the World Cup pool: upcoming fixtures with kickoff times, the list of
entrant agents, the current prize pool value, and, for the connected user, their agent's calls
per fixture with the evidence it bought and what it spent. Real data from the contracts and the
fixtures service.
```

### Prompt 6.3 — Leaderboard
```
Reuse CROSSFIRE's leaderboard component. Rank agents in a pool by cumulative score, with a
toggle to rank by ROI instead. Show score, accuracy, data spent, and ROI per agent. Link each
row to the agent detail page. Live-update as fixtures resolve.
```

### Prompt 6.4 — Agent detail
```
Reuse CROSSFIRE's agent page. For one agent show: its persona/template summary, every
prediction it has made with the actual result and points earned, the evidence it bought per
fixture and the price, total spend, accuracy, and ROI. This page is the proof of agency — make
the buy-or-skip decisions legible.
```

### Prompt 6.5 — Wallet + entry flow + /stats
```
Build the connect + wallet/budget panel (agent wallet balance, budget cap, spent) and wire the
USDC entry payment into the pool. Then build /stats tracking the EXACT RFB-named metrics from
BUILD_GUIDE section 7, because these are what traction is scored on:
RFB 01 — total autonomous payments, average transaction size (display this big, it must read
sub-cent), budget utilization efficiency (spent/allocated), cost per task (data spent / correct
predictions).
RFB 03 — agent-to-agent volume (USDC through the broker), average settlement time (signed ->
on-chain completed), payment chain depth.
Plus: agents registered, unique owners, predictions made, total pool value, reader-to-owner
conversion.
Every number must be real, pulled from the purchase records, the contracts, and the settlement
reconciliation. These same numbers are the answers to the submission form's traction questions
and to `arc-canteen update traction`.
```

Gate: a stranger can land on the live URL, build an agent, pay entry, watch it predict a real
match, and see it ranked.

---

## PHASE 7 — Deploy, seed, prove, demo

### Prompt 7.1 — Deploy
```
Deploy /app to Vercel with all env vars wired (Circle keys, model + data keys, contract
addresses). The arc-canteen CLI is not on Vercel, so the production RPC cannot come from the
CLI at runtime: run `arc-canteen rpc-url --export` locally, copy the resolved RPC URL, and set
it as the RPC env var in Vercel (rotate it with `arc-canteen rotate-rpc-key` if it leaks or
nears its 90-day expiry, then update Vercel). Confirm the production build is green and the live
URL hits the Arc testnet and the deployed contracts.
```

### Prompt 7.2 — Seed + live matchday dry run
```
Seed 3-5 sample agents with distinct templates (e.g. a cheap-data contrarian, an
odds-follower, an injury-news specialist, a high-budget maximalist). Join them to the World
Cup pool. Run `pnpm fixtures:sync`, then `pnpm run:pool` against the next real fixture, confirm
each agent bought evidence and posted a prediction, and verify the nanopayments on the Arc
explorer. After the match, run `pnpm resolve:pool` and confirm scoring + leaderboard update.
```

### Prompt 7.3 — PROOF.md + demo capture
```
Following the CROSSFIRE PROOF.md pattern, write PROOF.md listing: contract addresses, sample
agent wallet addresses, 3-5 real nanopayment settlements (UUID + batch tx hash + explorer link),
one resolved fixture, and one finalize/payout reference once a round closes. To generate the
per-buyer settlement proof, reuse circle-agent's decode-batch.ts against your submitBatch tx
hashes (`npx tsx decode-batch.ts 0x<hash>`) and paste the decoded deltas. Then write a tight
sub-3-minute demo script that walks the live loop: build an agent, watch it buy evidence and
predict a real match, show the leaderboard and ROI, point at /stats. Keep the script in Nerom's
voice. List the exact tabs to pre-open.
```

Gate: live URL, public repo, PROOF.md with real on-chain references, demo recorded, form submitted.

---

## After MVP (only if the loop is live and stable)
- Data Broker reputation surfaced on the catalog; agents factoring reputation into buys
- Agent-to-agent: let an agent buy a higher-ranked agent's call as an evidence source
- Dynamic evidence pricing by demand around big fixtures
- A second pool scaffolded (no live matches in-window, structure only)

## Submit early and often
You can submit the form multiple times. Submit a first version the moment the loop is live,
then resubmit as traction climbs. Do not wait for perfect.
