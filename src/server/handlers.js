import { createHash, createHmac, randomUUID } from "node:crypto";

import {
  buildGoogleLoginUrl,
  clearSessionCookie,
  getCurrentUser,
  handleGoogleCallback,
  isGoogleAuthConfigured
} from "../auth.js";
import { trimWavBuffer } from "../audio.js";
import { config, limits } from "../config.js";
import {
  createCreditsCheckout,
  createProCheckout,
  isCreemConfigured,
  isCreditsCheckoutConfigured,
  verifyCreemWebhookSignature
} from "../creem.js";
import { classifyScore, confidenceForScore, detectVoice } from "../provider.js";
import {
  consumeDetectionQuota,
  consumeDetectionCredit,
  consumeProMonthlyQuota,
  getUserCreditBalance,
  getDetectionQuota,
  getProMonthlyQuota,
  getUserSubscription,
  grantDetectionCredits,
  isSupabaseConfigured,
  recordDetectionEvent,
  refundDetectionCredit,
  refundProMonthlyQuota,
  upsertSubscription
} from "../supabase.js";

const cache = globalThis.__avdCache || new Map();
const usage = globalThis.__avdUsage || new Map();
globalThis.__avdCache = cache;
globalThis.__avdUsage = usage;

const allowedAudioTypes = new Set(["audio/wav", "audio/x-wav", "application/octet-stream"]);

const todayKey = () => new Date().toISOString().slice(0, 10);
const monthStartKey = () => `${new Date().toISOString().slice(0, 7)}-01`;

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
      analyticsIdentity: `user:${user.id}`,
      key: `${todayKey()}:user:${user.id}:free`,
      limit: config.authenticatedDailyLimit
    };
  }

  const ip = getIp(req);
  return {
    user: null,
    subscription: null,
    isPro: false,
    analyticsIdentity: `ip:${ip}`,
    key: `${todayKey()}:ip:${ip}`,
    limit: config.dailyIpLimit
  };
};

const analyticsIdentityHash = (quota) =>
  createHmac(
    "sha256",
    config.sessionSecret || config.googleClientSecret || "local-dev-analytics-secret"
  )
    .update(quota.analyticsIdentity)
    .digest("hex");

const analyticsPlan = (quota) => (quota.isPro ? "pro" : quota.user ? "free_account" : "anonymous");

const safeInputSource = (value) => (value === "record" || value === "upload" ? value : "unknown");

const safePagePath = (value) => {
  const path = String(value || "").slice(0, 160);
  return /^\/[a-z0-9/_-]*$/i.test(path) ? path : null;
};

const detectionErrorCode = (error) => {
  const message = String(error?.message || "").toLowerCase();
  if (message.includes("missing audio") || message.includes("empty")) return "missing_audio";
  if (message.includes("wav") || message.includes("audio file")) return "invalid_audio";
  if (message.includes("too large")) return "payload_too_large";
  if (message.includes("timed out")) return "provider_timeout";
  if (error?.statusCode === 503) return "provider_unavailable";
  if (error?.statusCode === 502) return "provider_error";
  return "request_error";
};

const writeDetectionEvent = async ({ quota, requestId, startedAt, ...details }) => {
  try {
    await recordDetectionEvent({
      requestId,
      identityHash: analyticsIdentityHash(quota),
      identityType: quota.user ? "authenticated" : "anonymous",
      plan: analyticsPlan(quota),
      durationMs: Math.max(0, Date.now() - startedAt),
      ...details
    });
  } catch (error) {
    console.error("Detection analytics write failed", {
      requestId,
      message: error.message
    });
  }
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
  const requestId = randomUUID();
  const startedAt = Date.now();
  const quota = await usageKeyForRequest(req);
  let quotaState;
  let creditReserved = false;
  let proMonthlyReserved = false;
  let creditBalance;
  let remainingProMonthlyDetections;
  let quotaSource = "daily_free";
  const proPeriodStart = monthStartKey();

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

  if (!quotaState.allowed && !quota.user) {
    await writeDetectionEvent({
      quota,
      requestId,
      startedAt,
      status: "quota_rejected",
      errorCode: "daily_limit",
      quotaSource: "daily_free"
    });
    sendJson(res, 429, {
      error: "Daily free limit reached. Sign in with Google for 3 free daily detections and optional credit packs."
    });
    return;
  }

  let analyticsDetails = {};

  try {
    const body = await readJsonBody(req);
    const audioBase64 = String(body.audioBase64 || "").replace(/^data:[^,]+,/, "");
    const filename = String(body.filename || "audio-upload").slice(0, 160);
    const mimeType = String(body.mimeType || "application/octet-stream").toLowerCase();
    const maxAnalyzeSeconds = quota.user
      ? config.maxAnalyzeSeconds
      : Math.min(config.maxAnalyzeSeconds, config.anonymousMaxAnalyzeSeconds);
    const requestedSeconds = Math.trunc(Number(body.analyzeSeconds) || maxAnalyzeSeconds);
    const analyzeSeconds = Math.max(1, Math.min(maxAnalyzeSeconds, requestedSeconds));
    analyticsDetails = {
      analyzeSeconds,
      inputSource: safeInputSource(body.inputSource),
      pagePath: safePagePath(body.pagePath)
    };

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

    if (!quotaState.allowed && quota.isPro) {
      quotaSource = "pro_monthly";
      let proMonthlyState;
      try {
        proMonthlyState = await consumeProMonthlyQuota({
          periodStart: proPeriodStart,
          googleId: quota.user.id,
          limit: config.proMonthlyLimit,
          requestId
        });
      } catch (error) {
        console.error("Pro monthly quota service failed", { requestId, message: error.message });
        sendJson(res, 503, { error: "Pro monthly allowance is temporarily unavailable. Please try again shortly." });
        return;
      }

      remainingProMonthlyDetections = proMonthlyState.remainingCount;
      proMonthlyReserved = proMonthlyState.allowed;
    }

    if (!quotaState.allowed && !proMonthlyReserved) {
      quotaSource = "credit";
      let creditState;
      try {
        creditState = await consumeDetectionCredit({
          googleId: quota.user.id,
          requestId
        });
      } catch (error) {
        console.error("Detection credit service failed", { requestId, message: error.message });
        sendJson(res, 503, { error: "Credit balance is temporarily unavailable. Please try again shortly." });
        return;
      }

      if (!creditState.allowed) {
        await writeDetectionEvent({
          quota,
          requestId,
          startedAt,
          ...analyticsDetails,
          status: "quota_rejected",
          errorCode: quota.isPro ? "all_allowances_exhausted" : "daily_limit_and_no_credits",
          quotaSource
        });
        sendJson(res, 429, {
          error: quota.isPro
            ? "Your daily free checks and 50 Pro checks for this month are used. Buy 20 extra checks for $4.99 or wait for the next reset."
            : "Your 3 free checks for today are used. Buy 20 extra checks for $4.99 or try again tomorrow.",
          creditBalance: creditState.balance,
          remainingProMonthlyDetections: quota.isPro ? 0 : undefined,
          canBuyCredits: isCreditsCheckoutConfigured(),
          pricingUrl: "/pricing/#credit-pack"
        });
        return;
      }

      creditReserved = true;
      creditBalance = creditState.balance;
    }

    analyticsDetails.quotaSource = quotaSource;

    const fileHash = createHash("sha256").update(trimmedAudio.buffer).digest("hex");
    const cacheKey = `${fileHash}:${analyzeSeconds}`;
    const cached = getCachedDetection(cacheKey);

    if (cached) {
      await writeDetectionEvent({
        quota,
        requestId,
        startedAt,
        ...analyticsDetails,
        status: "success",
        provider: cached.provider,
        cached: true,
        resultLabel: cached.label
      });
      sendJson(res, 200, {
        ...cached,
        cached: true,
        user: quota.user,
        subscription: quota.subscription,
        isPro: quota.isPro,
        remainingDailyDetections: remainingForQuota({ usedCount: quotaState.usedCount, limit: quota.limit }),
        remainingProMonthlyDetections,
        creditBalance,
        quotaSource
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
    await writeDetectionEvent({
      quota,
      requestId,
      startedAt,
      ...analyticsDetails,
      status: "success",
      provider: detection.provider,
      cached: false,
      resultLabel: result.label
    });
    sendJson(res, 200, {
      ...result,
      user: quota.user,
      subscription: quota.subscription,
      isPro: quota.isPro,
      remainingDailyDetections: remainingForQuota({ usedCount: quotaState.usedCount, limit: quota.limit }),
      remainingProMonthlyDetections,
      creditBalance,
      quotaSource
    });
  } catch (error) {
    if (proMonthlyReserved) {
      try {
        const refund = await refundProMonthlyQuota({
          periodStart: proPeriodStart,
          googleId: quota.user.id,
          limit: config.proMonthlyLimit,
          requestId
        });
        remainingProMonthlyDetections = refund.remainingCount;
      } catch (refundError) {
        console.error("Pro monthly quota refund failed", {
          requestId,
          googleId: quota.user.id,
          message: refundError.message
        });
      }
    }
    if (creditReserved) {
      try {
        const refund = await refundDetectionCredit({ googleId: quota.user.id, requestId });
        creditBalance = refund.balance;
      } catch (refundError) {
        console.error("Detection credit refund failed", {
          requestId,
          googleId: quota.user.id,
          message: refundError.message
        });
      }
    }
    await writeDetectionEvent({
      quota,
      requestId,
      startedAt,
      ...analyticsDetails,
      status: "failed",
      errorCode: detectionErrorCode(error),
      quotaSource
    });
    throw error;
  }
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
  const eventType = String(event?.eventType || event?.type || event?.event_type || event?.event || "");
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

export const creditPurchaseFromCreemEvent = (event) => {
  const data = event?.object || event?.data?.object || event?.data || event || {};
  const order = data.order || data.order_details || {};
  const customer = data.customer || data.customer_details || order.customer || {};
  const metadata = findMetadata(event);
  const eventType = String(event?.eventType || event?.type || event?.event_type || event?.event || "").toLowerCase();
  const productId = objectId(
    firstValue(data.product_id, data.product, order.product_id, order.product, data.product_details)
  );
  const orderId = objectId(firstValue(data.order_id, data.order, order.id));
  const checkoutId = objectId(firstValue(data.checkout_id, data.checkout, order.checkout_id));
  const eventId = objectId(firstValue(event?.id, data.id));
  const status = String(firstValue(data.status, order.status, data.payment_status)).toLowerCase();
  const marksCreditPack =
    metadata.purchase_type === "credit_pack" ||
    metadata.plan === "credit_pack" ||
    (config.creemCreditsProductId && productId === config.creemCreditsProductId);
  const isPaidCompletion =
    /(checkout\.completed|payment\.succeeded|order\.paid)/.test(eventType) || /^(paid|completed|succeeded)$/.test(status);

  if (!marksCreditPack || !isPaidCompletion) return null;
  if (!config.creemCreditsProductId || productId !== config.creemCreditsProductId) return null;

  const purchaseKey = orderId || checkoutId || eventId;
  if (!purchaseKey) return null;

  return {
    googleId: firstValue(metadata.google_user_id, metadata.googleUserId, metadata.user_id, metadata.userId),
    email: firstValue(metadata.email, data.customer_email, data.email, customer.email),
    amount: config.creditPackChecks,
    requestId: `credit_purchase:${purchaseKey}`,
    orderId,
    checkoutId,
    productId,
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

export const handleCreditsCheckout = async (req, res) => {
  const user = getCurrentUser(req);
  if (!user) {
    redirect(res, "/auth/google?next=/pricing/#credit-pack");
    return;
  }

  const checkout = await createCreditsCheckout({ user });
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

  const creditPurchase = creditPurchaseFromCreemEvent(event);
  if (creditPurchase) {
    const grantResult = await grantDetectionCredits(creditPurchase);
    if (!grantResult.ok) {
      sendJson(res, 503, {
        error: "Credit purchase was not persisted",
        reason: grantResult.reason || (grantResult.skipped ? "storage_not_configured" : "unknown")
      });
      return;
    }

    console.log("Creem credit purchase received", {
      type: creditPurchase.rawEventType || "unknown",
      orderId: creditPurchase.orderId || "unknown",
      granted: grantResult.granted,
      balance: grantResult.balance
    });
    sendJson(res, 200, { ok: true });
    return;
  }

  const eventMetadata = findMetadata(event);
  if (eventMetadata.purchase_type === "credit_pack" || eventMetadata.plan === "credit_pack") {
    const eventType = String(event?.eventType || event?.type || event?.event_type || event?.event || "").toLowerCase();
    if (/(checkout\.completed|payment\.succeeded|order\.paid)/.test(eventType)) {
      sendJson(res, 503, { error: "Credit purchase product could not be verified" });
      return;
    }
    sendJson(res, 200, { ok: true, ignored: true });
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
    type: event.eventType || event.type || event.event_type || event.event || "unknown",
    id: event.id || event.object?.id || event.data?.id || "unknown",
    subscriptionUpdated: true
  });

  sendJson(res, 200, { ok: true });
};

export const handleMe = async (req, res) => {
  const quota = await usageKeyForRequest(req);
  const proPeriodStart = monthStartKey();
  let quotaState;
  let creditBalance = 0;
  let proMonthlyState = { usedCount: 0, remainingCount: 0 };

  try {
    [quotaState, creditBalance, proMonthlyState] = await Promise.all([
      readQuota(quota),
      quota.user ? getUserCreditBalance(quota.user) : Promise.resolve(0),
      quota.isPro
        ? getProMonthlyQuota({
            periodStart: proPeriodStart,
            googleId: quota.user.id,
            limit: config.proMonthlyLimit
          })
        : Promise.resolve({ usedCount: 0, remainingCount: 0 })
    ]);
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
    proMonthlyLimit: config.proMonthlyLimit,
    remainingProMonthlyDetections: proMonthlyState.remainingCount,
    proMonthlyPeriodStart: quota.isPro ? proPeriodStart : null,
    creditBalance,
    creditPackChecks: config.creditPackChecks,
    creditPackPriceUsd: config.creditPackPriceUsd,
    creditsCheckoutConfigured: isCreditsCheckoutConfigured(),
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
    creditsCheckoutConfigured: isCreditsCheckoutConfigured(),
    creditPackChecks: config.creditPackChecks,
    creditPackPriceUsd: config.creditPackPriceUsd,
    maxFileMb: config.maxFileMb,
    maxAnalyzeSeconds: config.maxAnalyzeSeconds,
    anonymousMaxAnalyzeSeconds: config.anonymousMaxAnalyzeSeconds,
    modulateRequestTimeoutMs: config.modulateRequestTimeoutMs,
    dailyIpLimit: config.dailyIpLimit,
    authenticatedDailyLimit: config.authenticatedDailyLimit,
    proMonthlyLimit: config.proMonthlyLimit
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
  "/how-to-detect-ai-voice/",
  "/signs-of-ai-generated-voice/",
  "/how-to-detect-cloned-voice/",
  "/ai-voice-detection-accuracy/",
  "/ai-voice-detection-privacy/",
  "/ai-voice-scam-calls/",
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
    redirect(res, "/?login=success");
  } catch (error) {
    redirect(res, `/?auth_error=${encodeURIComponent(error.message || "Google sign-in failed.")}`);
  }
};

export const handleLogout = (req, res) => {
  clearSessionCookie(res);
  if (req.method === "GET") redirect(res, "/");
  else sendJson(res, 200, { ok: true });
};
