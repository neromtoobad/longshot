# LONGSHOT — Claude Code Project Context

## What this is
LONGSHOT is a prediction-agent league on Arc. A user builds an agent from an editable
prompt template, funds it, and drops it into a tournament pool. The agent autonomously
predicts real match scores. To predict well it has to spend: before each call it buys
evidence (form, odds, injuries, head-to-head) from x402-protected endpoints, each priced
as a sub-cent nanopayment settled in USDC on Arc. Agents are ranked by accuracy and by
ROI (accuracy per dollar of data bought). At the end of a pool, the top agents split the
prize pool.

The whole product in one line: build your longshot, drop it in the pool, it earns its
rank by beating the favorites on real matches and paying its own way.

## Reference, not template
CROSSFIRE (github.com/neromtoobad/crossfire) is prior art and the reference build.
LONGSHOT REUSES its arena/leaderboard/agent-page frontend patterns and its ESPN fixture
ingestion. LONGSHOT DOES NOT reuse the MetaMask delegation layer (ERC-7710 / ERC-7715),
the 1Shot relayer, or Base settlement. None of that exists on Arc. It is fully replaced
by the Circle stack. Treat CROSSFIRE as a thing to read for patterns, not a thing to fork
wholesale.

## Hackathon facts
- Event: Lepton Agents Hackathon (Canteen x Circle x Arc). Online, Jun 15 -> Jun 29 2026.
- Judging is async. No live demo day. Submit early and often, you can submit many times.
- Weights: Agentic Sophistication 30%, Traction 30%, Circle tool usage 20%, Innovation 20%.
- RFB anchor: RFB 1 (Autonomous Paying Agents) + RFB 3 (Agent-to-Agent Nanopayment Networks).
- Required to submit: public GitHub repo, a recorded demo under 3 minutes. Live link encouraged.
- Submission form: forms.gle/SMqLaw2pMGDe58LFA
- Traction questions are asked at submission: how many users onboarded, what problem you solve.

## Stack (hard)
- Chain: Arc testnet, Canteen-hosted, reached via the ARC CLI. EVM. Native USDC gas, sub-500ms finality.
- Payments: Circle stack only.
  - Wallets: one Circle wallet per agent.
  - Gateway Nanopayments: sub-cent, gas-free, batched USDC for every data buy.
  - x402: every evidence/data endpoint is pay-per-request behind HTTP 402.
  - USDC: native settlement on Arc, always 6 decimals.
- Contracts: Solidity on Arc. AgentRegistry + Pool (entry escrow, resolution, payout).
  Reference circlefin/arc-escrow and circlefin/arc-prediction-markets.
- Agent runtime: model-pluggable. Reuse CROSSFIRE's provider integration to save time.
  Agent behavior is defined by the user's editable template prompt.
- Frontend: Next.js on Vercel. Reuse CROSSFIRE UI patterns.
- Data: real fixtures and real results. ESPN for the World Cup pool (reuse CROSSFIRE ingestion).

## Reference repos (available locally after `arc-canteen context sync`; pipe in via `arc-canteen context | claude`)
- circlefin/arc-nanopayments — the payment backbone and the best scaffold to fork: full Next.js
  seller dashboard, Supabase persistence, and a LangChain buyer agent. START HERE for the seller
  endpoints and the buyer loop.
- the-canteen-dev/circle-agent — the explainer companion, run it FIRST. A small paywalled
  `server.ts` using `createGatewayMiddleware`, a CLI `buyer.ts` (signs EIP-712, pays from a raw
  key), a browser buyer with a 6-step payment-trace UI, and `decode-batch.ts` which unpacks a
  Gateway `submitBatch` tx into per-buyer deltas + settlement UUIDs. Watch one real settlement
  land, then reuse `decode-batch.ts` for your PROOF and /stats.
- circlefin/arc-prediction-markets — resolution mechanics (UMA). For match result settlement.
- circlefin/arc-escrow — escrow + USDC settlement. For pool entry and payout.
- Faucet: faucet.circle.com (Arc testnet USDC). Public Arc testnet RPC: https://rpc.testnet.arc.network
  (fine for reads/decoding; use the arc-canteen proxy `$RPC` for tracked calls).
- Docs: docs.arc.network · developers.circle.com/gateway/nanopayments · developers.circle.com/agent-stack

## Hard rules (always / never)
- ALWAYS handle USDC at 6 decimals.
- ALWAYS settle per-data buys through Gateway (batched). Do not fire one on-chain tx per fetch.
- ALWAYS gate every evidence/data endpoint behind x402. There is no free data path.
- ALWAYS provision an agent's Circle wallet before it tries to spend.
- ALWAYS read the real Circle/Arc docs or the reference repo for exact SDK signatures before
  writing payment code. Do not invent API calls or method names.
- ALWAYS price evidence genuinely sub-cent ($0.001-$0.005 per call). "Average transaction size,
  sub-cent" is a named RFB 01 traction metric and the headline number on /stats. The circle-agent
  demo's $0.01 is a full cent — do not copy that price, go below it.
- NEVER use the MetaMask delegation framework or the 1Shot relayer. Not on Arc.
- NEVER ship a fake/free data path that bypasses payment. The nanopayment is the whole thesis
  and judges verify it.
- NEVER let an agent spend past its budget cap. Enforce it in the wallet guardrail or the contract.
- NEVER block a prediction on the Gateway settlement landing on-chain. Settlement is async and
  batched: the buyer signs an EIP-712 TransferWithAuthorization, the facilitator returns a
  settlement UUID immediately, then Circle's relayer flushes a `submitBatch` tx later. On Arc
  testnet that flush can take ~10 minutes under low traffic. Treat the settlement UUID as the
  receipt, let the agent predict right away, and reconcile the on-chain batch afterward. Run
  every agent well before kickoff so the lag never costs a prediction.
- NEVER block on building every pool. World Cup is the only live pool in the window. Build
  multi-pool as structure, seed and demo World Cup.

## What "done" looks like (MVP — must close the loop, live)
One World Cup pool, end to end, on Arc testnet, behind a live URL:
1. user registers an agent from a template
2. user pays a USDC entry -> pool escrow contract
3. agent buys real evidence via x402 + Gateway, within budget
4. agent posts a score prediction for a real upcoming fixture
5. the match resolves from a real result, the agent is scored
6. the leaderboard updates (accuracy + ROI)
7. the pool finalizes, top agents are paid in USDC
Plus a live /stats panel tracking the exact RFB-named metrics (see BUILD_GUIDE section 7):
total autonomous payments, average transaction size (sub-cent), budget utilization, cost per
task, agent-to-agent volume, settlement time, plus agents registered, unique owners, pool value.

Prior lessons that apply (from Nerom's own hackathon notes): small beats ambitious, close
the loop, configure git identity first, use both sponsor products meaningfully, go
protocol-level not surface-level.

## Voice
Working docs and code comments: direct, plain, no filler.
Submission and social copy: Nerom's content rules — lowercase, short sentences, no em dashes,
"➠" for listings, no AI slop, no "it's not X but Y", no stacked negations.
