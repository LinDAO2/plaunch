# Playground — game launchpad v0.9.1

Playable mini-games for sharing on the web, with creator accounts, an X player card, and a validated AI spec. The original four mechanics still run as they did: tap, reaction, number guess, and meteor dodge. New games can also use the arcade runtime, which plays a GameSpec v1.1 description on a canvas. Arcade specs can fall, pop up and hide, chase the player, shoot, jump on platforms, or step through a maze.

Ideas that do not fit that arcade spec use the freeform tier: one self-contained HTML document, served from `USERCONTENT_ORIGIN`, inside an iframe with `sandbox="allow-scripts"`. The studio picks the tier automatically and the creator can override it. Freeform games still cannot open a network connection.

Blocks is a first-party voxel runtime (`world` in GameSpec v1.2). Two featured worlds, Blocks: Grassland and Blocks: Candy Moon, share one map per slug over a same-origin WebSocket. Guests play without an account. `WORLD_GUEST_CAP` limits anonymous sockets per IP. A moderator can reset a world from the moderation page.

Creating a game does not ask for an account. The first visit sets an HttpOnly guest cookie and a guest user row. That browser can generate, preview, publish, edit, and archive its own games. Email login stays available as "Save your games" and moves those games onto the account. `AI_DAILY_LIMIT_PER_GUEST` caps generation per guest and per IP. A per-IP publish limit, the safety hold, and moderator bans still apply. Sign in with X stays off unless `X_CLIENT_ID` and `X_CLIENT_SECRET` are set, and the OAuth exchange is not implemented yet.

This is a development build. Leaderboards rank **checked** scores by default. Scores without a valid round token stay **unverified** and show on a separate tab. That is not a claim of human verification. Token interest is still only a checkbox: there is no wallet, minting, or chain code. Rosebud is not integrated.

## Requirements

- Node.js 20 or newer (CI runs on Node 22)
- Optional: Docker, for local Postgres

## Run locally

```bash
npm install
npm start
```

Open http://localhost:3000.

With no `DATABASE_URL`, development mode uses file-backed [PGlite](https://pglite.dev/) at `./data/pglite`. That data survives restarts and is gitignored. Production refuses to boot on PGlite.

### Postgres

```bash
docker compose up -d
cp .env.example .env
# edit SESSION_SECRET, then:
export DATABASE_URL=postgres://playground:playground@localhost:5432/playground
export SESSION_SECRET="$(openssl rand -hex 32)"
npm run migrate
npm run seed
npm start
```

The server applies migrations on startup. `npm run seed` is safe to repeat; existing ids are left alone. In development, an empty database is seeded automatically unless `SEED_ON_EMPTY=false`.

## Test

```bash
npm install
npx playwright install chromium
npm test
```

`npm test` runs unit tests, API tests for every route, and a Chromium smoke test of the studio and `/play/:slug` flow. Tests use in-memory PGlite, not Docker.

## AI generation

`POST /api/ai/generate` asks the model for GameSpec v1.1 with an arcade runtime: entity kinds, a spawn pattern, movement, a control scheme, win rules, scoring, a palette, emoji sprites, and a primitive set (`fall`, `popup`, `chase`, `shoot`, `platform`, `maze`). The prompt includes contrasting examples and asks the model to vary rates and combo values. The browser arcade runtime plays that spec. Version 1 specs for the original four mechanics still validate. CI and local tests use a mocked provider. A missing key stays in template mode.

| Provider | Key | Default model | API |
| --- | --- | --- | --- |
| Gemini | `GEMINI_API_KEY` | `gemini-3.5-flash` (`GEMINI_MODEL`; `gemini-3.8-flash` is optional) | `models.generateContent` with `responseMimeType: application/json` and `responseJsonSchema` |
| xAI | `XAI_API_KEY` | `grok-3` | OpenAI-compatible `POST /chat/completions` |
| OpenAI | `OPENAI_API_KEY` | `gpt-4o-mini` | OpenAI-compatible `POST /chat/completions` |

`AI_PROVIDER=auto` uses the first configured key in that order. With no key, the endpoint uses the built-in template matcher and the studio says **Template mode**. Keys stay on the server. Model output must match GameSpec v1 or v1.1. Invalid JSON is retried up to three times and is never executed. A provider 429 is not retried. `GEMINI_THINKING_LEVEL` defaults to `low` on Gemini 3 models, and `AI_TIMEOUT_MS` defaults to 60000.

AI generation is capped per UTC day. Accounts use `AI_DAILY_LIMIT_PER_USER` (default 20). Guests use `AI_DAILY_LIMIT_PER_GUEST` (default 10) for that guest and again for the IP. Everyone shares `AI_DAILY_LIMIT_GLOBAL` (default 200). Over the cap, the route returns 429 with `ai_daily_limit`.

`POST /api/generate` remains the template matcher even when a key is set.

### Freeform sandbox

`POST /api/ai/generate` accepts `tier`: `auto` (default), `spec`, or `freeform`. Auto keeps tap, dodge, reaction, guess, and the arcade primitives on GameSpec. Other ideas return `{ tier: "freeform", html }` and `spec: null`. The model must return one HTML document with a canvas, inline CSS and JavaScript, and no network. Static checks reject external URLs, `fetch`, XHR, WebSocket, `eval`, the Function constructor, and `document.cookie` / `localStorage`. A rejection is shown to the model once. The document is never executed on the server.

Freeform HTML is stored on the game and served only by the usercontent listener (`GET /g/:slug` and short-lived `GET /preview/:token`). Its CSP is `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; connect-src 'none'`, with `frame-ancestors` for the app origin, x.com, and twitter.com. Scores come back only as `postMessage` `{ type: "playground-score", points }`. The parent accepts that shape from the iframe, and only when `event.origin` is `"null"`.

Set `USERCONTENT_ORIGIN` to a different origin from the app. In development it defaults to `http://127.0.0.1:43921`. Production requires `PUBLIC_BASE_URL` and `USERCONTENT_ORIGIN`, and it refuses to boot when those hosts match or share a registrable domain. A separate domain such as `playgroundusercontent.com` is the layout to use. `ALLOW_SAME_SITE_USERCONTENT=true` is the explicit opt-in for a subdomain. Auto tier prefers a freeform game when the idea needs its own rules, physics, or levels, and keeps the arcade spec for a simple tap, dodge, reaction, guess, or arcade game. An idea the keyword check cannot place is sent to the model when a key is set. `POST /api/freeform/preview` requires a creator (the guest cookie or an account) and counts toward the AI rate limit. `/play/:slug?embed=1` and `/r/:slug` use the same 480×480 player for freeform games. The parent hides its timer and shows the best score; the game draws its own HUD.

Discover is at `/discover`. Trending ranks unique `play_started` events from the last 24 hours. The same session and IP hash counts once, a burst of three starts inside two minutes is left out, and the creator's own signed-in plays are left out. New is chronological. Featured is set by a moderator.

`ADMIN_EMAILS` is a comma-separated moderator list. Moderators use `/admin` to review abuse reports, hide or unhide a game, archive it, feature it, and ban an account. Those actions are written to `audit_log`. A title, description, or prompt that hits the blocklist is stored as `pending` and stays off Discover until a moderator unhides it. When `GEMINI_API_KEY` is set, publish also asks Gemini for a safety classification, and a flagged game is held the same way.

`/privacy` and `/terms` are drafts. They say they need legal review and are not in effect.

Production layout, accounts, and DNS records are in [DEPLOY.md](DEPLOY.md).

Rosebud has no generation API and its terms prohibit automated use, so there is no Rosebud adapter.

## Routes

- `GET /` studio and discover
- `GET /studio/dashboard` creator dashboard for this browser's guest, or for the signed-in account
- `GET /g/:slug` studio opened on a published game
- `GET /play/:slug` chrome-less, mobile-first guest play page (touch and keyboard)
- `GET /play/:slug?embed=1` 480×480 player with a Play overlay. Frame ancestors are X and Twitter only
- `GET /r/:slug` X player card (`twitter:card=player`) plus a page that links to `/play` and lists checked and unverified scores
- `POST /api/games/:slug/share` counts a click on the studio Share on X button
- `GET /api/games/:slug/poster.png` 1200×1200 poster used as `twitter:image`
- `GET /api/health` includes database status

`/play` and `/r` send `frame-ancestors 'self' https://x.com https://*.x.com https://twitter.com https://*.twitter.com` and do not send `X-Frame-Options`. `?embed=1` drops `'self'`. Set `PUBLIC_BASE_URL` to the public origin and `X_SITE_HANDLE` for `twitter:site`. The studio Share on X button opens `https://x.com/intent/post` with the `/r/:slug` URL.

Anonymous visitors can play and submit scores. A `play_started` event returns a round token. That token is consumed in the same transaction as the score insert. A plausible score is `checked`; a missing token stays `unverified`. Leaderboards return checked scores in `scores` and unverified scores in `unverified`. `verified` remains false. Creating, editing, publishing, and archiving require the owning account (email, password, HttpOnly session cookie, CSRF header). The dashboard lists each owned game with publish state, views, play_started, completions, shares, and the top checked score.

## Scripts

- `npm start` — migrate, optionally seed, listen
- `npm run dev` — restart on file changes
- `npm run migrate` — apply `migrations/`
- `npm run seed` — insert the classic games and the arcade examples
- `npm test` — unit, API, and browser tests

See `.env.example` for every variable. Do not commit `.env` or `data/`.
