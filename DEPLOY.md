# Deploy Playground

Two HTTPS origins are required. The sandbox must be a different host from the app, on a different registrable domain. Migrations run when a process boots. Nothing in this repo deploys itself.

`PUBLIC_BASE_URL` and `USERCONTENT_ORIGIN` are both required in production. Each value is an origin with no path and no trailing slash. Production refuses to boot when the two hosts are equal or share a registrable domain (for example `play.example.com` and `usercontent.play.example.com` both sit on `example.com`, and `play.example.co.uk` and `sandbox.example.co.uk` both sit on `example.co.uk`).

## Accounts

Create these before the first boot. No wallet, no chain, no extra database vendor.

1. **Domain registrar.** Register two domains. The usual pair is `example.com` for the app and `playgroundusercontent.com` for the sandbox. The same registrar account can hold both. You need permission to add the DNS records below.
2. **Google AI Studio.** [aistudio.google.com](https://aistudio.google.com) → API key. Store it as `GEMINI_API_KEY`. Without it the site still boots and uses template mode.
3. **One host account**, and only one of these:
   - A VPS with Docker (any provider), or
   - [Fly.io](https://fly.io), or
   - [Render](https://render.com).
4. **Postgres** comes from that same choice: the `postgres` service in `docker-compose.prod.yml`, Fly Postgres, or the Render Postgres in `render.yaml`. You do not need a separate database account.

Also generate `SESSION_SECRET` locally (`openssl rand -hex 32`). Set `COOKIE_SECURE=true` once both origins are HTTPS. Set `ADMIN_EMAILS` to the moderator addresses, comma-separated. Those accounts open `/admin`.

Leave `ALLOW_SAME_SITE_USERCONTENT` unset, or set it to `false`. The value `true` is only for the weaker subdomain layout at the bottom of this file.

## DNS records

Use these names. Replace `example.com` and `playgroundusercontent.com` with the domains you registered.

| Origin | Hostname | What it serves |
| --- | --- | --- |
| App | `play.example.com` | Studio, `/play`, `/r`, `/api/health` |
| Sandbox | `playgroundusercontent.com` | Freeform HTML only. `GET /health` returns `ok` |

`PUBLIC_BASE_URL` is `https://play.example.com`. `USERCONTENT_ORIGIN` is `https://playgroundusercontent.com`.

### VPS and Caddy

Point both names at the server's public address. Caddy in `docker-compose.prod.yml` requests the certificates on port 80 and 443.

| Name | Type | Value |
| --- | --- | --- |
| `play.example.com` | A | the server's IPv4 |
| `play.example.com` | AAAA | the server's IPv6, if you have one |
| `playgroundusercontent.com` | A | the same IPv4 |
| `playgroundusercontent.com` | AAAA | the same IPv6, if you have one |

```bash
# .env next to docker-compose.prod.yml
APP_DOMAIN=play.example.com
USERCONTENT_DOMAIN=playgroundusercontent.com
POSTGRES_PASSWORD=choose-a-long-password
SESSION_SECRET=paste-the-openssl-value
GEMINI_API_KEY=paste-the-studio-key
docker compose -f docker-compose.prod.yml up -d --build
```

The app container listens on 3000 and 43921. Caddy is the only process on 80 and 443. `GET https://play.example.com/api/health` should return `"db":"up"`. `GET https://playgroundusercontent.com/health` should return `ok`. A browser tab opened on a game URL at the sandbox origin returns 403. The game still loads inside the play page iframe.

### Fly.io

Create two apps from this repo, in the same region. Attach one Postgres database to both (`fly postgres attach` on each app) so `DATABASE_URL` matches.

| App | Config | Custom domain |
| --- | --- | --- |
| `playground` | `fly.toml` | `play.example.com` |
| `playground-usercontent` | `fly.usercontent.toml` | `playgroundusercontent.com` |

DNS, after `fly certs add` prints the target:

| Name | Type | Value |
| --- | --- | --- |
| `play.example.com` | CNAME | the `playground.fly.dev` hostname Fly shows |
| `playgroundusercontent.com` | A and AAAA, or ALIAS | the addresses `fly certs add` prints for the apex |

An apex domain often cannot be a CNAME. Use the A and AAAA records Fly prints for `playgroundusercontent.com`. `play.example.com` can be a CNAME. If Fly asks for A and AAAA records on the app hostname too, use those addresses.

```bash
fly secrets set -a playground \
  SESSION_SECRET=... \
  PUBLIC_BASE_URL=https://play.example.com \
  USERCONTENT_ORIGIN=https://playgroundusercontent.com \
  GEMINI_API_KEY=... \
  COOKIE_SECURE=true
fly secrets set -a playground-usercontent \
  SESSION_SECRET=... \
  PUBLIC_BASE_URL=https://play.example.com \
  USERCONTENT_ORIGIN=https://playgroundusercontent.com \
  COOKIE_SECURE=true
```

`SERVER_ROLE=app` is in `fly.toml`. `SERVER_ROLE=usercontent` is in `fly.usercontent.toml`. Each process runs migrations on boot. Health checks are `/api/health` and `/health`.

### Render

`render.yaml` defines the database and both web services. In the Render dashboard, set the secrets it marks as sync-off:

| Service | Key | Value |
| --- | --- | --- |
| playground | `PUBLIC_BASE_URL` | `https://play.example.com` |
| playground | `USERCONTENT_ORIGIN` | `https://playgroundusercontent.com` |
| playground | `GEMINI_API_KEY` | the AI Studio key |
| playground-usercontent | `USERCONTENT_ORIGIN` | `https://playgroundusercontent.com` |

`SESSION_SECRET` is generated for the app service and shared with the sandbox service. `ALLOW_SAME_SITE_USERCONTENT` is `false` on both services. Add the custom domains in the Render dashboard, then create the records it displays:

| Name | Type | Value |
| --- | --- | --- |
| `play.example.com` | CNAME | the `onrender.com` hostname for the playground service |
| `playgroundusercontent.com` | A and AAAA, or ALIAS | the addresses Render shows for an apex domain |

Health check paths are `/api/health` and `/health`. Both services migrate on boot. Leave `SEED_ON_EMPTY=false` on the sandbox service so only the app inserts the example games.

## Weaker alternative: a subdomain

A subdomain such as `usercontent.play.example.com` is a different origin, and the iframe sandbox still applies. It is a weaker deployment because the sandbox stays on the app's registrable domain, so the two hosts are same-site. Production will not boot with that pair.

To use it anyway, set `ALLOW_SAME_SITE_USERCONTENT=true` on both processes, and set `USERCONTENT_ORIGIN` to `https://usercontent.play.example.com`.

DNS for that layout, on the one domain you already have:

| Name | Type | Value |
| --- | --- | --- |
| `play.example.com` | A or CNAME | the app service, as in the sections above |
| `usercontent.play.example.com` | A or CNAME | the sandbox service, as in the sections above |

On a VPS, `USERCONTENT_DOMAIN=usercontent.play.example.com`. On Fly and Render, add that hostname to the usercontent app and set the same flag in that app's secrets or environment. The default in this repo stays the separate domain.
