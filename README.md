# ade-api

**Backend for [Agent Command Center](https://github.com/jtmilan/agent-commandcenter)** — auth session helpers, Stripe Checkout/Portal, **HMAC-verified webhooks**, entitlements, and usage.

> Desktop (Tauri) never holds Stripe secrets. This repo is the only place webhooks and billing keys live.

| | |
|---|---|
| **Repo** | [`jtmilan/ade-api`](https://github.com/jtmilan/ade-api) |
| **Companion UI** | [`jtmilan/agent-commandcenter`](https://github.com/jtmilan/agent-commandcenter) |
| **Default port** | `8787` |

## Architecture

```text
Stripe ──POST /v1/webhooks/stripe──► ade-api (verify HMAC → idempotent store → queue)
                                            │
Desktop ADE ◄── GET /v1/entitlements ───────┘  (signed blob, TTL)
Desktop ADE ──► POST /v1/checkout | /v1/portal  (returns browser URLs)
```

## Quick start

```bash
cp .env.example .env
npm install
npm run dev
# → http://0.0.0.0:8787/health
```

Stripe CLI (local webhooks):

```bash
stripe listen --forward-to localhost:8787/v1/webhooks/stripe
stripe trigger customer.subscription.updated
```

## API surface

| Method | Path | Auth | Notes |
|--------|------|------|--------|
| `GET` | `/health` | — | Liveness |
| `GET` | `/v1/plans` | — | Plan catalog |
| `GET` | `/v1/me` | Bearer | User + subscription snapshot |
| `GET` | `/v1/entitlements` | Bearer | Signed features + limits |
| `GET` | `/v1/usage` | Bearer | Soft meters |
| `POST` | `/v1/checkout` | Bearer | `{ planId }` → Checkout URL |
| `POST` | `/v1/portal` | Bearer | Customer portal URL |
| `POST` | `/v1/webhooks/stripe` | Stripe-Signature | Raw body + HMAC |

## Security (P0)

1. Webhook route uses **raw body** only  
2. Verify `Stripe-Signature` before any side effects  
3. Idempotency on `event.id`  
4. Fast `200` after durable accept; process in worker  
5. Secrets only in env / secret manager  

See [docs/HMAC.md](docs/HMAC.md) and [docs/ASYNC.md](docs/ASYNC.md).

## Scripts

```bash
npm run dev
npm run typecheck
npm test
```

## License

Private / product — owner terms apply.
