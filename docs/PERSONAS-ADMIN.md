# Personas & admin console (ade-api)

Same product interface; capability differs by **persona role**.

| Persona | Dev bearer | Can do |
|---------|------------|--------|
| **admin** | `Authorization: Bearer admin` | Users, coupons, campaigns, grant credits, events, ledger |
| **operator** | `Bearer operator` or `Bearer dev` | Redeem coupons, consume credits, campaigns, checkout |
| **viewer** | `Bearer viewer` | Read me / entitlements / usage |

## Admin routes (`role=admin` required)

| Method | Path |
|--------|------|
| GET | `/v1/admin/overview` |
| GET | `/v1/admin/users` |
| PATCH | `/v1/admin/users/:id` |
| GET/POST | `/v1/admin/coupons` |
| PATCH | `/v1/admin/coupons/:code` |
| GET/POST | `/v1/admin/campaigns` |
| GET | `/v1/admin/events` |
| GET | `/v1/admin/ledger` |
| POST | `/v1/admin/credits/grant` |

## Operator growth routes

| Method | Path |
|--------|------|
| GET | `/v1/coupons/preview?code=` |
| POST | `/v1/coupons/redeem` |
| GET | `/v1/credits` |
| POST | `/v1/credits/consume` |
| GET | `/v1/campaigns/active` |
| POST | `/v1/events` |

Desktop ADE uses the **same shell**: switch persona → Operator fleet **or** Admin console tabs.
