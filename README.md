# Playground — game launchpad v0.4

Playable mini-games for sharing on the web, with creator accounts, an X player card, and a validated AI spec. The original four mechanics still run as they did: tap, reaction, number guess, and meteor dodge. New games can also use the arcade runtime, which plays a GameSpec v1.1 description on a canvas.

This is a development build. Scores are **unverified** unless a round token passes a time and rate check, in which case they are marked **checked**. That is not a claim of human verification. Token interest is still only a checkbox: there is no wallet, minting, or chain code. Rosebud is not integrated.

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

`POST /api/ai/generate` asks the model for GameSpec v1.1 with an arcade runtime: entity kinds, a spawn pattern, movement, a control scheme, win rules, scoring, a palette, and emoji sprites. The browser arcade runtime plays that spec. Version 1 specs for the original four mechanics still validate. CI and local tests use a mocked provider. A missing key stays in template mode.

| Provider | Key | Default model | API |
| --- | --- | --- | --- |
| Gemini | `GEMINI_API_KEY` | `gemini-3.8-flash` (`GEMINI_MODEL`) | `models.generateContent` with `responseMimeType: application/json` and `responseJsonSchema` |
| xAI | `XAI_API_KEY` | `grok-3` | OpenAI-compatible `POST /chat/completions` |
| OpenAI | `OPENAI_API_KEY` | `gpt-4o-mini` | OpenAI-compatible `POST /chat/completions` |

`AI_PROVIDER=auto` uses the first configured key in that order. With no key, the endpoint uses the built-in template matcher and the studio says **Template mode**. Keys stay on the server. Model output must match GameSpec v1 or v1.1. Invalid JSON is retried up to three times and is never executed.

`POST /api/generate` remains the template matcher even when a key is set.

Rosebud has no generation API and its terms prohibit automated use, so there is no Rosebud adapter.

## Routes

- `GET /` studio and discover
- `GET /g/:slug` studio opened on a published game
- `GET /play/:slug` chrome-less, mobile-first guest play page (touch and keyboard)
- `GET /play/:slug?embed=1` 480×480 player with a Play overlay. Frame ancestors are X and Twitter only
- `GET /r/:slug` X player card (`twitter:card=player`) plus a page that links to `/play` and lists the top 20
- `GET /api/games/:slug/poster.png` 1200×1200 poster used as `twitter:image`
- `GET /api/health` includes database status

`/play` and `/r` send `frame-ancestors 'self' https://x.com https://*.x.com https://twitter.com https://*.twitter.com` and do not send `X-Frame-Options`. `?embed=1` drops `'self'`. Set `PUBLIC_BASE_URL` to the public origin and `X_SITE_HANDLE` for `twitter:site`. The studio Share on X button opens `https://x.com/intent/post` with the `/r/:slug` URL.

Anonymous visitors can play and submit scores. A `play_started` event returns a round token. Sending that token with a score marks it `checked` when the round is old enough and the score is within the mechanic's rate. Missing tokens stay `unverified`. `verified` remains false. Creating, editing, publishing, and archiving require the owning account (email, password, HttpOnly session cookie, CSRF header).

## Scripts

- `npm start` — migrate, optionally seed, listen
- `npm run dev` — restart on file changes
- `npm run migrate` — apply `migrations/`
- `npm run seed` — insert the classic games and the arcade examples
- `npm test` — unit, API, and browser tests

See `.env.example` for every variable. Do not commit `.env` or `data/`.
