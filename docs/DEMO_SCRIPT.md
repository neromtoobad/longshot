# LONGSHOT — demo script (under 3 minutes)

Recorded walkthrough for the Lepton submission. Target ~2:45. Live site: https://longshot-tan.vercel.app
· Repo: https://github.com/neromtoobad/longshot

Voice: lowercase, plain, fast. Show, don't tell. Every claim is backed by something real on screen.

---

## 0:00–0:20 — the hook (home page)

> "this is longshot. a prediction-agent league on arc. you build an agent, fund it, and drop it in
> the pool. it predicts real world cup scores on its own. but to predict well it has to spend — it
> buys evidence per call, sub-cent, in usdc on arc. it pays its own way."

Show: home page hero, the live activity ticker.

## 0:20–0:50 — the agent actually decides (agentic sophistication, 30%)

Open an agent page (`/agent/4`), hit **watch it think**.

> "before it predicts, the agent asks: which data is worth paying for, for THIS match? it values
> each source zero to one and buys only what clears its threshold. here it bought form and injuries
> — high value — and skipped odds and h2h because they wouldn't move the call. that's the agent
> deciding, not a fixed rule."

Show: the decision replay — BUY form (value 0.9), BUY injuries (0.8), SKIP odds (0.3), SKIP h2h
(0.1), each with a one-line match-specific reason, then the verdict.

## 0:50–1:25 — the payments are real (Circle tool usage, 20%)

Go to `/stats`, scroll to **settlement proof**.

> "every evidence buy is a real x402 nanopayment. the agent signs an eip-712 transfer, circle's
> gateway returns a settlement uuid, the agent predicts immediately, and circle batches it on-chain.
> these are reconciled live against circle's gateway facilitator — 27 of 27 settled on arc. average
> transaction size stays sub-cent by design. that's the rfb-01 headline metric."

Show: the settlement table — agent → x402 → Gateway → seller, amounts like $0.0030, "settled on Arc".

## 1:25–2:00 — reputation as money on the line (innovation, 20%)

Stay on `/stats`, scroll to **bonded reputation**.

> "the data broker stakes a usdc bond behind each source it sells. when a match resolves, good data
> holds the bond, bad data slashes it — on-chain, in usdc. here, odds misled and got slashed; form,
> injuries and h2h held at a hundred percent. reputation is capital at risk, not a number you ask to
> be trusted. the rfbs flagged this erc-8004 lane as nearly empty. it's live on arc."

Show: the bond panel — form/injuries/h2h BOND INTACT, odds SLASHED $0.02, the contract address.

## 2:00–2:30 — the loop closes (traction, 30%)

Go to `/leaderboard`, then `/pool`.

> "agents are ranked two ways: accuracy, and roi — accuracy per dollar of data bought. the cheap
> agent that buys nothing has infinite roi; the spendy one has to earn it. matches resolve from real
> espn results, agents score, and when the pool finalizes the top agents split the usdc prize. it's
> the whole loop, live, on arc testnet."

Show: leaderboard with the four scored agents + ROI column; pool page with real fixtures.

## 2:30–2:45 — close

> "build your longshot, drop it in the pool, it earns its rank by beating the favorites and paying
> its own way. it's live — link's in the description. that's longshot."

Show: home page, "Connect wallet" / "+ New agent".

---

## recording checklist

- [ ] run a fresh prediction first so a recent decision log shows the value-of-information reasoning
- [ ] `/stats` has settlements reconciled (run `pnpm --filter @longshot/app reconcile` beforehand)
- [ ] use the clean production URL `longshot-tan.vercel.app`, not the deployment hash url
- [ ] keep it under 3:00 — the form requires it. trim the close if needed.
- [ ] upload to Loom/YouTube/Vimeo, paste the link in the submission form
