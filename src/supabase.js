import https from "node:https";

import { config } from "./config.js";

const requestJson = ({ method, url, headers = {}, body = null, timeoutMs = 10000 }) =>
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

    request.setTimeout(timeoutMs, () => {
      request.destroy(new Error(`Supabase request timed out after ${timeoutMs}ms`));
    });
    request.on("error", reject);
    if (body) request.write(body);
    request.end();
  });

export const isSupabaseConfigured = () =>
  Boolean(config.supabaseUrl && config.supabaseServiceRoleKey);

const callRpc = async ({ functionName, body }) => {
  const serializedBody = JSON.stringify(body);
  const response = await requestJson({
    method: "POST",
    url: `${config.supabaseUrl}/rest/v1/rpc/${functionName}`,
    headers: {
      apikey: config.supabaseServiceRoleKey,
      Authorization: `Bearer ${config.supabaseServiceRoleKey}`,
      "Content-Type": "application/json",
      "Content-Length": String(Buffer.byteLength(serializedBody))
    },
    body: serializedBody
  });

  if (!response.ok) {
    throw new Error(
      response.payload?.message ||
        response.payload?.error ||
        `Supabase RPC ${functionName} failed with HTTP ${response.status}`
    );
  }

  return Array.isArray(response.payload) ? response.payload[0] || {} : response.payload || {};
};

export const consumeDetectionQuota = async ({ usageDate, identityKey, limit }) => {
  if (!isSupabaseConfigured()) return null;

  const result = await callRpc({
    functionName: "consume_detection_quota",
    body: {
      p_usage_date: usageDate,
      p_identity_key: identityKey,
      p_limit: limit
    }
  });

  return {
    allowed: result.allowed === true,
    usedCount: Number(result.used_count) || 0
  };
};

export const getDetectionQuota = async ({ usageDate, identityKey, limit }) => {
  if (!isSupabaseConfigured()) return null;

  const result = await callRpc({
    functionName: "get_detection_quota",
    body: {
      p_usage_date: usageDate,
      p_identity_key: identityKey,
      p_limit: limit
    }
  });

  return {
    usedCount: Number(result.used_count) || 0,
    remainingCount: Math.max(0, Number(result.remaining_count) || 0)
  };
};

export const upsertUser = async (user) => {
  if (!isSupabaseConfigured()) return { ok: false, skipped: true };

  const body = JSON.stringify({
    google_id: user.id,
    email: user.email,
    name: user.name,
    picture: user.picture,
    last_login_at: new Date().toISOString()
  });

  const response = await requestJson({
    method: "POST",
    url: `${config.supabaseUrl}/rest/v1/users?on_conflict=google_id`,
    headers: {
      apikey: config.supabaseServiceRoleKey,
      Authorization: `Bearer ${config.supabaseServiceRoleKey}`,
      "Content-Type": "application/json",
      "Content-Length": String(Buffer.byteLength(body)),
      Prefer: "resolution=merge-duplicates,return=minimal"
    },
    body
  });

  if (!response.ok) {
    throw new Error(
      response.payload?.message ||
        response.payload?.error ||
        `Supabase user upsert failed with HTTP ${response.status}`
    );
  }

  return { ok: true };
};

const activeSubscriptionStatuses = new Set(["active", "trialing"]);

export const getUserSubscription = async (user) => {
  if (!isSupabaseConfigured() || !user?.id) return null;

  const params = new URLSearchParams({
    select: "google_id,email,plan,status,creem_subscription_id,current_period_end,cancel_at_period_end,updated_at",
    google_id: `eq.${user.id}`,
    order: "updated_at.desc",
    limit: "1"
  });

  const response = await requestJson({
    method: "GET",
    url: `${config.supabaseUrl}/rest/v1/subscriptions?${params}`,
    headers: {
      apikey: config.supabaseServiceRoleKey,
      Authorization: `Bearer ${config.supabaseServiceRoleKey}`
    }
  });

  if (!response.ok) {
    throw new Error(
      response.payload?.message ||
        response.payload?.error ||
        `Supabase subscription lookup failed with HTTP ${response.status}`
    );
  }

  const subscription = Array.isArray(response.payload) ? response.payload[0] : null;
  if (!subscription) return null;

  return {
    ...subscription,
    isPro: subscription.plan === "pro_monthly" && activeSubscriptionStatuses.has(subscription.status)
  };
};

export const upsertSubscription = async ({
  googleId,
  email,
  plan = "pro_monthly",
  status,
  creemCustomerId = "",
  creemSubscriptionId = "",
  creemCheckoutId = "",
  creemOrderId = "",
  creemProductId = "",
  currentPeriodEnd = null,
  cancelAtPeriodEnd = false,
  rawEventType = ""
}) => {
  if (!isSupabaseConfigured()) return { ok: false, skipped: true };
  if (!googleId && !email) return { ok: false, skipped: true, reason: "missing_user_identity" };
  if (!status) return { ok: false, skipped: true, reason: "missing_status" };

  const body = JSON.stringify({
    google_id: googleId || null,
    email: email || null,
    plan,
    status,
    creem_customer_id: creemCustomerId || null,
    creem_subscription_id: creemSubscriptionId || null,
    creem_checkout_id: creemCheckoutId || null,
    creem_order_id: creemOrderId || null,
    creem_product_id: creemProductId || null,
    current_period_end: currentPeriodEnd || null,
    cancel_at_period_end: Boolean(cancelAtPeriodEnd),
    raw_event_type: rawEventType || null,
    last_event_at: new Date().toISOString()
  });

  const response = await requestJson({
    method: "POST",
    url: `${config.supabaseUrl}/rest/v1/subscriptions?on_conflict=google_id`,
    headers: {
      apikey: config.supabaseServiceRoleKey,
      Authorization: `Bearer ${config.supabaseServiceRoleKey}`,
      "Content-Type": "application/json",
      "Content-Length": String(Buffer.byteLength(body)),
      Prefer: "resolution=merge-duplicates,return=minimal"
    },
    body
  });

  if (!response.ok) {
    throw new Error(
      response.payload?.message ||
        response.payload?.error ||
        `Supabase subscription upsert failed with HTTP ${response.status}`
    );
  }

  return { ok: true };
};
