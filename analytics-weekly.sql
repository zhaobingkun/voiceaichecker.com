-- Weekly product dashboard. Run after supabase-detection-analytics.sql.
select *
from public.detection_weekly_dashboard
order by week_start desc
limit 12;

-- Current rolling 30-day repeat-use snapshot.
select *
from public.detection_retention_30d;

-- Landing pages that produce successful detections.
select
  page_path,
  count(*) as successful_detections,
  count(distinct identity_hash) as unique_detection_users,
  round(avg(duration_ms), 0) as avg_duration_ms
from public.detection_events
where status = 'success'
  and event_date >= current_date - 29
group by page_path
order by successful_detections desc;

-- Recent failure categories for reliability monitoring.
select
  error_code,
  count(*) as failures
from public.detection_events
where status = 'failed'
  and event_date >= current_date - 29
group by error_code
order by failures desc;
