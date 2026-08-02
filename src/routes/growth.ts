import { Hono } from "hono";
import { z } from "zod";
import type { Env } from "../config";
import { store } from "../db/store";
import { requireAuth, requireRole } from "../lib/auth";
import { buildEntitlements } from "../lib/entitlements";

const ALLOWED = new Set([
  "wizard_completed", "first_fleet", "merge_gate_pass",
  "handoff_export", "soft_gate_shown", "checkout_opened", "app_open",
]);

export function growthRoutes(cfg: Env) {
  const app = new Hono();

  app.get("/coupons/preview", (c) => {
    const code = (c.req.query("code") ?? "").toUpperCase().trim();
    const coupon = store.coupons.get(code);
    if (!coupon?.active) return c.json({ valid: false }, 404);
    return c.json({
      valid: true,
      code: coupon.code,
      label: coupon.label,
      percentOff: coupon.percentOff ?? null,
      trialDays: coupon.trialDays ?? null,
      bonusHandoffs: coupon.bonusHandoffs ?? 0,
      bonusTokens: coupon.bonusTokens ?? 0,
    });
  });

  app.post("/coupons/redeem", async (c) => {
    const auth = requireAuth(c, cfg);
    if (auth instanceof Response) return auth;
    const body = z.object({ code: z.string().min(2) }).safeParse(await c.req.json().catch(() => ({})));
    if (!body.success) return c.json({ error: "invalid_body" }, 400);
    const code = body.data.code.toUpperCase().trim();
    const coupon = store.coupons.get(code);
    if (!coupon?.active) return c.json({ error: "invalid_coupon" }, 404);
    const key = `${auth.id}:${code}`;
    if (store.redeemKeys.has(key)) return c.json({ error: "already_redeemed" }, 409);
    const user = store.getUser(auth.id);
    if (!user) return c.json({ error: "not_found" }, 404);
    store.redeemKeys.add(key);
    coupon.redemptions += 1;
    user.promoCode = coupon.code;
    user.promoLabel = coupon.label;
    user.promoEndsAt = coupon.endsAt;
    if (coupon.trialDays && user.planId === "free") {
      user.status = "trialing";
      user.planId = "pro";
      user.trialEndsAt = new Date(Date.now() + coupon.trialDays * 864e5).toISOString();
    }
    if (coupon.bonusHandoffs) store.grantCredits(user.id, "handoff", coupon.bonusHandoffs, `coupon:${code}`);
    if (coupon.bonusTokens) store.grantCredits(user.id, "tokens", coupon.bonusTokens, `coupon:${code}`);
    const { payload, payloadJson, sig } = buildEntitlements(user, cfg.ENTITLEMENTS_SIGNING_SECRET);
    return c.json({ ok: true, coupon: { code: coupon.code, label: coupon.label }, entitlements: payload, payloadJson, sig });
  });

  app.get("/credits", (c) => {
    const auth = requireAuth(c, cfg);
    if (auth instanceof Response) return auth;
    const user = store.getUser(auth.id);
    if (!user) return c.json({ error: "not_found" }, 404);
    return c.json({ credits: user.credits, currency: "ade_credit", ledger: store.ledger.filter((e) => e.userId === auth.id).slice(0, 20) });
  });

  app.post("/credits/consume", async (c) => {
    const auth = requireAuth(c, cfg);
    if (auth instanceof Response) return auth;
    const body = z.object({
      meter: z.enum(["tokens", "handoff"]),
      amount: z.number().positive(),
      reason: z.string().min(1),
      idempotencyKey: z.string().optional(),
    }).safeParse(await c.req.json().catch(() => ({})));
    if (!body.success) return c.json({ error: "invalid_body" }, 400);
    const idemp = body.data.idempotencyKey ?? c.req.header("idempotency-key") ?? undefined;
    const result = store.consumeCredits(auth.id, body.data.meter, body.data.amount, body.data.reason, idemp);
    if (!result.ok) return c.json({ error: result.error }, result.error === "insufficient_credits" ? 402 : 400);
    return c.json({ ok: true, entry: result.entry, credits: store.getUser(auth.id)!.credits });
  });

  app.get("/credits/ledger", (c) => {
    const auth = requireAuth(c, cfg);
    if (auth instanceof Response) return auth;
    return c.json({ entries: store.ledger.filter((e) => e.userId === auth.id).slice(0, 50) });
  });

  app.get("/campaigns/active", (c) => {
    const auth = requireAuth(c, cfg);
    if (auth instanceof Response) return auth;
    const user = store.getUser(auth.id);
    if (!user) return c.json({ error: "not_found" }, 404);
    const now = new Date();
    const list = [...store.campaigns.values()]
      .filter((camp) => {
        if (!camp.active) return false;
        if (camp.endsAt && new Date(camp.endsAt) < now) return false;
        if (store.dismissals.has(`${auth.id}:${camp.id}`)) return false;
        if (camp.segment === "all") return true;
        if (camp.segment === user.planId) return true;
        if (camp.segment === "trialing" && user.status === "trialing") return true;
        if (camp.segment === "past_due" && user.status === "past_due") return true;
        return false;
      })
      .sort((a, b) => b.priority - a.priority);
    return c.json({ campaigns: list });
  });

  app.post("/campaigns/:id/dismiss", (c) => {
    const auth = requireAuth(c, cfg);
    if (auth instanceof Response) return auth;
    store.dismissals.add(`${auth.id}:${c.req.param("id")}`);
    return c.json({ ok: true });
  });

  app.post("/events", async (c) => {
    const auth = requireAuth(c, cfg);
    if (auth instanceof Response) return auth;
    const body = z.object({ name: z.string(), props: z.record(z.unknown()).optional() }).safeParse(await c.req.json().catch(() => ({})));
    if (!body.success) return c.json({ error: "invalid_body" }, 400);
    if (!ALLOWED.has(body.data.name)) return c.json({ error: "event_not_allowed" }, 400);
    if (body.data.name === "wizard_completed") {
      const key = `${auth.id}:WELCOME`;
      if (!store.redeemKeys.has(key)) {
        store.redeemKeys.add(key);
        store.grantCredits(auth.id, "handoff", 5, "wizard_completed");
        store.grantCredits(auth.id, "tokens", 50_000, "wizard_completed");
      }
    }
    const ev = { id: `evt_${Date.now()}`, userId: auth.id, name: body.data.name, props: body.data.props, at: new Date().toISOString() };
    store.events.unshift(ev);
    return c.json({ ok: true, event: ev });
  });

  app.post("/credits/grant", async (c) => {
    const auth = requireRole(c, cfg, ["admin"]);
    if (auth instanceof Response) return auth;
    const body = z.object({
      userId: z.string(),
      meter: z.enum(["tokens", "handoff"]),
      amount: z.number().positive(),
      reason: z.string(),
    }).safeParse(await c.req.json().catch(() => ({})));
    if (!body.success) return c.json({ error: "invalid_body" }, 400);
    const entry = store.grantCredits(body.data.userId, body.data.meter, body.data.amount, body.data.reason, auth.id);
    if (!entry) return c.json({ error: "grant_failed" }, 400);
    return c.json({ ok: true, entry });
  });

  return app;
}
