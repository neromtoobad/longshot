# LONGSHOT

**AI agents that call every Premier League, Champions League, La Liga and Serie A match, and pay their own way.**

➠ **Live:** https://longshot-league.up.railway.app · **Chain:** Arc testnet (play money)

You build an agent, enter it into a season pool, and fund its data budget. Before every match it
decides which evidence is worth buying (bookmaker odds, recent form, the league table, head-to-head),
pays for each piece with a sub-cent USDC nanopayment over x402 and Circle Gateway, predicts the
exact score, and commits that prediction on Arc before kickoff. After full time the result goes
on-chain, the agent is scored, and at the end of the season the top three in each pool split the pot.

Originally built for the Lepton Agents Hackathon (Canteen × Circle × Arc) around the 2026 World Cup.
This version runs all season.

---

## How a matchday works

➠ **sync** the worker pulls fixtures and results for all four leagues from ESPN every few minutes
➠ **decide** up to 30 hours before kickoff each agent asks itself which evidence is worth its price for *this* match
➠ **pay** every purchase is an HTTP 402 → signed authorization → Circle Gateway batch on Arc
➠ **predict** an LLM (any OpenAI-compatible endpoint) or the built-in Poisson model calls the score from what was bought
➠ **commit** the prediction hash is recorded in the `Pool` contract before kickoff
➠ **resolve** after full time the worker posts the real score on-chain and syncs each agent's points
➠ **pay out** at season end `Pool.finalize` pays the top three 60 / 30 / 10%

Scoring: exact score +3, correct result +1, correct goal difference +1 (max 5). ROI = points per USDC
of data, so a cheap agent that scores well beats an expensive one that scores the same.

## The evidence (all real)

| source | what the agent gets | price |
| --- | --- | --- |
| `odds` | bookmaker 1X2 moneylines + over/under, as vig-free probabilities | $0.004 |
| `form` | each side's last five matches (any competition) with goals | $0.003 |
| `table` | league position, points per game, goal difference | $0.002 |
| `h2h` | the last meetings between the two clubs | $0.002 |

All of it comes from ESPN's public match summaries. If ESPN has nothing for a fixture yet (odds post a
few days out), the catalog marks the source unavailable and the endpoint answers a free 404, so an agent
never pays for an empty answer. A data broker resells the same feeds at a 20% markup, an agent → broker →
source payment chain.

## Architecture

```
 browser wallet ──register / enter / fund──▶ Arc testnet: AgentRegistry · Pool (escrow, results, payout)
                                                  ▲
 ┌──────────────── one Railway service, one volume (/data) ────────────────┐
 │ Next.js app                         worker (agent runtime)              │
 │  pages: home · pool · standings     every 5 min: sync ESPN ─▶ seed house │
 │         build · my agents · stats   agents ─▶ Gateway deposits ─▶ predict│
 │  /api/evidence/* (x402, 402)  ◀──── buys evidence over x402              │
 │  /api/broker/*   (x402, markup)     commit hash ─▶ resolve ─▶ score      │
 │  /api/wallets · /api/agents         reconcile settlements                │
 └──────────────────────────────────────────────────────────────────────────┘
```

- **Agent wallets** are plain EOAs. The key is generated server-side and stored encrypted (AES-256-GCM,
  `LONGSHOT_WALLET_SECRET`) in the data dir. The owner funds the wallet with USDC; the worker moves it into
  the Gateway Wallet from the agent's own key; purchases are signed EIP-712 authorizations, batched by Gateway.
- **House agents** (The Sharp, Form Hunter, Home Banker) are entered in every league by the treasury, so
  each pool has a field from day one: one pays for the market, one for cheap football signals, one for nothing.
- **Trust**: saving an agent is checked against the on-chain registry (owner, wallet, template hash). Editing
  one needs a fresh wallet signature from its owner.

## Monorepo

```
app/        Next.js app: pages, x402 evidence + broker endpoints, wallet/agent APIs
agent/      worker, predict loop, LLM + statistical model, wallets, on-chain calls, deploy script
shared/     types, leagues, ESPN ingestion, scoring, template compiler, addresses, keystore
contracts/  Foundry: AgentRegistry, Pool (+ ReputationBond, unused)
```

## Run it locally

```bash
pnpm install
cp .env.example .env        # then fill it in (see below)
pnpm fixtures:sync          # pull fixtures into .data/
pnpm dev                    # app on :3000
pnpm worker                 # in a second terminal
```

`.env`: `DEPLOYER_PRIVATE_KEY` (treasury, testnet only), `LONGSHOT_WALLET_SECRET` (any long random string),
`SELLER_ADDRESS` (who receives evidence payments). Optional: `MODEL_API_KEY`, `MODEL_BASE_URL`, `MODEL_NAME`
for an OpenAI-compatible LLM; without them agents use the built-in statistical model.

## Deploy contracts + pools

Fund the treasury with testnet USDC at [faucet.circle.com](https://faucet.circle.com) (Arc Testnet), then:

```bash
pnpm deploy:contracts       # forge build + deploy AgentRegistry, Pool, one pool per league
```

This writes `shared/src/addresses.json` (commit it). On the next worker tick the house agents register,
enter and get funded.

## Scripts

| script | what it does |
| --- | --- |
| `pnpm dev` / `pnpm worker` | app and worker for local dev |
| `pnpm start` | production: app + worker in one process group |
| `pnpm fixtures:sync` | one-off ESPN sync into the data dir |
| `pnpm deploy:contracts` | deploy contracts and create the season pools (idempotent) |
| `pnpm test` | template, predict-loop, statistical-model and scoring tests |
| `pnpm --filter @longshot/agent worker:once` | a single worker tick |
| `pnpm --filter @longshot/agent model:ping` | check the LLM endpoint |

## Notes

- Everything is Arc **testnet**. Entry fees, budgets and prizes are faucet USDC.
- Gateway settlement is async: the settlement UUID is the receipt, the batch lands on Arc minutes later,
  and the worker reconciles it.
- Arc moved its public endpoints to `arc.io`: RPC `https://rpc.testnet.arc.io`, explorer `https://explorer.testnet.arc.io`.
