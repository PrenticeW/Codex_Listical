-- Optimistic-concurrency guard for the tactics chips LIVE layer (HIGH-2,
-- WEB_KNOWN_ISSUES.md). The live chip save is replace-the-layer (delete every
-- chip at the (user, year, is_sent=false) slice, then reinsert), so a save
-- from a stale client silently erased everything another device had added.
--
-- chips_live_version is a monotonically increasing counter on the existing
-- tactics_year_settings row (one per user_id + year_id). Before rewriting the
-- layer, the client does a compare-and-set:
--
--   UPDATE tactics_year_settings
--      SET chips_live_version = <expected> + 1
--    WHERE user_id = ... AND year_id = ... AND chips_live_version = <expected>
--
-- Zero rows updated means another client saved since this one last read the
-- layer; the client then refetches instead of overwriting. See
-- writeChipsLayerInner in src/lib/tacticsStorage.js.
--
-- The sent layer (is_sent=true) is intentionally unguarded: it is only
-- written by an explicit Send to System press, where last-press-wins is the
-- desired semantic.

alter table public.tactics_year_settings
  add column if not exists chips_live_version integer not null default 0;
