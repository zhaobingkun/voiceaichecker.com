-- One-time detection credits. Run this migration before deploying the credit-pack code.
create table if not exists public.credit_balances (
  google_id text primary key,
  email text,
  balance integer not null default 0,
  lifetime_purchased integer not null default 0,
  lifetime_used integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint credit_balances_balance_check check (balance >= 0),
  constraint credit_balances_purchased_check check (lifetime_purchased >= 0),
  constraint credit_balances_used_check check (lifetime_used >= 0)
);

create table if not exists public.credit_transactions (
  id uuid primary key default gen_random_uuid(),
  google_id text not null,
  amount integer not null,
  transaction_type text not null,
  request_key text not null unique,
  creem_order_id text,
  creem_checkout_id text,
  creem_product_id text,
  created_at timestamptz not null default now(),
  constraint credit_transactions_amount_check check (amount <> 0),
  constraint credit_transactions_type_check check (transaction_type in ('purchase', 'usage', 'refund', 'adjustment'))
);

create index if not exists credit_transactions_google_id_created_at_idx
on public.credit_transactions (google_id, created_at desc);

drop trigger if exists credit_balances_set_updated_at on public.credit_balances;
create trigger credit_balances_set_updated_at
before update on public.credit_balances
for each row
execute function public.set_updated_at();

alter table public.credit_balances enable row level security;
alter table public.credit_transactions enable row level security;

drop policy if exists "No public credit balance access" on public.credit_balances;
create policy "No public credit balance access"
on public.credit_balances
for all
using (false)
with check (false);

drop policy if exists "No public credit transaction access" on public.credit_transactions;
create policy "No public credit transaction access"
on public.credit_transactions
for all
using (false)
with check (false);

create or replace function public.grant_detection_credits(
  p_google_id text,
  p_email text,
  p_amount integer,
  p_request_key text,
  p_order_id text default null,
  p_checkout_id text default null,
  p_product_id text default null
)
returns table (granted boolean, balance integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_count integer;
  new_balance integer;
begin
  if coalesce(p_google_id, '') = '' or coalesce(p_request_key, '') = '' or p_amount <= 0 then
    raise exception 'Invalid credit grant';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_request_key));

  insert into public.credit_transactions (
    google_id, amount, transaction_type, request_key,
    creem_order_id, creem_checkout_id, creem_product_id
  )
  values (
    p_google_id, p_amount, 'purchase', p_request_key,
    p_order_id, p_checkout_id, p_product_id
  )
  on conflict (request_key) do nothing;

  get diagnostics inserted_count = row_count;
  if inserted_count = 0 then
    select b.balance into new_balance
    from public.credit_balances b
    where b.google_id = p_google_id;
    return query select false, coalesce(new_balance, 0);
    return;
  end if;

  insert into public.credit_balances (google_id, email, balance, lifetime_purchased)
  values (p_google_id, p_email, p_amount, p_amount)
  on conflict (google_id) do update
  set email = coalesce(excluded.email, public.credit_balances.email),
      balance = public.credit_balances.balance + excluded.balance,
      lifetime_purchased = public.credit_balances.lifetime_purchased + excluded.lifetime_purchased
  returning public.credit_balances.balance into new_balance;

  return query select true, new_balance;
end;
$$;

create or replace function public.consume_detection_credit(
  p_google_id text,
  p_request_key text
)
returns table (allowed boolean, balance integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  new_balance integer;
begin
  if coalesce(p_google_id, '') = '' or coalesce(p_request_key, '') = '' then
    return query select false, 0;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtext(p_request_key));

  if exists (
    select 1 from public.credit_transactions t
    where t.request_key = p_request_key
      and t.google_id = p_google_id
      and t.transaction_type = 'usage'
  ) then
    select b.balance into new_balance
    from public.credit_balances b
    where b.google_id = p_google_id;
    return query select true, coalesce(new_balance, 0);
    return;
  end if;

  update public.credit_balances as b
  set balance = b.balance - 1,
      lifetime_used = b.lifetime_used + 1
  where b.google_id = p_google_id
    and b.balance > 0
  returning b.balance into new_balance;

  if new_balance is null then
    return query select false, 0;
    return;
  end if;

  insert into public.credit_transactions (google_id, amount, transaction_type, request_key)
  values (p_google_id, -1, 'usage', p_request_key);

  return query select true, new_balance;
end;
$$;

create or replace function public.refund_detection_credit(
  p_google_id text,
  p_usage_request_key text
)
returns table (refunded boolean, balance integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  refund_key text := 'refund:' || p_usage_request_key;
  new_balance integer;
begin
  if coalesce(p_google_id, '') = '' or coalesce(p_usage_request_key, '') = '' then
    return query select false, 0;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtext(refund_key));

  if exists (select 1 from public.credit_transactions t where t.request_key = refund_key) then
    select b.balance into new_balance from public.credit_balances b where b.google_id = p_google_id;
    return query select false, coalesce(new_balance, 0);
    return;
  end if;

  if not exists (
    select 1 from public.credit_transactions t
    where t.request_key = p_usage_request_key
      and t.google_id = p_google_id
      and t.transaction_type = 'usage'
  ) then
    select b.balance into new_balance from public.credit_balances b where b.google_id = p_google_id;
    return query select false, coalesce(new_balance, 0);
    return;
  end if;

  update public.credit_balances as b
  set balance = b.balance + 1,
      lifetime_used = greatest(0, b.lifetime_used - 1)
  where b.google_id = p_google_id
  returning b.balance into new_balance;

  insert into public.credit_transactions (google_id, amount, transaction_type, request_key)
  values (p_google_id, 1, 'refund', refund_key);

  return query select true, coalesce(new_balance, 0);
end;
$$;

revoke all on table public.credit_balances from public, anon, authenticated;
revoke all on table public.credit_transactions from public, anon, authenticated;
grant all on table public.credit_balances to service_role;
grant all on table public.credit_transactions to service_role;

revoke all on function public.grant_detection_credits(text, text, integer, text, text, text, text) from public;
revoke all on function public.consume_detection_credit(text, text) from public;
revoke all on function public.refund_detection_credit(text, text) from public;
grant execute on function public.grant_detection_credits(text, text, integer, text, text, text, text) to service_role;
grant execute on function public.consume_detection_credit(text, text) to service_role;
grant execute on function public.refund_detection_credit(text, text) to service_role;

alter table public.detection_events
add column if not exists quota_source text;

alter table public.detection_events
drop constraint if exists detection_events_quota_source_check;

alter table public.detection_events
add constraint detection_events_quota_source_check
check (quota_source is null or quota_source in ('daily_free', 'pro_monthly', 'credit'));
