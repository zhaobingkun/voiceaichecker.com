import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const loadDotEnv = () => {
  const envPath = path.join(process.cwd(), ".env");
  if (!existsSync(envPath)) return;

  const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;

    const key = trimmed.slice(0, separator).trim();
    const rawValue = trimmed.slice(separator + 1).trim();
    const value = rawValue.replace(/^["']|["']$/g, "");

    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
};

loadDotEnv();

const toNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const defaultModulateBatchUrl =
  "https://modulate-developer-apis.com/api/velma-2-synthetic-voice-detection-batch";

const normalizeApiUrl = (value) => {
  const raw = value || defaultModulateBatchUrl;
  if (raw.includes("modulate-developer-apis.com/api/")) {
    const parsed = new URL(raw.replace(/\/+$/, ""));
    parsed.hostname = "modulate-developer-apis.com";
    parsed.port = "";
    parsed.search = "";
    parsed.hash = "";
    parsed.pathname = parsed.pathname.replace(/\/+$/, "");
    if (parsed.pathname.endsWith("/velma-2-synthetic-voice-detection")) {
      parsed.pathname = `${parsed.pathname}-batch`;
    }
    return parsed.toString();
  }
  return raw;
};

const normalizeSupabaseUrl = (value) => {
  const raw = (value || "").replace(/\/+$/, "");
  if (!raw) return "";

  const parsed = new URL(raw);
  parsed.pathname = parsed.pathname.replace(/\/rest\/v1\/?$/, "");
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString().replace(/\/+$/, "");
};

export const config = {
  port: Math.trunc(toNumber(process.env.PORT, 8787)),
  appBaseUrl: (process.env.APP_BASE_URL || `http://localhost:${Math.trunc(toNumber(process.env.PORT, 8787))}`).replace(/\/+$/, ""),
  modulateApiKey: process.env.MODULATE_API_KEY || "",
  modulateApiUrl: normalizeApiUrl(process.env.MODULATE_API_URL),
  googleClientId: process.env.GOOGLE_CLIENT_ID || "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
  sessionSecret: process.env.SESSION_SECRET || "",
  supabaseUrl: normalizeSupabaseUrl(process.env.SUPABASE_URL),
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  maxFileMb: toNumber(process.env.MAX_FILE_MB, 10),
  maxAnalyzeSeconds: Math.trunc(toNumber(process.env.MAX_ANALYZE_SECONDS, 30)),
  dailyIpLimit: Math.trunc(toNumber(process.env.DAILY_IP_LIMIT, 3)),
  authenticatedDailyLimit: Math.trunc(toNumber(process.env.AUTH_DAILY_LIMIT, 10))
};

export const limits = {
  maxFileBytes: Math.trunc(config.maxFileMb * 1024 * 1024),
  maxJsonBodyBytes: Math.trunc(config.maxFileMb * 1024 * 1024 * 1.45 + 8192)
};
