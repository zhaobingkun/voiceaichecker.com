import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

process.env.CREEM_WEBHOOK_SECRET = "test_webhook_secret";
process.env.CREEM_CREDITS_PRODUCT_ID = "prod_credit_test";

const { verifyCreemWebhookSignature } = await import("../src/creem.js");
const {
  creditPurchaseFromCreemEvent,
  handleCheckout,
  handleCreditsCheckout,
  handleCreemWebhook
} = await import("../src/server/handlers.js");

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

test("credit checkout redirects an anonymous visitor to Google login", async () => {
  const req = { headers: {}, socket: { remoteAddress: "127.0.0.1" } };
  const res = responseRecorder();

  await handleCreditsCheckout(req, res);

  assert.equal(res.statusCode, 302);
  assert.equal(res.headers.Location, "/auth/google?next=/pricing/#credit-pack");
});

test("credit purchase parser accepts the configured paid checkout and ignores metadata amount", () => {
  const purchase = creditPurchaseFromCreemEvent({
    id: "evt_credit_1",
    eventType: "checkout.completed",
    object: {
      id: "checkout_1",
      product: { id: "prod_credit_test" },
      order: { id: "order_1", status: "paid" },
      customer: { email: "buyer@example.com" },
      metadata: {
        google_user_id: "google-test-user",
        purchase_type: "credit_pack",
        credit_amount: "9999"
      }
    }
  });

  assert.deepEqual(purchase, {
    googleId: "google-test-user",
    email: "buyer@example.com",
    amount: 20,
    requestId: "credit_purchase:order_1",
    orderId: "order_1",
    checkoutId: "",
    productId: "prod_credit_test",
    rawEventType: "checkout.completed"
  });
});

test("credit purchase parser rejects an unconfigured product", () => {
  const purchase = creditPurchaseFromCreemEvent({
    eventType: "checkout.completed",
    object: {
      id: "checkout_wrong",
      product: { id: "prod_wrong" },
      order: { id: "order_wrong", status: "paid" },
      metadata: { google_user_id: "google-test-user", purchase_type: "credit_pack" }
    }
  });

  assert.equal(purchase, null);
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

test("valid credit purchase webhook refuses success when credits cannot be persisted", async () => {
  const rawBody = Buffer.from(
    JSON.stringify({
      id: "evt_credit_2",
      eventType: "checkout.completed",
      object: {
        id: "checkout_2",
        product: { id: "prod_credit_test" },
        order: { id: "order_2", status: "paid" },
        metadata: {
          google_user_id: "google-test-user",
          email: "buyer@example.com",
          purchase_type: "credit_pack"
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
    error: "Credit purchase was not persisted",
    reason: "storage_not_configured"
  });
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
