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

export const isSupabaseConfigured = () =>
  Boolean(config.supabaseUrl && config.supabaseServiceRoleKey);

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
