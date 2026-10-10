# Deploy Playground

Two HTTPS origins are required. The app and the sandbox must not share a host, or the iframe isolation fails. Migrations run when a process boots. Nothing in this repo deploys itself.

Use one host. The names below are the ones to create. Replace `example.com` with the domain you actually control.

| Origin | Hostname | What it serves |
| --- | --- | --- |
| App | `play.example.com` | Studio, `/play`, `/r`, `/api/health` |
| Sandbox | `usercontent.play.example.com` | Freeform HTML only. `GET /health` returns `ok` |

`PUBLIC_BASE_URL` is `https://play.example.com`. `USERCONTENT_ORIGIN` is `https://usercontent.play.example.com`. No path, no trailing slash.

## Accounts

Create these before the first boot. No wallet, no chain, no extra database vendor.

1. **Domain registrar.** The account that can edit DNS for your domain. Any registrar is fine. You need permission to add the two hostnames below.
2. **Google AI Studio.** [aistudio.google.com](https://aistudio.google.com) → API key. Store it as `GEMINI_API_KEY`. Without it the site still boots and uses template mode.
3. **One host account**, and only one of these:
   - A VPS with Docker (any provider), or
   - [Fly.io](https://fly.io), or
   - [Render](https://render.com).
4. **Postgres** comes from that same choice: the `postgres` service in `docker-compose.prod.yml`, Fly Postgres, or the Render Postgres in `render.yaml`. You do not need a separate database account.

Also generate `SESSION_SECRET` locally (`openssl rand -hex 32`). Set `COOKIE_SECURE=true` once both origins are HTTPS.

## DNS records

Create both records at the registrar. A subdomain is a different origin, which is what the sandbox needs.

### VPS and Caddy

Point both names at the server's public address. Caddy in `docker-compose.prod.yml` requests the certificates on port 80 and 443.

| Name | Type | Value |
| --- | --- | --- |
| `play` | A | the server's IPv4 |
| `play` | AAAA | the server's IPv6, if you have one |
| `usercontent.play` | A | the same IPv4 |
| `usercontent.play` | AAAA | the same IPv6, if you have one |

`usercontent.play.example.com` is the host `usercontent.play` under `example.com`.

```bash
# .env next to docker-compose.prod.yml
APP_DOMAIN=play.example.com
USERCONTENT_DOMAIN=usercontent.play.example.com
POSTGRES_PASSWORD=choose-a-long-password
SESSION_SECRET=paste-the-openssl-value
GEMINI_API_KEY=paste-the-studio-key
docker compose -f docker-compose.prod.yml up -d --build
```

The app container listens on 3000 and 43921. Caddy is the only process on 80 and 443. `GET https://play.example.com/api/health` should return `"db":"up"`. `GET https://usercontent.play.example.com/health` should return `ok`. A browser tab opened on a game URL at the sandbox origin returns 403. The game still loads inside the play page iframe.

### Fly.io

Create two apps from this repo, in the same region. Attach one Postgres database to both (`fly postgres attach` on each app) so `DATABASE_URL` matches.

| App | Config | Custom domain |
| --- | --- | --- |
| `playground` | `fly.toml` | `play.example.com` |
| `playground-usercontent` | `fly.usercontent.toml` | `usercontent.play.example.com` |

DNS, after `fly certs add` prints the target:

| Name | Type | Value |
| --- | --- | --- |
| `play` | CNAME | the `playground.fly.dev` hostname Fly shows |
| `usercontent.play` | CNAME | the `playground-usercontent.fly.dev` hostname Fly shows |

If Fly asks for A and AAAA records instead of CNAME, use the addresses `fly certs add` prints. Then:

```bash
fly secrets set -a playground \
  SESSION_SECRET=... \
  PUBLIC_BASE_URL=https://play.example.com \
  USERCONTENT_ORIGIN=https://usercontent.play.example.com \
  GEMINI_API_KEY=... \
  COOKIE_SECURE=true
fly secrets set -a playground-usercontent \
  SESSION_SECRET=... \
  PUBLIC_BASE_URL=https://play.example.com \
  USERCONTENT_ORIGIN=https://usercontent.play.example.com \
  COOKIE_SECURE=true
```

`SERVER_ROLE=app` is in `fly.toml`. `SERVER_ROLE=usercontent` is in `fly.usercontent.toml`. Each process runs migrations on boot. Health checks are `/api/health` and `/health`.

### Render

`render.yaml` defines the database and both web services. In the Render dashboard, set the secrets it marks as sync-off:

| Service | Key | Value |
| --- | --- | --- |
| playground | `PUBLIC_BASE_URL` | `https://play.example.com` |
| playground | `USERCONTENT_ORIGIN` | `https://usercontent.play.example.com` |
| playground | `GEMINI_API_KEY` | the AI Studio key |
| playground-usercontent | `USERCONTENT_ORIGIN` | `https://usercontent.play.example.com` |

`SESSION_SECRET` is generated for the app service and shared with the sandbox service. Add the custom domains in the Render dashboard, then create the CNAMEs it displays:

| Name | Type | Value |
| --- | --- | --- |
| `play` | CNAME | the `onrender.com` hostname for the playground service |
| `usercontent.play` | CNAME | the `onrender.com` hostname for the playground-usercontent service |

Health check paths are `/api/health` and `/health`. Both services migrate on boot. Leave `SEED_ON_EMPTY=false` on the sandbox service so only the app inserts the example games.
