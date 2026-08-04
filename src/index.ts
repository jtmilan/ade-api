import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { loadConfig } from "./config";
import { v1Routes } from "./routes/v1";
import { webhookRoutes } from "./routes/webhooks";

const cfg = loadConfig();
const app = new Hono();

app.use(
  "*",
  cors({
    origin: [
      "http://localhost:8080",
      "http://127.0.0.1:8080",
      cfg.PUBLIC_APP_URL,
    ],
    allowHeaders: [
      "Content-Type",
      "Authorization",
      "Stripe-Signature",
      "X-Dev-Webhook",
      "Idempotency-Key",
    ],
    allowMethods: ["GET", "POST", "PATCH", "OPTIONS"],
  }),
);

app.get("/health", (c) =>
  c.json({
    ok: true,
    service: "ade-api",
    version: "0.3.0",
    stripeConfigured: Boolean(cfg.STRIPE_SECRET_KEY),
    webhookConfigured: Boolean(cfg.STRIPE_WEBHOOK_SECRET),
    features: [
      "entitlements",
      "entitlements_verify",
      "checkout_mock",
      "coupons",
      "credits",
      "campaigns",
      "events",
      "admin_console",
      "personas",
      "hmac_webhooks",
    ],
  }),
);

app.route("/v1", v1Routes(cfg));
app.route("/v1/webhooks", webhookRoutes(cfg));

app.notFound((c) => c.json({ error: "not_found" }, 404));

console.log(`ade-api listening on http://${cfg.HOST}:${cfg.PORT}`);
serve({ fetch: app.fetch, hostname: cfg.HOST, port: cfg.PORT });
