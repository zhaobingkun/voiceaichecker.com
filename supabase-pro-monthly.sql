-- Pro monthly allowance. Run after supabase-schema.sql and before deploying Pro monthly quota code.
create table if not exists public.pro_monthly_usage (
  period_start date not null,
  google_id text not null,
  used_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (period_start, google_id),
  constraint pro_monthly_usage_count_check check (used_count >= 0)
);

create table if not exists public.pro_monthly_transactions (
  id uuid primary key default gen_random_uuid(),
  period_start date not null,
  google_id text not null,
  amount integer not null,
  transaction_type text not null,
  request_key text not null unique,
  created_at timestamptz not null default now(),
  constraint pro_monthly_transactions_amount_check check (amount in (-1, 1)),
  constraint pro_monthly_transactions_type_check check (transaction_type in ('usage', 'refund'))
);

create index if not exists pro_monthly_transactions_account_period_idx
on public.pro_monthly_transactions (google_id, period_start, created_at desc);

drop trigger if exists pro_monthly_usage_set_updated_at on public.pro_monthly_usage;
create trigger pro_monthly_usage_set_updated_at
before update on public.pro_monthly_usage
for each row
execute function public.set_updated_at();

alter table public.pro_monthly_usage enable row level security;
alter table public.pro_monthly_transactions enable row level security;

drop policy if exists "No public Pro monthly usage access" on public.pro_monthly_usage;
create policy "No public Pro monthly usage access"
on public.pro_monthly_usage
for all
using (false)
with check (false);

drop policy if exists "No public Pro monthly transaction access" on public.pro_monthly_transactions;
create policy "No public Pro monthly transaction access"
on public.pro_monthly_transactions
for all
using (false)
with check (false);

create or replace function public.get_pro_monthly_quota(
  p_period_start date,
  p_google_id text,
  p_limit integer
)
returns table (used_count integer, remaining_count integer)
language sql
security definer
set search_path = public
as $$
  select
    coalesce(u.used_count, 0),
    greatest(0, p_limit - coalesce(u.used_count, 0))
  from (select 1) as placeholder
  left join public.pro_monthly_usage u
    on u.period_start = p_period_start
   and u.google_id = p_google_id;
$$;

create or replace function public.consume_pro_monthly_quota(
  p_period_start date,
  p_google_id text,
  p_limit integer,
  p_request_key text
)
returns table (allowed boolean, used_count integer, remaining_count integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  next_count integer;
begin
  if coalesce(p_google_id, '') = '' or coalesce(p_request_key, '') = '' or p_limit <= 0 then
    return query select false, 0, 0;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtext(p_request_key));

  if exists (
    select 1 from public.pro_monthly_transactions t
    where t.request_key = p_request_key
      and t.google_id = p_google_id
      and t.period_start = p_period_start
      and t.transaction_type = 'usage'
  ) then
    select u.used_count into next_count
    from public.pro_monthly_usage u
    where u.period_start = p_period_start and u.google_id = p_google_id;
    return query select true, coalesce(next_count, 0), greatest(0, p_limit - coalesce(next_count, 0));
    return;
  end if;

  insert into public.pro_monthly_usage (period_start, google_id)
  values (p_period_start, p_google_id)
  on conflict (period_start, google_id) do nothing;

  update public.pro_monthly_usage as u
  set used_count = u.used_count + 1
  where u.period_start = p_period_start
    and u.google_id = p_google_id
    and u.used_count < p_limit
  returning u.used_count into next_count;

  if next_count is null then
    select u.used_count into next_count
    from public.pro_monthly_usage u
    where u.period_start = p_period_start and u.google_id = p_google_id;
    return query select false, coalesce(next_count, 0), greatest(0, p_limit - coalesce(next_count, 0));
    return;
  end if;

  insert into public.pro_monthly_transactions (
    period_start, google_id, amount, transaction_type, request_key
  )
  values (p_period_start, p_google_id, -1, 'usage', p_request_key);

  return query select true, next_count, greatest(0, p_limit - next_count);
end;
$$;

create or replace function public.refund_pro_monthly_quota(
  p_period_start date,
  p_google_id text,
  p_limit integer,
  p_usage_request_key text
)
returns table (refunded boolean, used_count integer, remaining_count integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  refund_key text := 'refund:' || p_usage_request_key;
  next_count integer;
begin
  if coalesce(p_google_id, '') = '' or coalesce(p_usage_request_key, '') = '' or p_limit <= 0 then
    return query select false, 0, 0;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtext(refund_key));

  if exists (select 1 from public.pro_monthly_transactions t where t.request_key = refund_key) then
    select u.used_count into next_count
    from public.pro_monthly_usage u
    where u.period_start = p_period_start and u.google_id = p_google_id;
    return query select false, coalesce(next_count, 0), greatest(0, p_limit - coalesce(next_count, 0));
    return;
  end if;

  if not exists (
    select 1 from public.pro_monthly_transactions t
    where t.request_key = p_usage_request_key
      and t.google_id = p_google_id
      and t.period_start = p_period_start
      and t.transaction_type = 'usage'
  ) then
    select u.used_count into next_count
    from public.pro_monthly_usage u
    where u.period_start = p_period_start and u.google_id = p_google_id;
    return query select false, coalesce(next_count, 0), greatest(0, p_limit - coalesce(next_count, 0));
    return;
  end if;

  update public.pro_monthly_usage as u
  set used_count = greatest(0, u.used_count - 1)
  where u.period_start = p_period_start
    and u.google_id = p_google_id
  returning u.used_count into next_count;

  insert into public.pro_monthly_transactions (
    period_start, google_id, amount, transaction_type, request_key
  )
  values (p_period_start, p_google_id, 1, 'refund', refund_key);

  return query select true, coalesce(next_count, 0), greatest(0, p_limit - coalesce(next_count, 0));
end;
$$;

revoke all on table public.pro_monthly_usage from public, anon, authenticated;
revoke all on table public.pro_monthly_transactions from public, anon, authenticated;
grant all on table public.pro_monthly_usage to service_role;
grant all on table public.pro_monthly_transactions to service_role;

revoke all on function public.get_pro_monthly_quota(date, text, integer) from public;
revoke all on function public.consume_pro_monthly_quota(date, text, integer, text) from public;
revoke all on function public.refund_pro_monthly_quota(date, text, integer, text) from public;
grant execute on function public.get_pro_monthly_quota(date, text, integer) to service_role;
grant execute on function public.consume_pro_monthly_quota(date, text, integer, text) to service_role;
grant execute on function public.refund_pro_monthly_quota(date, text, integer, text) to service_role;

alter table public.detection_events
drop constraint if exists detection_events_quota_source_check;

alter table public.detection_events
add constraint detection_events_quota_source_check
check (quota_source is null or quota_source in ('daily_free', 'pro_monthly', 'credit'));
