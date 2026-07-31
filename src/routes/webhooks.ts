import { Hono } from "hono";
import type { Env } from "../config";
import { store } from "../db/store";
import { verifyStripeSignature } from "../lib/hmac";
import { hashPayload, processStripeEvent } from "../workers/stripeWorker";

/** Keep raw event bodies for worker (scaffold). Production: DB blob. */
const eventBodies = new Map<string, { id: string; type: string; data?: { object?: Record<string, unknown> } }>();

export function webhookRoutes(cfg: Env) {
  const app = new Hono();

  app.post("/stripe", async (c) => {
    const raw = Buffer.from(await c.req.arrayBuffer());
    const sig = c.req.header("stripe-signature");

    const secret = cfg.STRIPE_WEBHOOK_SECRET ?? "";
    // In test without secret: only allow if ALLOW_DEV_AUTH and header X-Dev-Webhook: 1
    if (!secret) {
      if (!(cfg.ALLOW_DEV_AUTH && c.req.header("x-dev-webhook") === "1")) {
        return c.text("Webhook secret not configured", 503);
      }
    } else {
      const verified = verifyStripeSignature(raw, sig, secret);
      if (!verified.ok) {
        console.error("webhook_signature_fail", verified.reason);
        return c.text(`Invalid signature: ${verified.reason}`, 400);
      }
    }

    let event: { id: string; type: string; data?: { object?: Record<string, unknown> } };
    try {
      event = JSON.parse(raw.toString("utf8")) as typeof event;
    } catch {
      return c.text("Invalid JSON", 400);
    }
    if (!event?.id || !event?.type) {
      return c.text("Invalid event", 400);
    }

    const inserted = store.insertWebhookEvent(
      event.id,
      event.type,
      hashPayload(raw),
    );
    if (!inserted) {
      return c.json({ received: true, duplicate: true });
    }

    eventBodies.set(event.id, event);
    store.enqueue({ kind: "stripe_event", eventId: event.id });

    // Scaffold: process immediately after enqueue (still after durable insert)
    // Production: return 200 here and let a worker drain.
    processStripeEvent(event.id, event);

    return c.json({ received: true });
  });

  return app;
}

export { eventBodies };
