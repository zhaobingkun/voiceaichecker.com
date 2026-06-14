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
