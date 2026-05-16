# Supabase Migration Handoff

**Author:** Claude (session ending 2026-05-16, evening, after helper #4 port and async-aware callsite sweep across all six callers)
**For:** Whoever picks this up next (likely a fresh Claude session for helper #5)
**Read first:** `SUPABASE_MIGRATION_PLAN.md`, `STORAGE_AUDIT.md`, `CLAUDE.md`. Git history holds prior handoff iterations if you want the long view.

## Where we are

Steps 1 through 4 of the migration plan are still complete. Step 5 (storage helper rewrites) advanced one helper this session: **helper #4 (tacticsStorage) is now fully ported and verified working end-to-end**. Helper #5 (plannerStorage) is the only remaining helper.

| Helper | Status |
|---|---|
| `yearMetadataStorage` | Ported, verified working |
| `stagingStorage` | Ported, verified working |
| `tacticsMetricsStorage` | Ported, verified working |
| `tacticsStorage` | **Ported and verified working as of 2026-05-16 evening.** All four sub-domains (chips state, year settings, column widths, send-to-system timestamp) flow through Supabase. The 5-step test plan from the previous handoff passes. |
| `plannerStorage` | Not started, still localStorage. **Read the helper #5 design notes below before porting.** |

## What was done this session

### 1. Schema revision applied

Migration `supabase/migrations/20260516000003_drop_chip_duration_minutes.sql` was added and run against the dev Supabase project. Two changes to `tactics_chips`:

* Dropped `duration_minutes` (intrinsic). Duration is now a pure derivation from `start_row_id + end_row_id + the year's increment_minutes`, computed at read time. This forecloses the stale-field bug class from the previous session.
* Renamed `duration_override_minutes` to `override_minutes` (the explicit user override; wins over the derived value when set).

The composite `UNIQUE (user_id, year_id, chip_id, is_sent)` constraint on the table was kept rather than swapped for partial unique indexes. Functionally equivalent for this table, simpler to reason about.

### 2. Helper #4 internals rewritten

`src/lib/tacticsStorage.js` is now Supabase-backed throughout. Every public export's name and argument signature is unchanged; all 11 public functions now return `Promise<T>`. The internal mapping:

| Public function | Supabase home |
|---|---|
| `loadTacticsYearSettings` / `saveTacticsYearSettings` | `tactics_year_settings` (eight settings columns) |
| `loadTacticsColumnWidths` / `saveTacticsColumnWidths` | `tactics_year_settings.column_widths` (same row, partial update) |
| `loadTacticsChipsState` / `saveTacticsChipsState` | `tactics_chips` + `tactics_custom_projects` with `is_sent = FALSE` |
| `loadSentChipsSnapshot` / `saveSentChipsSnapshot` | Same tables with `is_sent = TRUE` |
| `getSendToSystemTimestamp` / `setSendToSystemTimestamp` / `clearSendToSystemTimestamp` | `planner_settings.send_to_system_at` |

The legacy localStorage cleanup (the one-shot wipe of `tactics-page-settings` on module load) is gone — no localStorage to clean now.

Chip save uses "delete-the-layer then bulk-insert" per `is_sent` slice. Two round-trips per save (parallel delete + parallel insert). Debounced at the call site at 500ms.

`saveTacticsYearSettings` and `saveTacticsColumnWidths` each only touch their own columns on the shared `tactics_year_settings` row via partial updates, so they don't clobber each other.

Send-to-system timestamp format changed from epoch-ms string to ISO timestamp string. Callers use identity equality (`ts !== last`) and truthiness (`!!ts`), both of which work fine with ISO strings.

### 3. All six caller files converted to async-aware

Files updated, in order:

1. `src/utils/planner/createDraftYear.js` — added `await` to 7 calls inside the existing async flow. Trivial.
2. `src/utils/planner/undoDraftYear.js` — added `await` to `clearSendToSystemTimestamp`. Updated the surrounding comment because the localStorage sweep no longer catches the marker.
3. `src/hooks/planner/useTacticsChips.js` — added `await` to the two `loadX` calls inside the already-async `loadChips` and `extractChips` callbacks.
4. `src/pages/StagingPageV2.jsx` — three callsites. `handleArchiveAndCleanup` became async (callers don't await; fire-and-forget is fine). The two callsites inside the command pattern's `execute`/`undo` block use an async IIFE inside `execute` (so the sync command interface stays intact) and `.catch()` fire-and-forget in `undo`.
5. `src/pages/TacticsPage.jsx` — the big one. The synchronous `useMemo` + 8 `useState` lazy initializers for year settings were replaced with default-value `useState` calls plus a consolidated async load effect. Three chip-related `useState` lazy initializers (`projectChips`, `customProjects`, `chipTimeOverrides`) and the `columnWidths` initializer all became defaults. One unified async load effect now does `Promise.all` over staging + settings + column widths + chip state on first mount AND every year change. The old "skip first mount" branch on the year-change effect is gone (first mount and year change now do identical loads). `handleSendToSystem` was extended to await the chip + sent-snapshot + timestamp writes inside the same `Promise.all` as the metrics writes.
6. `src/pages/ProjectTimePlannerV2.jsx` — four callsites. The `useState(() => !!getSendToSystemTimestamp(currentYear))` lazy init became `useState(false)` plus an async load effect with cancelled-flag cleanup. The two `getSendToSystemTimestamp` calls inside other effects became async-then chains with `.catch` for error logging. `loadEnrichedChips` now uses `Promise.all` for its three async dependencies.

### 4. Gate-pattern bug fix

`TacticsPage` had a latent bug in its `chipsLoadedForYear` ref pattern that was harmless pre-port but actively destructive post-port: the ref initialised to `currentYear` instead of `null`, which meant the first save effect run wrote default state to DB before the async load could complete. Changed to `null` initialisation. Two new sibling refs (`settingsLoadedForYear`, `columnWidthsLoadedForYear`) were added with the same `null` init for the year-settings and column-widths autosaves.

### 5. Gate-pattern bug fix #2 (column resize regression)

After the first round of TacticsPage changes, column resizing on day-of-week columns stopped persisting. Root cause: the gate clears only when a state change re-triggers the save effect after the async load. For column widths, the load was `if (Array.isArray(widths) && widths.length > 0) { setColumnWidths(widths); }`. When Supabase had no saved widths (first run after the port), `setColumnWidths` was never called, no re-render happened, the save effect never fired, and the gate stayed armed forever. First user resize hit the still-armed gate, skipped the write, re-armed.

Fix: explicitly set all three loaded-gate refs to `currentYear` at the end of the async load block. Costs one redundant write of just-loaded data per autosave effect on first mount, but guarantees the gates are always open by the time the user can interact. Verified working in local dev.

## What's safe to assume

* Helpers 1, 2, 3, 4 all work. The 5-step Plan → System test plan from the previous handoff passes cleanly.
* Chip state, custom projects, year settings, column widths, and the send-to-system timestamp all round-trip Supabase correctly.
* Task row data (the System page's planner_rows equivalent) is still in localStorage — that's helper #5.
* Pre-port chips saved in localStorage did NOT migrate to Supabase. Prentice's existing chips appeared "wiped" on first Plan-page load post-port; new chips placed now save and persist correctly. He's fine with that fresh-start loss.
* Build state at session end: latest changes are in the working tree but NOT yet deployed to Vercel. Push when ready.

## What to do next

### 1. Port helper #5: `plannerStorage`

Largest single helper, with 13 read/save function pairs plus the archive-week table. Spread across `src/utils/planner/storage.js` and `src/constants/plannerStorageKeys.js`. Public API surface (all should keep their names and signatures, just become async):

```
readTaskRows / saveTaskRows
readColumnSizing / saveColumnSizing
readSizeScale / saveSizeScale
readStartDate / saveStartDate
readShowRecurring / saveShowRecurring
readShowSubprojects / saveShowSubprojects
readShowMaxMinRows / saveShowMaxMinRows
readSortStatuses / saveSortStatuses
readSortPlannerStatuses / saveSortPlannerStatuses
readTotalDays / saveTotalDays
readVisibleDayColumns / saveVisibleDayColumns
readCollapsedGroups / saveCollapsedGroups
```

Plus archive snapshots, which today are stored as `archive-week-*` rows inside `task-rows`. Schema-wise these split into a dedicated `archived_weeks` table (already exists in `20260516000001_planning_schema.sql`).

**Schema is already in place.** `planner_rows`, `archived_weeks`, and `planner_settings` are all created with RLS. Read sections 5, 6, and 11 of `supabase/migrations/20260516000001_planning_schema.sql` to refresh on shape. The only thing I touched on `planner_settings` in helper #4 was `send_to_system_at`; the rest is helper #5's domain. No new schema migration should be needed unless you find a column missing during port.

**Watch out for:**

* The seven calendar header rows that currently live as the first seven entries of `task-rows` are not persisted in the new schema. They're derived at render time from `years.start_date`, `years.total_days`, and `tactics_metrics.daily_bounds`. The current `createInitialData` produces them. The Supabase port must compute and prepend them on read in the helper or in the consuming hook.
* `archive-week-*` rows mixed into `task-rows` today must split out to `archived_weeks` on save.
* Boolean settings (`showRecurring`, `showSubprojects`, `showMaxMinRows`) are stored as `'true'`/`'false'` strings in localStorage today. The schema's boolean columns will coerce naturally; just make sure the helper converts at the boundary.
* `task.project` and `task.subproject` are nickname-based join keys today. STORAGE_AUDIT.md flags this as fragile. The schema uses `project_id` UUID. Port will need a translation layer when reading legacy nickname-only chip references.
* `tactics-column-widths-{N}` was the only key bypassing the storage module pattern. After helper #4 it's been folded into `tactics_year_settings.column_widths`. Helper #5's `column-sizing` (different key, different module) is still its own thing; it maps to `planner_settings.column_sizing`.

Same pattern as helpers 1-4: async public API preserving names and signatures, debounce autosave at the owning hook, `__eventYear` on the one event this module fires (`planner-start-date-update`), `requireUserId()` + `findYearId()` internal helpers.

### 2. Apply the gate-pattern lesson from this session

When you replace a sync useState lazy init with a default + async load effect, also add a "skip first save" gate on the corresponding autosave effect, AND explicitly open the gate at the end of the async load. Without the explicit open, an autosave gated by "skip first save" can stay armed forever if the loaded value happens to equal the default (React's setState bail-out short-circuits the re-render, the save effect doesn't fire, the gate never clears, and the first real user change is silently swallowed).

Pattern, abbreviated:

```js
const xLoadedForYear = useRef(null);

useEffect(() => {
  if (xLoadedForYear.current == null) {
    xLoadedForYear.current = currentYear;
    return;
  }
  saveX(x, currentYear);
}, [x, currentYear]);

// inside the load effect's async block, after all setX calls:
xLoadedForYear.current = currentYear;
```

This trades one redundant first-load write for guaranteed correctness on subsequent user changes.

### 3. Step 6: async-aware sweep

The migration plan's step 6 now has a new item flagged as a real regression Prentice hit: **in-memory cache layer in each ported helper** so navigating between Goal, Plan, and System pages renders saved data instantly rather than blanking out for ~300ms-1s on every navigation while the Supabase round-trip completes. Module-level `Map<yearNumber, payload>` per helper; load returns cached value if present, save updates the cache. Pre-port, localStorage was synchronous and gave this behavior for free; post-port, the navigation latency is noticeable enough that Prentice asked about it directly. Apply to stagingStorage, tacticsMetricsStorage, tacticsStorage, and (once it ports) plannerStorage. yearMetadataStorage already has equivalent caching via YearContext.

Decision still open at implementation time: simple "use cache if present" vs stale-while-revalidate. Either is fine; the latter adds a background refresh on every cached read at the cost of one Supabase round-trip per navigation (still non-blocking).

### 4. Step 7: end-to-end testing

Full flow: create project on Goal → schedule chips on Plan → Send to System → edit task rows on System → archive a week → Plan Next Year → work on draft → archive year N. Sign out + back in to confirm data restores. Sign in as a second user to confirm no crosstalk.

### 5. Step 8: history table triggers + cleanup job

See `VERSION_HISTORY_PLAN.md`. Schema is in place from helper #4's migration.

### 6. Step 9: deploy + remove dev controls

Push to Vercel. Monitor. Remove the dev-only Undo Draft button (B4 in CODE_REVIEW). Delete dead code listed in CLAUDE.md.

## Open items (not blocking, worth noting)

* **Pre-port chip data didn't migrate.** New users start fresh in Supabase as designed. Prentice's existing local chips are still in localStorage but never read. They're effectively lost. He's OK with that. If you want to write a one-time client-side migration that reads localStorage and writes to Supabase before clearing, that's a small script; not required.
* **Navigation snappiness regression.** Documented in step 6 above. Logged in `SUPABASE_MIGRATION_PLAN.md`. Don't lose it.
* **Cross-tab and cross-device staleness.** Mentioned in the cache discussion. Single-user-single-tab is fine for now. Add BroadcastChannel or Supabase realtime later if it becomes a real problem.
* **Sign-out/sign-in without page reload.** Would leak previous user's React state and (once cache lands) cache data. Standard practice is a hard reload on auth state change. Out of scope for the migration but worth fixing during cleanup.
* **Plan-side chip resize doesn't update `durationMinutes` on the chip object.** Closed at the schema level (no such column anymore). Plan reads duration via the same row-based recompute System uses. If a regression appears here, the fix is to ensure both pages route through the same `estimateDurationFromRowIds` helper (task #2 of the previous handoff is still open: pull it into `src/utils/chips/duration.js` and import from both pages).
* **Greyed-out chips on Plan during initial mount.** Same race-condition shape, lower priority because it self-resolves a second later. Worth a single useEffect dep fix when you next touch that area.

## Code conventions reminder

* Storage helpers return `Promise<T>` and preserve their public API name and signature.
* Autosaves debounce at 500ms in the hook that owns the state.
* `useStorageSync` accepts an `initialValue` option and handles both sync and async `loadData`.
* The window event name for each helper fires on save, with `__eventYear` on `CustomEvent.detail`.
* `requireUserId()` and `findYearId(userId, yearNumber)` are the standard internal patterns. `findYearId` uses `.maybeSingle()` so it will THROW if two `years` rows ever share a `year_number` for the same user.
* When introducing a save effect for new state, add a "skip first save" gate ref AND explicitly clear it at the end of the async load (lesson from this session, section 2 above).
* Read-modify-write inside React command-pattern `execute` blocks: wrap the read+write in an async IIFE so the sync command interface stays intact; `.catch()` for fire-and-forget error logging.

## Files modified in this session

* `supabase/migrations/20260516000003_drop_chip_duration_minutes.sql` — new file, applied via dashboard.
* `src/lib/tacticsStorage.js` — full rewrite (Supabase internals, async API preserved).
* `src/utils/planner/createDraftYear.js` — added 8 awaits.
* `src/utils/planner/undoDraftYear.js` — added 1 await, updated comment.
* `src/hooks/planner/useTacticsChips.js` — added 2 awaits.
* `src/pages/StagingPageV2.jsx` — 3 callsites converted (async IIFE pattern in command-pattern blocks).
* `src/pages/TacticsPage.jsx` — substantial: 8 useState defaults replace the useMemo settings load, 3 chip useStates replaced with defaults, new consolidated async load effect, new gate refs, explicit gate-opening at end of load, handleSendToSystem extended.
* `src/pages/ProjectTimePlannerV2.jsx` — 4 callsites converted, sentToSystem moved from sync lazy init to async load effect with cancelled-flag cleanup, loadEnrichedChips parallel-loaded.
* `SUPABASE_MIGRATION_PLAN.md` — step 6 gained a new bullet for the cache layer (documented as a real regression).
* `MIGRATION_HANDOFF.md` — this file.

No new debug logs were added. None remain in any of the above files.

## Test plan to verify current state before starting helper #5

Same 5-step plan from the previous handoff. All five pass as of session end:

1. Hard-refresh System. Project headers appear with their quotas after a brief moment.
2. After project headers appear, subproject and task rows for each chip appear underneath.
3. Resize a chip on Plan. Press Send to System. Navigate to System. The subproject header label, task row Estimate, and task row TimeValue all match the resized duration on Plan.
4. The quota ("of X.XX") on the project header matches the sum of chip durations for that project.
5. Repeat steps 3 to 4 with a second resize. Values update both times.

If all five pass, you're cleared to start helper #5.

A bonus test for helper #4's specific surface:

6. Resize a day-of-week column on Plan. Refresh. Width survives. (This was the regression bug we caught and fixed in this session; the gate-pattern lesson above is the takeaway.)
