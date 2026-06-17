# PHASE 0 — Setup Checklist (do all of this before writing code)

## Access & registration
- [ ] Register on Luma: luma.com/5xcrazms — passphrase **SITEx2224**
- [ ] Enter your GitHub handle (neromtoobad) and Discord handle EXACTLY. This is how
      submissions are collated. A typo here loses your entry.
- [ ] Join the Canteen Discord (discord.gg/rsVfYutFZg). Say hello, say you're building LONGSHOT.
- [ ] Join the Arc builder Discord (discord.com/invite/buildonarc). Mention "Canteen + Lepton"
      in onboarding. If rejected, ping @kdrohan in the Canteen Discord.

## Tooling
- [ ] Confirm Node v20.18.2 or higher (`node -v`)
- [ ] Confirm uv is installed (`uv --version`)
- [ ] Install the Canteen ARC CLI: `uv tool install git+https://github.com/the-canteen-dev/ARC-cli.git`
      (installs a binary named `arc-canteen` at `~/.local/bin/`)
- [ ] `arc-canteen login` — authenticate with GitHub, set Discord / Telegram / Luma email in profile
- [ ] `arc-canteen rpc-url --export` — writes `$RPC` to your env (this is your Arc testnet RPC,
      proxied by Canteen; note the proxy enforces a JSON-RPC method allowlist)
- [ ] `arc-canteen shell-init >> ~/.zshrc` so `$RPC` auto-loads in every shell
- [ ] `arc-canteen rpc eth_chainId` — confirm the chain answers
- [ ] Install Circle CLI: `npm install -g @circle-fin/cli`
- [ ] Fund a dev wallet with testnet USDC from faucet.circle.com; note the address
- [ ] Note for the whole event: traction is logged through the CLI with
      `arc-canteen update traction` and `arc-canteen update product`. Push real updates all
      through the window, not just at the end. This very likely feeds the 30% traction score.

## Study (timebox ~90 min, do not rabbit-hole)
- [ ] `arc-canteen context sync` — clones the-canteen-dev/context-arc into `~/.arc-canteen/context/`,
      bundling the Arc + Circle dev docs plus five sample codebases as submodules. one command,
      the whole reference set.
- [ ] `arc-canteen context | claude` — pipe that full context into Claude Code so it builds
      against the real Arc/Circle docs and samples out of the box (use `--paths` for just paths,
      `--full` to inline every doc)
- [ ] Run the-canteen-dev/circle-agent locally (`npm install && npm start`) and pay its
      /hello-world endpoint once from the browser buyer. This is the fastest way to see one real
      x402 + Gateway settlement land end to end before you build your own. Note the ~10-min
      testnet batch lag so it doesn't surprise you later.
- [ ] Inside the synced samples, find and read the x402 seller + Gateway batching + paying-agent
      loop (arc-nanopayments). This is the spine of the whole build.
- [ ] Skim the escrow and prediction-market samples (pool escrow/payout, resolution)
- [ ] Open CROSSFIRE repo and tag the files worth reusing: leaderboard, agent page, ESPN
      fixture ingestion. Mark the MetaMask/1Shot/Base files as DO-NOT-PORT.

## Decisions locked (do not relitigate)
- Name: **LONGSHOT**
- Anchor: **A + B** = RFB 1 (autonomous paying agents) + RFB 3 (agent-to-agent / data broker)
- Live pool: **World Cup**. Group stage runs through Jun 27, Round of 32 starts Jun 28. The
  entire window has live matches. Premier League is off-season; build it as structure only.
- MVP rule: close the loop on ONE pool, live, before adding anything.

## Repo
- [ ] Create public repo: github.com/neromtoobad/longshot
- [ ] Configure git identity FIRST (`git config user.name` / `user.email`) — Delphi Duel lesson
- [ ] Drop CLAUDE.md, BUILD_GUIDE.md, EXECUTION_PLAN.md in the repo root
- [ ] Add a README stub with the one-line pitch

## Env
- [ ] `$RPC` comes from `arc-canteen rpc-url --export` / `arc-canteen shell-init`, not a hardcoded
      URL. Have your app read `process.env.RPC`.
- [ ] `.env` with: CIRCLE_API_KEY, CIRCLE_ENTITY_SECRET (or as the Circle CLI requires),
      MODEL_PROVIDER_KEY, ESPN/data source keys, DEPLOYER_PRIVATE_KEY (testnet only). RPC is in `$RPC`.
- [ ] Commit `.env.example`, gitignore `.env`
- [ ] Never commit a real key. Testnet keys only on this machine. Note `arc-canteen` RPC tokens
      expire after 90 days; `rotate-rpc-key` mints a fresh one.

## Sanity gate before Phase 1
You should be able to: run `arc-canteen rpc eth_chainId` and get a chain id, read a testnet USDC
balance through `$RPC`, and run one x402 request against the bundled nanopayments sample. If those
three work, start building.
