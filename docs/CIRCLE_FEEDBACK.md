# Circle developer-tooling feedback — from building LONGSHOT

Honest friction points and developer-experience notes from building an autonomous paying-agent app
on the Circle stack + Arc during the Lepton hackathon. Ordered by impact. Each item: what we hit,
where, and a concrete suggestion. The intent is useful, specific feedback, not a complaint list —
several of these are small docs/DX fixes that would have saved us hours.

---

## 1. The Agent Stack CLI doesn't support Arc — the chain the hackathon is about

**What we hit.** `@circle-fin/cli` (the `circle` agent-stack CLI: wallets, x402 services, pay) supports
Base, Ethereum, Arbitrum, Avalanche, Optimism, Polygon, Unichain, Monad and their testnets — but
**not Arc**. The entire hackathon is "build on Arc," and the agent-stack is pitched as "the fastest
path from a coding agent to one that holds and spends USDC." So the headline agent tooling and the
headline chain don't meet.

**Impact.** We could not use `circle services search/pay` to discover and buy x402 services settled on
Arc. We built a hybrid: the league, escrow, predictions, and our own x402 evidence endpoints run on
Arc (via Gateway nanopayments), while the *external* Circle Agent Marketplace buys settle on Base.
That split is real and we documented it, but it's a seam a builder shouldn't have to invent.

**Suggestion.** Add Arc as a first-class settlement chain in the agent-stack CLI and the x402
discovery API. If that's not ready, say so loudly in the agent-stack docs so builders plan the hybrid
up front instead of discovering it mid-build.

## 2. Arc's native USDC precompile breaks `forge script` simulation

**What we hit.** Arc's native USDC (`0x3600…0000`) `transferFrom` calls a compliance precompile
(`0x1800…0001`, `isBlocklisted`). Foundry's local EVM can't execute that precompile, so any
`forge script` that does a USDC transfer reverts in simulation with `StackUnderflow` and aborts
before broadcasting — even though the same call succeeds on-chain. This bit us deploying
`ReputationBond`: the deploy + `postBond` (which does `transferFrom`) failed as one script.

**Workaround.** Split it: deploy the contract with `forge script` (no token ops to simulate), then do
all USDC operations with `cast send`, which estimates gas against the Arc node itself (where the
precompile works) instead of forge's local EVM.

**Suggestion.** Document this prominently for Arc + Foundry (it's a sharp edge every contract builder
will hit), and ideally ship a Foundry profile or a precompile mock/cheatcode for Arc so
`forge script` and `forge test` can simulate USDC transfers locally.

## 3. Gateway batch-flush lag needs a signal, not just polling

**What we hit.** The x402 → Gateway flow returns a settlement UUID immediately (great — we let the
agent predict right away and reconcile later). But the on-chain `submitBatch` flush can lag ~10 min on
Arc testnet under low traffic. We reconcile by polling the facilitator per-UUID until status flips to
`completed`.

**Suggestion.** A webhook or an event we can subscribe to ("batch X flushed, UUIDs […] settled")
would remove the polling loop. Even a single "next flush ETA" field on the facilitator response would
let us back off intelligently.

## 4. The Gateway deposit step is easy to miss

**What we hit.** x402 payments draw from a **deposited Gateway balance**, not directly from the
agent's EOA. Our first agent runs silently failed to pay until we added a deposit step to wallet
provisioning. It wasn't obvious from the quickstart that fund-the-EOA and deposit-to-Gateway are two
separate moves.

**Suggestion.** In the agent-stack quickstart, make the deposit an explicit, numbered step with a
"check your Gateway balance" command, and have the buyer SDK throw a clear "no Gateway balance —
deposit first" error instead of a generic payment failure.

## 5. The `circle services pay` Terms gate blocks headless agents

**What we hit.** `circle services pay` requires interactively accepting Terms of Use the first time.
That's fine for a human at a prompt, but an autonomous agent (or a CI/cron run) can't get past it, and
we (correctly) won't auto-accept Terms on a user's behalf.

**Suggestion.** A documented headless consent path — an env var or a one-time `circle accept-terms`
the operator runs knowingly — so agent flows can run unattended after a human has consented once.

## 6. What worked well (keep it)

- **The x402 facilitator is public for reads.** `GET gateway-api-testnet.circle.com/v1/x402/transfers/<uuid>`
  returns status/from/to/amount/network with no auth. This made our whole settlement-proof panel
  trivial — we verify every nanopayment against Circle directly. Don't lock this down.
- **Settlement UUID as an immediate receipt** is exactly the right primitive for agents: predict now,
  reconcile later. The async model fits autonomous agents far better than blocking on-chain.
- **Native USDC gas on Arc** removes the "hold a separate gas token" tax that makes sub-cent payments
  uneconomical elsewhere. This is the thing that makes the whole nanopayment thesis real.
- **`decode-batch.ts` in the circle-agent companion repo** was the clearest single artifact for
  understanding how a Gateway batch maps back to per-buyer deltas + settlement UUIDs.
