# Playground — game launchpad v0.2

Playable, multi-user **prototype** built with Node.js and plain HTML/CSS/JS. No API keys and no dependencies to install.

## Start

```bash
node --version  # Node 20+
npm start
```

Open http://localhost:3000. To use a different port: `PORT=8080 npm start`.

## What's new

- Prompt-to-game **template matcher** for four mechanics: tap, reaction, guessing, and meteor dodge. This is **not AI model generation**.
- Creator studio and mobile-friendly preview.
- Real server-side publishing with shareable `/g/<slug>` URLs.
- Browsable catalog, search, most-played sorting and basic play counters.
- Per-game server-side leaderboard; scores are client-submitted, **not verified**.
- JSON-file persistence in `data/db.json`, seeded with four example games.
- Optional token-interest flag, **no actual token issuance**.
- Baseline request limits, body limits, input validation, no third-party scripts, restrictive Content Security Policy.

## Test

Start the server and run:

```bash
curl http://localhost:3000/api/health
curl http://localhost:3000/api/games
curl -X POST http://localhost:3000/api/generate -H 'content-type: application/json' -d '{"prompt":"space dodge falling meteors"}'
```

## Next workstreams

- **AI engine:** authenticated, metered server endpoint to an LLM; strict validated game schema (avoid arbitrary generated JS), more game primitives, versioned prompts and an isolated preview.
- **Identity & safety:** real account and creator ownership, moderation, reporting, gameplay scoring validation/anti-cheat, per-user throttles.
- **Scale:** Postgres, durable hosting, storage/CDN, analytics, migrations and tests.
- **X sharing:** rich OG meta/social card endpoint; verify current X-supported embedded game experiences rather than assuming an arbitrary web game runs inside X.
- **Token:** separate reviewed smart contracts and legal/product diligence, chain choice, fees, risk disclosures, anti-sybil controls; not enabled yet.

## Limitations

This is a development prototype. No authentication, anti-cheat, production database, AI provider, payments, wallet, token creation, automated social posting, or public deployment. Publishing works across visitors **only when the server is running and accessible**; localhost is not a publicly shared host. Do not use this build in production without security review.
