import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

process.env.CREEM_WEBHOOK_SECRET = "test_webhook_secret";

const { verifyCreemWebhookSignature } = await import("../src/creem.js");
const { handleCheckout, handleCreemWebhook } = await import("../src/server/handlers.js");

const responseRecorder = () => ({
  statusCode: null,
  headers: {},
  body: "",
  writeHead(statusCode, headers = {}) {
    this.statusCode = statusCode;
    this.headers = { ...this.headers, ...headers };
  },
  getHeader(name) {
    return this.headers[name];
  },
  setHeader(name, value) {
    this.headers[name] = value;
  },
  end(value = "") {
    this.body += value;
  }
});

const signedSessionCookie = (user) => {
  const payload = Buffer.from(
    JSON.stringify({ user, expiresAt: Date.now() + 60_000 }),
    "utf8"
  ).toString("base64url");
  const signature = createHmac("sha256", "local-dev-session-secret")
    .update(payload)
    .digest("base64url");
  return `avd_session=${payload}.${signature}`;
};

test("Creem webhook signature accepts the exact raw payload", () => {
  const rawBody = Buffer.from('{"type":"subscription.active"}', "utf8");
  const signature = createHmac("sha256", process.env.CREEM_WEBHOOK_SECRET)
    .update(rawBody)
    .digest("hex");

  assert.equal(
    verifyCreemWebhookSignature({
      headers: { "creem-signature": signature },
      rawBody
    }),
    true
  );
});

test("Creem webhook signature rejects a modified payload", () => {
  const originalBody = Buffer.from('{"type":"subscription.active"}', "utf8");
  const modifiedBody = Buffer.from('{"type":"subscription.canceled"}', "utf8");
  const signature = createHmac("sha256", process.env.CREEM_WEBHOOK_SECRET)
    .update(originalBody)
    .digest("hex");

  assert.equal(
    verifyCreemWebhookSignature({
      headers: { "creem-signature": signature },
      rawBody: modifiedBody
    }),
    false
  );
});

test("checkout redirects an anonymous visitor to Google login", async () => {
  const req = { headers: {}, socket: { remoteAddress: "127.0.0.1" } };
  const res = responseRecorder();

  await handleCheckout(req, res);

  assert.equal(res.statusCode, 302);
  assert.equal(res.headers.Location, "/auth/google?next=/pricing/");
});

test("checkout refuses a signed-in user when Creem is not configured", async () => {
  const user = { id: "google-test-user", email: "buyer@example.com" };
  const req = {
    headers: { cookie: signedSessionCookie(user) },
    socket: { remoteAddress: "127.0.0.1" }
  };
  const res = responseRecorder();

  await assert.rejects(() => handleCheckout(req, res), /Creem checkout is not configured/);
});

test("webhook rejects a missing signature", async () => {
  const req = {
    headers: {},
    body: Buffer.from('{"type":"subscription.active"}', "utf8")
  };
  const res = responseRecorder();

  await handleCreemWebhook(req, res);

  assert.equal(res.statusCode, 401);
  assert.deepEqual(JSON.parse(res.body), { error: "Invalid webhook signature" });
});

test("valid webhook returns 503 when the subscription cannot be persisted", async () => {
  const rawBody = Buffer.from(
    JSON.stringify({
      type: "subscription.active",
      data: {
        status: "active",
        metadata: {
          google_user_id: "google-test-user",
          email: "buyer@example.com",
          plan: "pro_monthly"
        }
      }
    }),
    "utf8"
  );
  const signature = createHmac("sha256", process.env.CREEM_WEBHOOK_SECRET)
    .update(rawBody)
    .digest("hex");
  const req = {
    headers: { "creem-signature": signature },
    body: rawBody
  };
  const res = responseRecorder();

  await handleCreemWebhook(req, res);

  assert.equal(res.statusCode, 503);
  assert.deepEqual(JSON.parse(res.body), {
    error: "Subscription update was not persisted",
    reason: "storage_not_configured"
  });
});
