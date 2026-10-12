import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("credit migration keeps balances private and uses idempotent atomic RPCs", async () => {
  const sql = await readFile(new URL("../supabase-credits.sql", import.meta.url), "utf8");

  assert.match(sql, /create table if not exists public\.credit_balances/i);
  assert.match(sql, /create table if not exists public\.credit_transactions/i);
  assert.match(sql, /request_key text not null unique/i);
  assert.match(sql, /create or replace function public\.grant_detection_credits/i);
  assert.match(sql, /create or replace function public\.consume_detection_credit/i);
  assert.match(sql, /create or replace function public\.refund_detection_credit/i);
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /grant execute on function public\.consume_detection_credit\(text, text\) to service_role/i);
});

test("credit pack configuration documents the intended offer", async () => {
  const env = await readFile(new URL("../.env.example", import.meta.url), "utf8");
  const pricing = await readFile(new URL("../public/pricing/index.html", import.meta.url), "utf8");

  assert.match(env, /DAILY_IP_LIMIT=1/);
  assert.match(env, /AUTH_DAILY_LIMIT=3/);
  assert.match(env, /PRO_MONTHLY_LIMIT=50/);
  assert.match(env, /CREDIT_PACK_CHECKS=20/);
  assert.match(env, /CREDIT_PACK_PRICE_USD=4\.99/);
  assert.match(pricing, /form action="\/api\/credits\/checkout"/i);
  assert.match(pricing, /\$4\.99 once/i);
  assert.match(pricing, /50 additional successful checks per UTC calendar month/i);
  assert.match(pricing, /form action="\/api\/checkout"/i);
});

test("Pro monthly migration uses private idempotent consume and refund RPCs", async () => {
  const sql = await readFile(new URL("../supabase-pro-monthly.sql", import.meta.url), "utf8");

  assert.match(sql, /create table if not exists public\.pro_monthly_usage/i);
  assert.match(sql, /create table if not exists public\.pro_monthly_transactions/i);
  assert.match(sql, /request_key text not null unique/i);
  assert.match(sql, /create or replace function public\.get_pro_monthly_quota/i);
  assert.match(sql, /create or replace function public\.consume_pro_monthly_quota/i);
  assert.match(sql, /create or replace function public\.refund_pro_monthly_quota/i);
  assert.match(sql, /'pro_monthly'/i);
  assert.match(sql, /grant execute on function public\.consume_pro_monthly_quota\(date, text, integer, text\) to service_role/i);
});

test("paid allowances preserve free, Pro, then permanent-credit ordering", async () => {
  const handlers = await readFile(new URL("../src/server/handlers.js", import.meta.url), "utf8");
  const dailyReserve = handlers.indexOf("quotaState = await reserveQuota(quota)");
  const proReserve = handlers.indexOf("proMonthlyState = await consumeProMonthlyQuota");
  const creditReserve = handlers.indexOf("creditState = await consumeDetectionCredit");

  assert.ok(dailyReserve >= 0);
  assert.ok(proReserve > dailyReserve);
  assert.ok(creditReserve > proReserve);
  assert.match(handlers, /if \(proMonthlyReserved\)[\s\S]*refundProMonthlyQuota/);
  assert.match(handlers, /if \(creditReserved\)[\s\S]*refundDetectionCredit/);
});
