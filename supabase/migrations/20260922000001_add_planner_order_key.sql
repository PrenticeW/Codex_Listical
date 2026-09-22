-- Stable per-row ordering for the System page (2026-09-22 cross-device
-- reorder fix). display_order was renumbered 0..N by every client on every
-- save, so any stale or differently-derived client rewrote the whole
-- ordering (258-row and 435-row rewrites observed 2026-09-21/22).
--
-- order_key is a base-62 fractional key (see src/utils/planner/orderKey.js):
-- lexicographic order = row order, assigned once per row and rewritten only
-- when that row is moved or inserted. display_order remains as a read-only
-- legacy fallback for clients that predate this migration; new clients never
-- update it on existing rows.
--
-- Applied to the live DB 2026-09-22 alongside the web deploy.

ALTER TABLE planner_rows ADD COLUMN IF NOT EXISTS order_key text;

-- Backfill: rank rows per (user, year) by the current display_order and give
-- row rank n the key base62(n, 6 chars) || 'V' — identical to backfillKey()
-- in src/utils/planner/orderKey.js (the 'V' suffix keeps keys from ending in
-- '0', so a midpoint below any key always exists). Equal length => keys sort
-- exactly like the ranks.
WITH cs AS (
  SELECT '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz' AS d
), ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY user_id, year_id
           ORDER BY display_order, created_at, id
         ) AS rn
  FROM planner_rows
)
UPDATE planner_rows p
SET order_key =
      substr(cs.d, ((r.rn / 916132832) % 62)::int + 1, 1)
   || substr(cs.d, ((r.rn / 14776336)  % 62)::int + 1, 1)
   || substr(cs.d, ((r.rn / 238328)    % 62)::int + 1, 1)
   || substr(cs.d, ((r.rn / 3844)      % 62)::int + 1, 1)
   || substr(cs.d, ((r.rn / 62)        % 62)::int + 1, 1)
   || substr(cs.d, ( r.rn              % 62)::int + 1, 1)
   || 'V'
FROM ranked r, cs
WHERE p.id = r.id AND p.order_key IS NULL;

-- Keys compare by BYTE order (JS string comparison). The default database
-- collation (ICU dictionary order) would sort them differently, so pin the
-- column to COLLATE "C" — any SQL ORDER BY order_key then matches the app.
ALTER TABLE planner_rows ALTER COLUMN order_key TYPE text COLLATE "C";
