import { getPlan, type PlanId } from "./plans";
import { signEntitlements } from "./hmac";
import type { PersonaRole, SubStatus, UserRecord } from "../db/store";

export interface EntitlementsPayload {
  userId: string;
  email: string;
  role: PersonaRole;
  planId: PlanId;
  status: SubStatus;
  features: string[];
  limits: ReturnType<typeof getPlan>["limits"];
  credits: { tokenBalance: number; handoffBalance: number };
  promo: { code: string; label: string; endsAt: string | null } | null;
  trialEndsAt: string | null;
  exp: number;
  iat: number;
}

export function buildEntitlements(
  user: UserRecord,
  secret: string,
  ttlSec = 3600,
): { payload: EntitlementsPayload; payloadJson: string; sig: string } {
  const plan = getPlan(user.planId);
  const iat = Math.floor(Date.now() / 1000);
  const features = [...plan.featureFlags];
  if (user.role === "admin") {
    features.push("feature.admin.console", "feature.credits.grant");
  }
  const payload: EntitlementsPayload = {
    userId: user.id,
    email: user.email,
    role: user.role,
    planId: user.planId,
    status: user.status,
    features,
    limits: plan.limits,
    credits: { ...user.credits },
    promo:
      user.promoCode && user.promoLabel
        ? {
            code: user.promoCode,
            label: user.promoLabel,
            endsAt: user.promoEndsAt ?? null,
          }
        : null,
    trialEndsAt: user.trialEndsAt,
    iat,
    exp: iat + ttlSec,
  };
  const payloadJson = JSON.stringify(payload);
  const sig = signEntitlements(payloadJson, secret);
  return { payload, payloadJson, sig };
}
