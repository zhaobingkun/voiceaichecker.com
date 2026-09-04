import { createHash } from "node:crypto";

import {
  buildGoogleLoginUrl,
  clearSessionCookie,
  getCurrentUser,
  handleGoogleCallback,
  isGoogleAuthConfigured
} from "../auth.js";
import { trimWavBuffer } from "../audio.js";
import { config, limits } from "../config.js";
import { createProCheckout, isCreemConfigured, verifyCreemWebhookSignature } from "../creem.js";
import { classifyScore, confidenceForScore, detectVoice } from "../provider.js";
import {
  consumeDetectionQuota,
  getDetectionQuota,
  getUserSubscription,
  isSupabaseConfigured,
  upsertSubscription
} from "../supabase.js";

const cache = globalThis.__avdCache || new Map();
const usage = globalThis.__avdUsage || new Map();
globalThis.__avdCache = cache;
globalThis.__avdUsage = usage;

const allowedAudioTypes = new Set(["audio/wav", "audio/x-wav", "application/octet-stream"]);

const todayKey = () => new Date().toISOString().slice(0, 10);

const getIp = (req) => {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) return forwarded.split(",")[0].trim();
  return req.socket?.remoteAddress || "unknown";
};

export const sendJson = (res, statusCode, payload) => {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(payload));
};

export const redirect = (res, location) => {
  res.writeHead(302, { Location: location });
  res.end();
};

export const readJsonBody = async (req) => {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return JSON.parse(req.body || "{}");

  let size = 0;
  const chunks = [];

  for await (const chunk of req) {
    size += chunk.length;
    if (size > limits.maxJsonBodyBytes) {
      throw new Error(`Request is too large. Max processed audio sample is ${config.maxFileMb}MB.`);
    }
    chunks.push(chunk);
  }

  const body = Buffer.concat(chunks).toString("utf8");
  if (!body) return {};
  return JSON.parse(body);
};

const usageKeyForRequest = async (req) => {
  const user = getCurrentUser(req);
  if (user) {
    const subscription = await getUserSubscription(user);
    const isPro = Boolean(subscription?.isPro);
    return {
      user,
      subscription,
      isPro,
      key: `${todayKey()}:user:${user.id}:${isPro ? "pro" : "free"}`,
      limit: isPro ? config.proDailyLimit : config.authenticatedDailyLimit
    };
  }

  const ip = getIp(req);
  return { user: null, subscription: null, isPro: false, key: `${todayKey()}:ip:${ip}`, limit: config.dailyIpLimit };
};

const remainingForKey = (key, limit) => Math.max(0, limit - (usage.get(key) || 0));

const remainingForQuota = ({ usedCount, limit }) => Math.max(0, limit - usedCount);

const useQuota = (key, limit) => {
  const used = usage.get(key) || 0;
  if (used >= limit) return false;
  usage.set(key, used + 1);
  return true;
};

const reserveQuota = async (quota) => {
  const persisted = await consumeDetectionQuota({
    usageDate: todayKey(),
    identityKey: quota.key,
    limit: quota.limit
  });

  if (persisted) return persisted;

  return {
    allowed: useQuota(quota.key, quota.limit),
    usedCount: usage.get(quota.key) || 0
  };
};

const readQuota = async (quota) => {
  const persisted = await getDetectionQuota({
    usageDate: todayKey(),
    identityKey: quota.key,
    limit: quota.limit
  });

  if (persisted) return persisted;

  return {
    usedCount: usage.get(quota.key) || 0,
    remainingCount: remainingForKey(quota.key, quota.limit)
  };
};

const getCachedDetection = (cacheKey) => {
  const entry = cache.get(cacheKey);
  if (!entry) return null;

  if (entry.expiresAt <= Date.now()) {
    cache.delete(cacheKey);
    return null;
  }

  cache.delete(cacheKey);
  cache.set(cacheKey, entry);
  return entry.value;
};

const setCachedDetection = (cacheKey, value) => {
  cache.set(cacheKey, { value, expiresAt: Date.now() + config.cacheTtlSeconds * 1000 });

  while (cache.size > config.cacheMaxEntries) {
    cache.delete(cache.keys().next().value);
  }
};

export const handleDetect = async (req, res) => {
  const quota = await usageKeyForRequest(req);
  let quotaState;

  try {
    quotaState = await reserveQuota(quota);
  } catch (error) {
    console.error("Detection quota service failed", {
      message: error.message,
      identityType: quota.user ? "user" : "ip"
    });
    sendJson(res, 503, { error: "Detection quota is temporarily unavailable. Please try again shortly." });
    return;
  }

  if (!quotaState.allowed) {
    sendJson(res, 429, {
      error: quota.user
        ? "Daily account limit reached. Try again tomorrow."
        : "Daily free limit reached. Sign in with Google for more free detections."
    });
    return;
  }

  const body = await readJsonBody(req);
  const audioBase64 = String(body.audioBase64 || "").replace(/^data:[^,]+,/, "");
  const filename = String(body.filename || "audio-upload").slice(0, 160);
  const mimeType = String(body.mimeType || "application/octet-stream").toLowerCase();
  const maxAnalyzeSeconds = quota.user
    ? config.maxAnalyzeSeconds
    : Math.min(config.maxAnalyzeSeconds, config.anonymousMaxAnalyzeSeconds);
  const requestedSeconds = Math.trunc(Number(body.analyzeSeconds) || maxAnalyzeSeconds);
  const analyzeSeconds = Math.max(1, Math.min(maxAnalyzeSeconds, requestedSeconds));

  if (!audioBase64) throw new Error("Missing audio file.");
  if (!allowedAudioTypes.has(mimeType)) {
    throw new Error("Server accepts WAV only. The browser converts supported uploads before detection.");
  }

  const audioBuffer = Buffer.from(audioBase64, "base64");
  if (!audioBuffer.length) throw new Error("Audio file is empty.");
  if (audioBuffer.length > limits.maxFileBytes) {
    throw new Error(`Processed audio sample is too large. Max sample size is ${config.maxFileMb}MB.`);
  }

  const trimmedAudio = trimWavBuffer({ buffer: audioBuffer, maxSeconds: analyzeSeconds });
  if (trimmedAudio.buffer.length > limits.maxFileBytes) {
    throw new Error(`Trimmed audio is too large. Max sample size is ${config.maxFileMb}MB.`);
  }

  const fileHash = createHash("sha256").update(trimmedAudio.buffer).digest("hex");
  const cacheKey = `${fileHash}:${analyzeSeconds}`;
  const cached = getCachedDetection(cacheKey);

  if (cached) {
    sendJson(res, 200, {
      ...cached,
      cached: true,
      user: quota.user,
      subscription: quota.subscription,
      isPro: quota.isPro,
      remainingDailyDetections: remainingForQuota({ usedCount: quotaState.usedCount, limit: quota.limit })
    });
    return;
  }

  const detection = await detectVoice({
    audioBuffer: trimmedAudio.buffer,
    filename: filename.replace(/\.[^.]+$/, "") + ".wav",
    mimeType: "audio/wav",
    analyzeSeconds,
    apiKey: config.modulateApiKey,
    apiUrl: config.modulateApiUrl,
    timeoutMs: config.modulateRequestTimeoutMs
  });

  const aiProbability = detection.aiProbability;
  const result = {
    label: classifyScore(aiProbability),
    aiProbability,
    humanProbability: Number((1 - aiProbability).toFixed(4)),
    confidence: confidenceForScore(aiProbability),
    analyzedSeconds: analyzeSeconds,
    provider: detection.provider,
    cached: false,
    notes:
      detection.provider === "mock"
        ? "Demo result. Add MODULATE_API_KEY and MODULATE_API_URL on the server to enable real detection."
        : trimmedAudio.trimmed
          ? `Only the first ${analyzeSeconds} seconds were analyzed. Detection is probabilistic and should be reviewed with context.`
          : "Detection is probabilistic and should be reviewed with context."
  };

  setCachedDetection(cacheKey, result);
  sendJson(res, 200, {
    ...result,
    user: quota.user,
    subscription: quota.subscription,
    isPro: quota.isPro,
    remainingDailyDetections: remainingForQuota({ usedCount: quotaState.usedCount, limit: quota.limit })
  });
};


const readRawBody = async (req) => {
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === "string") return Buffer.from(req.body, "utf8");
  if (req.body && typeof req.body === "object") return Buffer.from(JSON.stringify(req.body), "utf8");

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
};

const firstValue = (...values) => {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return "";
};

const objectId = (value) => {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object") return value.id || value.subscription_id || value.customer_id || "";
  return "";
};

const findMetadata = (event) => {
  const queue = [event?.data, event?.object, event];
  const seen = new Set();

  while (queue.length) {
    const item = queue.shift();
    if (!item || typeof item !== "object" || seen.has(item)) continue;
    seen.add(item);

    if (item.metadata && typeof item.metadata === "object") return item.metadata;

    for (const value of Object.values(item)) {
      if (value && typeof value === "object") queue.push(value);
    }
  }

  return {};
};

const normalizeCreemStatus = ({ type, status }) => {
  const rawStatus = String(status || "").toLowerCase();
  const rawType = String(type || "").toLowerCase();
  const text = `${rawType} ${rawStatus}`;

  if (/(refund|refunded)/.test(text)) return "refunded";
  if (/(cancel|canceled|cancelled)/.test(text)) return "canceled";
  if (/(expire|expired)/.test(text)) return "expired";
  if (/(fail|failed|past_due|unpaid)/.test(text)) return rawStatus || "failed";
  if (/(trial)/.test(text)) return "trialing";
  if (/(active|paid|completed|checkout\.completed|payment\.succeeded|subscription\.created)/.test(text)) {
    return "active";
  }

  return rawStatus || "active";
};

const normalizeTimestamp = (value) => {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "number") return new Date(value > 100000000000 ? value : value * 1000).toISOString();
  if (/^\d+$/.test(String(value))) {
    const number = Number(value);
    return new Date(number > 100000000000 ? number : number * 1000).toISOString();
  }
  return String(value);
};

const normalizeBoolean = (value) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return ["true", "1", "yes"].includes(value.toLowerCase());
  return Boolean(value);
};

const subscriptionUpdateFromCreemEvent = (event) => {
  const data = event?.data || event?.object || event || {};
  const subscription = data.subscription || data.subscription_details || data.recurring || {};
  const customer = data.customer || data.customer_details || {};
  const metadata = findMetadata(event);
  const eventType = String(event?.type || event?.event_type || event?.event || "");
  const status = normalizeCreemStatus({
    type: eventType,
    status: firstValue(data.status, subscription.status, data.payment_status, data.subscription_status)
  });

  return {
    googleId: firstValue(metadata.google_user_id, metadata.googleUserId, metadata.user_id, metadata.userId),
    email: firstValue(metadata.email, data.customer_email, data.email, customer.email),
    plan: firstValue(metadata.plan, "pro_monthly"),
    status,
    creemCustomerId: objectId(firstValue(data.customer_id, data.customer, customer)),
    creemSubscriptionId: objectId(firstValue(data.subscription_id, data.subscription, subscription)),
    creemCheckoutId: objectId(firstValue(data.checkout_id, data.checkout)),
    creemOrderId: objectId(firstValue(data.order_id, data.order, data.id)),
    creemProductId: objectId(firstValue(data.product_id, data.product, subscription.product_id, subscription.product)),
    currentPeriodEnd: normalizeTimestamp(
      firstValue(subscription.current_period_end, data.current_period_end, subscription.currentPeriodEnd, data.currentPeriodEnd)
    ),
    cancelAtPeriodEnd: normalizeBoolean(firstValue(subscription.cancel_at_period_end, data.cancel_at_period_end, false)),
    rawEventType: eventType
  };
};

export const handleCheckout = async (req, res) => {
  const user = getCurrentUser(req);
  if (!user) {
    redirect(res, "/auth/google?next=/pricing/");
    return;
  }

  const checkout = await createProCheckout({ user });
  redirect(res, checkout.checkoutUrl);
};

export const handleCreemWebhook = async (req, res) => {
  const rawBody = await readRawBody(req);
  if (!verifyCreemWebhookSignature({ headers: req.headers || {}, rawBody })) {
    sendJson(res, 401, { error: "Invalid webhook signature" });
    return;
  }

  let event = {};
  try {
    event = JSON.parse(rawBody.toString("utf8"));
  } catch {
    sendJson(res, 400, { error: "Invalid webhook JSON" });
    return;
  }

  const subscriptionUpdate = subscriptionUpdateFromCreemEvent(event);
  const upsertResult = await upsertSubscription(subscriptionUpdate);

  if (!upsertResult.ok) {
    sendJson(res, 503, {
      error: "Subscription update was not persisted",
      reason: upsertResult.reason || (upsertResult.skipped ? "storage_not_configured" : "unknown")
    });
    return;
  }

  console.log("Creem webhook received", {
    type: event.type || event.event_type || event.event || "unknown",
    id: event.id || event.object?.id || event.data?.id || "unknown",
    subscriptionUpdated: true
  });

  sendJson(res, 200, { ok: true });
};

export const handleMe = async (req, res) => {
  const quota = await usageKeyForRequest(req);
  let quotaState;

  try {
    quotaState = await readQuota(quota);
  } catch (error) {
    console.error("Detection quota lookup failed", {
      message: error.message,
      identityType: quota.user ? "user" : "ip"
    });
    sendJson(res, 503, { error: "Detection quota is temporarily unavailable. Please try again shortly." });
    return;
  }

  sendJson(res, 200, {
    authConfigured: isGoogleAuthConfigured(),
    user: quota.user,
    subscription: quota.subscription,
    isPro: quota.isPro,
    dailyLimit: quota.limit,
    maxAnalyzeSeconds: quota.user ? config.maxAnalyzeSeconds : Math.min(config.maxAnalyzeSeconds, config.anonymousMaxAnalyzeSeconds),
    remainingDailyDetections: quotaState.remainingCount
  });
};

export const handleHealth = (res) => {
  sendJson(res, 200, {
    ok: true,
    providerConfigured: Boolean(config.modulateApiKey && config.modulateApiUrl),
    authConfigured: isGoogleAuthConfigured(),
    supabaseConfigured: isSupabaseConfigured(),
    quotaBackend: isSupabaseConfigured() ? "supabase" : "memory",
    creemConfigured: isCreemConfigured(),
    maxFileMb: config.maxFileMb,
    maxAnalyzeSeconds: config.maxAnalyzeSeconds,
    anonymousMaxAnalyzeSeconds: config.anonymousMaxAnalyzeSeconds,
    modulateRequestTimeoutMs: config.modulateRequestTimeoutMs,
    dailyIpLimit: config.dailyIpLimit,
    authenticatedDailyLimit: config.authenticatedDailyLimit,
    proDailyLimit: config.proDailyLimit
  });
};

const publicPages = [
  "/",
  "/free-ai-voice-detector/",
  "/ai-audio-detector/",
  "/deepfake-audio-detector/",
  "/voice-clone-detector/",
  "/ai-voice-checker/",
  "/voice-ai-checker/",
  "/is-this-voice-ai/",
  "/pricing/",
  "/refund-policy/",
  "/privacy/",
  "/terms/"
];

const originForRequest = (req) => {
  const forwardedHost = req.headers["x-forwarded-host"];
  const host = (Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost) || req.headers.host || "localhost:8787";
  const forwardedProto = req.headers["x-forwarded-proto"];
  const protocol =
    (Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto) ||
    (host.includes("localhost") ? "http" : "https");
  return `${protocol}://${host}`;
};

export const handleSitemap = (req, res) => {
  const origin = originForRequest(req).replace(/\/+$/, "");
  const updated = new Date().toISOString().slice(0, 10);
  const urls = publicPages
    .map(
      (page) => `  <url>
    <loc>${origin}${page}</loc>
    <lastmod>${updated}</lastmod>
  </url>`
    )
    .join("\n");

  res.writeHead(200, {
    "Content-Type": "application/xml; charset=utf-8",
    "Cache-Control": "public, max-age=3600"
  });
  res.end(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`);
};

export const handleRobots = (req, res) => {
  const origin = originForRequest(req).replace(/\/+$/, "");
  res.writeHead(200, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "public, max-age=3600"
  });
  res.end(`User-agent: *
Allow: /

Sitemap: ${origin}/sitemap.xml
`);
};

export const handleGoogleLogin = (res) => {
  redirect(res, buildGoogleLoginUrl({ res }));
};

export const handleGoogleLoginCallback = async (req, res, requestUrl) => {
  const oauthError = requestUrl.searchParams.get("error");
  if (oauthError) {
    redirect(res, `/?auth_error=${encodeURIComponent(oauthError)}`);
    return;
  }

  const code = requestUrl.searchParams.get("code");
  const state = requestUrl.searchParams.get("state");
  if (!code || !state) throw new Error("Google login callback is missing code or state.");

  try {
    await handleGoogleCallback({ req, code, state, res });
    redirect(res, "/");
  } catch (error) {
    redirect(res, `/?auth_error=${encodeURIComponent(error.message || "Google sign-in failed.")}`);
  }
};

export const handleLogout = (req, res) => {
  clearSessionCookie(res);
  if (req.method === "GET") redirect(res, "/");
  else sendJson(res, 200, { ok: true });
};
