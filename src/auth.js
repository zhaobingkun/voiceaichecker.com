import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import https from "node:https";

import { config } from "./config.js";
import { upsertUser } from "./supabase.js";

const sessionCookieName = "avd_session";
const stateCookieName = "avd_oauth_state";
const sessionMaxAgeSeconds = 30 * 24 * 60 * 60;
const stateMaxAgeSeconds = 10 * 60;

const requestJson = ({ method = "GET", url, headers = {}, body = null }) =>
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

const parseCookies = (req) => {
  const header = req.headers.cookie || "";
  const cookies = new Map();

  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1) continue;
    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (key) cookies.set(key, decodeURIComponent(value));
  }

  return cookies;
};

const signingSecret = () => {
  if (config.sessionSecret) return config.sessionSecret;
  if (config.googleClientSecret) return config.googleClientSecret;
  return "local-dev-session-secret";
};

const sign = (payload) => createHmac("sha256", signingSecret()).update(payload).digest("base64url");

const encodeSigned = (value) => {
  const payload = Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
  return `${payload}.${sign(payload)}`;
};

const decodeSigned = (cookieValue) => {
  if (!cookieValue || !cookieValue.includes(".")) return null;
  const [payload, signature] = cookieValue.split(".");
  const expected = sign(payload);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) {
    return null;
  }

  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
};

const cookieFlags = ({ maxAge, httpOnly = true }) => {
  const flags = [`Path=/`, `SameSite=Lax`, `Max-Age=${maxAge}`];
  if (httpOnly) flags.push("HttpOnly");
  if (config.appBaseUrl.startsWith("https://")) flags.push("Secure");
  return flags.join("; ");
};

const appendSetCookie = (res, cookie) => {
  const current = res.getHeader("Set-Cookie");
  if (!current) {
    res.setHeader("Set-Cookie", cookie);
    return;
  }
  res.setHeader("Set-Cookie", Array.isArray(current) ? [...current, cookie] : [current, cookie]);
};

export const clearSessionCookie = (res) => {
  appendSetCookie(res, `${sessionCookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
};

export const isGoogleAuthConfigured = () =>
  Boolean(config.googleClientId && config.googleClientSecret && config.appBaseUrl);

export const getCurrentUser = (req) => {
  const value = parseCookies(req).get(sessionCookieName);
  const session = decodeSigned(value);
  if (!session?.user || !session?.expiresAt || session.expiresAt <= Date.now()) return null;
  return session.user;
};

export const buildGoogleLoginUrl = ({ res }) => {
  if (!isGoogleAuthConfigured()) {
    throw new Error("Google login is not configured.");
  }

  const state = randomBytes(24).toString("hex");
  appendSetCookie(
    res,
    `${stateCookieName}=${encodeURIComponent(encodeSigned({ state, expiresAt: Date.now() + stateMaxAgeSeconds * 1000 }))}; ${cookieFlags({ maxAge: stateMaxAgeSeconds })}`
  );

  const loginUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  loginUrl.searchParams.set("client_id", config.googleClientId);
  loginUrl.searchParams.set("redirect_uri", `${config.appBaseUrl}/auth/google/callback`);
  loginUrl.searchParams.set("response_type", "code");
  loginUrl.searchParams.set("scope", "openid email profile");
  loginUrl.searchParams.set("state", state);
  loginUrl.searchParams.set("prompt", "select_account");

  return loginUrl.toString();
};

export const handleGoogleCallback = async ({ req, code, state, res }) => {
  const storedState = decodeSigned(parseCookies(req).get(stateCookieName));
  appendSetCookie(res, `${stateCookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);

  if (!storedState?.state) {
    throw new Error("Google login state cookie was not found. Start again from the Sign in with Google button.");
  }

  if (storedState.state !== state) {
    throw new Error("Google login state did not match. Start again from the Sign in with Google button.");
  }

  if (storedState.expiresAt <= Date.now()) {
    throw new Error("Google login state expired. Start again from the Sign in with Google button.");
  }

  const body = new URLSearchParams({
    code,
    client_id: config.googleClientId,
    client_secret: config.googleClientSecret,
    redirect_uri: `${config.appBaseUrl}/auth/google/callback`,
    grant_type: "authorization_code"
  }).toString();

  const tokenResponse = await requestJson({
    method: "POST",
    url: "https://oauth2.googleapis.com/token",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Content-Length": String(Buffer.byteLength(body))
    },
    body
  });

  if (!tokenResponse.ok) {
    throw new Error(tokenResponse.payload?.error_description || tokenResponse.payload?.error || "Google token exchange failed.");
  }

  const accessToken = tokenResponse.payload?.access_token;
  if (!accessToken) {
    throw new Error("Google did not return an access token.");
  }

  const userResponse = await requestJson({
    url: "https://www.googleapis.com/oauth2/v3/userinfo",
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  if (!userResponse.ok) {
    throw new Error(userResponse.payload?.error_description || userResponse.payload?.error || "Google profile request failed.");
  }

  const profile = userResponse.payload;
  const user = {
    id: String(profile.sub || ""),
    email: String(profile.email || ""),
    name: String(profile.name || profile.email || "Google user"),
    picture: String(profile.picture || "")
  };

  if (!user.id || !user.email) {
    throw new Error("Google profile is missing email information.");
  }

  await upsertUser(user);

  appendSetCookie(
    res,
    `${sessionCookieName}=${encodeURIComponent(
      encodeSigned({ user, expiresAt: Date.now() + sessionMaxAgeSeconds * 1000 })
    )}; ${cookieFlags({ maxAge: sessionMaxAgeSeconds })}`
  );
};
