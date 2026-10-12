-- Base schema. After this file, run supabase-credits.sql and supabase-pro-monthly.sql.
create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  google_id text not null unique,
  email text not null,
  name text,
  picture text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_login_at timestamptz not null default now()
);

create index if not exists users_email_idx on public.users (email);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists users_set_updated_at on public.users;
create trigger users_set_updated_at
before update on public.users
for each row
execute function public.set_updated_at();

alter table public.users enable row level security;

drop policy if exists "No public user reads" on public.users;
create policy "No public user reads"
on public.users
for select
using (false);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  google_id text unique,
  email text,
  plan text not null default 'pro_monthly',
  status text not null default 'inactive',
  creem_customer_id text,
  creem_subscription_id text,
  creem_checkout_id text,
  creem_order_id text,
  creem_product_id text,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  raw_event_type text,
  last_event_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscriptions_identity_check check (google_id is not null or email is not null)
);

create index if not exists subscriptions_email_idx on public.subscriptions (email);
create index if not exists subscriptions_status_idx on public.subscriptions (status);

drop trigger if exists subscriptions_set_updated_at on public.subscriptions;
create trigger subscriptions_set_updated_at
before update on public.subscriptions
for each row
execute function public.set_updated_at();

alter table public.subscriptions enable row level security;

drop policy if exists "No public subscription reads" on public.subscriptions;
create policy "No public subscription reads"
on public.subscriptions
for select
using (false);

create table if not exists public.daily_detection_usage (
  usage_date date not null,
  identity_key text not null,
  used_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (usage_date, identity_key),
  constraint daily_detection_usage_count_check check (used_count >= 0)
);

create index if not exists daily_detection_usage_updated_at_idx
on public.daily_detection_usage (updated_at);

alter table public.daily_detection_usage enable row level security;

drop policy if exists "No public daily usage reads" on public.daily_detection_usage;
create policy "No public daily usage reads"
on public.daily_detection_usage
for select
using (false);

drop trigger if exists daily_detection_usage_set_updated_at on public.daily_detection_usage;
create trigger daily_detection_usage_set_updated_at
before update on public.daily_detection_usage
for each row
execute function public.set_updated_at();

create or replace function public.consume_detection_quota(
  p_usage_date date,
  p_identity_key text,
  p_limit integer
)
returns table (allowed boolean, used_count integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  next_count integer;
begin
  if p_limit <= 0 then
    return query select false, 0;
    return;
  end if;

  insert into public.daily_detection_usage (usage_date, identity_key)
  values (p_usage_date, p_identity_key)
  on conflict (usage_date, identity_key) do nothing;

  update public.daily_detection_usage as d
  set used_count = d.used_count + 1
  where d.usage_date = p_usage_date
    and d.identity_key = p_identity_key
    and d.used_count < p_limit
  returning d.used_count into next_count;

  if next_count is not null then
    return query select true, next_count;
  end if;

  return query
  select false, d.used_count
  from public.daily_detection_usage d
  where d.usage_date = p_usage_date
    and d.identity_key = p_identity_key;
end;
$$;

create or replace function public.get_detection_quota(
  p_usage_date date,
  p_identity_key text,
  p_limit integer
)
returns table (used_count integer, remaining_count integer)
language sql
security definer
set search_path = public
as $$
  select
    coalesce(d.used_count, 0),
    greatest(0, p_limit - coalesce(d.used_count, 0))
  from (select 1) as placeholder
  left join public.daily_detection_usage d
    on d.usage_date = p_usage_date
   and d.identity_key = p_identity_key;
$$;

revoke all on function public.consume_detection_quota(date, text, integer) from public;
revoke all on function public.get_detection_quota(date, text, integer) from public;
grant execute on function public.consume_detection_quota(date, text, integer) to service_role;
grant execute on function public.get_detection_quota(date, text, integer) to service_role;

-- Product analytics for detection conversion and repeat-use measurement.
-- No audio, filename, email, Google ID, or raw IP address is stored here.
create table if not exists public.detection_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique,
  event_date date not null default ((now() at time zone 'utc')::date),
  occurred_at timestamptz not null default now(),
  identity_hash text not null,
  identity_type text not null,
  plan text not null,
  status text not null,
  provider text,
  cached boolean not null default false,
  result_label text,
  analyze_seconds integer,
  duration_ms integer,
  error_code text,
  input_source text,
  page_path text,
  quota_source text,
  constraint detection_events_identity_hash_check check (identity_hash ~ '^[a-f0-9]{64}$'),
  constraint detection_events_identity_type_check check (identity_type in ('anonymous', 'authenticated')),
  constraint detection_events_plan_check check (plan in ('anonymous', 'free_account', 'pro')),
  constraint detection_events_status_check check (status in ('success', 'failed', 'quota_rejected')),
  constraint detection_events_seconds_check check (analyze_seconds is null or analyze_seconds between 1 and 120),
  constraint detection_events_duration_check check (duration_ms is null or duration_ms >= 0),
  constraint detection_events_input_source_check check (input_source is null or input_source in ('upload', 'record', 'unknown')),
  constraint detection_events_quota_source_check check (quota_source is null or quota_source in ('daily_free', 'pro_monthly', 'credit'))
);

create index if not exists detection_events_event_date_status_idx
on public.detection_events (event_date desc, status);

create index if not exists detection_events_identity_date_idx
on public.detection_events (identity_hash, event_date desc);

create index if not exists detection_events_page_path_idx
on public.detection_events (page_path, event_date desc);

alter table public.detection_events enable row level security;

drop policy if exists "No public detection event reads" on public.detection_events;
create policy "No public detection event reads"
on public.detection_events
for select
using (false);

drop policy if exists "No public detection event writes" on public.detection_events;
create policy "No public detection event writes"
on public.detection_events
for all
using (false)
with check (false);

create or replace view public.detection_analytics_daily as
select
  event_date,
  count(*) as detection_attempts,
  count(*) filter (where status = 'success') as successful_detections,
  count(*) filter (where status = 'failed') as failed_detections,
  count(*) filter (where status = 'quota_rejected') as quota_rejections,
  count(distinct identity_hash) filter (where status = 'success') as unique_detection_users,
  count(distinct identity_hash) filter (where status = 'success' and identity_type = 'authenticated') as authenticated_users,
  count(distinct identity_hash) filter (where status = 'success' and identity_type = 'anonymous') as anonymous_users,
  round(
    100.0 * count(*) filter (where status = 'success') / nullif(count(*), 0),
    2
  ) as success_rate_percent,
  round(avg(duration_ms) filter (where status = 'success'), 0) as avg_success_duration_ms,
  coalesce(sum(analyze_seconds) filter (where status = 'success'), 0) as analyzed_seconds
from public.detection_events
group by event_date;

create or replace view public.detection_retention_30d as
with per_identity as (
  select
    identity_hash,
    min(event_date) as first_active_date,
    max(event_date) as last_active_date,
    count(distinct event_date) as active_days,
    count(*) as successful_detections
  from public.detection_events
  where status = 'success'
    and event_date >= current_date - 29
  group by identity_hash
)
select
  count(*) as detection_users,
  count(*) filter (where active_days >= 2) as repeat_users,
  round(
    100.0 * count(*) filter (where active_days >= 2) / nullif(count(*), 0),
    2
  ) as repeat_user_rate_percent,
  round(avg(active_days), 2) as avg_active_days,
  coalesce(sum(successful_detections), 0) as successful_detections
from per_identity;

create or replace view public.detection_weekly_dashboard as
with event_weeks as (
  select
    date_trunc('week', event_date)::date as week_start,
    status,
    identity_hash,
    identity_type,
    duration_ms,
    analyze_seconds
  from public.detection_events
),
weekly_totals as (
  select
    week_start,
    count(*) as detection_attempts,
    count(*) filter (where status = 'success') as successful_detections,
    count(*) filter (where status = 'failed') as failed_detections,
    count(*) filter (where status = 'quota_rejected') as quota_rejections,
    round(
      100.0 * count(*) filter (where status = 'success') / nullif(count(*), 0),
      2
    ) as success_rate_percent,
    round(avg(duration_ms) filter (where status = 'success'), 0) as avg_success_duration_ms,
    coalesce(sum(analyze_seconds) filter (where status = 'success'), 0) as analyzed_seconds
  from event_weeks
  group by week_start
),
successful_days as (
  select distinct identity_hash, identity_type, event_date
  from public.detection_events
  where status = 'success'
),
first_success as (
  select identity_hash, min(event_date) as first_success_date
  from successful_days
  group by identity_hash
),
weekly_users as (
  select
    date_trunc('week', successful_days.event_date)::date as week_start,
    successful_days.identity_hash,
    max(successful_days.identity_type) as identity_type,
    count(distinct successful_days.event_date) as active_days,
    min(first_success.first_success_date) as first_success_date
  from successful_days
  join first_success using (identity_hash)
  group by date_trunc('week', successful_days.event_date)::date, successful_days.identity_hash
),
weekly_user_totals as (
  select
    week_start,
    count(*) as unique_detection_users,
    count(*) filter (where identity_type = 'authenticated') as authenticated_users,
    count(*) filter (where identity_type = 'anonymous') as anonymous_users,
    count(*) filter (where first_success_date < week_start) as returning_users,
    count(*) filter (where active_days >= 2) as multi_day_users,
    round(
      100.0 * count(*) filter (where first_success_date < week_start) / nullif(count(*), 0),
      2
    ) as returning_user_rate_percent
  from weekly_users
  group by week_start
)
select
  weekly_totals.week_start,
  weekly_totals.detection_attempts,
  weekly_totals.successful_detections,
  weekly_totals.failed_detections,
  weekly_totals.quota_rejections,
  weekly_totals.success_rate_percent,
  coalesce(weekly_user_totals.unique_detection_users, 0) as unique_detection_users,
  coalesce(weekly_user_totals.returning_users, 0) as returning_users,
  coalesce(weekly_user_totals.returning_user_rate_percent, 0) as returning_user_rate_percent,
  coalesce(weekly_user_totals.multi_day_users, 0) as multi_day_users,
  coalesce(weekly_user_totals.authenticated_users, 0) as authenticated_users,
  coalesce(weekly_user_totals.anonymous_users, 0) as anonymous_users,
  weekly_totals.avg_success_duration_ms,
  weekly_totals.analyzed_seconds
from weekly_totals
left join weekly_user_totals using (week_start);

revoke all on table public.detection_events from public, anon, authenticated;
revoke all on public.detection_analytics_daily from public, anon, authenticated;
revoke all on public.detection_retention_30d from public, anon, authenticated;
revoke all on public.detection_weekly_dashboard from public, anon, authenticated;

grant all on table public.detection_events to service_role;
grant select on public.detection_analytics_daily to service_role;
grant select on public.detection_retention_30d to service_role;
grant select on public.detection_weekly_dashboard to service_role;
