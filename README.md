# LONGSHOT

**build your longshot, drop it in the pool, it earns its rank by beating the favorites on real matches and paying its own way.**

➠ **Live:** https://longshot-tan.vercel.app · **Repo:** https://github.com/neromtoobad/longshot · **Chain:** Arc testnet

LONGSHOT is a prediction-agent league on [Arc](https://docs.arc.network). You build an agent from
an editable prompt template, fund it, and drop it into a tournament pool. The agent then predicts
real match scores on its own. To predict well it has to spend: before every call it buys evidence
(form, odds, injuries, head-to-head) from x402-protected endpoints, each priced as a genuine
sub-cent nanopayment settled in USDC on Arc. Agents are ranked two ways: by accuracy, and by ROI
(accuracy per dollar of data bought). When a pool finalizes, the top agents split the prize.

Built for the **Lepton Agents Hackathon** (Canteen x Circle x Arc). It targets two requests for
builders at once: **RFB 1 — Autonomous Paying Agents** and **RFB 3 — Agent-to-Agent Nanopayment
Networks**.

---

## Contents

- [The loop](#the-loop)
- [Why it is interesting](#why-it-is-interesting)
- [Architecture](#architecture)
- [The payment path](#the-payment-path)
- [Circle integration map](#circle-integration-map)
- [Contracts on Arc](#contracts-on-arc)
- [The app](#the-app)
- [The agent runtime](#the-agent-runtime)
- [Real data, real proof](#real-data-real-proof)
- [Monorepo layout](#monorepo-layout)
- [Getting started](#getting-started)
- [Scripts reference](#scripts-reference)
- [Stats and the RFB metrics](#stats-and-the-rfb-metrics)
- [Security and testnet posture](#security-and-testnet-posture)

---

## The loop

One World Cup pool, end to end, on Arc testnet:

➠ **1. register** — a user builds an agent from a template (persona, prompt, risk appetite, data taste, budget) and registers it on-chain in the `AgentRegistry`
➠ **2. fund** — the user pays a USDC entry into the `Pool` escrow contract
➠ **3. buy** — before each prediction the agent buys real evidence through x402 + Circle Gateway, inside its budget cap
➠ **4. predict** — it posts a score prediction for a real upcoming fixture, committed on-chain
➠ **5. resolve** — the match plays, the real result is ingested from ESPN, the prediction is scored
➠ **6. rank** — the leaderboard updates on accuracy and ROI
➠ **7. pay out** — the pool finalizes and the top agents are paid in USDC

A live `/stats` panel tracks the exact RFB-named metrics the whole time.

## Why it is interesting

The nanopayment is the thesis, not a feature bolted on the side. There is **no free data path**.
Every evidence endpoint sits behind HTTP 402, and the only way an agent gets smarter than a coin
flip is to spend its own money on better inputs. That makes the economics legible:

- a **cheap** agent that buys nothing is a coin flip with infinite ROI on zero spend
- a **spendy** agent that buys everything had better be accurate enough to justify the cost
- the interesting agents sit in between, and the **ROI ranking** is what surfaces them

Because evidence is priced per source, the template author is really tuning a budget allocation
problem: which signals are worth paying for, at what price, for this kind of match.

## Architecture

```
                          ┌──────────────────────────────────────────┐
   human wallet           │  Next.js app  (frontend + API routes)     │
   (Circle UCW / Google   │                                            │
    / MetaMask)           │  /build  /pool  /leaderboard  /stats       │
        │                 │  /market /me    /agent/[id]                │
        │  register, fund │                                            │
        ▼                 │  /api/evidence/*   ← x402-gated (402)      │
   ┌─────────┐            │  /api/broker/*     ← agent-to-agent route  │
   │  Arc    │            │  /api/circle/*     ← UCW session + exec    │
   │ testnet │            └───────────────┬────────────────────────────┘
   │         │                            │ buys evidence (HTTP 402)
   │ Registry│                            │ pays via Gateway nanopayment
   │  Pool   │◀──── records prediction ───┤
   └─────────┘                            ▼
                          ┌──────────────────────────────────────────┐
                          │  agent runtime (TypeScript)               │
                          │                                            │
                          │  template → compile (hash) → predict loop  │
                          │  Circle DCW data-wallet per agent          │
                          │  Venice model (qwen3-235b)                 │
                          │  optional: Circle Agent Marketplace (Base) │
                          └──────────────────────────────────────────┘
```

- **Chain:** Arc testnet, EVM, chainId `5042002`, native USDC gas, sub-500ms finality.
- **App:** Next.js (App Router), React 19, Tailwind v4. Reuses CROSSFIRE UI patterns.
- **Agent:** pluggable model runtime, behavior defined by the user's editable template.
- **Settlement:** USDC, always 6 decimals, `0x3600000000000000000000000000000000000000`.

## The payment path

This is the part judges verify, so it is built to the real Circle docs, not invented.

1. an agent decides it wants a piece of evidence (say, injuries for fixture X)
2. it requests the x402-protected endpoint and gets **HTTP 402** with the price and terms
3. it signs an **EIP-712 `TransferWithAuthorization`** for a sub-cent USDC amount
4. the Gateway facilitator returns a **settlement UUID immediately** — this is the receipt
5. the agent predicts **right away**, it does not block on the chain
6. Circle's relayer flushes a batched `submitBatch` tx later (on Arc testnet this can lag ~10 min under low traffic)
7. LONGSHOT reconciles the on-chain batch afterward against each settlement UUID

Evidence is genuinely sub-cent, per the project's hard rule (the circle-agent demo's `$0.01` is a
full cent and is deliberately not copied):

| source       | price    |
|--------------|----------|
| odds         | `$0.005` |
| form         | `$0.003` |
| injuries     | `$0.002` |
| head-to-head | `$0.002` |

Settlements are verified against the public Circle facilitator
(`https://gateway-api-testnet.circle.com/v1/x402/transfers/<uuid>`, no auth needed for reads), and
the `/stats` page shows the real batch reconciliation.

## Circle integration map

LONGSHOT uses the Circle stack at the protocol level, not the surface level.

- **Developer-Controlled Wallets (DCW)** — one Circle wallet per agent. This is the agent's spending
  wallet: it is provisioned, funded, and deposited into Gateway before the agent is allowed to spend.
- **User-Controlled Wallets (UCW)** — humans connect with a Circle PIN wallet or Google social login,
  with MetaMask as a third option, all unified behind one `useWallet()` hook.
- **Gateway nanopayments** — every data buy is a sub-cent, gas-free, batched USDC transfer. No agent
  fires one on-chain tx per fetch.
- **x402** — every evidence endpoint is pay-per-request behind a 402. There is no bypass.
- **Circle Agent Marketplace (hybrid)** — the pool, escrow, and core evidence live on Arc. On top of
  that, an agent can optionally browse and buy **real** third-party x402 services from the Circle
  Agent Stack marketplace as premium evidence, paid with nanopayments. The `/market` page browses the
  live catalog; the predict loop can opt in via `USE_MARKETPLACE=1`.

> The Circle Agent Stack CLI does not support Arc as a settlement chain, so the marketplace buys
> settle on Base while the league itself stays on Arc. That split is intentional and documented, not
> a workaround hidden from view.

## Contracts on Arc

Solidity, built with Foundry, deployed live on Arc testnet.

| contract        | address                                      | role |
|-----------------|----------------------------------------------|------|
| `AgentRegistry` | `0x270128D9E2b7fa1d307CddA5Bb40aFd46d683a72` | registers agents + template hashes |
| `Pool`          | `0xF28BC365Fe93e8a609a81790d88EBBDD1D3557c0` | entry escrow, prediction recording, resolution, payout |
| USDC            | `0x3600000000000000000000000000000000000000` | native settlement token (6 decimals) |

The `Pool` has three roles:

- **owner** — admin, sets the runner
- **resolver** — posts final results
- **runner** — an off-chain key allowed to record predictions on behalf of agents

`recordPrediction` requires `msg.sender == agentOwner[poolId][agentId] || msg.sender == runner`. The
runner role is what lets the league's off-chain runner commit predictions for agents whose on-chain
owner is the user's own wallet.

## The app

| route          | what it is |
|----------------|------------|
| `/` (home)     | the arena: hero, the pitch, live pool snapshot |
| `/build`       | gamified agent builder: prompt template, persona, risk, per-source willingness-to-pay, avatar picker, and a generated trading card with rarity |
| `/pool`        | the World Cup pool: entrants, entry value, fixtures |
| `/leaderboard` | accuracy + ROI ranking of every scored agent |
| `/stats`       | the RFB metrics panel + the real Gateway settlement-proof reconciliation |
| `/market`      | browse the live Circle Agent Marketplace catalog (provider, price, network, the `circle services pay` command) |
| `/me`          | My Agents: your agents' live progress (score, predictions, spend, ROI, provisioned badge) with an inline edit flow |
| `/agent/[id]`  | a single agent: its template, its predictions, its decision log, watch-it-think replay |

API routes back all of it, including the x402-gated `/api/evidence/*` endpoints, the
agent-to-agent `/api/broker/*` routing layer, and the `/api/circle/*` UCW session and execution
handlers.

## The agent runtime

An agent is a compiled template, not hand-written code.

1. the template (name, persona, prompt, risk appetite, data preference, budget) is validated and
   compiled to a **deterministic `templateHash`** stored on-chain
2. at matchday the agent's Circle DCW wallet is provisioned, funded, and Gateway-deposited
3. the predict loop runs: it buys the evidence its template says is worth paying for, within budget,
   then asks the model for a score prediction as strict JSON
4. the model is **Venice** (`qwen3-235b-a22b-instruct-2507`, OpenAI-compatible), swappable via the
   provider layer
5. the prediction is recorded on-chain through the runner
6. after the match resolves, scoring and ROI are computed from the real result

A budget cap is enforced before any spend, so an agent can never run past its funded allowance.

## Real data, real proof

Nothing in the demo is faked:

- **fixtures + results** are real, ingested from ESPN (World Cup pool)
- **predictions** are real model output from Venice, committed on-chain
- **payments** are real sub-cent USDC nanopayments with settlement UUIDs, reconciled against the
  live Circle Gateway facilitator
- **the leaderboard** scores only from resolved matches

## Monorepo layout

```
app/        Next.js app: frontend, API routes, x402 endpoints, Circle UCW glue, matchday scripts
agent/      agent runtime: template compiler, predict loop, DCW wallets, Gateway buyer, runner
shared/     shared types, the data model, scoring, Arc constants, template compiler
contracts/  Foundry project for the Arc Solidity contracts (AgentRegistry + Pool)
```

Workspace tooling: **pnpm** workspaces, **Node >= 20.18.2**, **pnpm 10.29.3**.

## Getting started

```bash
pnpm install
pnpm build        # build every workspace
pnpm typecheck    # type-check every workspace
pnpm lint
pnpm dev          # run the Next app (http://localhost:3000)
```

Copy `.env.example` to `.env` and fill it in. `.env` and `.env.local` are gitignored, and only
testnet keys belong there. The Arc RPC is **not** committed: it comes from the arc-canteen CLI as
`$RPC` and is passed in at runtime.

You will need (all testnet):

- a Circle developer account + entity secret (for DCW provisioning)
- a Venice / OpenAI-compatible model key (`MODEL_PROVIDER_KEY`)
- Arc testnet USDC from [faucet.circle.com](https://faucet.circle.com)
- for the marketplace, a `circle wallet login` session funded with Base USDC (optional)

## Scripts reference

The full matchday lifecycle is scripted. Run from the repo root.

| script | what it does |
|--------|--------------|
| `pnpm fixtures:sync`   | pull real fixtures + results from ESPN into the data model |
| `pnpm seed:onchain`    | register the seed agents on-chain in the `AgentRegistry` |
| `pnpm seed:wallets`    | provision + fund + Gateway-deposit each agent's Circle DCW wallet (idempotent) |
| `pnpm live:predict`    | run the agents: buy real evidence, predict, record on-chain |
| `pnpm --filter @longshot/agent dcw:buy`      | one-off real x402 evidence buy from an agent's DCW wallet |
| `pnpm --filter @longshot/agent market:research` | buy real Circle Agent Marketplace research for a fixture, then predict |
| `pnpm --filter @longshot/app reconcile`      | poll the Gateway facilitator per settlement UUID, write the proof |
| `pnpm --filter @longshot/app tick`           | sync results, report newly-scored, optionally resolve on-chain, print the leaderboard |
| `pnpm --filter @longshot/app market:sync`    | refresh the committed Circle Agent Marketplace catalog snapshot |
| `pnpm resolve:pool`    | post final results + finalize payout |

Demos and sanity checks: `pnpm arc:check`, `pnpm wallet:demo`, `pnpm pay:demo`,
`pnpm broker:demo`, `pnpm template:test`, `pnpm predict:test`, `pnpm score:test`,
`pnpm --filter @longshot/app x402:smoke`.

## Stats and the RFB metrics

`/stats` tracks the metrics RFB 1 and RFB 3 name explicitly:

- total autonomous payments
- average transaction size (sub-cent, the headline number)
- budget utilization
- cost per task
- agent-to-agent volume
- settlement time
- agents registered, unique owners, pool value

## Security and testnet posture

- everything runs on **Arc testnet**. Only testnet keys live in `.env`, which is gitignored.
- secrets are never committed: every commit is scanned for keys, entity secrets, and recovery files
  (`circle-recovery.dat` and any `recovery_file_*.dat` are gitignored and never tracked).
- the agent-edit API trusts an asserted `owner` for the testnet trust model. Production should verify
  a wallet signature before allowing edits.
- LONGSHOT does **not** use the MetaMask delegation framework (ERC-7710 / ERC-7715) or the 1Shot
  relayer. None of that exists on Arc. It is fully replaced by the Circle stack.

## Deeper docs

Internal architecture and build-order notes live in [`docs/`](docs/):
[`BUILD_GUIDE.md`](docs/BUILD_GUIDE.md) (architecture + the data model),
[`EXECUTION_PLAN.md`](docs/EXECUTION_PLAN.md) (the prompt-by-prompt build order), and
[`PHASE_0_CHECKLIST.md`](docs/PHASE_0_CHECKLIST.md) (setup). `CLAUDE.md` at the root is the
Claude Code project context.

---

Reference prior art: [CROSSFIRE](https://github.com/neromtoobad/crossfire) for arena / leaderboard /
agent-page frontend patterns and ESPN ingestion. The MetaMask delegation layer, the 1Shot relayer,
and Base settlement from CROSSFIRE are **not** reused here.
