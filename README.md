# ade-api

**Backend for [Agent Command Center](https://github.com/jtmilan/agent-commandcenter)** — auth personas, Stripe webhooks (HMAC), entitlements, **coupons, credits, campaigns**, and **admin console APIs**.

> Desktop (Tauri) never holds Stripe secrets. This repo is the only place webhooks and billing keys live.

| | |
|---|---|
| **Repo** | [`jtmilan/ade-api`](https://github.com/jtmilan/ade-api) |
| **Companion UI** | [`jtmilan/agent-commandcenter`](https://github.com/jtmilan/agent-commandcenter) |
| **Local rebuild guide** | [agent-commandcenter/docs/LOCAL-HANDOVER.md](https://github.com/jtmilan/agent-commandcenter/blob/main/docs/LOCAL-HANDOVER.md) |
| **Default port** | `8787` |
| **Version** | 0.3.0 — entitlements verify + checkout mock |

## Personas (same interface)

| Bearer | Role |
|--------|------|
| `Authorization: Bearer admin` | Admin console |
| `Bearer operator` / `Bearer dev` | Operator (fleet + billing self-serve) |
| `Bearer viewer` | Read-only |

See [docs/PERSONAS-ADMIN.md](docs/PERSONAS-ADMIN.md) if present.

## Quick start (for manual ADE testing)

```bash
cp .env.example .env   # optional
export ALLOW_DEV_AUTH=1
export ENTITLEMENTS_SIGNING_SECRET=dev-only-change-me
npm install
npm run dev
# → http://0.0.0.0:8787/health
```

```bash
curl -s http://127.0.0.1:8787/health | jq .
curl -s http://127.0.0.1:8787/v1/me -H 'Authorization: Bearer admin' | jq .
curl -s http://127.0.0.1:8787/v1/entitlements -H 'Authorization: Bearer operator' | jq .
curl -s -X POST http://127.0.0.1:8787/v1/coupons/redeem \
  -H 'Authorization: Bearer operator' -H 'Content-Type: application/json' \
  -d '{"code":"WELCOME"}' | jq .
```

Pair with the desktop UI:

```bash
# other terminal
cd agent-commandcenter
export VITE_ADE_API_URL=http://127.0.0.1:8787
export VITE_ENTITLEMENTS_VERIFY_SECRET=dev-only-change-me
npm run dev
# or: npm run tauri:dev
```

Full manual test script: **LOCAL-HANDOVER** in the UI repo.

## API surface

| Method | Path | Auth | Notes |
|--------|------|------|--------|
| GET | `/health` | — | Liveness |
| GET | `/v1/plans` | — | Catalog |
| GET | `/v1/me` | Bearer | User + role + subscription |
| GET | `/v1/entitlements` | Bearer | Signed blob (role, credits, promo) |
| POST | `/v1/entitlements/verify` | — | Server HMAC check |
| GET | `/v1/public/config` | — | Algorithm + path hints |
| GET | `/v1/usage` | Bearer | Meters + credits |
| POST | `/v1/checkout` | Bearer | `{ planId, couponCode? }` — mock applies plan if no Stripe |
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
