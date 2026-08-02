import { Hono } from "hono";
import { z } from "zod";
import type { Env } from "../config";
import { store, type PersonaRole } from "../db/store";
import { requireRole } from "../lib/auth";
import { getPlan, type PlanId } from "../lib/plans";

export function adminRoutes(cfg: Env) {
  const app = new Hono();

  app.get("/overview", (c) => {
    const auth = requireRole(c, cfg, ["admin"]);
    if (auth instanceof Response) return auth;
    const users = store.listUsers();
    const byPlan: Record<string, number> = {};
    const byRole: Record<string, number> = {};
    for (const u of users) {
      byPlan[u.planId] = (byPlan[u.planId] ?? 0) + 1;
      byRole[u.role] = (byRole[u.role] ?? 0) + 1;
    }
    return c.json({
      users: users.length,
      byPlan,
      byRole,
      coupons: store.coupons.size,
      campaigns: store.campaigns.size,
      events24h: store.events.filter((e) => Date.now() - new Date(e.at).getTime() < 864e5).length,
      ledgerEntries: store.ledger.length,
    });
  });

  app.get("/users", (c) => {
    const auth = requireRole(c, cfg, ["admin"]);
    if (auth instanceof Response) return auth;
    return c.json({
      users: store.listUsers().map((u) => ({
        id: u.id,
        email: u.email,
        role: u.role,
        planId: u.planId,
        planName: getPlan(u.planId).name,
        status: u.status,
        credits: u.credits,
        promoCode: u.promoCode ?? null,
        renewsAt: u.renewsAt,
        trialEndsAt: u.trialEndsAt,
      })),
    });
  });

  app.patch("/users/:id", async (c) => {
    const auth = requireRole(c, cfg, ["admin"]);
    if (auth instanceof Response) return auth;
    const user = store.getUser(c.req.param("id"));
    if (!user) return c.json({ error: "not_found" }, 404);
    const body = z.object({
      role: z.enum(["admin", "operator", "viewer"]).optional(),
      planId: z.enum(["free", "pro", "team"]).optional(),
      status: z.enum(["active", "trialing", "past_due", "canceled", "none"]).optional(),
    }).safeParse(await c.req.json().catch(() => ({})));
    if (!body.success) return c.json({ error: "invalid_body" }, 400);
    if (body.data.role) user.role = body.data.role as PersonaRole;
    if (body.data.planId) user.planId = body.data.planId as PlanId;
    if (body.data.status) user.status = body.data.status;
    return c.json({ ok: true, user });
  });

  app.get("/coupons", (c) => {
    const auth = requireRole(c, cfg, ["admin"]);
    if (auth instanceof Response) return auth;
    return c.json({ coupons: [...store.coupons.values()] });
  });

  app.post("/coupons", async (c) => {
    const auth = requireRole(c, cfg, ["admin"]);
    if (auth instanceof Response) return auth;
    const body = z.object({
      code: z.string().min(2),
      label: z.string(),
      percentOff: z.number().optional(),
      trialDays: z.number().optional(),
      bonusHandoffs: z.number().optional(),
      bonusTokens: z.number().optional(),
      maxRedemptions: z.number().default(1000),
      endsAt: z.string().nullable().optional(),
    }).safeParse(await c.req.json().catch(() => ({})));
    if (!body.success) return c.json({ error: "invalid_body" }, 400);
    const code = body.data.code.toUpperCase().trim();
    if (store.coupons.has(code)) return c.json({ error: "exists" }, 409);
    const coupon = {
      code,
      label: body.data.label,
      percentOff: body.data.percentOff,
      trialDays: body.data.trialDays,
      bonusHandoffs: body.data.bonusHandoffs,
      bonusTokens: body.data.bonusTokens,
      maxRedemptions: body.data.maxRedemptions,
      redemptions: 0,
      active: true,
      endsAt: body.data.endsAt ?? null,
    };
    store.coupons.set(code, coupon);
    return c.json({ ok: true, coupon }, 201);
  });

  app.patch("/coupons/:code", async (c) => {
    const auth = requireRole(c, cfg, ["admin"]);
    if (auth instanceof Response) return auth;
    const coupon = store.coupons.get(c.req.param("code").toUpperCase());
    if (!coupon) return c.json({ error: "not_found" }, 404);
    const body = z.object({ active: z.boolean().optional(), label: z.string().optional() }).safeParse(await c.req.json().catch(() => ({})));
    if (!body.success) return c.json({ error: "invalid_body" }, 400);
    if (body.data.active !== undefined) coupon.active = body.data.active;
    if (body.data.label) coupon.label = body.data.label;
    return c.json({ ok: true, coupon });
  });

  app.get("/campaigns", (c) => {
    const auth = requireRole(c, cfg, ["admin"]);
    if (auth instanceof Response) return auth;
    return c.json({ campaigns: [...store.campaigns.values()] });
  });

  app.post("/campaigns", async (c) => {
    const auth = requireRole(c, cfg, ["admin"]);
    if (auth instanceof Response) return auth;
    const body = z.object({
      id: z.string(),
      title: z.string(),
      body: z.string(),
      placement: z.enum(["billing_banner", "command_strip", "soft_gate"]),
      ctaLabel: z.string(),
      segment: z.enum(["all", "trialing", "past_due", "free", "pro", "team"]).default("all"),
      priority: z.number().default(5),
      endsAt: z.string().nullable().optional(),
      couponCode: z.string().optional(),
      planId: z.enum(["free", "pro", "team"]).optional(),
    }).safeParse(await c.req.json().catch(() => ({})));
    if (!body.success) return c.json({ error: "invalid_body" }, 400);
    if (store.campaigns.has(body.data.id)) return c.json({ error: "exists" }, 409);
    const camp = { ...body.data, active: true, endsAt: body.data.endsAt ?? null };
    store.campaigns.set(camp.id, camp);
    return c.json({ ok: true, campaign: camp }, 201);
  });

  app.get("/events", (c) => {
    const auth = requireRole(c, cfg, ["admin"]);
    if (auth instanceof Response) return auth;
    return c.json({ events: store.events.slice(0, 100) });
  });

  app.get("/ledger", (c) => {
    const auth = requireRole(c, cfg, ["admin"]);
    if (auth instanceof Response) return auth;
    return c.json({ entries: store.ledger.slice(0, 100) });
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
    const entry = store.grantCredits(body.data.userId, body.data.meter, body.data.amount, body.data.reason, "admin");
    if (!entry) return c.json({ error: "grant_failed" }, 400);
    return c.json({ ok: true, entry, credits: store.getUser(body.data.userId)?.credits });
  });

  return app;
}
