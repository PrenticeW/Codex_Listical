# Storage Shape Audit

**Status:** Complete
**Last updated:** 2026-05-16
**Source files:** `src/lib/stagingStorage.js`, `src/lib/tacticsMetricsStorage.js`, `src/utils/planner/storage.js`, `src/lib/tacticsStorage.js`, `src/lib/yearMetadataStorage.js`

This document captures every localStorage key currently written by Listical's planning data layer, the JSON shape stored under each key, the invariants and quirks worth preserving, and how the helpers relate to each other. It is the blueprint for step 2 of `SUPABASE_MIGRATION_PLAN.md` (rewriting the schema migration).

## Conventions used throughout

* Every helper goes through `storage` (a default-exported singleton in `src/lib/storageService.js`). When a user is signed in, `storageService` transparently prefixes every key with `user:{userId}:` before hitting `window.localStorage`. The audit below lists the unscoped key; mentally prepend `user:{userId}:` for the authenticated path.
* `storageService.removeKeysMatching(predicate)` is the surgical wipe primitive used by `undoDraftYear` and `revertArchive`. Anything year-scoped becomes deletable by a `{domain}-year-{N}-` substring match.
* "Year-scoped" below means the key embeds `year-{N}` in the name and reads or writes per year. "Project-scoped" means the key embeds `{projectId}` (currently always `project-1` via `DEFAULT_PROJECT_ID`). Both can coexist.
* Year-scoped custom events spread a reserved `__eventYear` field into `CustomEvent.detail` so listeners can short-circuit cross-year cross-talk. The field is documented per helper below.
* The legacy global `tactics-page-settings` key (Plan settings before the May 2026 year-scope split) is not part of the migration. `tacticsStorage.js` proactively wipes it on module load.

---

## 1. stagingStorage (Goal page)

**Source:** `src/lib/stagingStorage.js`
**Public API:** `loadStagingState(yearNumber)`, `saveStagingState(payload, yearNumber)`, `getStagingShortlist(yearNumber)`
**Event fired on save:** `staging-state-update`

### Keys

| Key | Scoping | Notes |
|---|---|---|
| `staging-year-{N}-shortlist` | year + user (when signed in) | Single blob holding both `shortlist` and `archived` arrays for a year. |
| `staging-shortlist` | global (legacy) | Returned by `getStorageKey(null)`. Still readable for backward compat but no current caller passes `null`. Safe to ignore in the Supabase schema. |

### Value shape

```ts
type StagingStateBlob = {
  shortlist: SerializedStagingItem[];
  archived: SerializedStagingItem[];
};

type SerializedStagingItem = {
  id: string;                  // UUID / nanoid generated client-side
  text: string;                // original user-typed prompt
  projectName?: string;        // display name
  projectNickname?: string;    // short uppercase nickname — the current Plan↔System join key (see invariants)
  color?: string;              // hex or HSL string from COLOR_PALETTE
  planTableVisible: boolean;
  planTableCollapsed: boolean;
  hasPlan?: boolean;
  addedToPlan?: boolean;
  showOutcomeTotals?: boolean;
  isSimpleTable?: boolean;
  planReasonRowCount?: number;
  planOutcomeRowCount?: number;
  planOutcomeQuestionRowCount?: number;
  planNeedsQuestionRowCount?: number;
  planNeedsPlanRowCount?: number;
  planSubprojectRowCount?: number;   // schedule row count (named "subproject" for historical reasons)
  planXxxRowCount?: number;          // subproject row count (named "xxx" for historical reasons)
  planTableEntries: SerializedRow[]; // rendered as a 6-column plan table per item
};

type SerializedRow = {
  cells: string[];             // length 6; column indices defined by COL in planTableHelpers.js
  _rowType?: 'header' | 'prompt' | 'response' | 'data';
  _pairId?: string;            // links prompt rows to their response rows
  _sectionType?: 'Reasons' | 'Outcomes' | 'Actions' | 'Schedule' | 'Subprojects' | 'Needs';
  _isTotalRow?: boolean;
};
```

Legacy stored rows are sometimes a plain `string[]` (no `cells` wrapper); `deserializeRow` handles both. The Supabase representation should normalise to the wrapped form.

### Invariants and quirks

* `planTableEntries` is roughly fixed at `PLAN_TABLE_ROWS = 15` rows of `PLAN_TABLE_COLS = 6` columns. `clonePlanTableEntries` pads up to that minimum on read paths but the stored value can be longer if the user added rows.
* Row metadata (`_rowType`, `_pairId`, `_sectionType`, `_isTotalRow`) is *non-enumerable* on the in-memory array form and is re-attached via `defineRowMetadata` after each load. The on-disk JSON form moves them onto a sibling object next to `cells`. This wrapping must round-trip on the Supabase side or the staging page's section-aware logic breaks.
* `serializeItem`/`deserializeItem` is a pure rewrap; otherwise the rest of the staging item is forwarded as-is and there is no schema enforcement on extra fields.
* The function returns `{ shortlist: [], archived: [] }` for missing keys; the schema should mirror this with empty rows being valid.

### Cross-helper references

* `projectNickname` is the join key used by `tacticsStorage` chips and `tacticsMetricsStorage` weekly quotas, and consumed by the System page. **Fragile and known-bad** — renaming a nickname in the Goal page silently zeroes out the System page's quota lookups. Flag every appearance of `projectNickname` for the Supabase port: it should be replaced with a stable `projects.id UUID` join key.
* `color` is read by `tacticsStorage` chip rendering when a project is added to the schedule.

### Event contract

`saveStagingState` dispatches `staging-state-update` with detail `{ ...payload, __eventYear: yearNumber }`. Listeners: TacticsPage (Plan), `useProjectsData` (System), `useStorageSync` (year filtering).

### User / year scoping summary

Year-scoped via key, user-scoped via `storageService` prefix when signed in. Anonymous sessions still write to the legacy unscoped key.

---

## 2. tacticsMetricsStorage (Plan page metrics)

**Source:** `src/lib/tacticsMetricsStorage.js`
**Public API:** `loadTacticsMetrics(yearNumber)`, `saveTacticsMetrics(payload, yearNumber)`, `saveSentMetricsSnapshot(payload, yearNumber)`, `loadSentMetricsSnapshot(yearNumber)`
**Event fired on save:** `tactics-metrics-state-update` (live key only; the sent snapshot does not fire an event)

### Keys

| Key | Scoping | Notes |
|---|---|---|
| `tactics-year-{N}-metrics-state` | year + user | "Live" metrics, auto-saved on every Plan-page recalculation. |
| `tactics-year-{N}-sent-metrics` | year + user | Frozen snapshot written only when the user presses **Send to System**. System page reads exclusively from this key. |
| `tactics-metrics-state` | global (legacy) | Returned when `yearNumber` is null. No active caller. |
| `tactics-sent-metrics` | global (legacy) | Same as above for the sent snapshot. |

### Value shape (identical for live and sent snapshot)

```ts
type TacticsMetricsBlob = {
  projectWeeklyQuotas: Array<{
    id: string;          // matches stagingStorage item id
    label: string;       // projectNickname — see fragility note
    weeklyHours: string; // formatted as "H.MM" (decimal-minute style, e.g. "3.30" = 3h 30m)
  }>;
  dailyBounds: Array<{
    day: string;            // "Sunday" through "Saturday"
    dailyMaxHours: string;  // "H.MM"
    dailyMinHours: string;  // "H.MM"
  }>;
  weeklyTotals: {
    availableHours: string; // "H.MM"
    workingHours: string;   // "H.MM"
  };
};
```

### Invariants and quirks

* All times are stored as `"H.MM"` strings, not minute integers. The Supabase port should pick one unit (recommend minutes as `INTEGER`) and convert at the boundary; do not preserve the string form just because callers happen to render it.
* `dailyBounds` is parallel to the seven days of the week as displayed (ordered by the `startDay` setting from `tacticsStorage`). Listeners assume the array length is 7 in normal operation but no code enforces it; an empty array is safe.
* `projectWeeklyQuotas[].label` is `projectNickname`. **Fragile join key** — see stagingStorage notes. The System page builds a `Map(label → weeklyHours)` from this and looks up rows by `task.project`, which must match the staging nickname exactly.
* The live and sent snapshot can drift after a user edits Plan but before pressing Send. That two-layer model has to be preserved post-migration; the migration plan calls for either a `is_sent` flag with a partial unique index or parallel `*_sent` tables.
* `loadTacticsMetrics` returns `null` when the key is missing; `loadSentMetricsSnapshot` does the same. Callers must defend against `null`.

### Cross-helper references

* Depends on `stagingStorage` for project IDs and nicknames.
* Read on the System page by `ProjectTimePlannerV2.jsx#loadMetricsData` (sent snapshot only).
* Live key has **no current consumer** beyond debug visibility — `useTacticsMetrics` was deleted in May 2026. The save call still fires for API parity; the schema must support the live state nonetheless because the Plan page's autosave depends on round-tripping it back on reload.

### Event contract

`saveTacticsMetrics` dispatches `tactics-metrics-state-update` with detail `{ ...payload, __eventYear: yearNumber }`. No live consumer today. `saveSentMetricsSnapshot` does not fire an event; consumers learn about a Send via the `tactics-send-to-system` event from `tacticsStorage`.

### User / year scoping summary

Year-scoped via key, user-scoped via prefix. Two layers per year: live and sent.

---

## 3. plannerStorage (System page task rows and per-project settings)

**Source:** `src/utils/planner/storage.js` (key templates in `src/constants/plannerStorageKeys.js`)
**Public API:** `readTaskRows / saveTaskRows`, `readColumnSizing / saveColumnSizing`, `readSizeScale / saveSizeScale`, `readStartDate / saveStartDate`, `readShowRecurring / saveShowRecurring`, `readShowSubprojects / saveShowSubprojects`, `readShowMaxMinRows / saveShowMaxMinRows`, `readSortStatuses / saveSortStatuses`, `readSortPlannerStatuses / saveSortPlannerStatuses`, `readTotalDays / saveTotalDays`, `readVisibleDayColumns / saveVisibleDayColumns`, `readCollapsedGroups / saveCollapsedGroups`
**Event fired on save:** `planner-start-date-update` (start-date only)

### Key construction

Every helper builds its key from a `_TEMPLATE` constant with two interpolations:

1. `{projectId}` — always `project-1` today (`DEFAULT_PROJECT_ID`). Multi-project support is scaffolded but unused.
2. Optional `year-{N}` suffix inserted via `getProjectKey` immediately before the descriptor segment.

So `planner-v2-{projectId}-task-rows` with `projectId='project-1'` and `yearNumber=2` becomes `planner-v2-project-1-year-2-task-rows`.

### Keys

| Key (year-N form) | Stored value type | Scoping | Notes |
|---|---|---|---|
| `planner-v2-project-1-year-{N}-task-rows` | `TaskRow[]` (JSON) | year + project + user | The main task data for the System page. See task row shape below. |
| `planner-v2-project-1-year-{N}-column-sizing` | `{ [columnId: string]: number }` | year + project + user | Pixel widths per column. Default values from `getDefaultColumnSizing`. Includes `day-0` through `day-{totalDays-1}`. |
| `planner-v2-project-1-year-{N}-size-scale` | `number` (stored as decimal string) | year + project + user | Range 0.5 to 3.0; default 1.0. Stored via `setItem` not `setJSON`. |
| `planner-v2-project-1-year-{N}-start-date` | `string` ("YYYY-MM-DD") | year + project + user | Fires `planner-start-date-update` on save. Default = today. |
| `planner-v2-project-1-year-{N}-show-recurring` | `"true" \| "false"` | year + project + user | Boolean stored as string. Default true. |
| `planner-v2-project-1-year-{N}-show-subprojects` | `"true" \| "false"` | year + project + user | Default true. |
| `planner-v2-project-1-year-{N}-show-max-min-rows` | `"true" \| "false"` | year + project + user | Default true. |
| `planner-v2-project-1-year-{N}-sort-statuses` | `string[]` (JSON) | year + project + user | Persisted as array, materialised as a `Set<string>` in memory. Defaults to all 8 sortable statuses. |
| `planner-v2-project-1-year-{N}-sort-planner-statuses` | `string[]` (JSON) | year + project + user | Same shape and defaults as above, distinct feature ("Sort Planner" vs "Sort Inbox"). |
| `planner-v2-project-1-year-{N}-total-days` | `number` (stored as string) | year + project + user | Timeline length in days; default 84. Stored via `setItem`. |
| `planner-v2-project-1-year-{N}-visible-day-columns` | `{ [`day-{idx}`]: boolean }` | year + project + user | Maps each day column id to visibility. Default: every day visible. |
| `planner-v2-project-1-year-{N}-collapsed-groups` | `string[]` (JSON) | year + project + user | Persisted as array, materialised as `Set<string>` in memory. |

The unsuffixed forms (`planner-v2-project-1-task-rows`, etc.) are the year-agnostic legacy keys returned when `yearNumber` is `null`. They are no longer written by the active pages but `readTaskRows(projectId, null)` still resolves them; the Supabase port can ignore them.

### TaskRow shape

Task rows are heterogenous — they include both real data rows and seven leading "header" rows that render the timeline calendar. All share the same field set so they can flow through the same TanStack table.

```ts
type TaskRow = {
  id: string;          // e.g. 'row-0', 'row-1747000000-3', 'project-{nickname}', 'archive-week-N-...'
  checkbox: boolean | '';
  project: string;     // projectNickname (join key — fragile)
  subproject: string;
  status: string;      // '-', 'Done', 'Scheduled', 'Not Scheduled', 'Blocked', 'On Hold', 'Abandoned', 'Skipped', 'Accounted'
  task: string;
  recurring: string;
  estimate: string;    // e.g. '30 Minutes', '2 Hours', 'Custom', '-'
  timeValue: string;   // 'H.MM' decimal-minute representation
  [`day-${number}`]: string; // one key per day column up to totalDays; values usually 'H.MM' or ''

  // Header-row discriminators (only one is true per row, none on data rows):
  _isMonthRow?: boolean;
  _monthSpans?: Array<{ startDay: number; span: number; label: string }>;
  _isWeekRow?: boolean;
  _weekSpans?: Array<{ startDay: number; span: number; label: string }>;
  _isDayRow?: boolean;
  _isDayOfWeekRow?: boolean;
  _isDailyMinRow?: boolean;
  _isDailyMaxRow?: boolean;
  _isFilterRow?: boolean;

  // Optional row-type discriminators set during runtime (project/subproject grouping, archive snapshots):
  _rowType?: 'projectHeader' | 'projectGeneral' | 'projectUnscheduled' | 'subprojectGeneral' | 'subprojectUnscheduled' | string;
  projectNickname?: string;
  parentGroupId?: string;
  archiveWeekLabel?: string;
};
```

### Invariants and quirks

* The first seven rows of `task-rows` are always the calendar header rows in this order: month, week, day, day-of-week, daily-min, daily-max, filter. `createInitialData` produces them and downstream code locates them by `id` (`'month-row'`, `'week-row'`, `'day-row'`, `'dayofweek-row'`, `'daily-min-row'`, `'daily-max-row'`, `'filter-row'`).
* `_monthSpans` and `_weekSpans` are derived from `startDate` and `totalDays` at row creation time. Stored as plain `JSON.stringify`-able arrays. Changing `startDate` does not retroactively rewrite them — the System page recomputes header rows when start-date events fire.
* `task.project` (and `task.subproject`) must match a `projectNickname` from `stagingStorage` for the row to associate with a Plan-side project. **Fragile** — flag for the projects-by-id rewrite.
* `status` is a free string but only the values listed above have meaning. Status transitions to `Done` / `Abandoned` are the ones the migration plan wants to capture as `completed_at` / `abandoned_at` timestamps; today there is no on-row timestamp.
* Boolean settings (`showRecurring`, `showSubprojects`, `showMaxMinRows`) are stored as `'true'` / `'false'` strings via `storage.setItem`, not JSON. Anything except `'true'` is treated as `false` on read. Migration must coerce.
* `sortStatuses` and `sortPlannerStatuses` defaults differ between the happy path (8 statuses) and the catch path (6 statuses). Treat the 8-status set as the canonical default.
* `visibleDayColumns` is keyed by `day-{idx}` strings; `idx` is zero-based and bounded by `totalDays`. Missing keys are treated as visible.
* `archiveWeekLabel` and the `archive-week-*` row family are inserted by `handleArchiveWeek` directly into `task-rows`. They are not stored under a separate key. The Supabase port may want a dedicated `archived_weeks` table — flag for schema design.

### Cross-helper references

* `task.project` → `stagingStorage[*].projectNickname` (fragile join).
* `startDate` is written from the Plan page (`saveStartDate` is also called from `TacticsPage.handleSendToSystem`) and read by the System page. The `planner-start-date-update` event carries `{ startDate, projectId, yearNumber }`. It is not tagged with `__eventYear` because the year is on the payload directly.
* `loadMetricsData` in `ProjectTimePlannerV2.jsx` reads `tactics-year-{N}-sent-metrics` and merges its `dailyBounds`/`projectWeeklyQuotas` into the system view at render time.
* `archiveYear` and `createDraftYear` utilities copy or skip these keys depending on the operation; the Supabase port has to preserve those flows.

### Event contract

Only `saveStartDate` emits an event today: `planner-start-date-update` with detail `{ startDate, projectId, yearNumber }`. Does not use `__eventYear` — listeners read `yearNumber` directly.

### User / year scoping summary

Year + project + user. The `projectId` axis is currently always `project-1`; the Supabase schema can fold it into a `projects(id UUID)` table and drop the literal `project-1` token.

---

## 4. tacticsStorage (chips state, year settings, column widths, send-to-system marker)

**Source:** `src/lib/tacticsStorage.js`
**Public API:** `loadTacticsYearSettings(yearNumber)`, `saveTacticsYearSettings(payload, yearNumber)`, `loadTacticsChipsState(yearNumber)`, `saveTacticsChipsState(payload, yearNumber)`, `loadTacticsColumnWidths(yearNumber)`, `saveTacticsColumnWidths(widths, yearNumber)`, `loadSentChipsSnapshot(yearNumber)`, `saveSentChipsSnapshot(payload, yearNumber)`, `getSendToSystemTimestamp(yearNumber)`, `setSendToSystemTimestamp(yearNumber)`, `clearSendToSystemTimestamp(yearNumber)`
**Events fired on save:** `tactics-chips-state-update`, `tactics-settings-state-update`. The Send-to-System press dispatches `tactics-send-to-system` (fired from TacticsPage, not from this module, but documented here because the timestamp marker lives in this file).

### Keys

| Key | Stored value type | Scoping | Notes |
|---|---|---|---|
| `tactics-year-{N}-settings` | `TacticsYearSettings` (JSON) | year + user | All eight Plan-page settings since the May 2026 split. `loadTacticsYearSettings` and `saveTacticsYearSettings` **throw** if `yearNumber` is null/undefined. |
| `tactics-year-{N}-chips-state` | `TacticsChipsState` (JSON) | year + user | Live chip layout, auto-saved on every Plan edit. |
| `tactics-year-{N}-sent-chips` | `TacticsChipsState` (JSON) | year + user | Frozen snapshot written on Send to System. System page reads only this key. |
| `tactics-column-widths-{N}` | `number[]` (JSON) | year + user | Pixel widths array for the Plan grid. Note the key uses `{N}` as a suffix, not `year-{N}` infix — the only key in this module that breaks the `{domain}-year-{N}-{descriptor}` convention. |
| `tactics-year-{N}-send-to-system-ts` | `string` (epoch ms as decimal string) | year + user | Set to `Date.now().toString()` on every Send press. Cleared on draft-year teardown. |
| `tactics-chips-state` | global (legacy) | — | Returned when `yearNumber` is null. No active caller. |
| `tactics-sent-chips` | global (legacy) | — | Same as above for the sent snapshot. |
| `tactics-column-widths` | global (legacy) | — | Same as above for column widths. |
| `tactics-send-to-system-ts` | global (legacy) | — | Same as above for the timestamp marker. |
| `tactics-page-settings` | global (deleted) | — | Removed on module load. **Do not include in the Supabase schema.** |

### Value shapes

```ts
type TacticsYearSettings = {
  startHour: string;        // '' or '00'..'23'
  startMinute: string;      // '' or '00'..'59'
  incrementMinutes: number; // typically 15, 30, 60; default 60
  showAmPm: boolean;        // default true
  use24Hour: boolean;       // default false
  startDay:
    | 'Sunday' | 'Monday' | 'Tuesday' | 'Wednesday'
    | 'Thursday' | 'Friday' | 'Saturday';
  chipDisplayModes: {
    __default__: { duration: boolean; clock: boolean };
    [projectId: string]?: { duration: boolean; clock: boolean };
  };
  summaryRowOrder: string[] | null; // ordered project ids; null = use the default ordering
};

type TacticsChipsState = {
  projectChips: ProjectChip[] | null;
  customProjects: CustomProject[] | null;
  chipTimeOverrides: { [chipId: string]: number } | null; // override minutes per chip id
};

type ProjectChip = {
  id: string;                  // e.g. 'sleep-3', '<projectId>-<column>-<row>-<n>'
  columnIndex: number;         // 0..6 for day columns; >= DAY_COLUMN_COUNT for project columns
  dayName: string | null;      // 'Sunday'..'Saturday' or null for project-column chips
  startRowId: string;          // e.g. 'sleep-start', 'row-0900-15'
  endRowId: string;            // same shape as startRowId
  projectId: string;           // matches stagingStorage id, or built-in 'sleep'/'wake', or a customProjects.id
  durationMinutes?: number;    // optional explicit duration; overridden by chipTimeOverrides[chipId] when present
};

type CustomProject = {
  id: string;                  // e.g. 'custom-1'
  label: string;               // uppercase, e.g. 'CUSTOM 1'
  color: string;               // hex or HSL
};
```

### Invariants and quirks

* `loadTacticsYearSettings` and `saveTacticsYearSettings` **throw** if `yearNumber` is missing. They also have no legacy null-year fallback. The legacy global `tactics-page-settings` key was the source of the May 2026 cross-year bug and is actively wiped on module load — do not reintroduce a global tactics settings blob.
* `chipDisplayModes.__default__` is required; per-project entries override it.
* `summaryRowOrder` is `null` to mean "use the default ordering". Empty array would also work but the loader normalises non-arrays to `null`.
* `ProjectChip.startRowId` and `endRowId` reference timeline rows by string id. The id format is opaque outside the Plan page — preserve verbatim. Sleep chips use the synthetic `'sleep-start'` id.
* `ProjectChip.columnIndex` may be `>= DAY_COLUMN_COUNT` to represent project-column chips. The legacy `supabase/migrations/...` schema's `CHECK (column_index BETWEEN 0 AND 6)` is wrong for this reason — `CLAUDE.md` and the migration plan both flag it.
* `chipTimeOverrides` is the source of truth for chip duration when present; otherwise `chip.durationMinutes` or a derived value from `startRowId`/`endRowId` and `incrementMinutes` applies. Migration must preserve this priority order.
* `loadTacticsChipsState` returns `{ projectChips: null, customProjects: null, chipTimeOverrides: null }` (all-null) for a missing key. Callers default to `[]` / `{}` themselves.
* Column widths are an ordered `number[]`. Index 0 is the time column (120px default), indices 1+ are day/project columns (140px default). The array length is whatever the Plan page renders (defaults to 30). The key name is the one anomaly to the year-scoping convention — `{N}` is suffixed, not infixed. Worth normalising in the Supabase schema by storing as a JSON array under a `tactics_year_settings` row instead.
* Sent-to-system timestamp is a string of milliseconds since epoch. Its presence is what flips the System page out of the "no imported tasks" guard for draft years.

### Cross-helper references

* `ProjectChip.projectId` must match a `stagingStorage` item id or be a built-in (`sleep`, `wake`) or a `CustomProject.id`. This is the cleanest existing join key — preserve it under whatever id replaces `projectNickname`.
* `customProjects[].color` is picked by `pickCustomChipColour(customProjects, stagingProjects)` to avoid colliding with staging colors.
* Save-time event payloads do not include the legacy `chipState` object — they carry the just-saved fields plus `__eventYear`.
* `setSendToSystemTimestamp` is called from `TacticsPage.handleSendToSystem` immediately before the `tactics-send-to-system` event is dispatched. `clearSendToSystemTimestamp` is called by `undoDraftYear` and `revertArchive`.

### Event contracts

* `tactics-chips-state-update` — detail `{ projectChips, customProjects, chipTimeOverrides, __eventYear }`. Listener: `useTacticsChips` (System page).
* `tactics-settings-state-update` — detail `{ ...settings, __eventYear }`. **No live consumer.** Fired for parity.
* `tactics-send-to-system` — detail `{ __eventYear }`. Listener: `ProjectTimePlannerV2` (System).

### User / year scoping summary

Year-scoped via key, user-scoped via prefix. Live and sent chip layers exist in parallel, like the metrics module.

---

## 5. yearMetadataStorage (year statuses, draft year tracking)

**Source:** `src/lib/yearMetadataStorage.js`
**Public API:** `readYearMetadata`, `saveYearMetadata`, `initializeYearMetadata`, `getCurrentYear`, `getYearInfo`, `getAllYears`, `getActiveYear`, `getArchivedYears`, `updateYearInfo`, `setCurrentYear`, `createNewYear`, `archiveYear`, `createDraftYear`, `getDraftYear`, `promoteDraftToActive`, `deleteDraftYearRecord`, `yearExists`, `calculateCycleEndDate`, `calculateNextCycleStartDate`
**Event fired on save:** `yearMetadataStorage`

### Keys

| Key | Scoping | Notes |
|---|---|---|
| `app-year-metadata` | user (when signed in) | Single blob for all year records. Intentionally not year-scoped — it is the index of years. |

### Value shape

```ts
type YearMetadata = {
  currentYear: number;     // the year the UI is showing; can point at active or draft
  years: YearInfo[];
};

type YearInfo = {
  yearNumber: number;          // 1, 2, 3, ...
  status: 'active' | 'archived' | 'draft';
  startDate: string;           // YYYY-MM-DD
  endDate: string | null;      // YYYY-MM-DD on archive; null otherwise
  archivedAt: string | null;   // ISO timestamp; null until archived
  totalWeeksCompleted: number; // 0..12
  totalHoursCompleted: number; // accumulated hours from completed tasks
};
```

### Invariants and quirks

* `currentYear` is the year the UI is currently displaying; it can be the active year or the draft year. Always equals one of `years[*].yearNumber`.
* Exactly one year has `status === 'active'` at any time (enforced by the Plan Next Year and Archive flows in `createDraftYear.js` / `archiveYear.js`, not by this module).
* At most one year has `status === 'draft'` at any time.
* `archived` years are read-only by convention. `revertArchive` is the only path that flips an `archived` year back to `active`.
* `archivedAt` is the only ISO-timestamp field; `endDate` is date-only. Both are set in `archiveYear` from the same `now`.
* `archiveYear` (the `performYearArchive` flow in `src/utils/planner/archiveYear.js`) **snapshots and rolls back** the metadata blob if a mid-flight failure occurs (M2, May 2026). Whatever Supabase shape replaces this needs an equivalent transaction boundary.
* The legacy `supabase/migrations/20260102000001_initial_schema.sql` constrains `years.status` to `'active'` or `'archived'` — missing `'draft'`. Flagged in `SUPABASE_MIGRATION_PLAN.md` step 2.
* `getCurrentYear` defaults to `1` when the blob is missing; the schema should treat "no rows" as "Year 1, status active, today as startDate" via `initializeYearMetadata`.
* `getArchivedYears` returns most-recent-first; the loader does not need to maintain on-disk order.

### Cross-helper references

* `getYearInfo(yearNumber).startDate` is read by `TacticsPage.handleSendToSystem` and pushed to `plannerStorage.saveStartDate`. Migration must preserve this read path.
* `YearContext.jsx` subscribes to the `yearMetadataStorage` window event and re-derives `currentYear`, `activeYear`, `draftYear`, `allYears` on change.
* `createDraftYearFromActive`, `performYearArchive`, `undoDraftYear`, and `revertArchive` all mutate this blob alongside the year-scoped helpers in stagingStorage, tacticsMetricsStorage, plannerStorage, and tacticsStorage. The Supabase port should reuse the existing flow shapes and only swap internals — the helpers' public API contract is preserved by design.

### Event contract

`saveYearMetadata` dispatches `yearMetadataStorage` with detail `metadata` (the full blob). **Not tagged with `__eventYear`** — this event is inherently global because the blob spans every year. Documented in `CLAUDE.md` as the intentional exception.

### User / year scoping summary

User-scoped via `storageService` prefix. Not year-scoped — by design, this is the index of years.

---

## Summary of fragility flags for the Supabase port

These are the items most likely to need schema design attention. None of them are blockers; flag them collectively for step 2.

1. **`projectNickname` as join key.** Used by `stagingStorage`, `tacticsMetricsStorage.projectWeeklyQuotas[].label`, `tacticsStorage` chip rendering (indirectly, via the staging projects list), and `plannerStorage` task rows (`task.project`, `task.subproject`). Replace with `projects.id UUID`.
2. **`"H.MM"` string time format.** Used throughout `tacticsMetricsStorage` and in `plannerStorage` task rows (`timeValue`, `day-{n}`). Normalise to integer minutes in Supabase.
3. **Boolean-as-string in plannerStorage.** `showRecurring`, `showSubprojects`, `showMaxMinRows`, `size-scale`, `total-days` are stored via `setItem` (raw string) not `setJSON`. Convert on the way in.
4. **Two-layer live vs sent state.** `tacticsMetricsStorage` and `tacticsStorage.chips` each have a `live` key and a `sent-*` key. Pick one of: boolean flag + partial unique index, or parallel `*_sent` tables. The migration plan currently recommends the flag approach.
5. **`tactics_chips.column_index` range.** Project-column chips set `columnIndex >= DAY_COLUMN_COUNT` (typically `7+`). The legacy schema's `CHECK (column_index BETWEEN 0 AND 6)` will reject them.
6. **`tactics-column-widths-{N}` key naming.** The only key in `tacticsStorage` that uses `{N}` as a suffix rather than `year-{N}` infix. Worth folding into the year settings row in Supabase rather than carrying the anomaly forward.
7. **Calendar-header task rows.** The first seven rows of `task-rows` are calendar metadata, not tasks. Either keep them in `planner_rows` with a `row_kind` discriminator, or derive them server-side from `years.startDate` + `years.totalDays`.
8. **Archive snapshot rows in `task-rows`.** `handleArchiveWeek` writes archive snapshots into the same `task-rows` blob using `_rowType: 'archive*'` and `archiveWeekLabel` markers. Consider a dedicated `archived_weeks` table.
9. **Row metadata non-enumerable trick in stagingStorage.** The wrap/unwrap pattern around `cells` + `_rowType`/`_pairId`/`_sectionType`/`_isTotalRow` must round-trip exactly or the Goal page section logic breaks.
10. **`yearMetadata.archiveYear` rollback.** The May 2026 M2 fix relies on a synchronous in-memory snapshot/restore. The Supabase equivalent needs an explicit transaction.

## Custom events summary

| Event | Source helper | Listeners | `__eventYear` tagged? |
|---|---|---|---|
| `staging-state-update` | `stagingStorage` | TacticsPage (Plan), `useProjectsData` (System), `useStorageSync` | yes |
| `tactics-metrics-state-update` | `tacticsMetricsStorage` | none | yes |
| `tactics-chips-state-update` | `tacticsStorage` | `useTacticsChips` (System) | yes |
| `tactics-settings-state-update` | `tacticsStorage` | none | yes |
| `tactics-send-to-system` | TacticsPage (via `tacticsStorage` timestamp marker) | `ProjectTimePlannerV2` (System) | yes |
| `planner-start-date-update` | `plannerStorage` | `usePlannerStorage` | no — payload carries `yearNumber` directly |
| `yearMetadataStorage` | `yearMetadataStorage` | `YearContext` | no — inherently global |
