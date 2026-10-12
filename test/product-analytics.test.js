import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readProjectFile = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("browser analytics covers the detection, login, pricing, and checkout funnel", async () => {
  const analytics = await readProjectFile("public/analytics.js");
  const detector = await readProjectFile("public/app.js");

  for (const eventName of [
    "pricing_view",
    "login_click",
    "login_success",
    "checkout_start",
    "checkout_success_return",
    "credit_checkout_start",
    "credit_checkout_return"
  ]) {
    assert.match(analytics, new RegExp(`\\b${eventName}\\b`), `missing ${eventName}`);
  }

  for (const eventName of [
    "audio_selected",
    "detect_start",
    "detect_success",
    "detect_failed",
    "credit_offer_view",
    "credit_offer_click"
  ]) {
    assert.match(detector, new RegExp(`\\b${eventName}\\b`), `missing ${eventName}`);
  }
});

test("server-side detection analytics schema is private and supports repeat-use reporting", async () => {
  const migration = await readProjectFile("supabase-detection-analytics.sql");

  assert.match(migration, /create table if not exists public\.detection_events/i);
  assert.match(migration, /create or replace view public\.detection_retention_30d/i);
  assert.match(migration, /create or replace view public\.detection_weekly_dashboard/i);
  assert.match(migration, /quota_source text/i);
  assert.match(migration, /pro_monthly/i);
  assert.match(migration, /alter table public\.detection_events enable row level security/i);
  assert.match(migration, /revoke all on table public\.detection_events from public, anon, authenticated/i);
  assert.doesNotMatch(migration, /^\s*(email|filename|file_name|raw_ip|google_id)\s+/im);
});

test("privacy policy explains pseudonymous product analytics and excluded fields", async () => {
  const privacy = await readProjectFile("public/privacy/index.html");

  assert.match(privacy, /pseudonymous detection event/i);
  assert.match(privacy, /one-way hashed visitor or account identifier/i);
  assert.match(privacy, /does not contain the audio, file name, email address, Google account ID, or\s+raw IP address/i);
  assert.match(privacy, /Google Analytics/i);
});
