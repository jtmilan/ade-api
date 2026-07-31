import assert from "node:assert/strict";
import crypto from "node:crypto";
import { describe, it } from "node:test";
import { verifyStripeSignature } from "./hmac";

function sign(body: string, secret: string, t: number): string {
  const signed = `${t}.${body}`;
  const v1 = crypto.createHmac("sha256", secret).update(signed).digest("hex");
  return `t=${t},v1=${v1}`;
}

describe("verifyStripeSignature", () => {
  const secret = "whsec_test_secret";
  const body = '{"id":"evt_1","type":"customer.subscription.updated"}';
  const now = 1_700_000_000;

  it("accepts a valid signature", () => {
    const header = sign(body, secret, now);
    const r = verifyStripeSignature(Buffer.from(body), header, secret, 300, now);
    assert.equal(r.ok, true);
  });

  it("rejects tampered body", () => {
    const header = sign(body, secret, now);
    const r = verifyStripeSignature(
      Buffer.from(body + "x"),
      header,
      secret,
      300,
      now,
    );
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.reason, "bad_signature");
  });

  it("rejects expired timestamp", () => {
    const header = sign(body, secret, now - 3600);
    const r = verifyStripeSignature(Buffer.from(body), header, secret, 300, now);
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.reason, "timestamp_out_of_range");
  });

  it("rejects missing header", () => {
    const r = verifyStripeSignature(Buffer.from(body), null, secret, 300, now);
    assert.equal(r.ok, false);
  });
});
