# Playground — game launchpad v0.3

Playable mini-games for sharing on the web, with creator accounts and a validated AI spec scaffold. The four mechanics from v0.2 still run in the browser: tap, reaction, number guess, and meteor dodge.

This is a development build. Scores are stored as **unverified**. Token interest is still only a checkbox: there is no wallet, minting, or chain code. Rosebud is not integrated.

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

`POST /api/ai/generate` picks a provider from the environment:

| Provider | Key | Default model | API |
| --- | --- | --- | --- |
| Gemini | `GEMINI_API_KEY` | `gemini-3.8-flash` (`GEMINI_MODEL`) | `models.generateContent` with `responseMimeType: application/json` and `responseJsonSchema` |
| xAI | `XAI_API_KEY` | `grok-3` | OpenAI-compatible `POST /chat/completions` |
| OpenAI | `OPENAI_API_KEY` | `gpt-4o-mini` | OpenAI-compatible `POST /chat/completions` |

`AI_PROVIDER=auto` uses the first configured key in that order. With no key, the endpoint uses the built-in template matcher and the studio says **Template mode**. Keys stay on the server. Model output must match GameSpec v1; invalid JSON is retried up to three times and is never executed.

`POST /api/generate` remains the template matcher even when a key is set.

Rosebud has no generation API and its terms prohibit automated use, so there is no Rosebud adapter.

## Routes

- `GET /` studio and discover
- `GET /g/:slug` studio opened on a published game
- `GET /play/:slug` chrome-less, mobile-first guest play page (touch and keyboard)
- `GET /r/:slug` reserved share URL. It does **not** emit `twitter:card=player` yet
- `GET /api/health` includes database status

`/play` and `/r` send `frame-ancestors 'self' https://x.com https://*.x.com https://twitter.com https://*.twitter.com` and do not send `X-Frame-Options`, so a later X Player Card can frame them. The planned card is `twitter:player` → `/play/:id` at 480×480. That card is not implemented.

Anonymous visitors can play and submit unverified scores. Creating, editing, publishing, and archiving require the owning account (email, password, HttpOnly session cookie, CSRF header).

## Scripts

- `npm start` — migrate, optionally seed, listen
- `npm run dev` — restart on file changes
- `npm run migrate` — apply `migrations/`
- `npm run seed` — insert the four example games
- `npm test` — unit, API, and browser tests

See `.env.example` for every variable. Do not commit `.env` or `data/`.
