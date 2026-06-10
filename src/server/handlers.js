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
import { classifyScore, confidenceForScore, detectVoice } from "../provider.js";
import { isSupabaseConfigured } from "../supabase.js";

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

const usageKeyForRequest = (req) => {
  const user = getCurrentUser(req);
  if (user) {
    return { user, key: `${todayKey()}:user:${user.id}`, limit: config.authenticatedDailyLimit };
  }

  const ip = getIp(req);
  return { user: null, key: `${todayKey()}:ip:${ip}`, limit: config.dailyIpLimit };
};

const remainingForKey = (key, limit) => Math.max(0, limit - (usage.get(key) || 0));

const useQuota = (key, limit) => {
  const used = usage.get(key) || 0;
  if (used >= limit) return false;
  usage.set(key, used + 1);
  return true;
};

export const handleDetect = async (req, res) => {
  const quota = usageKeyForRequest(req);
  if (!useQuota(quota.key, quota.limit)) {
    sendJson(res, 429, {
      error: quota.user
        ? "Daily signed-in limit reached. Try again tomorrow."
        : "Daily free limit reached. Sign in with Google for more free detections."
    });
    return;
  }

  const body = await readJsonBody(req);
  const audioBase64 = String(body.audioBase64 || "").replace(/^data:[^,]+,/, "");
  const filename = String(body.filename || "audio-upload").slice(0, 160);
  const mimeType = String(body.mimeType || "application/octet-stream").toLowerCase();
  const requestedSeconds = Math.trunc(Number(body.analyzeSeconds) || config.maxAnalyzeSeconds);
  const analyzeSeconds = Math.max(1, Math.min(config.maxAnalyzeSeconds, requestedSeconds));

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
  const cached = cache.get(cacheKey);

  if (cached) {
    sendJson(res, 200, {
      ...cached,
      cached: true,
      user: quota.user,
      remainingDailyDetections: remainingForKey(quota.key, quota.limit)
    });
    return;
  }

  const detection = await detectVoice({
    audioBuffer: trimmedAudio.buffer,
    filename: filename.replace(/\.[^.]+$/, "") + ".wav",
    mimeType: "audio/wav",
    analyzeSeconds,
    apiKey: config.modulateApiKey,
    apiUrl: config.modulateApiUrl
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

  cache.set(cacheKey, result);
  sendJson(res, 200, {
    ...result,
    user: quota.user,
    remainingDailyDetections: remainingForKey(quota.key, quota.limit)
  });
};

export const handleMe = (req, res) => {
  const quota = usageKeyForRequest(req);
  sendJson(res, 200, {
    authConfigured: isGoogleAuthConfigured(),
    user: quota.user,
    dailyLimit: quota.limit,
    remainingDailyDetections: remainingForKey(quota.key, quota.limit)
  });
};

export const handleHealth = (res) => {
  sendJson(res, 200, {
    ok: true,
    providerConfigured: Boolean(config.modulateApiKey && config.modulateApiUrl),
    authConfigured: isGoogleAuthConfigured(),
    supabaseConfigured: isSupabaseConfigured(),
    maxFileMb: config.maxFileMb,
    maxAnalyzeSeconds: config.maxAnalyzeSeconds,
    dailyIpLimit: config.dailyIpLimit,
    authenticatedDailyLimit: config.authenticatedDailyLimit
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
