# Playground — game launchpad v1.3.1

Playable mini-games for sharing on the web, with creator accounts, an X player card, and a validated AI spec. The original four mechanics still run as they did: tap, reaction, number guess, and meteor dodge. New games can also use the arcade runtime, which plays a GameSpec v1.1 description on a canvas. Arcade specs can fall, pop up and hide, chase the player, shoot, jump on platforms, or step through a maze.

Ideas that do not fit that arcade spec use the freeform tier: one self-contained HTML document, served from `USERCONTENT_ORIGIN`, inside an iframe with `sandbox="allow-scripts allow-pointer-lock"`. The studio picks the tier automatically and the creator can override it. Freeform games still cannot open a third-party network connection.

Blocks is a first-party voxel runtime (`world` in GameSpec v1.2). Two featured worlds, Blocks: Grassland and Blocks: Candy Moon, share one map per slug over a same-origin WebSocket. Each world has a landmark to raise and sparks to gather, with the count kept on the HUD. The sky shifts between day and night, and placing, breaking, and picking up a spark play a short tone. Guests play without an account. `WORLD_GUEST_CAP` limits anonymous sockets per IP. A moderator can reset a world from the moderation page.

Creating a game does not ask for an account. The first visit sets an HttpOnly guest cookie and a guest user row. That browser can generate, preview, publish, edit, and archive its own games. Email login stays available as "Save your games" and moves those games onto the account. `AI_DAILY_LIMIT_PER_GUEST` caps generation per guest and per IP. A per-IP publish limit, the safety hold, and moderator bans still apply. Sign in with X stays off unless `X_CLIENT_ID` and `X_CLIENT_SECRET` are set, and the OAuth exchange is not implemented yet.

Discover includes six credited open-source games under the Open source tag: 2048, Lane Racer, Stack, Grid Snake, Brick Bounce, and Tower Bounce. Each page and `/r` card links the author, license, and source. The twelve Kaplay templates are playable there too — Word Guess, Block Drop, Snake, Merge Tiles, Flap, Breakout, Platformer, Endless Runner, Space Shooter, Maze Chomper, Jump Up, and Match-3 — tagged by genre. Three featured three.js games sit beside them: Arena (sci-fi blaster), Circuit Dash (kart loop), and Beacon Isle (walk and light beacons). Remix copies one into your studio so Try another style works. Import, in the header, accepts a GitHub repo, pasted HTML, or a `.html` / `.zip` upload. The server pins a commit, checks the license, inlines the page, and serves it from the sandbox. Permissive licenses (MIT, BSD, Apache-2.0, ISC, Zlib, Unlicense, CC0, WTFPL) can be hosted as-is. GPL, AGPL, LGPL, and MPL need a confirmation that the copy is unmodified. No license needs “I am the author / I have permission”. `GITHUB_TOKEN` is optional.

Posters for those eighteen games are mid-play frames in `public/posters/`, captured with Playwright by `node scripts/build-imports.mjs --posters` and `node scripts/capture-templates.mjs`. Discover uses that file. A community import keeps the title card until a background capture stores a frame. If Playwright cannot launch, the import still publishes and the title card stays.

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

### Template library

Ideas that match a known game are assembled from `templates/`, not written from scratch. Twelve files are Kaplay games with `CONFIG` (numbers), `THEME` (palette, pixel-grid sprites, names), and `RULES` (small functions): Word Guess, Block Drop, Snake, Merge Tiles, Flap, Breakout, Platformer, Endless Runner, Space Shooter, Maze Chomper, Jump Up, and Match-3. The three.js family uses the same three blocks. `THEME.mode` is `deathmatch`, `tag`, `ctf`, `race`, or `explore`. `THEME.weapon` is `blaster`, `laser`, or `none`. `THEME.sky` is `day`, `dusk`, `night`, or `neon`. `CONFIG` sets speed, bot count, round length, range, damage, and quality. Names stay generic. Sources and licenses are in [CREDITS.md](CREDITS.md).

Auto generation picks a template by keyword. A medium match can ask Gemini which template to use, then ask once for replacements of those three blocks. The server splices the JSON, rejects anything outside the editable fields, and syntax-checks the script. If the model is missing, busy, or returns a bad edit, the unmodified template is themed from the prompt and still plays. A prompt that does not match a template with reasonable confidence is the only path that writes a freeform game from scratch. That path is at most two Gemini calls for a template (picker plus edit) and skips the picker when the keyword is already confident.

The studio shows `Built on: <template>` and `Try another style`, which re-rolls `THEME` only.

Kaplay 3001.0.19 and ZzFX are pinned under `vendor/` and served as `/kaplay.js` and `/zzfx.js` from the usercontent origin. three.js r170 is pinned at `vendor/three/three.min.js` and served as `/three.js`. That build also exposes `GLTFLoader`, `EffectComposer`, `RenderPass`, `UnrealBloomPass`, `OutputPass`, and `RoomEnvironment`. It does not include Draco, meshopt, or KTX2 decoders. Kenney CC0 glTF files live in `vendor/arena-assets/` and are served as `/assets/*` before the iframe gate. A game loads only the pack for its mode. The blaster meshes embed the Kenney colormap, so they do not need a second texture request. A 3D page never opens a socket. The play page relays input to `/api/arenas/:slug`, and the server decides hits, scores, and bot movement. Rooms hold up to 12 people. Bots fill empty seats. Guests join with the same cookie as Blocks. `WORLD_GUEST_CAP` limits anonymous sockets per IP. Quality is low, medium, or high. The 480 card and coarse pointers start on low (no shadow map, no bloom, Lambert materials). Medium and high add shadow maps and bloom. Colors, fog distances, and the HUD read `THEME` tokens. Palette, HUD layout, menu styling, and poster frames are not a finished art direction.

### Freeform sandbox (v1.2)

Kaplay templates stay the primary path. When a prompt does not match a template, auto generation falls through to a sandboxed HTML game. The studio can also pick **Sandbox** (`tier: "freeform"`) so the model writes that document directly. With no `GEMINI_API_KEY`, that path returns a deterministic canvas fixture. A key asks Gemini for one HTML document. Tests mock that call. The document is checked and stored. It is never executed on the app origin.

Limits before a document is served:

- One HTML page, at most 150KB, with a canvas and a `playground-score` postMessage
- No `fetch`, XHR, WebSocket, `eval`, Function constructor, workers, nested frames, or external URLs
- Script `src` allowlist is `/kaplay.js`, `/zzfx.js`, and `/three.js` on the sandbox origin
- `parent.postMessage` is allowed. `parent.document`, `top.location`, `contentWindow`, and `contentDocument` are refused
- No `document.cookie`, `localStorage`, `sessionStorage`, or `document.domain`

The play page mounts the game in an iframe whose attribute is `sandbox="allow-scripts allow-pointer-lock"`. That omits `allow-same-origin`, so the frame origin is `"null"`, it cannot read the parent DOM, and it sends no cookies. Pointer lock is requested for mouse look. If a parent frame denies it, hold-to-drag still looks. The parent accepts a score only as `{ type: "playground-score", points }` from `event.origin === "null"`.

The sandbox response CSP is exactly:

`default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data: blob:; media-src data: blob:; connect-src 'self'; frame-src 'none'; child-src 'none'; worker-src 'none'; form-action 'none'; base-uri 'none'; sandbox allow-scripts allow-pointer-lock; frame-ancestors <app origin> https://x.com https://*.x.com https://twitter.com https://*.twitter.com`

There is no `unsafe-eval` and no `wasm-unsafe-eval`. `font-src` falls back to `default-src 'none'`. `script-src 'self'` exists so the page can load the pinned Kaplay and ZzFX files on that same origin.

Discover labels these games **Sandboxed**. `/play/:slug` and `/r/:slug` carry the same 480×480 `twitter:player` card as other games, and the page says the game is sandboxed. Guests generate, preview, and publish with the guest cookie. No account is required. `POST /api/freeform/preview` counts toward the AI rate limit.

Set `USERCONTENT_ORIGIN` to a different origin from the app. In development it defaults to `http://127.0.0.1:43921`. Production requires `PUBLIC_BASE_URL` and `USERCONTENT_ORIGIN`, and it refuses to boot when those hosts match or share a registrable domain. A separate domain such as `playgroundusercontent.com` is the layout to use. `ALLOW_SAME_SITE_USERCONTENT=true` is the explicit opt-in for a subdomain.

Discover is at `/discover`. Trending ranks unique `play_started` events from the last 24 hours. The same session and IP hash counts once, a burst of three starts inside two minutes is left out, and the creator's own signed-in plays are left out. New is chronological. Featured is set by a moderator.

`ADMIN_EMAILS` is a comma-separated moderator list. Moderators use `/admin` to review abuse reports, hide or unhide a game, archive it, feature it, and ban an account. Those actions are written to `audit_log`. A title, description, or prompt that hits the blocklist is stored as `pending` and stays off Discover until a moderator unhides it. When `GEMINI_API_KEY` is set, publish can also ask Gemini for a safety classification, and a flagged game is held the same way. That call spends quota. `SAFETY_MODEL_ON_PUBLISH=false` skips it. The default is on in production and off in development. The blocklist still runs.

`/privacy` and `/terms` are drafts. They say they need legal review and are not in effect.

Production layout, accounts, and DNS records are in [DEPLOY.md](DEPLOY.md).

Rosebud has no generation API and its terms prohibit automated use, so there is no Rosebud adapter.

## Routes

- `GET /` studio and discover
- `GET /studio/dashboard` creator dashboard for this browser's guest, or for the signed-in account
- `GET /g/:slug` studio opened on a published game
- `GET /play/:slug` chrome-less, mobile-first guest play page (touch and keyboard)
- `GET /play/:slug?embed=1` 480×480 player with a Play overlay. Frame ancestors are X and Twitter only
- `GET /r/:slug` X player card (`twitter:card=player`) plus a page that links to `/play` and lists checked and unverified scores. Blocks worlds add a Share on X checklist with the card title, the `?embed=1` player URL, and the poster image.
- `POST /api/games/:slug/share` counts a click on the studio Share on X button
- `GET /api/games/:slug/poster.png` 1200×1200 poster used as `twitter:image`
- `GET /api/health` includes database status

`/play` and `/r` send `frame-ancestors 'self' https://x.com https://*.x.com https://twitter.com https://*.twitter.com` and do not send `X-Frame-Options`. `?embed=1` drops `'self'`. A Blocks play page carries the same `twitter:player` and Open Graph tags as its `/r` card, with the player URL set to `/play/:slug?embed=1` at 480×480. Set `PUBLIC_BASE_URL` to the public origin and `X_SITE_HANDLE` for `twitter:site`. The studio Share on X button opens `https://x.com/intent/post` with the `/r/:slug` URL.

Anonymous visitors can play and submit scores. A `play_started` event returns a round token. That token is consumed in the same transaction as the score insert. A plausible score is `checked`; a missing token stays `unverified`. Leaderboards return checked scores in `scores` and unverified scores in `unverified`. `verified` remains false. Creating, editing, publishing, and archiving require the owning account (email, password, HttpOnly session cookie, CSRF header). The dashboard lists each owned game with publish state, views, play_started, completions, shares, and the top checked score.

## Scripts

- `npm start` — migrate, optionally seed, listen
- `npm run dev` — restart on file changes
- `npm run migrate` — apply `migrations/`
- `npm run seed` — insert the classic games and the arcade examples
- `npm test` — unit, API, and browser tests

See `.env.example` for every variable. Do not commit `.env` or `data/`.
