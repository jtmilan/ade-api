import type { PlanId } from "../lib/plans";

export type SubStatus = "active" | "trialing" | "past_due" | "canceled" | "none";
export type PersonaRole = "admin" | "operator" | "viewer";

export interface UserRecord {
  id: string;
  email: string;
  role: PersonaRole;
  stripeCustomerId?: string;
  planId: PlanId;
  status: SubStatus;
  renewsAt: string | null;
  trialEndsAt: string | null;
  externalSubscriptionId?: string;
  promoCode?: string | null;
  promoLabel?: string | null;
  promoEndsAt?: string | null;
  credits: { tokenBalance: number; handoffBalance: number };
}

export interface WebhookEventRow {
  id: string;
  type: string;
  receivedAt: string;
  processedAt: string | null;
  payloadHash: string;
}

export interface UsageMeters {
  panesPeak: number;
  workspaces: number;
  mcpServers: number;
  handoffExports24h: number;
  tokensEstimate: number;
}

export interface CouponDef {
  code: string;
  label: string;
  percentOff?: number;
  trialDays?: number;
  bonusHandoffs?: number;
  bonusTokens?: number;
  maxRedemptions: number;
  redemptions: number;
  active: boolean;
  endsAt: string | null;
}

export interface CampaignDef {
  id: string;
  title: string;
  body: string;
  placement: "billing_banner" | "command_strip" | "soft_gate";
  ctaLabel: string;
  planId?: PlanId;
  couponCode?: string;
  segment: "all" | "trialing" | "past_due" | "free" | "pro" | "team";
  active: boolean;
  endsAt: string | null;
  priority: number;
}

export interface CreditLedgerEntry {
  id: string;
  userId: string;
  meter: "tokens" | "handoff";
  amount: number;
  direction: "grant" | "consume";
  reason: string;
  idempotencyKey?: string;
  at: string;
  by?: string;
}

export interface ProductEvent {
  id: string;
  userId: string;
  name: string;
  props?: Record<string, unknown>;
  at: string;
}

export class Store {
  users = new Map<string, UserRecord>();
  usersByEmail = new Map<string, string>();
  webhookEvents = new Map<string, WebhookEventRow>();
  queue: { kind: string; eventId: string }[] = [];
  usage = new Map<string, UsageMeters>();
  coupons = new Map<string, CouponDef>();
  campaigns = new Map<string, CampaignDef>();
  ledger: CreditLedgerEntry[] = [];
  events: ProductEvent[] = [];
  redeemKeys = new Set<string>();
  consumeKeys = new Set<string>();
  dismissals = new Set<string>();

  constructor() {
    const seeds: UserRecord[] = [
      {
        id: "user_admin",
        email: "admin@ade.local",
        role: "admin",
        stripeCustomerId: "cus_admin",
        planId: "team",
        status: "active",
        renewsAt: new Date(Date.now() + 30 * 864e5).toISOString(),
        trialEndsAt: null,
        externalSubscriptionId: "sub_admin",
        credits: { tokenBalance: 50_000_000, handoffBalance: 2000 },
      },
      {
        id: "user_demo",
        email: "jeffry@example.com",
        role: "operator",
        stripeCustomerId: "cus_mock_ade",
        planId: "pro",
        status: "active",
        renewsAt: new Date(Date.now() + 30 * 864e5).toISOString(),
        trialEndsAt: null,
        externalSubscriptionId: "sub_mock_ade",
        promoCode: "LAUNCH50",
        promoLabel: "Launch: 50% off first 3 months",
        promoEndsAt: "2026-09-01T00:00:00.000Z",
        credits: { tokenBalance: 8_760_000, handoffBalance: 188 },
      },
      {
        id: "user_viewer",
        email: "viewer@ade.local",
        role: "viewer",
        planId: "free",
        status: "none",
        renewsAt: null,
        trialEndsAt: null,
        credits: { tokenBalance: 500_000, handoffBalance: 5 },
      },
    ];
    for (const u of seeds) {
      this.users.set(u.id, u);
      this.usersByEmail.set(u.email, u.id);
    }
    this.usage.set("user_demo", {
      panesPeak: 7,
      workspaces: 3,
      mcpServers: 6,
      handoffExports24h: 12,
      tokensEstimate: 1_240_000,
    });
    this.coupons.set("LAUNCH50", {
      code: "LAUNCH50",
      label: "50% off first 3 months + 20 handoffs",
      percentOff: 50,
      bonusHandoffs: 20,
      bonusTokens: 100_000,
      maxRedemptions: 1000,
      redemptions: 12,
      active: true,
      endsAt: "2026-09-01T00:00:00.000Z",
    });
    this.coupons.set("TRIAL14", {
      code: "TRIAL14",
      label: "14-day Pro trial",
      trialDays: 14,
      bonusHandoffs: 10,
      maxRedemptions: 5000,
      redemptions: 40,
      active: true,
      endsAt: null,
    });
    this.coupons.set("WELCOME", {
      code: "WELCOME",
      label: "Welcome credits",
      bonusHandoffs: 5,
      bonusTokens: 50_000,
      maxRedemptions: 100_000,
      redemptions: 200,
      active: true,
      endsAt: null,
    });
    this.campaigns.set("camp_august_launch", {
      id: "camp_august_launch",
      title: "Launch week: invite a teammate",
      body: "Both of you get handoff credits when they finish the wizard.",
      placement: "billing_banner",
      ctaLabel: "Copy referral",
      segment: "all",
      active: true,
      endsAt: "2026-08-15T00:00:00.000Z",
      priority: 10,
      couponCode: "WELCOME",
    });
    this.campaigns.set("camp_upgrade_soft", {
      id: "camp_upgrade_soft",
      title: "Need more panes?",
      body: "Pro unlocks 24 concurrent panes and MCP pack export.",
      placement: "soft_gate",
      ctaLabel: "Upgrade to Pro",
      planId: "pro",
      segment: "free",
      active: true,
      endsAt: null,
      priority: 5,
      couponCode: "TRIAL14",
    });
  }

  getUser(id: string) {
    return this.users.get(id);
  }
  getUserByEmail(email: string) {
    const id = this.usersByEmail.get(email);
    return id ? this.users.get(id) : undefined;
  }
  listUsers() {
    return [...this.users.values()];
  }
  insertWebhookEvent(id: string, type: string, payloadHash: string) {
    if (this.webhookEvents.has(id)) return false;
    this.webhookEvents.set(id, {
      id,
      type,
      receivedAt: new Date().toISOString(),
      processedAt: null,
      payloadHash,
    });
    return true;
  }
  markProcessed(id: string) {
    const row = this.webhookEvents.get(id);
    if (row) row.processedAt = new Date().toISOString();
  }
  enqueue(job: { kind: string; eventId: string }) {
    this.queue.push(job);
  }
  dequeue() {
    return this.queue.shift();
  }
  upsertSubscription(input: {
    customerId: string;
    subscriptionId: string;
    planId: PlanId;
    status: SubStatus;
    renewsAt: string | null;
  }) {
    for (const user of this.users.values()) {
      if (user.stripeCustomerId === input.customerId) {
        user.planId = input.planId;
        user.status = input.status;
        user.renewsAt = input.renewsAt;
        user.externalSubscriptionId = input.subscriptionId;
        return;
      }
    }
    const id = `user_${input.customerId}`;
    if (!this.users.has(id)) {
      const rec: UserRecord = {
        id,
        email: `${input.customerId}@stripe.local`,
        role: "operator",
        stripeCustomerId: input.customerId,
        planId: input.planId,
        status: input.status,
        renewsAt: input.renewsAt,
        trialEndsAt: null,
        externalSubscriptionId: input.subscriptionId,
        credits: { tokenBalance: 500_000, handoffBalance: 5 },
      };
      this.users.set(id, rec);
      this.usersByEmail.set(rec.email, id);
    }
  }
  grantCredits(
    userId: string,
    meter: "tokens" | "handoff",
    amount: number,
    reason: string,
    by?: string,
  ) {
    const user = this.users.get(userId);
    if (!user || amount <= 0) return null;
    if (meter === "tokens") user.credits.tokenBalance += amount;
    else user.credits.handoffBalance += amount;
    const entry: CreditLedgerEntry = {
      id: `led_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      userId,
      meter,
      amount,
      direction: "grant",
      reason,
      at: new Date().toISOString(),
      by,
    };
    this.ledger.unshift(entry);
    return entry;
  }
  consumeCredits(
    userId: string,
    meter: "tokens" | "handoff",
    amount: number,
    reason: string,
    idempotencyKey?: string,
  ): { ok: true; entry: CreditLedgerEntry } | { ok: false; error: string } {
    if (idempotencyKey && this.consumeKeys.has(idempotencyKey)) {
      return { ok: false, error: "duplicate_idempotency_key" };
    }
    const user = this.users.get(userId);
    if (!user) return { ok: false, error: "user_not_found" };
    if (amount <= 0) return { ok: false, error: "invalid_amount" };
    const bal =
      meter === "tokens" ? user.credits.tokenBalance : user.credits.handoffBalance;
    if (bal < amount) return { ok: false, error: "insufficient_credits" };
    if (meter === "tokens") user.credits.tokenBalance -= amount;
    else user.credits.handoffBalance -= amount;
    if (idempotencyKey) this.consumeKeys.add(idempotencyKey);
    const entry: CreditLedgerEntry = {
      id: `led_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      userId,
      meter,
      amount,
      direction: "consume",
      reason,
      idempotencyKey,
      at: new Date().toISOString(),
    };
    this.ledger.unshift(entry);
    return { ok: true, entry };
  }
}

export const store = new Store();
