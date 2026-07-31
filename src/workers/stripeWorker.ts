import crypto from "node:crypto";
import { store } from "../db/store";
import type { PlanId } from "../lib/plans";
import type { SubStatus } from "../db/store";

function mapStripeStatus(s: string): SubStatus {
  switch (s) {
    case "active":
      return "active";
    case "trialing":
      return "trialing";
    case "past_due":
      return "past_due";
    case "canceled":
    case "unpaid":
      return "canceled";
    default:
      return "none";
  }
}

function planFromPriceId(
  priceId: string | undefined,
  metadataPlan?: string,
): PlanId {
  if (metadataPlan === "team" || metadataPlan === "pro" || metadataPlan === "free") {
    return metadataPlan;
  }
  if (priceId?.includes("team")) return "team";
  if (priceId?.includes("pro")) return "pro";
  return "pro";
}

/**
 * Process one queued Stripe event. Idempotent via event row mark.
 * In production: re-fetch subscription from Stripe API for latest state.
 */
export function processStripeEvent(
  eventId: string,
  event: {
    id: string;
    type: string;
    data?: { object?: Record<string, unknown> };
  },
): void {
  const obj = event.data?.object ?? {};
  const type = event.type;

  if (
    type.startsWith("customer.subscription.") ||
    type === "invoice.paid" ||
    type === "invoice.payment_failed"
  ) {
    const customerId =
      (typeof obj.customer === "string" ? obj.customer : undefined) ??
      "cus_unknown";
    const subscriptionId =
      (typeof obj.id === "string" && type.includes("subscription")
        ? obj.id
        : (obj.subscription as string | undefined)) ?? `sub_${eventId}`;
    const statusRaw = String(obj.status ?? "active");
    const items = obj.items as
      | { data?: { price?: { id?: string } }[] }
      | undefined;
    const priceId = items?.data?.[0]?.price?.id;
    const metadata = obj.metadata as { planId?: string } | undefined;
    const periodEnd = obj.current_period_end as number | undefined;

    store.upsertSubscription({
      customerId,
      subscriptionId,
      planId: planFromPriceId(priceId, metadata?.planId),
      status: mapStripeStatus(statusRaw),
      renewsAt: periodEnd
        ? new Date(periodEnd * 1000).toISOString()
        : null,
    });
  }

  store.markProcessed(eventId);
}

export function hashPayload(raw: Buffer): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

/** Drain queue (sync for scaffold; use background interval in server). */
export function drainQueue(getEvent: (id: string) => unknown | undefined): number {
  let n = 0;
  let job = store.dequeue();
  while (job) {
    const ev = getEvent(job.eventId) as
      | { id: string; type: string; data?: { object?: Record<string, unknown> } }
      | undefined;
    if (ev) processStripeEvent(job.eventId, ev);
    else store.markProcessed(job.eventId);
    n++;
    job = store.dequeue();
  }
  return n;
}
