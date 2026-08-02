import { Hono } from "hono";
import { z } from "zod";
import type { Env } from "../config";
import { store } from "../db/store";
import { requireAuth } from "../lib/auth";
import { buildEntitlements } from "../lib/entitlements";
import { PLANS, getPlan, type PlanId } from "../lib/plans";
import { growthRoutes } from "./growth";
import { adminRoutes } from "./admin";

export function v1Routes(cfg: Env) {
  const app = new Hono();

  app.get("/plans", (c) => c.json({ plans: PLANS }));

  app.get("/me", (c) => {
    const auth = requireAuth(c, cfg);
    if (auth instanceof Response) return auth;
    const user = store.getUser(auth.id);
    if (!user) return c.json({ error: "not_found" }, 404);
    const plan = getPlan(user.planId);
    return c.json({
      user: { id: user.id, email: user.email, role: user.role },
      subscription: {
        planId: user.planId,
        planName: plan.name,
        status: user.status,
        renewsAt: user.renewsAt,
        trialEndsAt: user.trialEndsAt,
        promo: user.promoCode
          ? { code: user.promoCode, label: user.promoLabel, endsAt: user.promoEndsAt }
          : null,
        credits: user.credits,
        externalCustomerId: user.stripeCustomerId,
        externalSubscriptionId: user.externalSubscriptionId,
      },
      personas: {
        current: user.role,
        available: ["admin", "operator", "viewer"],
        hint: "Dev: Authorization Bearer admin | operator | viewer",
      },
    });
  });

  app.get("/entitlements", (c) => {
    const auth = requireAuth(c, cfg);
    if (auth instanceof Response) return auth;
    const user = store.getUser(auth.id);
    if (!user) return c.json({ error: "not_found" }, 404);
    const { payload, payloadJson, sig } = buildEntitlements(user, cfg.ENTITLEMENTS_SIGNING_SECRET);
    return c.json({ entitlements: payload, payloadJson, sig, algorithm: "HMAC-SHA256" });
  });

  app.get("/usage", (c) => {
    const auth = requireAuth(c, cfg);
    if (auth instanceof Response) return auth;
    const user = store.getUser(auth.id);
    if (!user) return c.json({ error: "not_found" }, 404);
    const plan = getPlan(user.planId);
    const u = store.usage.get(user.id) ?? {
      panesPeak: 0, workspaces: 0, mcpServers: 0, handoffExports24h: 0, tokensEstimate: 0,
    };
    return c.json({
      meters: [
        { id: "panes", label: "Concurrent panes (peak)", used: u.panesPeak, limit: plan.limits.concurrentPanes, unit: "panes" },
        { id: "workspaces", label: "Workspaces", used: u.workspaces, limit: plan.limits.workspaces, unit: "ws" },
        { id: "mcp", label: "MCP servers bound", used: u.mcpServers, limit: plan.limits.mcpServers, unit: "servers" },
        { id: "handoff", label: "Handoff exports (24h)", used: u.handoffExports24h, limit: plan.limits.handoffExportsDay, unit: "exports" },
        { id: "tokens", label: "Agent tokens (estimate)", used: u.tokensEstimate, limit: user.credits.tokenBalance, unit: "tok" },
      ],
      credits: user.credits,
    });
  });

  app.post("/checkout", async (c) => {
    const auth = requireAuth(c, cfg);
    if (auth instanceof Response) return auth;
    const body = z.object({
      planId: z.enum(["pro", "team"]),
      couponCode: z.string().optional(),
    }).safeParse(await c.req.json().catch(() => ({})));
    if (!body.success) return c.json({ error: "invalid_body" }, 400);
    const q = new URLSearchParams({ plan: body.data.planId, mock: "1" });
    if (body.data.couponCode) q.set("coupon", body.data.couponCode);
    return c.json({
      mode: cfg.STRIPE_SECRET_KEY ? "live_stub" : "mock",
      url: `${cfg.CHECKOUT_SUCCESS_URL ?? cfg.PUBLIC_APP_URL + "/billing/success"}?${q}`,
      planId: body.data.planId,
      couponCode: body.data.couponCode ?? null,
    });
  });

  app.post("/portal", async (c) => {
    const auth = requireAuth(c, cfg);
    if (auth instanceof Response) return auth;
    const user = store.getUser(auth.id);
    return c.json({
      mode: "mock",
      url: `${cfg.PUBLIC_APP_URL}/settings?billing=portal&mock=1`,
      customerId: user?.stripeCustomerId ?? null,
    });
  });

  app.post("/dev/set-plan", async (c) => {
    if (!cfg.ALLOW_DEV_AUTH) return c.json({ error: "forbidden" }, 403);
    const auth = requireAuth(c, cfg);
    if (auth instanceof Response) return auth;
    const body = z.object({ planId: z.enum(["free", "pro", "team"]) }).safeParse(await c.req.json().catch(() => ({})));
    if (!body.success) return c.json({ error: "invalid_body" }, 400);
    const user = store.getUser(auth.id);
    if (!user) return c.json({ error: "not_found" }, 404);
    user.planId = body.data.planId as PlanId;
    user.status = body.data.planId === "free" ? "none" : "active";
    return c.json({ ok: true, planId: user.planId, status: user.status });
  });

  app.route("/", growthRoutes(cfg));
  app.route("/admin", adminRoutes(cfg));
  return app;
}
