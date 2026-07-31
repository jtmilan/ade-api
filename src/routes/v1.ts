import { Hono } from "hono";
import { z } from "zod";
import type { Env } from "../config";
import { store } from "../db/store";
import { requireAuth } from "../lib/auth";
import { buildEntitlements } from "../lib/entitlements";
import { PLANS, getPlan, type PlanId } from "../lib/plans";

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
      user: { id: user.id, email: user.email },
      subscription: {
        planId: user.planId,
        planName: plan.name,
        status: user.status,
        renewsAt: user.renewsAt,
        externalCustomerId: user.stripeCustomerId,
        externalSubscriptionId: user.externalSubscriptionId,
      },
    });
  });

  app.get("/entitlements", (c) => {
    const auth = requireAuth(c, cfg);
    if (auth instanceof Response) return auth;
    const user = store.getUser(auth.id);
    if (!user) return c.json({ error: "not_found" }, 404);
    const { payload, payloadJson, sig } = buildEntitlements(
      user,
      cfg.ENTITLEMENTS_SIGNING_SECRET,
    );
    return c.json({
      entitlements: payload,
      payloadJson,
      sig,
      algorithm: "HMAC-SHA256",
    });
  });

  app.get("/usage", (c) => {
    const auth = requireAuth(c, cfg);
    if (auth instanceof Response) return auth;
    const user = store.getUser(auth.id);
    if (!user) return c.json({ error: "not_found" }, 404);
    const plan = getPlan(user.planId);
    const u = store.usage.get(user.id) ?? {
      panesPeak: 0,
      workspaces: 0,
      mcpServers: 0,
      handoffExports24h: 0,
      tokensEstimate: 0,
    };
    return c.json({
      meters: [
        {
          id: "panes",
          label: "Concurrent panes (peak)",
          used: u.panesPeak,
          limit: plan.limits.concurrentPanes,
          unit: "panes",
        },
        {
          id: "workspaces",
          label: "Workspaces",
          used: u.workspaces,
          limit: plan.limits.workspaces,
          unit: "ws",
        },
        {
          id: "mcp",
          label: "MCP servers bound",
          used: u.mcpServers,
          limit: plan.limits.mcpServers,
          unit: "servers",
        },
        {
          id: "handoff",
          label: "Handoff exports (24h)",
          used: u.handoffExports24h,
          limit: plan.limits.handoffExportsDay,
          unit: "exports",
        },
        {
          id: "tokens",
          label: "Agent tokens (estimate)",
          used: u.tokensEstimate,
          limit:
            user.planId === "free"
              ? 500_000
              : user.planId === "pro"
                ? 10_000_000
                : null,
          unit: "tok",
        },
      ],
    });
  });

  const checkoutSchema = z.object({
    planId: z.enum(["pro", "team"]),
  });

  app.post("/checkout", async (c) => {
    const auth = requireAuth(c, cfg);
    if (auth instanceof Response) return auth;
    const body = checkoutSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!body.success) return c.json({ error: "invalid_body", details: body.error.flatten() }, 400);

    // Production: stripe.checkout.sessions.create(...)
    if (!cfg.STRIPE_SECRET_KEY) {
      return c.json({
        mode: "mock",
        message:
          "STRIPE_SECRET_KEY not set — returning mock checkout URL for desktop deep-link testing",
        url: `${cfg.CHECKOUT_SUCCESS_URL ?? cfg.PUBLIC_APP_URL + "/billing/success"}?plan=${body.data.planId}&mock=1`,
        planId: body.data.planId,
      });
    }

    return c.json({
      mode: "live_stub",
      message: "Wire Stripe SDK Checkout Session here",
      url: null,
      planId: body.data.planId,
    });
  });

  app.post("/portal", async (c) => {
    const auth = requireAuth(c, cfg);
    if (auth instanceof Response) return auth;
    const user = store.getUser(auth.id);
    if (!cfg.STRIPE_SECRET_KEY) {
      return c.json({
        mode: "mock",
        url: `${cfg.PUBLIC_APP_URL}/settings?billing=portal&mock=1`,
        customerId: user?.stripeCustomerId ?? null,
      });
    }
    return c.json({
      mode: "live_stub",
      message: "Wire stripe.billingPortal.sessions.create here",
      url: null,
    });
  });

  /** Dev helper: set plan without Stripe */
  app.post("/dev/set-plan", async (c) => {
    if (!cfg.ALLOW_DEV_AUTH) return c.json({ error: "forbidden" }, 403);
    const auth = requireAuth(c, cfg);
    if (auth instanceof Response) return auth;
    const body = z
      .object({ planId: z.enum(["free", "pro", "team"]) })
      .safeParse(await c.req.json().catch(() => ({})));
    if (!body.success) return c.json({ error: "invalid_body" }, 400);
    const user = store.getUser(auth.id);
    if (!user) return c.json({ error: "not_found" }, 404);
    user.planId = body.data.planId as PlanId;
    user.status = body.data.planId === "free" ? "none" : "active";
    return c.json({ ok: true, planId: user.planId, status: user.status });
  });

  return app;
}
