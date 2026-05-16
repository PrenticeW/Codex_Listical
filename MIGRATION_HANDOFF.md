# Supabase Migration Handoff

**Author:** Claude (session ending 2026-05-16 mid-way through step 5)
**For:** Whoever picks this up next (likely a fresh Claude session)
**Read first:** `SUPABASE_MIGRATION_PLAN.md`, `STORAGE_AUDIT.md`, `CLAUDE.md`

## Where we are

Steps 1 through 4 of the migration plan are complete and verified working in the live Supabase project. Step 5 (rewriting the storage helper internals) is in progress: three of five helpers are ported, two are still on localStorage.

| Helper | Status |
|---|---|
| `yearMetadataStorage` | Ported, verified working |
| `stagingStorage` | Ported, verified working |
| `tacticsMetricsStorage` | Ported, **has open bugs** (see below) |
| `tacticsStorage` | Not started, still localStorage |
| `plannerStorage` | Not started, still localStorage |

The two pending helpers still write to the browser's localStorage. Their public API is preserved so the rest of the app keeps working. Once they port, the localStorage tail goes away entirely.

## Live Supabase project

* `supabase/migrations/20260516000001_planning_schema.sql` is applied (schema, 11 planning tables, indexes, partial unique indexes).
* `supabase/migrations/20260516000002_planning_rls.sql` is applied (RLS enabled on every planning table with `user_id = auth.uid()` policies).
* `scripts/verify-rls.mjs` exists but Prentice has not run it. The dashboard `pg_policies` sanity query returned 11 rows all with policies, which was accepted as proof of RLS.
* Old `supabase/migrations/20260102000001_initial_schema.sql` is in place but its planning tables were dropped at the top of the new schema migration. `profiles` was left intact.

## Open bugs from helper #3 (tacticsMetricsStorage)

Prentice deployed the helper and saw two issues that I tried to fix and then ran out of confidence about.

### Bug A: project quota reads `1.18` instead of `1.30`

Setup: one project with a 1h chip and a 30min chip. Press Send to System. The project header in System shows `of 1.18` in the TimeValue column. Should be `1.30`.

The chain:

1. Plan's `minutesToHourMinuteDecimal(minutes)` returns a **number** like `1.3` for 90 minutes (decimal part is minutes/100, not a fraction of an hour).
2. The old `tacticsMetricsStorage.hmmToMinutes` mishandled the number case, did `1.3 * 60 = 78`, and stored 78 minutes in `tactics_metrics.project_weekly_quotas[].weekly_minutes`.
3. The current code (after my fix in commit `dada7f8`) handles the number case correctly: `Math.floor(1.3) = 1, Math.round(0.3 * 100) = 30, total = 90 minutes`. Reading 90 back through `minutesToHmm` returns the number `1.3` which `ProjectRow` formats as `"1.30"`.
4. **Suspicion (unconfirmed):** the DB still has the 78-minute value from before the fix, because either (a) browser cache kept Prentice running the old JS, or (b) my second fix has another flaw I didn't see.

**What the next session should do:** ask Prentice to open Supabase Table editor → `tactics_metrics` → the row with `is_sent = true` for his year → check `project_weekly_quotas[*].weekly_minutes`. If it's 78, push the user to hard-refresh, press Send again with the new code, recheck. If it's 90 but System still displays 1.18, the bug is in the read or render path. The relevant files are `src/lib/tacticsMetricsStorage.js` (helper) and `src/components/planner/rows/ProjectRow.jsx` (display).

### Bug B: task rows don't update consistently after Send

Symptom: change a chip's length on Plan, press Send. System sometimes doesn't add the task row at all, sometimes shows the task row but with the previous length, sometimes the project total updates but the task row doesn't.

Root cause I identified and tried to fix (commit `3baa8e8`): in `ProjectTimePlannerV2.jsx` the `tactics-send-to-system` event handler had a `resetSubprojectLabels(freshChips)` call where `freshChips` was an undefined variable. I introduced this when converting the handler to async. The original sync code grabbed `loadEnrichedChips(...)` into a local variable; my async version did `.then(setTacticsChips)` but forgot to pass the resolved value to `resetSubprojectLabels`. Fix in place is:

```js
loadEnrichedChips(currentYear).then((freshChips) => {
  setTacticsChips(freshChips);
  resetSubprojectLabels(freshChips);
});
```

I also fixed the on-mount catch-up effect so it re-runs when `tacticsChips` loads asynchronously (was previously `[]` deps which only ran once on first mount with empty chips).

**Unverified:** Prentice has not confirmed whether the latest fixes resolved the symptom. The next session should ask him to repeat the test sequence I gave him at the end of the conversation (1h chip + 30min chip → Send → check System → resize chip → Send → check System) and report exactly what happens at each step plus any console errors and the relevant Supabase row values.

There may be a separate pre-existing bug in the chip→task-row sync logic in `src/pages/ProjectTimePlannerV2.jsx` around lines 1026-1267 (the big chip-syncing useEffect) and lines 1272-1413 (`resetSubprojectLabels`). Both modify the `data` state and could race. I didn't dig deep enough to be sure.

## What's safe to assume

* Helpers #1 and #2 work. Prentice signed off on stagingStorage end-to-end.
* The chip data and the task row data are both still in localStorage (tacticsStorage and plannerStorage are not yet ported). Only `years`, `projects`, and `tactics_metrics` are coming from Supabase.
* Prentice has no precious data and is fine with fresh-start losses.
* He uses Vercel for deployment and pastes SQL into the Supabase dashboard for migrations.
* He has one Supabase project (no separate dev/prod yet).

## What to do next

1. **Pin down Bug A.** Ask Prentice to share the `tactics_metrics` row content for his current year. Based on that, either push him to hard-refresh and re-Send, or diagnose the read path.

2. **Pin down Bug B.** Run the test sequence in the last reply of this conversation and get the exact step-by-step results. If the freshChips fix solved it, mark Bug B closed. If not, instrument or read the chip-sync useEffect in `ProjectTimePlannerV2.jsx` carefully.

3. **Port helper #4: tacticsStorage.** This holds chip state (live + sent layer in `tactics_chips`, `tactics_custom_projects`), the year settings (`tactics_year_settings`), column widths (also into `tactics_year_settings`), and the send-to-system timestamp (move to `planner_settings.send_to_system_at`). The schema is already in place. Pattern follows helpers #1-#3: async public API, debounced autosave at every caller, await every callsite. The chip ID is text and references staging project UUIDs as text — keep that string-y join intentionally, the schema's `project_id_external TEXT` column already accommodates it.

4. **Port helper #5: plannerStorage.** This is the biggest. Task rows go into `planner_rows` (one row per task with `day_entries` as JSONB), per-year settings go into `planner_settings`. Calendar header rows (`_isMonthRow`, `_isWeekRow`, etc.) are NOT persisted per the design decision; derive them at render. Archive rows go into the dedicated `archived_weeks` table, NOT into `planner_rows`.

5. **Step 6: async-aware sweep.** Audit every caller of every helper one more time for `await` correctness and loading states. Add loading spinners on cold mount.

6. **Step 7: end-to-end testing.** Full flow: create projects, plan chips, send to system, edit tasks, archive a week, plan next year, archive year, undo draft.

7. **Step 8: history table triggers + cleanup job.** See `VERSION_HISTORY_PLAN.md`.

8. **Step 9: deploy + remove dev controls.**

## Code conventions established during this work

* Storage helpers return `Promise<T>` and the public API name/signature is preserved otherwise.
* Autosaves are debounced at 500ms in the hook that owns the state (`useShortlistState` does this for staging; `TacticsPage` does it for metrics).
* `useStorageSync` accepts an `initialValue` option and now handles both sync and async `loadData`.
* The window event name for each helper still fires on save, with `__eventYear` on `CustomEvent.detail` (yearMetadataStorage is the exception — global by design).
* `requireUserId()` and `findYearId(userId, yearNumber)` are the internal patterns each storage helper uses to scope work to the current authenticated user and a specific year.

## Bug avoidance for the next session

* When converting sync code to async, grep for every variable name that was previously a sync return value and double-check it's still defined inside the async callback. The `freshChips` bug was exactly this — `const freshChips = loadSync()` became `loadAsync().then(setX)` and the variable disappeared.
* Don't trust your own converters round-trip until you've written a test or manually walked through both directions with concrete numbers. The `hmmToMinutes(1.3) === 90` round-trip was assumed correct twice before I noticed the format wasn't what I thought.
* The Plan page emits times as numbers `1.3 = 1h30m` (decimal part is `minutes/100`), NOT as decimal hours. This is a project-specific convention and trips everyone up. `STORAGE_AUDIT.md` documents it but easy to miss.
* When making React effects depend on async state, remember the empty initial render. An effect that runs on `[tacticsChips]` will fire once with `[]` and then again with the loaded value. Guards inside the effect must handle the empty case gracefully.

## Files modified in this session

For the next session to know what's "fresh":

* `src/lib/yearMetadataStorage.js` — full rewrite
* `src/lib/stagingStorage.js` — full rewrite
* `src/lib/tacticsMetricsStorage.js` — full rewrite, hmm number-format bug fix
* `src/contexts/YearContext.jsx` — async load, INITIAL_SESSION filter
* `src/hooks/common/useStorageSync.js` — async-aware, `initialValue` option
* `src/hooks/staging/useShortlistState.js` — async load, debounced autosave
* `src/hooks/planner/useProjectsData.js` — async loadData + initialValue
* `src/hooks/planner/useTacticsChips.js` — async loadData + initialValue
* `src/pages/TacticsPage.jsx` — removed sync getYearInfo import, awaited send-to-system saves, debounced metrics autosave
* `src/pages/ProjectTimePlannerV2.jsx` — async loadMetricsData and loadEnrichedChips, fixed freshChips closure, fixed on-mount catch-up effect
* `src/pages/StagingPageV2.jsx` — async undoDraftYear and revertArchive handlers
* `src/components/ArchiveYearModal.jsx` — async validateYearReadyForArchive call
* `src/utils/planner/createDraftYear.js` — awaited all helper calls
* `src/utils/planner/archiveYear.js` — awaited all helper calls, validateYearReadyForArchive made async
* `src/utils/planner/undoDraftYear.js` — async, awaited yearMetadataStorage calls
* `src/utils/planner/revertArchive.js` — async, removed redundant setCurrentYear

Plus the two SQL migration files in `supabase/migrations/` and `scripts/verify-rls.mjs`. Plus `STORAGE_AUDIT.md` (chip-shape gap patched) and `SUPABASE_MIGRATION_PLAN.md` (status updates and step boxes ticked through step 4).
