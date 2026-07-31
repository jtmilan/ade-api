# HMAC webhook verification

See also the companion UI docs in `agent-commandcenter/docs/HMAC-WEBHOOK-VERIFICATION.md`.

## Flow

1. Read **raw** body (`arrayBuffer` / `express.raw`)
2. `verifyStripeSignature(raw, Stripe-Signature, STRIPE_WEBHOOK_SECRET)`
3. On fail → **400** + log `webhook_signature_fail`
4. On success → idempotent insert `event.id` → enqueue → **200**

## Implementation

`src/lib/hmac.ts` — pure functions + unit tests in `src/lib/hmac.test.ts`.

## Local without Stripe secret

```bash
curl -X POST http://127.0.0.1:8787/v1/webhooks/stripe \
  -H 'Content-Type: application/json' \
  -H 'X-Dev-Webhook: 1' \
  -d '{"id":"evt_dev_1","type":"customer.subscription.updated","data":{"object":{"id":"sub_x","customer":"cus_mock_ade","status":"active","metadata":{"planId":"team"}}}}'
```

Only works when `ALLOW_DEV_AUTH=true` and secret is unset.
