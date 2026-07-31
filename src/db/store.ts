import type { PlanId } from "../lib/plans";

export type SubStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "canceled"
  | "none";

export interface UserRecord {
  id: string;
  email: string;
  stripeCustomerId?: string;
  planId: PlanId;
  status: SubStatus;
  renewsAt: string | null;
  externalSubscriptionId?: string;
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

/** In-memory store for scaffold; swap for Postgres/SQLite in production. */
export class Store {
  users = new Map<string, UserRecord>();
  usersByEmail = new Map<string, string>();
  webhookEvents = new Map<string, WebhookEventRow>();
  queue: { kind: string; eventId: string }[] = [];
  usage = new Map<string, UsageMeters>();

  constructor() {
    const demo: UserRecord = {
      id: "user_demo",
      email: "jeffry@example.com",
      stripeCustomerId: "cus_mock_ade",
      planId: "pro",
      status: "active",
      renewsAt: new Date(Date.now() + 30 * 864e5).toISOString(),
      externalSubscriptionId: "sub_mock_ade",
    };
    this.users.set(demo.id, demo);
    this.usersByEmail.set(demo.email, demo.id);
    this.usage.set(demo.id, {
      panesPeak: 7,
      workspaces: 3,
      mcpServers: 6,
      handoffExports24h: 12,
      tokensEstimate: 1_240_000,
    });
  }

  getUser(id: string): UserRecord | undefined {
    return this.users.get(id);
  }

  getUserByEmail(email: string): UserRecord | undefined {
    const id = this.usersByEmail.get(email);
    return id ? this.users.get(id) : undefined;
  }

  /** Returns true if inserted; false if duplicate. */
  insertWebhookEvent(
    id: string,
    type: string,
    payloadHash: string,
  ): boolean {
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

  markProcessed(id: string): void {
    const row = this.webhookEvents.get(id);
    if (row) row.processedAt = new Date().toISOString();
  }

  enqueue(job: { kind: string; eventId: string }): void {
    this.queue.push(job);
  }

  dequeue(): { kind: string; eventId: string } | undefined {
    return this.queue.shift();
  }

  upsertSubscription(input: {
    customerId: string;
    subscriptionId: string;
    planId: PlanId;
    status: SubStatus;
    renewsAt: string | null;
  }): void {
    for (const user of this.users.values()) {
      if (user.stripeCustomerId === input.customerId) {
        user.planId = input.planId;
        user.status = input.status;
        user.renewsAt = input.renewsAt;
        user.externalSubscriptionId = input.subscriptionId;
        return;
      }
    }
    // Create orphan link by customer id for later claim
    const id = `user_${input.customerId}`;
    if (!this.users.has(id)) {
      const rec: UserRecord = {
        id,
        email: `${input.customerId}@stripe.local`,
        stripeCustomerId: input.customerId,
        planId: input.planId,
        status: input.status,
        renewsAt: input.renewsAt,
        externalSubscriptionId: input.subscriptionId,
      };
      this.users.set(id, rec);
      this.usersByEmail.set(rec.email, id);
    }
  }
}

export const store = new Store();
