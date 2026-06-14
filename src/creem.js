import { createHmac, timingSafeEqual } from "node:crypto";
import https from "node:https";

import { config } from "./config.js";

const requestJson = ({ method, url, headers = {}, body = null }) =>
  new Promise((resolve, reject) => {
    const target = new URL(url);
    const request = https.request(
      {
        method,
        hostname: target.hostname,
        port: target.port || 443,
        path: `${target.pathname}${target.search}`,
        headers
      },
      (response) => {
        const chunks = [];

        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let payload = null;

          try {
            payload = text ? JSON.parse(text) : {};
          } catch {
            payload = { message: text };
          }

          resolve({
            ok: response.statusCode >= 200 && response.statusCode < 300,
            status: response.statusCode,
            payload
          });
        });
      }
    );

    request.on("error", reject);
    if (body) request.write(body);
    request.end();
  });

export const isCreemConfigured = () =>
  Boolean(config.creemApiKey && config.creemApiBaseUrl && config.creemProProductId);

export const createProCheckout = async ({ user }) => {
  if (!isCreemConfigured()) {
    throw new Error("Creem checkout is not configured.");
  }

  const successUrl = `${config.appBaseUrl}/pricing/?checkout=success`;
  const body = JSON.stringify({
    product_id: config.creemProProductId,
    success_url: successUrl,
    customer: user?.email ? { email: user.email } : undefined,
    metadata: {
      google_user_id: user?.id || "",
      email: user?.email || "",
      plan: "pro_monthly"
    }
  });

  const response = await requestJson({
    method: "POST",
    url: `${config.creemApiBaseUrl}/v1/checkouts`,
    headers: {
      "x-api-key": config.creemApiKey,
      "Content-Type": "application/json",
      "Content-Length": String(Buffer.byteLength(body))
    },
    body
  });

  if (!response.ok) {
    const message = Array.isArray(response.payload?.message)
      ? response.payload.message.join("; ")
      : response.payload?.message || response.payload?.error || `Creem checkout failed with HTTP ${response.status}`;
    throw new Error(message);
  }

  const checkoutUrl = response.payload?.checkout_url || response.payload?.checkoutUrl || response.payload?.url;
  if (!checkoutUrl) {
    throw new Error("Creem did not return a checkout URL.");
  }

  return {
    checkoutUrl,
    checkoutId: response.payload?.id || "",
    mode: response.payload?.mode || ""
  };
};

const signaturesForHeader = (value) =>
  String(value || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .flatMap((part) => {
      const separator = part.indexOf("=");
      return separator === -1 ? [part] : [part.slice(separator + 1).trim()];
    });

const safeEqual = (left, right) => {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
};

export const verifyCreemWebhookSignature = ({ headers, rawBody }) => {
  if (!config.creemWebhookSecret) return false;

  const signatureHeader =
    headers["creem-signature"] ||
    headers["x-creem-signature"] ||
    headers["svix-signature"] ||
    headers["webhook-signature"];
  if (!signatureHeader) return false;

  const payload = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody || ""));
  const expectedHex = createHmac("sha256", config.creemWebhookSecret).update(payload).digest("hex");
  const expectedBase64 = createHmac("sha256", config.creemWebhookSecret).update(payload).digest("base64");

  return signaturesForHeader(signatureHeader).some(
    (signature) => safeEqual(signature, expectedHex) || safeEqual(signature, expectedBase64)
  );
};
