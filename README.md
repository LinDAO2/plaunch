# Playground — game launchpad v1.4.1

Playable mini-games for sharing on the web, with creator accounts, an X player card, and a validated AI spec. The original four mechanics still run as they did: tap, reaction, number guess, and meteor dodge. New games can also use the arcade runtime, which plays a GameSpec v1.1 description on a canvas. Arcade specs can fall, pop up and hide, chase the player, shoot, jump on platforms, or step through a maze.

Ideas that do not fit that arcade spec use the freeform tier: one self-contained HTML document, served from `USERCONTENT_ORIGIN`, inside an iframe with `sandbox="allow-scripts allow-pointer-lock"`. The studio picks the tier automatically and the creator can override it. Freeform games still cannot open a third-party network connection.

Blocks is a first-party voxel runtime (`world` in GameSpec v1.2). Two featured worlds, Blocks: Grassland and Blocks: Candy Moon, share one map per slug over a same-origin WebSocket. Each world has a landmark to raise and sparks to gather, with the count kept on the HUD. The sky shifts between day and night, and placing, breaking, and picking up a spark play a short tone. Guests play without an account. `WORLD_GUEST_CAP` limits anonymous sockets per IP. A moderator can reset a world from the moderation page.

Creating a game does not ask for an account. The first visit sets an HttpOnly guest cookie and a guest user row. That browser can generate, preview, publish, edit, and archive its own games. Email login stays available as "Save your games" and moves those games onto the account. `AI_DAILY_LIMIT_PER_GUEST` caps generation per guest and per IP. A per-IP publish limit, the safety hold, and moderator bans still apply. Sign in with X stays off unless `X_CLIENT_ID` and `X_CLIENT_SECRET` are set, and the OAuth exchange is not implemented yet.

Discover includes six credited open-source games under the Open source tag: 2048, Lane Racer, Stack, Grid Snake, Brick Bounce, and Tower Bounce. Each page and `/r` card links the author, license, and source. The twelve Kaplay templates are playable there too — Word Guess, Block Drop, Snake, Merge Tiles, Flap, Breakout, Platformer, Endless Runner, Space Shooter, Maze Chomper, Jump Up, and Match-3 — tagged by genre. Three featured three.js games sit beside them: Arena (sci-fi blaster), Circuit Dash (kart loop), and Beacon Isle (walk and light beacons). Remix copies one into your studio so Try another style works. Import, in the header, accepts a GitHub repo, pasted HTML, or a `.html` / `.zip` upload. The server pins a commit, checks the license, inlines the page, and serves it from the sandbox. Permissive licenses (MIT, BSD, Apache-2.0, ISC, Zlib, Unlicense, CC0, WTFPL) can be hosted as-is. GPL, AGPL, LGPL, and MPL need a confirmation that the copy is unmodified. No license needs “I am the author / I have permission”. `GITHUB_TOKEN` is optional.

Posters for the Kaplay templates, the three arena games, and the six credited imports are mid-play frames in `public/posters/`, captured with Playwright by `node scripts/build-imports.mjs --posters` and `node scripts/capture-templates.mjs`. Arcade originals and both Blocks worlds use a generated mid-action card from `src/poster.js`. v1.4.0 makes Create a shared block world and renders it with a realistic three.js path (ACES, soft sun shadows, fog, bloom, and SSAO on desktop). Terrain photos are Poly Haven CC0 maps in `public/textures/`. Mobile and the X card drop SSAO and use a smaller shadow map. The repair path keeps forest, lake, beach, peaks, and canyon prompts from collapsing into one landscape. `npm run world-bakeoff` calls Claude when `ANTHROPIC_API_KEY` is set. The model returns a GameSpec v1.2 world (palette, block textures, terrain, prefabs, quests, NPC flavor, day and night, music mood), the server repairs it onto the Blocks runtime, and the play page credits Built on Blocks plus Inspired by CC0/MIT voxel references and other Playground worlds. v1.4.1 uses global fetch when a world call does not pass one, logs the reason if that call falls back to a built-in world, replaces the model's terrain seed, and gives an unnamed prompt a structure that fits the land: a cabin or dock by a lake, a lighthouse on a beach, ruins in a canyon, a watchtower in snow, or none. Remix forks a world and its spec, including placed blocks. Older templates, arcade specs, and freeform games stay playable from Discover. `AI_RESEARCH=off` skips the older reference stage on those paths. v1.3.8 turns Anthropic thinking off with `{type:between_tools}` so the output cap is left for the game, keeps a theme edit when one palette field is invalid, and self-checks a freeform game so it can be scored within 30 seconds. Claude tool-use streams keep a 90 second idle limit while a tool or thinking block is open, and a missing how-to-play line is filled by the shell overlay. v1.3.7 streams freeform generation, continues a cut-off answer once, and defaults every path to Anthropic `claude-sonnet-5-5` with Gemini as the fallback. v1.3.6 shrinks the first-person blaster into the bottom-right, frames the credited Stack, Brick Bounce, Tower Bounce, and Grid Snake posters on the candy backdrop, and swaps the arena cast for CC0 KayKit Adventurers. v1.3.5 reframes posters with Kenney Pixel Platformer tiles and over-the-shoulder arena shots. v1.3.4 applied the candy-arcade kit. v1.3.3 remains the multi-provider release. A community import keeps the title card until a background capture stores a frame. If Playwright cannot launch, the import still publishes and the title card stays.

This is a development build. Leaderboards rank **checked** scores by default. Scores without a valid round token stay **unverified** and show on a separate tab. That is not a claim of human verification. Token interest is still only a checkbox: there is no wallet, minting, or chain code. Rosebud is not integrated.

## Requirements

- Node.js 20 or newer (CI runs on Node 22)
- Optional: Docker, for local Postgres or the production stack

## Run

```bash
npm install
PORT=4100 npm start
```

`npm start` runs `node server.js` and listens on port 4100. Open http://localhost:4100.

The process applies migrations on startup. In development, an empty database is seeded unless `SEED_ON_EMPTY=false`. `npm run seed` is safe to repeat; existing ids are left alone.

Copy `.env.example` to `.env` for local overrides. That example file has placeholders only (empty keys and `replace-with-a-long-random-string`). Put real secrets in `.env`. Do not commit `.env` or `data/pglite`. Both are gitignored (`.env` directly, and `data/pglite` because `data/` is ignored).

When `DATABASE_URL` is unset, development uses file-backed [PGlite](https://pglite.dev/) at `./data/pglite`. That directory survives restarts. Production requires a `postgres://` or `postgresql://` URL.

When you run on port 4100, set `PUBLIC_BASE_URL=http://localhost:4100` in `.env`.

### Environment variables

Every variable below is listed in `.env.example`.

| Variable | Role |
| --- | --- |
| `PORT` | App listen port. Use `4100` for this local run. |
| `NODE_ENV` | `development` or `production`. |
| `DATABASE_URL` | Postgres URL. Unset in development selects `./data/pglite`. |
| `SESSION_SECRET` | Long random string. Required in production. |
| `COOKIE_SECURE` | Set `true` behind HTTPS. |
| `PUBLIC_BASE_URL` | Absolute app origin, no path. |
| `USERCONTENT_ORIGIN` | Separate origin for freeform HTML games. |
| `USERCONTENT_PORT` | Port for that sandbox origin. |
| `ALLOW_SAME_SITE_USERCONTENT` | Opt in to a same-host or same-site sandbox. |
| `X_SITE_HANDLE` | `twitter:site` handle. Leave empty to omit the tag. |
| `SEED_ON_EMPTY` | Seed example games when the games table is empty. |
| `WORLD_GUEST_CAP` | Anonymous socket cap per IP for a shared block world. |
| `RATE_LIMIT_MAX` | Requests per IP per minute. |
| `AUTH_RATE_LIMIT_MAX` | Auth requests per IP per minute. |
| `AI_RATE_LIMIT_MAX` | AI requests per IP per minute. |
| `PASSWORD_SCRYPT_N` | scrypt cost (power of two). |
| `AI_PROVIDER` | `auto`, `anthropic`, `gemini`, `openai`, or `xai`. |
| `AI_PROVIDER_SPEC` | Provider for the spec path. |
| `AI_PROVIDER_FREEFORM` | Provider for the freeform path. |
| `AI_PROVIDER_SAFETY` | Provider for the safety path. |
| `AI_FALLBACKS` | Comma-separated fallbacks used on 429 and 5xx. |
| `GEMINI_API_KEY` | Google AI Studio key. |
| `GEMINI_MODEL` | Gemini model name. |
| `OPENAI_API_KEY` | OpenAI key. |
| `OPENAI_MODEL` | OpenAI Responses model. |
| `ANTHROPIC_API_KEY` | Anthropic key. |
| `ANTHROPIC_MODEL` | Anthropic model name. |
| `ANTHROPIC_THINKING` | `off` sends thinking `{type:between_tools}`. |
| `GEMINI_THINKING_LEVEL` | Gemini thinking level. |
| `AI_TIMEOUT_MS` | Spec and template HTTP timeout. |
| `AI_FREEFORM_TIMEOUT_MS` | Freeform sandbox timeout. |
| `AI_RETRY_DELAY_MS` | Delay before one retry of a 500 or 503. |
| `SERVER_ROLE` | `all`, `app`, or `usercontent`. |
| `GITHUB_TOKEN` | Optional. Raises the GitHub API rate limit for imports. |
| `AI_RESEARCH` | `on` researches similar games before generation. |
| `ADMIN_EMAILS` | Comma-separated moderator emails. |
| `AI_DAILY_LIMIT_PER_USER` | AI attempts per account per UTC day. |
| `AI_DAILY_LIMIT_PER_GUEST` | AI attempts per guest browser per UTC day. |
| `AI_DAILY_LIMIT_GLOBAL` | AI attempts for everyone per UTC day. |
| `PUBLISH_RATE_LIMIT_MAX` | Published games per IP per minute. |
| `SAFETY_MODEL_ON_PUBLISH` | Gemini safety check on publish. |
| `X_CLIENT_ID` | Sign in with X. Disabled when empty. |
| `X_CLIENT_SECRET` | Sign in with X client secret. |
| `X_REDIRECT_URI` | Sign in with X redirect URI. |
| `GEMINI_API_BASE` | Gemini API base URL. |
| `OPENAI_BASE_URL` | OpenAI API base URL. |
| `XAI_API_KEY` | xAI key. |
| `XAI_BASE_URL` | xAI API base URL. |
| `XAI_MODEL` | xAI model name. |

### Docker

Local Postgres only (the app still runs with `npm start` on port 4100):

```bash
docker compose up -d
cp .env.example .env
export DATABASE_URL=postgres://playground:playground@localhost:5432/playground
export SESSION_SECRET="$(openssl rand -hex 32)"
export PORT=4100
export PUBLIC_BASE_URL=http://localhost:4100
npm run migrate
npm run seed
npm start
```

Image build for the app container:

```bash
docker build -t playground .
```

The image listens on 3000 and 43921 inside the container (`EXPOSE` in the `Dockerfile`). Publish the app port when you run it, and pass the same variables as `.env.example`.

Production stack (Postgres, the app, and Caddy) is `docker-compose.prod.yml`. Set `POSTGRES_PASSWORD`, `SESSION_SECRET`, `APP_DOMAIN`, and `USERCONTENT_DOMAIN` in `.env`, then:

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Caddy publishes ports 80 and 443. The app container still listens on 3000 and 43921. Host names, DNS, and the remaining production values are in [DEPLOY.md](DEPLOY.md).

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
| Anthropic | `ANTHROPIC_API_KEY` | `claude-sonnet-5-5` | Messages API with the `emit_result` tool. `tool_choice` is `auto` |
| Gemini | `GEMINI_API_KEY` | `gemini-3.5-flash` (`GEMINI_MODEL`; `gemini-3.8-flash` is optional) | `models.generateContent` with `responseMimeType: application/json` and `responseJsonSchema` |
| xAI | `XAI_API_KEY` | `grok-3` | OpenAI-compatible `POST /chat/completions` |
| OpenAI | `OPENAI_API_KEY` | `gpt-6-astra` | Responses API, no temperature |

`AI_PROVIDER=auto` uses the first configured key in that order: Anthropic, then Gemini, then xAI, then OpenAI. The sample env sets every path to Anthropic and `AI_FALLBACKS=gemini`. With no key, the endpoint uses the built-in template matcher and the studio says **Template mode**. Keys stay on the server. Model output must match GameSpec v1 or v1.1. Invalid JSON is retried up to three times and is never executed. A provider 429 is not retried. `GEMINI_THINKING_LEVEL` defaults to `low` on Gemini 3 models, and `AI_TIMEOUT_MS` defaults to 60000 for spec and template calls. Freeform uses `AI_FREEFORM_TIMEOUT_MS` (180000 when unset) and streams tokens into the studio progress bar.

AI generation is capped per UTC day. Accounts use `AI_DAILY_LIMIT_PER_USER` (default 20). Guests use `AI_DAILY_LIMIT_PER_GUEST` (default 10) for that guest and again for the IP. Everyone shares `AI_DAILY_LIMIT_GLOBAL` (default 200). Over the cap, the route returns 429 with `ai_daily_limit`.

`POST /api/generate` remains the template matcher even when a key is set.

Providers are Anthropic Messages (`claude-sonnet-5-5` by default, `tool_choice: auto`, no temperature), Gemini, xAI chat completions, and OpenAI Responses (`gpt-6-astra` by default, no temperature). `AI_PROVIDER_SPEC`, `AI_PROVIDER_FREEFORM`, and `AI_PROVIDER_SAFETY` override the path. `AI_FALLBACKS` is used only after a 429 or a 5xx. A template that the model could not edit is labeled `template fallback` and is not counted as that model's game. `npm run bakeoff -- --providers gemini,openai,anthropic --prompts test/bakeoff-prompts.txt` runs the fixture bakeoff and writes `artifacts/bakeoff/bakeoff.md`. Headless smoke runs unless you pass `--no-smoke`, and that server serves the Kenney sprite sheets. `--resmoke` replays smoke on the saved report without calling the models again. Token counts are recorded. USD is left blank when a model price is not confirmed.

### Template library

Ideas that match a known game are assembled from `templates/`, not written from scratch. Twelve files are Kaplay games with `CONFIG` (numbers), `THEME` (palette, pixel-grid sprites, names), and `RULES` (small functions): Word Guess, Block Drop, Snake, Merge Tiles, Flap, Breakout, Platformer, Endless Runner, Space Shooter, Maze Chomper, Jump Up, and Match-3. The three.js family uses the same three blocks. `THEME.mode` is `deathmatch`, `tag`, `ctf`, `race`, or `explore`. `THEME.weapon` is `blaster`, `laser`, or `none`. `THEME.sky` is `day`, `dusk`, `night`, or `neon`. `CONFIG` sets speed, bot count, round length, range, damage, and quality. Names stay generic. Sources and licenses are in [CREDITS.md](CREDITS.md).

Auto generation picks a template by keyword. A medium match can ask the configured model which template to use, then ask once for replacements of those three blocks. The server splices the JSON, rejects anything outside the editable fields, and syntax-checks the script. If the model is missing, busy, or returns a bad edit, the unmodified template is themed from the prompt and still plays, and the response says it fell back. A prompt that does not match a template with reasonable confidence is the only path that writes a freeform game from scratch. That path is at most two model calls for a template (picker plus edit) and skips the picker when the keyword is already confident. Freeform asks for compact HTML that reuses `/kaplay.js`, `/zzfx.js`, `/three.js`, and the Kenney sprite sheets instead of inlining them. The call streams, stops near 8000 output tokens, and continues once if the provider stops on `max_tokens`, staying under 12000 output tokens.

The studio shows `Built on: <template>` and `Try another style`, which re-rolls `THEME` only. Every template, the arcade canvas, Blocks, and imported-game chrome share the candy-arcade kit in `src/style-kit.js`: dark outlines, the yellow Play button, and the day sky colors. New model prompts are told to follow that kit. Imported games keep their original code and license; the wrapper adds the start gate and the credit line.

Kaplay 3001.0.19 and ZzFX are pinned under `vendor/` and served as `/kaplay.js` and `/zzfx.js` from the usercontent origin. three.js r170 is pinned at `vendor/three/three.min.js` and served as `/three.js`. That build also exposes `GLTFLoader`, `EffectComposer`, `RenderPass`, `UnrealBloomPass`, `OutputPass`, and `RoomEnvironment`. It does not include Draco, meshopt, or KTX2 decoders. Kenney CC0 glTF files live in `vendor/arena-assets/` and are served as `/assets/*` before the iframe gate. A game loads only the pack for its mode. The blaster meshes embed the Kenney colormap, so they do not need a second texture request. A 3D page never opens a socket. The play page relays input to `/api/arenas/:slug`, and the server decides hits, scores, and bot movement. Rooms hold up to 12 people. Bots fill empty seats. Guests join with the same cookie as Blocks. `WORLD_GUEST_CAP` limits anonymous sockets per IP. Quality is low, medium, or high. The 480 card and coarse pointers start on low (no shadow map, no bloom, Lambert materials, outlines kept). Medium and high add a 512 or 1024 shadow map, a sun that stays on, and bloom at half resolution with threshold 0.9. Day and dusk use Neutral tone mapping at exposure 1.0. Night and neon use ACES Filmic at exposure 1.1. Exact sky, fog, sun, team, and floor colors are the `SKY_LOOK` table in `src/arena/view.js`. A `#sky=day|dusk|night|neon` hash overrides `THEME.sky` for poster capture. The HUD and one-tap start screen are in `src/arena/render.js`. There is no sign-in on the play path.

### Freeform sandbox (v1.2)

Kaplay templates stay the primary path. When a prompt does not match a template, auto generation falls through to a sandboxed HTML game. The studio can also pick **Sandbox** (`tier: "freeform"`) so the model writes that document directly. With no provider key, that path returns a deterministic canvas fixture. A key asks the configured model (Anthropic `claude-sonnet-5-5` by default) for one HTML document and shows token progress while it streams. Tests mock that call. The document is checked and stored. It is never executed on the app origin.

Limits before a document is served:

- One HTML page, at most 150KB, with a canvas and a `playground-score` postMessage
- No `fetch`, XHR, WebSocket, `eval`, Function constructor, workers, nested frames, or external URLs
- Script `src` allowlist is `/kaplay.js`, `/zzfx.js`, and `/three.js` on the sandbox origin
- `parent.postMessage` is allowed. `parent.document`, `top.location`, `contentWindow`, and `contentDocument` are refused
- No `document.cookie`, `localStorage`, `sessionStorage`, or `document.domain`

The play page mounts the game in an iframe whose attribute is `sandbox="allow-scripts allow-pointer-lock"`. That omits `allow-same-origin`, so the frame origin is `"null"`, it cannot read the parent DOM, and it sends no cookies. Pointer lock is requested for mouse look. If a parent frame denies it, hold-to-drag still looks. The parent accepts a score only as `{ type: "playground-score", points }` from `event.origin === "null"`.

The sandbox response CSP is exactly:

`default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data: blob:; media-src data: blob:; connect-src 'self'; font-src 'self'; frame-src 'none'; child-src 'none'; worker-src 'none'; form-action 'none'; base-uri 'none'; sandbox allow-scripts allow-pointer-lock; frame-ancestors <app origin> https://x.com https://*.x.com https://twitter.com https://*.twitter.com`

There is no `unsafe-eval` and no `wasm-unsafe-eval`. `font-src 'self'` lets a sandboxed page load the OFL woff2 files served on that same origin. `script-src 'self'` exists so the page can load the pinned Kaplay, ZzFX, and three.js files.

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
