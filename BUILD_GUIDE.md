# BUILD_GUIDE — LONGSHOT Architecture

## 1. The idea in full
A league where people build prediction agents and the agents compete on real sport, paying
their own way on Arc.

- You register an agent from a template. The template is an editable prompt: its persona, its
  read on the game, how aggressive it bets, which kinds of evidence it values.
- Your agent joins a pool. Pools are per tournament (World Cup, Premier League, etc).
- Inside the pool the agent predicts real match scores, autonomously, match after match.
- To predict, the agent must buy evidence. Each evidence call is an x402 nanopayment in USDC,
  settled on Arc through Gateway at the sub-cent floor. The agent decides what is worth buying.
- Agents are ranked by accuracy and by ROI (accuracy per dollar of data spent).
- The pool finalizes at the end of the tournament (or per matchday round) and the top agents
  split the prize pool.

The reason this is a Lepton project and not just a prediction game: the real decision the AI
makes is not "what's the score." It's "is this $0.002 stat worth buying for this match, or do
I call it on what I already know." That decision, made thousands of times across a pool, is
the agentic core.

## 2. How money moves (two flows)
1. **Entry -> prize pool.** A user pays a small USDC entry to join a pool. Entries are escrowed
   in the Pool contract on Arc and become the prize pool. Reference circlefin/arc-escrow.
2. **Data spend (the nanopayments).** Each agent has a Circle wallet funded with a budget. As
   it forms predictions it streams sub-cent payments to evidence endpoints via x402 + Gateway.
   This is the volume judges look at under Circle tool usage and RFB 1.

Optionally a third flow for RFB 3: agents pay a **Data Broker** that aggregates and resells
evidence and takes a small cut. The broker exposes reputation. Agent-to-agent payment network.

### The x402 + Gateway settlement lifecycle (from circle-agent, build to this)
1. The agent's wallet signs an EIP-712 `TransferWithAuthorization` scoped to the GatewayWallet
   contract. No gas, just a signature authorizing a debit up to `value` before `validBefore`.
2. The seller's `createGatewayMiddleware` forwards the signed auth to Circle's facilitator
   (`POST /v1/x402/settle`), which returns a settlement UUID. Not a tx hash yet.
3. Gateway optimistically debits the buyer and queues the settlement (status `received`). Look
   it up at `GET /v1/x402/transfers/:id`.
4. Circle's relayer batches many transfers and calls `submitBatch(...)` on GatewayWallet. One
   tx settles many buyers. On Arc testnet this flush can lag ~10 minutes under low traffic.
5. The batch tx mines; the settlement is marked completed.
Implication for LONGSHOT: the prediction does not wait on step 4-5. The UUID from step 2 is the
receipt. Predict immediately, reconcile the batch later, and run agents well before kickoff.
`decode-batch.ts` from circle-agent turns a `submitBatch` hash into per-buyer deltas + UUIDs —
reuse it for PROOF and the /stats nanopayment numbers.

## 3. Components
- **Contracts (Arc, Solidity)**
  - `AgentRegistry`: maps agentId -> {owner, name, templateHash, walletAddress, poolId}. Events.
  - `Pool`: createPool(tournament, entryFee, budgetPerAgent, prizeSplit), join() (pulls USDC
    entry into escrow), recordPrediction(agentId, fixtureId, predictionHash), resolveFixture(
    fixtureId, homeScore, awayScore), finalize() (computes ranking, pays top N). Reference
    arc-escrow for escrow/payout, arc-prediction-markets for resolution patterns.
- **Payment layer (Circle)**
  - Wallet provisioning: a Circle wallet per agent, funded from the owner's budget at join.
  - x402 evidence endpoints: `/evidence/form`, `/evidence/odds`, `/evidence/injuries`,
    `/evidence/h2h`. Each returns 402 with a price, settles on payment, then returns data.
    Reference the seller side of arc-nanopayments.
  - Paying client: performs the x402 handshake and Gateway batching, enforces the budget cap.
    Reference the paying-agent in arc-nanopayments.
  - Data Broker (RFB 3): a service that wraps the raw feeds, resells via x402 with a small
    markup, tracks per-source reputation, and is itself paid by agents.
- **Agent runtime**
  - Template schema + compiler: user prompt -> runnable config (persona, risk appetite, data
    preferences, budget, model).
  - Predict loop: for an upcoming fixture, the agent ranks candidate evidence by expected value
    vs price, buys within budget through the paying client, assembles context, calls the model,
    emits a structured prediction {homeScore, awayScore, confidence, rationale}, logs spend.
  - Runner/scheduler: runs every pool agent ahead of each fixture kickoff. Idempotent.
- **Data + resolution**
  - Fixtures ingestion: reuse CROSSFIRE's ESPN pull for World Cup fixtures.
  - Results resolver: pull final scores, write to Pool.resolveFixture, trigger scoring. For
    MVP a signed resolver is acceptable; note arc-prediction-markets / UMA as the trust upgrade.
  - Scoring: per fixture — exact score (3 pts), correct result W/D/L (1 pt), correct goal
    difference (1 pt). Cumulative score is the rank. ROI = cumulative score / USDC spent on data.
- **Frontend (Next.js, reuse CROSSFIRE patterns)**
  - Register / template editor with live persona preview.
  - Pool page: fixtures, entrants, prize pool, your agent's calls.
  - Leaderboard: rank by score, toggle to ROI. (reuse CROSSFIRE leaderboard)
  - Agent detail: its calls, what evidence it bought, spend, accuracy. (reuse CROSSFIRE agent page)
  - Wallet/budget panel + connect + entry payment flow.
  - /stats: the live traction numbers.

## 4. Data model (minimum)
- agent: id, owner, name, template, walletAddress, poolId, budget, spent, createdAt
- pool: id, tournament, entryFee, budgetPerAgent, prizeSplit, status, prizePool
- fixture: id, poolId, home, away, kickoff, status, homeScore, awayScore
- prediction: id, agentId, fixtureId, homeScore, awayScore, confidence, rationale, createdAt
- purchase: id, agentId, fixtureId, source, priceUSDC, txOrBatchRef, createdAt
- score: agentId, fixtureId, points, cumulative

## 5. How it scores against the rubric
- Agentic Sophistication (30%): the buy-or-skip-evidence decision under a budget, made per
  match. ROI metric proves the agent is reasoning about cost vs value, not just predicting.
- Traction (30%): every registered agent is a real user; every live World Cup match is real
  prediction volume; entry + data spend is real USDC moving inside the window.
- Circle tool usage (20%): Wallets (per agent), Gateway Nanopayments (data buys), x402 (every
  endpoint), USDC (settlement), Contracts (pool escrow + payout). Five primitives, used for real.
- Innovation (20%): user-authored agents competing, a data market with a broker, ROI-as-rank,
  emergent behavior (do cheap-data agents beat expensive-data agents). New territory.

## 6. Scope discipline
MVP (must ship, must be live): one World Cup pool, the full loop in section "What done looks
like" of CLAUDE.md, with 3-5 seeded agents plus real users.
Stretch (only after the loop is live): the Data Broker reputation layer, agent-to-agent
prediction buying, a second pool, dynamic evidence pricing by demand.
Cut if time runs out: anything that does not move the live loop or the traction numbers.

## 7. Traction instrumentation (build this, do not bolt it on at the end)
Track to the EXACT metrics the RFBs name, so /stats doubles as the judges' own scorecard.

RFB 01 (Autonomous Paying Agents) metrics:
- total autonomous payments (count of nanopayments made by all agents)
- average transaction size — must read sub-cent; this is the headline number, surface it big
- budget utilization efficiency = USDC spent / USDC allocated, per agent and aggregate
- cost per task = total data USDC spent / correct predictions (their "cost per task completed")

RFB 03 (Agent-to-Agent) metrics:
- agent-to-agent transaction volume (USDC routed through the broker)
- average settlement time (signed -> on-chain submitBatch completed)
- payment chain depth (how many hops a brokered purchase passes through)

Plus the product/traction basics:
- agents registered, unique owners (= unique payers), predictions made, total pool value,
  reader-to-owner conversion

Surface all of it on /stats and keep the same numbers ready to paste into the submission form's
traction questions and into `arc-canteen update traction`. Sub-cent is the metric to protect:
price evidence at $0.001-$0.005 so the average transaction size never creeps to a full cent.
