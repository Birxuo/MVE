# Public Portal — Production Operation (research guidance, not a deployment cert)

The prototype server (`apps/public-portal/src/server.ts`) is a localhost-only,
dependency-free HTTP API. It is correct for demos and tests; serving the public
requires the wrapper below. Nothing here changes prototype behavior.

## TLS termination

- The server speaks plain HTTP and defaults to `--host 127.0.0.1`. Never expose
  it directly. Terminate TLS at a reverse proxy (nginx/Caddy) that forwards to
  `127.0.0.1:8080`, enforces HSTS, and logs access.
- Minimal nginx sketch (adapt, do not paste blindly):
  `server { listen 443 ssl; ssl_certificate …; location / { proxy_pass http://127.0.0.1:8080; proxy_set_header X-Forwarded-For $remote_addr; } }`
- The in-process per-IP throttle keys on the socket address, so run ONE portal
  per host behind the proxy (or move the throttle key to a trusted
  `X-Forwarded-For` — only from your own proxy, never the open internet).

## Rate limits

| scope | budget | behavior |
|---|---|---|
| `GET /api/lookup` | 30/min/IP (enforced in code) | 429 + `Retry-After` |
| list endpoints (`results`, `audits`, …) | recommended 600/min/IP at proxy | 429 JSON (same shape) |
| static pages | cache 5 min at proxy ok | `index.html`/`citizen.html` only, never `/api/*` |

Every API response carries `Cache-Control: no-store` so shared caches never
serve stale election data; `X-API-Version` pins the behavior contract.

## Versioning

- Path version is the major: `/api/` serves **v1** (`X-API-Version: v1`,
  `docs/architecture/api-spec.yaml`).
- v1 rule: additive changes only (new endpoints, new optional query params,
  new response fields). Pagination envelopes and the `revoked` flag shipped
  this way without breaking the static pages.
- Breaking change (rename, remove, reshape) requires a new path (`/api/v2/`)
  with v1 kept read-only for one election cycle. Bump `API_VERSION` and the
  spec's `info.version` together — a test asserts the header.

## Read-only posture (enforced, tested)

- Non-GET → 405. No request body is ever interpreted except
  `?reference=`/`?station=`/`?limit=`/`?offset=` query params.
- Every response passes `sanitize()` (voter/token/CIN/private key stripping).
- The process needs read access to `data/` ONLY — run it as an unprivileged
  user with the stores mounted read-only where the platform allows.
