import { getPlan, type PlanId } from "./plans";
import { signEntitlements } from "./hmac";
import type { SubStatus, UserRecord } from "../db/store";

export interface EntitlementsPayload {
  userId: string;
  planId: PlanId;
  status: SubStatus;
  features: string[];
  limits: ReturnType<typeof getPlan>["limits"];
  exp: number; // unix seconds
  iat: number;
}

export function buildEntitlements(
  user: UserRecord,
  secret: string,
  ttlSec = 3600,
): { payload: EntitlementsPayload; payloadJson: string; sig: string } {
  const plan = getPlan(user.planId);
  const iat = Math.floor(Date.now() / 1000);
  const payload: EntitlementsPayload = {
    userId: user.id,
    planId: user.planId,
    status: user.status,
    features: plan.featureFlags,
    limits: plan.limits,
    iat,
    exp: iat + ttlSec,
  };
  const payloadJson = JSON.stringify(payload);
  const sig = signEntitlements(payloadJson, secret);
  return { payload, payloadJson, sig };
}
