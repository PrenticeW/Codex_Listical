# Supabase Migration Handoff

**Author:** Claude (session ending 2026-05-23, after helper #5 port). Lint and `vite build` pass cleanly; user verification of the new behaviour still pending.
**For:** Whoever picks this up next (likely a fresh Claude session for step 6 cache layer or step 7 end-to-end testing)
**Read first:** `SUPABASE_MIGRATION_PLAN.md`, `STORAGE_AUDIT.md`, `CLAUDE.md`. Git history holds prior handoff iterations if you want the long view.

## Where we are

Steps 1 through 4 of the migration plan are still complete. **Step 5 (storage helper rewrites) is now complete.** All five storage helpers flow through Supabase.

| Helper | Status |
|---|---|
| `yearMetadataStorage` | Ported, verified working |
| `stagingStorage` | Ported, verified working |
| `tacticsMetricsStorage` | Ported, verified working |
| `tacticsStorage` | Ported, verified working as of 2026-05-16. |
| `plannerStorage` | **Ported as of 2026-05-23.** Lint and build pass. End-to-end user verification still pending — see "Test plan" at the bottom. |

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

## What was done in the 2026-05-23 session (helper #5 port)

### 1. `src/utils/planner/storage.js` fully rewritten

All 12 read/save pairs (plus `getProjectKey` legacy helper) now async and Supabase-backed. The legacy `plannerStorage.js` re-exports were dropped (no consumers).

Mapping:

| Function | Supabase home |
|---|---|
| `readColumnSizing` / `saveColumnSizing` | `planner_settings.column_sizing` |
| `readSizeScale` / `saveSizeScale` | `planner_settings.size_scale` |
| `readStartDate` / `saveStartDate` | `years.start_date` (NOT planner_settings) |
| `readShowRecurring` / `saveShowRecurring` | `planner_settings.show_recurring` |
| `readShowSubprojects` / `saveShowSubprojects` | `planner_settings.show_subprojects` |
| `readShowMaxMinRows` / `saveShowMaxMinRows` | `planner_settings.show_max_min_rows` |
| `readSortStatuses` / `saveSortStatuses` | `planner_settings.sort_statuses` (returns Set) |
| `readSortPlannerStatuses` / `saveSortPlannerStatuses` | `planner_settings.sort_planner_statuses` (returns Set) |
| `readTotalDays` / `saveTotalDays` | `years.total_days` (NOT planner_settings) |
| `readVisibleDayColumns` / `saveVisibleDayColumns` | `planner_settings.visible_day_columns` |
| `readCollapsedGroups` / `saveCollapsedGroups` | `planner_settings.collapsed_groups` (returns Set) |
| `readTaskRows` / `saveTaskRows` | `planner_rows` (live tasks) + `archived_weeks` (archive snapshots), plus calendar header rows reconstructed at read time |

### 2. Calendar header reconstruction at read time

`readTaskRows` calls `createInitialData(0, totalDays, startDate)` to build the seven calendar header rows (month, week, day, dayofweek, daily-min, daily-max, filter), then overlays `daily_min_minutes` / `daily_max_minutes` from `tactics_metrics` onto the min/max rows by matching each day index's weekday (computed from `startDate + i days`) to the bound for that weekday. Calendar headers are stripped from the array before write.

### 3. Archive week split

`saveTaskRows` filters out rows where `archiveWeekLabel` is set, `id` starts with `archive-week-`, or status starts with `archive`. Those are routed to `archived_weeks` (one row per archive press, full row stashed in the `snapshot` JSONB column). On read they're appended after the live task rows in `week_number` order. This is a slight behavioural change from the previous inline-interleaved order; if positional ordering ever matters for rendering it can be revisited.

### 4. JSONB wrapping of extra row fields (watch-out)

Real task rows carry many extra fields the React rendering relies on (`_rowType`, `parentGroupId`, `groupId`, `projectNickname`, etc.). The schema's intended `day_entries` shape is just per-day minute integers, but if I forced first-class columns for everything the schema would need substantial changes. So `plannerRowPayloadToDb` packs day-* cells into `day_entries.__cells`, the project nickname into `day_entries.__project`, and everything else into `day_entries.__extra`. `plannerRowDbToPayload` unpacks the reverse. The schema's `time_value_minutes` integer column rounds `(timeValue * 60)`, which is fine for hour-resolution values but loses sub-minute precision (not currently used). The next session may want to normalise this — promote frequently-rendered fields like `_rowType` and `parentGroupId` to first-class columns and constrain `day_entries` to its documented shape. Not blocking.

### 5. useAutoPersist gained an `enabled` flag

To avoid the race where the user interacts before the async load resolves and gets their change overwritten, `useAutoPersist` now accepts `enabled: boolean` (default true). `usePlannerStorage` keeps an `isLoaded` boolean that flips true once all eleven reads complete in parallel, and passes it as `enabled` to all eleven `useAutoPersist` calls. Single gate covers everything.

### 6. Page-level callsite conversions

* `TacticsPage.jsx` — one `saveStartDate` call inside `handleSendToSystem` got an `await`.
* `ProjectTimePlannerV2.jsx` — unmount-flush `saveTaskRows` became fire-and-forget with `.catch`; `handleImportTasks` became `async` with `try/catch`.
* `StagingPageV2.jsx` — the "remove from plan" command's `execute` block wraps its task-row read/filter/save in an async IIFE (matches the chip cleanup pattern just below it); the `undo` block uses `.catch()` fire-and-forget on the restore save.
* `createDraftYear.js` — all 7 reads parallelised in a `Promise.all`; all 8 writes parallelised in a second `Promise.all`; remaining 3 writes (`saveVisibleDayColumns`, `saveTaskRows([], ...)` and the start-date write inside the parallel block) all awaited.
* `useCollapsibleGroups.ts` — converted from sync useState lazy init to default-plus-async-load-effect with a `loadedForYear` ref guarding the save effect.

### 7. Files changed

* `src/utils/planner/storage.js` — full rewrite, ~720 lines.
* `src/hooks/common/useAutoPersist.js` — added `enabled` option and docstring update.
* `src/hooks/planner/usePlannerStorage.js` — full rewrite (defaults + consolidated async load + `isLoaded` gate).
* `src/hooks/planner/useCollapsibleGroups.ts` — async load + gate ref.
* `src/pages/TacticsPage.jsx` — 1 await added.
* `src/pages/ProjectTimePlannerV2.jsx` — 2 callsites converted.
* `src/pages/StagingPageV2.jsx` — 2 callsites converted.
* `src/utils/planner/createDraftYear.js` — all reads/writes awaited and parallelised.

`SESSION_HANDOVER_2026-04-24.md` was deleted as superseded.

## What to do next

### 0. End-to-end verification of helper #5 (DO THIS FIRST)

The build passes but no user has actually clicked through the System page on the new code. Recommended manual smoke test:

1. Hard-refresh System. Calendar headers appear with month/week/day labels.
2. Daily min/max rows fill in (these come from tactics_metrics).
3. Add a task row, set its estimate, type into a day cell. Navigate away. Come back. Values persist.
4. Toggle Show Recurring / Show Subprojects. Refresh. Toggle survives.
5. Resize a column. Refresh. Width survives.
6. Collapse a project group. Refresh. State survives.
7. Archive a week. The archived rows still appear in the table. Refresh. They survive.
8. Plan Next Year. Draft year settings copy across. Goal page is reset per the existing rules.
9. Sign out, sign in as a second account. No crosstalk.

### 1. Step 6: async-aware sweep (DONE 2026-05-23)

In-memory cache layer landed across all four ported helpers (stagingStorage, tacticsMetricsStorage, tacticsStorage, plannerStorage) via `src/lib/storageCache.js`. Cache hits return the saved value instantly so page-to-page navigation no longer blanks out for ~300ms-1s. Save functions update the cache with the just-written row so the next read is consistent.

Sign-out invalidation: `storageCache.js` subscribes to `supabase.auth.onAuthStateChange` and calls `clearAll()` on `SIGNED_OUT`/`USER_DELETED`. Year mutations (`createDraftYear`, `undoDraftYear`, `performYearArchive`, `revertArchive`) call `clearForYear(yearNumber)` so cached `years.status` flips are seen immediately.

Caveat: this is an in-tab cache only. Two browser tabs on the same account won't see each other's edits until refresh. Documented as acceptable pre-launch.

### 1b. Step 6 (original): async-aware sweep — historical notes

The migration plan's step 6 now has a new item flagged as a real regression Prentice hit: **in-memory cache layer in each ported helper** so navigating between Goal, Plan, and System pages renders saved data instantly rather than blanking out for ~300ms-1s on every navigation while the Supabase round-trip completes. Module-level `Map<yearNumber, payload>` per helper; load returns cached value if present, save updates the cache. Pre-port, localStorage was synchronous and gave this behavior for free; post-port, the navigation latency is noticeable enough that Prentice asked about it directly. Apply to stagingStorage, tacticsMetricsStorage, tacticsStorage, and (once it ports) plannerStorage. yearMetadataStorage already has equivalent caching via YearContext.

Decision still open at implementation time: simple "use cache if present" vs stale-while-revalidate. Either is fine; the latter adds a background refresh on every cached read at the cost of one Supabase round-trip per navigation (still non-blocking).

### 2. Step 7: end-to-end testing

Full flow: create project on Goal → schedule chips on Plan → Send to System → edit task rows on System → archive a week → Plan Next Year → work on draft → archive year N. Sign out + back in to confirm data restores. Sign in as a second user to confirm no crosstalk.

### 3. Step 8: history table triggers + cleanup job

See `VERSION_HISTORY_PLAN.md`. Schema is in place from helper #4's migration.

### 4. Step 9: deploy + remove dev controls

Push to Vercel. Monitor. Remove the dev-only Undo Draft button (B4 in CODE_REVIEW). Delete dead code listed in CLAUDE.md.

### 5. Revisit JSONB wrapping in `planner_rows.day_entries`

Cosmetic, not blocking. The current helper packs extra row fields (`_rowType`, `parentGroupId`, `groupId`, `projectNickname`, etc.) into `day_entries.__cells` / `__project` / `__extra` because the rendering layer relies on them. If you promote the frequently-referenced ones to first-class columns and constrain `day_entries` to its documented shape (`{ "0": minutes, "1": minutes, ... }`) the schema and code become cleaner. Worth doing alongside step 8 when planning_history triggers go in.

## Open items (not blocking, worth noting)

* **Pre-port chip data didn't migrate, and now neither do pre-port task rows.** New users start fresh in Supabase as designed. Prentice's existing local task rows, like his local chips, are still in localStorage but never read. He'll see a blank System page on first load for any year that had its data in localStorage. Same trade-off as helper #4 — fine for pre-launch. If you want a one-time client-side migration that reads localStorage and writes to Supabase before clearing, that's a small script; not required.
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

## Files modified in this session (2026-05-23, helper #5 port)

* `src/utils/planner/storage.js` — full rewrite; ~720 lines; Supabase internals, async API preserving the same public function names and signatures.
* `src/hooks/common/useAutoPersist.js` — added `enabled: boolean` option (gates saves until the async load resolves).
* `src/hooks/planner/usePlannerStorage.js` — full rewrite; defaults plus consolidated async load via `Promise.all`; single `isLoaded` boolean gates all eleven autosaves.
* `src/hooks/planner/useCollapsibleGroups.ts` — async load with a `loadedForYear` ref gating the save effect.
* `src/pages/TacticsPage.jsx` — added one `await` to `saveStartDate` inside `handleSendToSystem`.
* `src/pages/ProjectTimePlannerV2.jsx` — unmount-flush `saveTaskRows` became `.catch()` fire-and-forget; `handleImportTasks` made `async` with `try/catch`.
* `src/pages/StagingPageV2.jsx` — task-row cleanup in command `execute` block wrapped in an async IIFE; `.catch()` fire-and-forget on the `undo` restore.
* `src/utils/planner/createDraftYear.js` — all reads and writes awaited; parallelised via two `Promise.all` blocks.
* `MIGRATION_HANDOFF.md` — this file.
* `SESSION_HANDOVER_2026-04-24.md` — deleted as superseded.

No new debug logs were added. Lint and `vite build` both pass cleanly on the changed files.
