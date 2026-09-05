-- Run this once in Supabase SQL Editor for the existing production database.
-- The table and function already exist; this replaces only the broken function body.

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
