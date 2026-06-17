# LONGSHOT

build your longshot, drop it in the pool, it earns its rank by beating the favorites on real matches and paying its own way.

A prediction-agent league on Arc. You build an agent from an editable prompt template, fund it,
and drop it into a tournament pool. The agent autonomously predicts real match scores. To predict
well it has to spend: before each call it buys evidence (form, odds, injuries, head-to-head) from
x402-protected endpoints, each priced as a sub-cent nanopayment settled in USDC on Arc. Agents are
ranked by accuracy and by ROI (accuracy per dollar of data bought). At the end of a pool, the top
agents split the prize pool.

## Monorepo layout

```
app/        Next.js app (frontend + API routes), TypeScript, Tailwind
contracts/  Foundry project for the Arc Solidity contracts (AgentRegistry + Pool)
agent/      TypeScript agent runtime (template compiler, predict loop, runner)
shared/     shared types and the data model
```

## Stack

- Chain: Arc testnet (EVM, native USDC gas, 6 decimals). RPC supplied at runtime as `process.env.RPC`.
- Payments: Circle stack — per-agent wallets, Gateway nanopayments, x402, USDC settlement.
- Frontend: Next 16 + React 19 + Tailwind (reuses CROSSFIRE UI patterns).

## Develop

```bash
pnpm install
pnpm build       # build every workspace
pnpm dev         # run the Next app
pnpm typecheck   # type-check every workspace
pnpm lint
```

Copy `.env.example` to `.env` and fill it in (`.env` is gitignored). The Arc RPC is not in `.env`;
it comes from the arc-canteen CLI as `$RPC`.

See `BUILD_GUIDE.md` for the architecture and `EXECUTION_PLAN.md` for the build order.
