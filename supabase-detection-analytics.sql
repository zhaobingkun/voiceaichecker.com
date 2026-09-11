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
  constraint detection_events_identity_hash_check check (identity_hash ~ '^[a-f0-9]{64}$'),
  constraint detection_events_identity_type_check check (identity_type in ('anonymous', 'authenticated')),
  constraint detection_events_plan_check check (plan in ('anonymous', 'free_account', 'pro')),
  constraint detection_events_status_check check (status in ('success', 'failed', 'quota_rejected')),
  constraint detection_events_seconds_check check (analyze_seconds is null or analyze_seconds between 1 and 120),
  constraint detection_events_duration_check check (duration_ms is null or duration_ms >= 0),
  constraint detection_events_input_source_check check (input_source is null or input_source in ('upload', 'record', 'unknown'))
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

