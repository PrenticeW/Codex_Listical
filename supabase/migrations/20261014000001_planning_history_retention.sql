-- Retention for planning_history (2026-10-14). Already applied to
-- production by hand via the SQL editor (pg_cron job id 1); this file
-- records the definition so it is versioned with the schema.
--
-- Policy:
--   * keep the last 30 days in full
--   * 31-90 days: thin to one snapshot per row per day (keep the day's last)
--   * delete everything older than 90 days
-- Runs nightly via pg_cron at 03:15 UTC.
--
-- Context (docs/known-issues.md): the 49 MB / 22k-row growth to Oct 2026 was
-- the archive-header order_key re-key loop (fixed 2026-10-12) multiplied by
-- AES-GCM re-encryption minting new ciphertext for unchanged fields on every
-- upsert (fixed 2026-10-14, ciphertext reuse in storage.js). The history
-- trigger's no-op guard only works with ciphertext reuse in place.

create extension if not exists pg_cron;

create or replace function public.prune_planning_history()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.planning_history
  where changed_at < now() - interval '90 days';

  delete from public.planning_history ph
  using (
    select id,
           row_number() over (
             partition by row_id, changed_at::date
             order by changed_at desc
           ) as rn
    from public.planning_history
    where changed_at < now() - interval '30 days'
  ) dup
  where ph.id = dup.id and dup.rn > 1;
$$;

revoke all on function public.prune_planning_history() from public, anon, authenticated;

-- Idempotent schedule: unschedule any existing job of the same name first.
do $do$
begin
  perform cron.unschedule('prune-planning-history')
  where exists (select 1 from cron.job where jobname = 'prune-planning-history');
end
$do$;

select cron.schedule(
  'prune-planning-history',
  '15 3 * * *',
  $$select public.prune_planning_history()$$
);
