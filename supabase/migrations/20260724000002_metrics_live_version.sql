-- Optimistic-concurrency guard for the tactics metrics LIVE row (HIGH-2,
-- WEB_KNOWN_ISSUES.md). The live metrics save rewrites the whole
-- (user, year, is_sent=false) row in one update, so a save from a stale
-- client silently overwrote every metric another device had written.
--
-- live_version is a monotonically increasing counter on the tactics_metrics
-- row itself (there is at most one live row per user + year, enforced by
-- one_live_metrics_per_year). Before rewriting, the client does a
-- compare-and-set:
--
--   UPDATE tactics_metrics
--      SET ..., live_version = <expected> + 1
--    WHERE id = <live row id> AND live_version = <expected>
--
-- Zero rows updated means another client saved since this one last read the
-- row; the client then refetches instead of overwriting. The first-ever save
-- for a year inserts with live_version = 1; a concurrent insert loses on the
-- one_live_metrics_per_year unique index (23505) and is treated as a
-- conflict. See writeMetricsRow in src/lib/tacticsMetricsStorage.js.
--
-- The sent snapshot (is_sent=true) is intentionally unguarded: it is only
-- written by an explicit Send to System press, where last-press-wins is the
-- desired semantic.

alter table public.tactics_metrics
  add column if not exists live_version integer not null default 0;
