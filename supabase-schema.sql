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

  update public.daily_detection_usage
  set used_count = used_count + 1
  where usage_date = p_usage_date
    and identity_key = p_identity_key
    and used_count < p_limit
  returning daily_detection_usage.used_count into next_count;

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
