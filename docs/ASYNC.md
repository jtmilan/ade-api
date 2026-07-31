# Async processing

| Layer | Behavior |
|-------|----------|
| HTTP webhook | Verify + durable insert + enqueue; return 200 quickly |
| Worker | Recompute subscription/entitlements (scaffold runs inline after enqueue) |
| Desktop | Soft-gate on signed `/v1/entitlements` cache |

Production upgrades:

- Postgres `webhook_events` unique on `id`
- Outbox table + dedicated worker process
- Re-fetch Stripe Subscription by id after event for ordering safety
