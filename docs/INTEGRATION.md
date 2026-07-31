# Desktop integration (agent-commandcenter)

1. Settings → Billing **Manage subscription** → `POST /v1/checkout` with `Authorization: Bearer dev`
2. Open returned `url` in system browser (Tauri `shell.open`)
3. On deep-link return → `GET /v1/entitlements` → cache `{ payloadJson, sig }`
4. Soft-gate UI with `features` + `limits`
5. Never call Stripe or hold `STRIPE_*` secrets in Tauri

## Example

```bash
curl -s http://127.0.0.1:8787/v1/entitlements -H 'Authorization: Bearer dev' | jq .
curl -s -X POST http://127.0.0.1:8787/v1/checkout \
  -H 'Authorization: Bearer dev' \
  -H 'Content-Type: application/json' \
  -d '{"planId":"pro"}' | jq .
```
