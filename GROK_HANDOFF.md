# PLAYGROUND — Complete Grok Engineering Handoff
Date: 2026-10-09
Status: v0.2 prototype. Continue this codebase, do not replace it with a slide deck or static mockup.

## 1. Product brief
Build an AI-first game launchpad optimized for games discovered and shared on X. A creator types an idea, gets a playable game, edits theme/mechanics, previews it, publishes a public URL, and invites players to compete on leaderboards. Optional crypto-token functionality is a separate later phase, not the core game creation flow. Think AI game studio + social distribution + launchpad economics.

Primary users: creators with no coding experience, X-native communities, indie game developers, crypto-native teams.

Core flow: landing/discover -> describe idea -> generate playable preview -> tweak -> publish -> share on X -> play -> leaderboard -> creator dashboard. Token: optional and deliberately not required to play.

Product principles: actual playable games, not screenshots; one-prompt creation; mobile-first; fast sharing; user-generated-content safety; transparent token risks; real, verified metrics.

## 2. Source code provided
Full source is included alongside this document. Current package name `playground-launchpad`, version `0.2.0`.

- `package.json`: Node >=20, ESM, `npm start` -> `node server.js`; no dependencies.
- `server.js`: Node built-in HTTP server, JSON datastore, routing, validation, basic rate limit and CSP.
- `public/index.html`: creator/discovery/play UI.
- `public/style.css`: visual styles and responsive layout.
- `public/app.js`: client state, UI rendering, four game mechanics, publishing, score submission.
- `data/db.json`: created on first start; sample entries seeded if absent. Do not commit user data.
- `README.md`: original run/setup and limitations.

### Run locally
```
node --version  # 20 or newer
npm start
# http://localhost:3000
```
There is no `npm install` requirement today. PORT can be overridden, e.g. `PORT=8080 npm start`.

### API endpoints (existing)
- `GET /api/health` -> `{ok,version}`
- `GET /api/games` -> `{games: [...]}`
- `POST /api/generate` -> `{game, ...}` with `{prompt}`. **RULE-BASED template matching, NOT genuine AI**.
- `POST /api/games` -> `{game,url}`; valid fields `name`, `description`, `type` (tap, reaction, guess, dodge), `duration` (5–60), `accent` hex, `tokenInterest` boolean.
- `GET /api/games/:id` -> `{game}`
- `POST /api/games/:id/play` -> `{plays}`
- `GET /api/games/:id/scores` -> `{scores}`
- `POST /api/games/:id/scores` -> `{scores}`; `{name,points}` with scores not verified.
- `GET /g/:slug` -> HTML application shell, then client fetches content; it is not a per-game SSR page.

## 3. Actually working today
- Studio input and browser preview using four handcrafted game types: tap, reaction, number guess, falling-meteor dodge.
- Simple prompt keyword matching to select a template and generate title, accent, description.
- Saves games server-side to JSON, discover/search/sort, shareable path `/g/:id` on running host.
- Server increments play counter on opening game; rudimentary per-game scoreboards.
- Responsive browser UI. Basic validation and CSP.

## 4. Known critical limitations, bugs, and risks
- No true AI generation and no model adapter. Generated games share four fixed mechanics.
- No authentication or authorization; anyone can publish; no editing/deleting or creator ownership.
- JSON file persistence is single-instance/local-disk only, vulnerable to hosting resets and scaling problems. Serial write queue mitigates in-process concurrent writes, not multi-process coordination.
- Scores are client-submitted; easily forged. Play count increments on opening, so it is not an accurate unique-play metric.
- No moderation, abuse reporting, age controls, content safety pipeline, privacy policy, or operational tooling.
- No database migrations, automated product tests, CI, deployment configuration, metrics or error tracking.
- `npm test` currently runs 0 tests; do not call that a passing test suite.
- X link sharing via copy works; neither rich OG cards nor directly interactive games inside X have been implemented. Research current X platform capabilities and policies before assuming inline gameplay is possible.
- Token interest is only a boolean. There is NO wallet connection, smart contract, minting, swaps, bonding curve, liquidity, onchain settlement, or tax/legal analysis.
- No AI-provider integration, API credentials, payments, or deployment.
- Server has single-process per-IP in-memory throttle but no durable anti-abuse. Security review needed before opening public UGC.
- In `public/app.js`, `showGame` changes URL and counts an additional play even when navigating after publication or direct load. Define a real 'play started' event and update analytics.
- Reaction and dodge scores use different semantics; leaderboard and anti-cheat should be per-mechanic, not universal.

## 5. Suggested target architecture (not already built)
Frontend: keep existing app working while progressively migrating to TypeScript + React/Next.js if beneficial; don't rewrite just to rewrite.
Backend: authenticated API, Postgres with schema migrations and audit timestamps, durable object storage for game assets, signed uploads, rate limiting at edge/backend.
Identity: email/social login; account verification and per-creator game ownership.
Generation: provider-agnostic server adapter (choose supported LLM with user-supplied API keys), restricted JSON game spec, deterministic validation, safe execution environment; do not eval arbitrary model-generated JS in main origin. Version and cache generated specs.
Game runtimes: spec -> composable primitives (obstacles, targets, timers, sprites, scoring rules), sandboxed previews, strict CPU/time/memory quotas. Real AI-generated variants should materially differ beyond recolors.
Analytics: events (game_viewed, play_started, play_completed, shared, creator_signup), basic bot filtering and unique counts.
Share: canonical game page with dynamic OG/X metadata per game, share link composer, verify real current X embed support via official docs.
Token extension: independent optional module with reviewed Solana contracts/SDK if chosen. Explicit fees, risk disclosure, mint authority policy, controls, legal review. No simulated token trading presented as real.

## 6. Prioritized backlog with acceptance tests
### P0 — production foundation
1. Add automated tests for existing endpoints and game flows (unit, API, browser smoke). `npm test` must run actual assertions.
2. Move persistent data to Postgres (schema: users, games, game_versions, plays, scores, game_assets, abuse_reports; optionally token_projects). Add migrations and seed script. Support local dev with docker-compose or managed DB guide.
3. Add creator accounts and authorization. Anonymous users may play; only signed-in owners can edit/publish/archive their own games. Protect write routes.
4. Add request schemas, sensible rate limits, clear error states, safe input rendering, moderation reporting, secret management, and logs.
5. Make deployment reproducible with env example, health checks, tests, CI instructions. Deploy only when credentials/platform access provided; never invent a public URL.

### P1 — genuine AI generation
6. Add `/api/ai/generate` server endpoint with configurable provider. Require API key in environment, never client browser. If absent, show clearly labeled template mode.
7. Define `GameSpecV1` as a strictly validated JSON schema: name, description, theme, runtime type, enemies/targets, spawn rates, controls, scoring, difficulty, assets, content-safety constraints. Version specs.
8. Build prompt -> validated spec -> playable sandbox preview -> edit -> publish. Retry/recover gracefully on invalid model output, cap cost/size, no arbitrary external scripts in game specs.
9. Build at least 3 materially distinct generated examples that execute predictably and can be saved/reopened.

### P2 — X-native distribution
10. Serve game-specific HTML with OG tags, `twitter:card` metadata and images; test link previews. Don't imply X embeds arbitrary external HTML games.
11. Design X share text and creator/player calls to action; measure shares/referrals via attribution without invasive tracking.
12. Investigate X-supported interactive surfaces officially; if inline play unsupported, optimize a one-click mobile web experience instead.

### P3 — growth + creator economy
13. Creator dashboard: games, edits, publish state, views, authentic plays, completion rates, scores, shares.
14. Discovery: categories, trending with fraud resistance, search, moderation queue, featured games.
15. Optional token launch proposal, behind feature flag. Decide chain and token design only after legal/security review; separate token launch mechanics from games themselves.

## 7. Roadmap and autonomy instructions for Grok
Implement P0 in small reviewed batches before P1. Use parallel workstreams if supported: Backend/Data; AI Runtime; Frontend/UX; QA/Security; Social Distribution. Establish interfaces first; don't have agents overwrite the same files simultaneously. A coordinator agent should integrate branches, run tests, review diffs, and report factual results. Work autonomously where tools allow; don't claim background work if jobs cannot persist.

For each implementation batch:
1. Inspect current repository and state what is verified.
2. Make code edits, not merely recommendations or UI mockups.
3. Add tests and run them; report command output and pass/fail counts.
4. Provide a changed-file summary and clear local run steps.
5. Explicitly distinguish implemented vs proposed; identify needed credentials/access.
6. Never commit secrets, private keys, real money, or mainnet token minting by default.

## 8. Definition of meaningful MVP upgrade
A new creator can register, enter an original concept, get a genuinely AI-generated playable game safely, preview it, publish a stable URL, share it to X with a working custom preview, and inspect real engagement. Another user can open it on mobile, play, and record a verified or clearly unverified score. The app persists after restart. README includes reliable setup and tests. Token functionality can remain disabled.

## 9. Questions to resolve later (do not block building core)
- Brand: Playground is working title.
- Game generation vendor: user mentioned Google and Rosebud; assess API/embed licensing and compatibility rather than assume integration is allowed.
- X: exact supported mechanism for inline gameplay vs a website link.
- Crypto chain: likely Solana given audience, but no commitment yet.
- Revenue: freemium generation credits, creator subscription, optional token-launch fees, or game monetization.
- Hosting/budget, domain, moderation staffing, and token jurisdiction.

## 10. Paste-this prompt to Grok
You are the lead engineering coordinator for Playground, an AI game launchpad designed for X-native discovery and optional future token launches. I have provided the complete `game-launchpad-v2` repository and `GROK_HANDOFF.md`. Read the README and source code first, then continue working IN THIS CODEBASE. The current product is a functioning Node+vanilla-JS prototype with four browser game mechanics and a JSON database; it does not have true AI generation, auth, anti-cheat, X inline games, or real token issuance. Do not misrepresent any of those as complete.

Use autonomous subagents when your environment truly supports them, assigning Backend/Data, AI/Game Runtime, Frontend/UX, QA/Security, and Social/X Integration. Plan file boundaries and coordinate integration to avoid conflicting edits. Your first goal is a runnable, tested v0.3: automated API and browser tests, creator authentication/ownership, durable database, reproducible developer environment, and model-adapter scaffold with template fallback. Then build verified AI-to-GameSpec generation, game-specific X share preview, and deployment readiness. Prefer safe structured game schemas over executing model-supplied arbitrary JS. Keep token launch behind a feature flag until security/legal review; never mint real assets without express authorization.

Implement as much as your environment permits now; run commands and show concrete outputs. Supply the updated source tree or a complete patch, tests, environment variable template, setup steps, and concise implemented/unimplemented status. Ask for credentials only when unavoidable, not as a pretext to stop coding.
