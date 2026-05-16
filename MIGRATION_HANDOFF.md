# Supabase Migration Handoff

**Author:** Claude (session ending 2026-05-16, late afternoon, after the chip-rendering debugging marathon)
**For:** Whoever picks this up next (likely a fresh Claude session)
**Read first:** `SUPABASE_MIGRATION_PLAN.md`, `STORAGE_AUDIT.md`, `CLAUDE.md`, and the previous handoff content in git history at `MIGRATION_HANDOFF.md` pre this overwrite if you want the original step-by-step.

## Where we are

Steps 1 through 4 of the migration plan remain complete and verified working. Step 5 (storage helper rewrites) still has helpers 4 and 5 pending. We did NOT advance the helper count this session. What we did do was unstick two real bugs that were blocking the Plan→System pipeline. Prentice burned hours on these; both are now closed.

| Helper | Status |
|---|---|
| `yearMetadataStorage` | Ported, verified working |
| `stagingStorage` | Ported, verified working |
| `tacticsMetricsStorage` | Ported, **previous "open bugs" were resolved this session** (see below) |
| `tacticsStorage` | Not started, still localStorage. **Read the schema recommendation below before porting.** |
| `plannerStorage` | Not started, still localStorage |

## What was fixed in this session

### Fix 1: race between async loads in System

**Symptom.** On page mount or navigation to System, project headers eventually rendered with their quotas but no subproject or task rows appeared. Send to System looked like it was doing nothing.

**Root cause.** Two `useEffect`s in `src/pages/ProjectTimePlannerV2.jsx` race on first mount:

1. The project-header insertion effect (line 846) fires when `projects` (from `useProjectsData → loadStagingState`) resolves.
2. The chip-sync effect (line 1026 area, see current source for exact location) fires when `tacticsChips` (from `loadEnrichedChips`) resolves.

Pre-migration both were sync, so order didn't matter. Post-migration the chip path can resolve first, run, find zero project headers in `prevData` (because the staging load hasn't completed), and silently skip every chip via the `projectHeaderIndex === -1` guard inside `newChips.forEach`. The chip-sync effect then never re-fires because `tacticsChips` doesn't change.

**Fix.** Added `projects` to the chip-sync effect's dep array so it re-runs when staging finishes loading. The setData callback then sees the now-present project headers and inserts subproject + task rows correctly. Comment in the source flags the change with `Debugging session 2026-05-16`.

### Fix 2: stale `durationMinutes` masking Plan resizes

**Symptom.** Even with chip rows finally appearing in System, the durations shown were always the original chip duration at creation time, never the user's resized value. Quota numbers on the project header were sometimes correct, sometimes not. Changes on Plan never propagated.

**Root cause.** Plan's chip-resize handler updates `chip.startRowId` and `chip.endRowId` on the chip object, but does NOT update `chip.durationMinutes`. Plan's UI displays the correct duration because it recomputes from row spans at render time. But the persisted chip blob carries the stale original number. System used to read `durationMinutes` directly, so it always showed the wrong value.

**Fix.** Changed `loadEnrichedChips` in `src/pages/ProjectTimePlannerV2.jsx` to recompute duration from row IDs as the primary source, with `chipTimeOverrides` winning when explicitly set and the stored `durationMinutes` only used as a last-resort fallback. System projects (sleep, rest, buffer) are filtered out earlier so row-based math is safe.

**Note.** This is a System-side workaround. The underlying Plan-side bug still lives in the resize handler. The right permanent fix is the schema decision below, taken at helper #4 port time. Until then, the workaround keeps the app working.

## Critical design decision for helper #4: drop `duration_minutes` from `tactics_chips`

When porting `tacticsStorage` to Supabase, **do not include a `duration_minutes` column on `tactics_chips`**. Duration should be a pure derivation from `start_row_id` + `end_row_id` + the year's `increment_minutes`. Persisting both invites the exact stale-field bug we just spent hours debugging.

Reasoning:

* Plan's chip-resize logic updates row IDs reliably. It does not update `duration_minutes`. Six months of debugging suggests this is unlikely to change without a deliberate engineering push.
* `loadEnrichedChips` already derives duration from row IDs successfully (our Fix 2).
* If `duration_minutes` exists in the schema, future code paths will read from it again, the stale-field bug will return, and you'll be back here.
* The only legitimate "stored duration" case is the explicit user override, which already has its own home in `chip_time_overrides` (currently a JSONB field on the chip blob; in Supabase it can be a separate `tactics_chip_time_overrides` table or a JSONB column on `tactics_chips`, either is fine).

Recommended `tactics_chips` schema (rough sketch, refine when you read the existing migration draft):

```sql
CREATE TABLE tactics_chips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  year_id UUID NOT NULL REFERENCES years(id) ON DELETE CASCADE,
  is_sent BOOLEAN NOT NULL DEFAULT false,
  chip_id_external TEXT NOT NULL,        -- the existing 'chip-19' / 'schedule-chip-...' strings
  project_id_external TEXT NOT NULL,     -- references staging projects.id as text (chip blobs use text)
  column_index SMALLINT NOT NULL,
  day_name TEXT NOT NULL,
  start_row_id TEXT NOT NULL,
  end_row_id TEXT NOT NULL,
  start_minutes INTEGER,                 -- optional, only some chips have it (schedule-chip-* + chip-20)
  display_label TEXT,
  has_schedule_name BOOLEAN DEFAULT false,
  override_minutes INTEGER,              -- chip_time_overrides moved inline; null when not overridden
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  -- NO duration_minutes column. Derive at read time.
);
```

Indexes and RLS follow the same pattern as `tactics_metrics`. Partial unique indexes on `(user_id, year_id, chip_id_external) WHERE is_sent = false` and same with `is_sent = true` so live and sent rows can coexist.

When System reads, it should do the same row-based calculation we wrote in `loadEnrichedChips`:

```
duration_minutes = override_minutes ?? deriveFromRowIds(start_row_id, end_row_id, year_increment_minutes)
```

Apply this consistently. The Plan page will need a parallel update: wherever it currently reads `chip.durationMinutes` for display, recompute from row IDs the same way. That removes the divergence between Plan and System once and for all.

## What's safe to assume

* Helpers 1, 2, 3 work. Prentice has been using them end-to-end this session.
* The chip data and the task row data are still in localStorage (tacticsStorage and plannerStorage are not yet ported). Only `years`, `projects`, and `tactics_metrics` come from Supabase.
* The race-condition fix and row-recompute fix are in `src/pages/ProjectTimePlannerV2.jsx` and pushed to Vercel. The current build hash at session end was `index-BNQeUE1s.js`.
* Prentice has minimal precious data and is fine with fresh-start losses during testing.
* He deploys via Vercel (push to git, Vercel rebuilds). He runs SQL via the Supabase dashboard.

## What to do next

1. **Port helper #4: `tacticsStorage`** using the schema recommendation above. Apply the new SQL migration to Supabase. Rewrite the helper's internals to use Supabase while keeping the public API (`loadTacticsChipsState`, `saveTacticsChipsState`, `loadSentChipsSnapshot`, `saveSentChipsSnapshot`, `loadTacticsYearSettings`, `saveTacticsYearSettings`, `loadTacticsColumnWidths`, `saveTacticsColumnWidths`, send-to-system timestamp helpers) intact. Same pattern as helpers 1 to 3: async public API, await every callsite, debounce autosave at the owning hook. Column widths go into `tactics_year_settings` and the send-to-system timestamp moves to `planner_settings.send_to_system_at` per the original handoff.

2. **Update Plan-side duration reads** so Plan derives chip durations from row IDs the same way System does. Right now Plan computes its display correctly somewhere internally, but you want a single shared helper used by both pages so the formula can never drift. Pull the existing `estimateDurationFromRowIds` out of `ProjectTimePlannerV2.jsx` into a shared util (`src/utils/chips/duration.js` or similar) and import it from both Plan and System.

3. **Port helper #5: `plannerStorage`** following the same pattern. Task rows into `planner_rows` with `day_entries` JSONB; per-year settings into `planner_settings`; archive rows into `archived_weeks`. Calendar header rows are derived at render time, not persisted.

4. **Step 6: async-aware sweep.** Audit every caller of every helper one more time for `await` correctness, loading states, and any other race conditions analogous to the one we just fixed. The pattern to watch for: a `useEffect` that reads cross-cutting state (project headers, chip data, task rows) needs to depend on ALL the async sources that could populate that state, not just the one it primarily reacts to.

5. **Step 7: end-to-end testing.** Full flow as documented in the previous handoff.

6. **Step 8: history table triggers + cleanup job.** See `VERSION_HISTORY_PLAN.md`.

7. **Step 9: deploy + remove dev controls.**

## Open items (not blocking, worth noting)

* **Plan-side chip resize doesn't update `durationMinutes` on the chip object.** Worked around in System via row-based recompute. Properly resolved by the schema change in step 1 above. If you can't port helper #4 right away for some reason, fix the resize handler in Plan as a tactical patch.
* **"of 1.18" Bug A from the previous handoff** should be closed now. The metrics path was always writing correct in-memory chip totals to Supabase. The "1.18 not 1.30" came from chip duration computation that's now fixed for project chips (the same fix in the metrics calc on Plan would also affect this). If Prentice sees a 1.18 again, hard-refresh and re-Send overwrites with the right value.
* **Bug B from the previous handoff** ("task rows don't update consistently after Send") is closed. The `freshChips` closure fix the previous Claude wrote was correct. The remaining issues were the two we fixed in this session.
* **Greyed-out chips on Plan during initial mount.** Same race-condition shape, lower priority because it self-resolves a second later. Worth a single useEffect dep fix similar to Fix 1 above when you next touch that area. Not blocking the migration.

## Code conventions reminder

* Storage helpers return `Promise<T>` and preserve their public API name and signature.
* Autosaves debounce at 500ms in the hook that owns the state.
* `useStorageSync` accepts an `initialValue` option and handles both sync and async `loadData`.
* The window event name for each helper fires on save, with `__eventYear` on `CustomEvent.detail`.
* `requireUserId()` and `findYearId(userId, yearNumber)` are the standard internal patterns. `findYearId` uses `.maybeSingle()` so it will THROW if two `years` rows ever share a `year_number` for the same user. The draft year flow already protects this invariant; don't break it during the port.

## Bug avoidance for the next session

* **When introducing an async load, check every effect that reads the resulting state for sibling-load dependencies.** This is exactly the race we just fixed. The chip-sync effect ran before staging completed, found nothing, and never re-ran. Treat every effect that walks the data structure as a candidate for adding more deps post-port.
* **Don't trust persisted "computed" fields after a UI gesture.** If Plan's resize updates row IDs but not `durationMinutes`, the persisted `durationMinutes` is a lie. Either keep one source of truth in storage (row IDs) and derive everything else, or make the UI gesture update every persisted field that depends on it. The schema recommendation above picks the first option for chip durations.
* **Round-trip your converters with concrete numbers.** The previous Claude noted this; we hit a variation of it again. `minutesToHmm` and `hmmToMinutes` round-trip cleanly now, but the chip duration path goes through a separate `estimateDurationFromRowIds` that you should also walk through with concrete row IDs (e.g., trailing-3 to trailing-10 = 8 rows = 240 min at 30min increments).
* **The Plan page emits times as numbers `1.3 = 1h30m` (decimal part is `minutes/100`), NOT as decimal hours.** Still trips everyone up. `STORAGE_AUDIT.md` documents it.

## Files modified in this session

* `src/pages/ProjectTimePlannerV2.jsx`
  * Added `projects` to chip-sync effect deps (race fix). Inline comment marks the change.
  * Rewrote duration resolution in `loadEnrichedChips` to prefer row-based recompute over stored `chip.durationMinutes` for project chips. Inline comment marks the change.
  * Temporary debug logs were added and then removed in the same session. None remain in the file.

No schema changes were made this session. No other helper files were touched.

## Test plan to verify current state before starting helper #4

1. Hard-refresh System. Project headers appear with their quotas after a brief moment.
2. After project headers appear, subproject and task rows for each chip appear underneath.
3. Resize a chip on Plan. Press Send to System. Navigate to System. The subproject header label, task row Estimate, and task row TimeValue all match the resized duration on Plan.
4. The quota ("of X.XX") on the project header matches the sum of chip durations for that project.
5. Repeat steps 3 to 4 with a second resize. Values should update both times.

If all five pass, you're cleared to start helper #4.
