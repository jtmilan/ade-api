export type PlanId = "free" | "pro" | "team";

export interface PlanLimits {
  concurrentPanes: number;
  workspaces: number;
  mcpServers: number;
  handoffExportsDay: number;
  prioritySupport: boolean;
}

export interface Plan {
  id: PlanId;
  name: string;
  priceMonthly: number | null;
  priceLabel: string;
  seats: number | "unlimited";
  features: string[];
  limits: PlanLimits;
  featureFlags: string[];
}

export const PLANS: Plan[] = [
  {
    id: "free",
    name: "Hobby",
    priceMonthly: 0,
    priceLabel: "$0",
    seats: 1,
    features: [
      "1 workspace · 3 concurrent panes",
      "Local MCP registry",
      "Merge gate dry-run",
    ],
    limits: {
      concurrentPanes: 3,
      workspaces: 1,
      mcpServers: 4,
      handoffExportsDay: 5,
      prioritySupport: false,
    },
    featureFlags: ["feature.merge.gate.basic", "feature.mcp.local", "feature.diff_pr"],
  },
  {
    id: "pro",
    name: "Pro",
    priceMonthly: 29,
    priceLabel: "$29",
    seats: 1,
    features: [
      "Unlimited workspaces",
      "24 concurrent panes",
      "MCP pack import/export",
      "Session handoff + merge gate",
    ],
    limits: {
      concurrentPanes: 24,
      workspaces: 50,
      mcpServers: 32,
      handoffExportsDay: 200,
      prioritySupport: true,
    },
    featureFlags: [
      "feature.merge.gate",
      "feature.mcp.export",
      "feature.handoff.v2",
      "feature.mcp.local",
      "feature.broadcast",
      "feature.runbook",
      "feature.diff_pr",
    ],
  },
  {
    id: "team",
    name: "Team",
    priceMonthly: 99,
    priceLabel: "$99",
    seats: 5,
    features: [
      "Everything in Pro",
      "5 seats · SSO-ready",
      "Org MCP policy templates",
      "Usage analytics API",
    ],
    limits: {
      concurrentPanes: 64,
      workspaces: 200,
      mcpServers: 64,
      handoffExportsDay: 2000,
      prioritySupport: true,
    },
    featureFlags: [
      "feature.merge.gate",
      "feature.mcp.export",
      "feature.handoff.v2",
      "feature.mcp.local",
      "feature.org.recipes",
      "feature.org_mcp",
      "feature.shared_inbox",
      "feature.usage.api",
      "feature.broadcast",
      "feature.runbook",
      "feature.diff_pr",
    ],
  },
];

export function getPlan(id: PlanId): Plan {
  return PLANS.find((p) => p.id === id) ?? PLANS[0]!;
}
