import crypto from "node:crypto";

export type VerifyResult =
  | { ok: true; timestamp: number }
  | { ok: false; reason: string };

/**
 * Stripe webhook signature verification (raw body).
 * Prefer Stripe SDK in production; this is a self-contained, testable implementation.
 *
 * Header: Stripe-Signature: t=<unix>,v1=<hex>
 * Signed payload: `${t}.${rawBody}`
 */
export function verifyStripeSignature(
  rawBody: Buffer,
  header: string | null | undefined,
  secret: string,
  toleranceSec = 300,
  nowSec = Math.floor(Date.now() / 1000),
): VerifyResult {
  if (!header) return { ok: false, reason: "missing_header" };
  if (!secret) return { ok: false, reason: "missing_secret" };

  const map: Record<string, string> = {};
  for (const part of header.split(",")) {
    const [k, ...rest] = part.split("=");
    if (!k || rest.length === 0) continue;
    map[k.trim()] = rest.join("=").trim();
  }

  const timestamp = Number(map.t);
  const v1 = map.v1;
  if (!Number.isFinite(timestamp) || !v1) {
    return { ok: false, reason: "malformed_header" };
  }

  if (Math.abs(nowSec - timestamp) > toleranceSec) {
    return { ok: false, reason: "timestamp_out_of_range" };
  }

  const signed = `${timestamp}.${rawBody.toString("utf8")}`;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(signed, "utf8")
    .digest("hex");

  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(v1, "utf8");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, reason: "bad_signature" };
  }
  return { ok: true, timestamp };
}

/** Sign entitlements blob for desktop offline cache (HMAC-SHA256). */
export function signEntitlements(
  payloadJson: string,
  secret: string,
): string {
  return crypto.createHmac("sha256", secret).update(payloadJson).digest("hex");
}

export function verifyEntitlementsSig(
  payloadJson: string,
  sig: string,
  secret: string,
): boolean {
  const expected = signEntitlements(payloadJson, secret);
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(sig, "utf8");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
