# ade-api

**Backend for [Agent Command Center](https://github.com/jtmilan/agent-commandcenter)** — auth personas, Stripe webhooks (HMAC), entitlements, **coupons, credits, campaigns**, and **admin console APIs**.

> Desktop (Tauri) never holds Stripe secrets. This repo is the only place webhooks and billing keys live.

| | |
|---|---|
| **Repo** | [`jtmilan/ade-api`](https://github.com/jtmilan/ade-api) |
| **Companion UI** | [`jtmilan/agent-commandcenter`](https://github.com/jtmilan/agent-commandcenter) |
| **Default port** | `8787` |
| **Version** | 0.2.0 — growth + personas |

## Personas (same interface)

| Bearer | Role |
|--------|------|
| `Authorization: Bearer admin` | Admin console |
| `Bearer operator` / `Bearer dev` | Operator (fleet + billing self-serve) |
| `Bearer viewer` | Read-only |

See [docs/PERSONAS-ADMIN.md](docs/PERSONAS-ADMIN.md).

## Quick start

```bash
cp .env.example .env
npm install
npm run dev
# → http://0.0.0.0:8787/health
```

```bash
curl -s http://127.0.0.1:8787/v1/me -H 'Authorization: Bearer admin' | jq .
curl -s http://127.0.0.1:8787/v1/admin/overview -H 'Authorization: Bearer admin' | jq .
curl -s -X POST http://127.0.0.1:8787/v1/coupons/redeem \
  -H 'Authorization: Bearer operator' -H 'Content-Type: application/json' \
  -d '{"code":"WELCOME"}' | jq .
```

## API surface

| Method | Path | Auth | Notes |
|--------|------|------|--------|
| GET | `/health` | — | Liveness |
| GET | `/v1/plans` | — | Catalog |
| GET | `/v1/me` | Bearer | User + role + subscription |
| GET | `/v1/entitlements` | Bearer | Signed blob (role, credits, promo) |
| GET | `/v1/usage` | Bearer | Meters + credits |
| POST | `/v1/checkout` | Bearer | `{ planId, couponCode? }` |
| POST | `/v1/coupons/redeem` | Bearer | Apply promo |
| GET/POST | `/v1/credits*` | Bearer | Wallet / consume / ledger |
| GET | `/v1/campaigns/active` | Bearer | In-app marketing |
| POST | `/v1/events` | Bearer | Lifecycle events |
| * | `/v1/admin/*` | **admin** | Console management |
| POST | `/v1/webhooks/stripe` | Stripe-Signature | HMAC |

## Security (P0)

1. Webhook raw body + HMAC  
2. Idempotent coupon redeem + credit consume  
3. Admin routes gated by `role === admin`  
4. Secrets only in env  

## License

Private / product — owner terms apply.
