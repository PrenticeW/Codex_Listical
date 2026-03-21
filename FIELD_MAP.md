# FIELD_MAP.md — Codex Listical Data Flow Reference

---

## Part 1: Project Object (originates on Goals / StagingPageV2)

### Source files
- **Written by:** `useShortlistState.js` → `saveStagingState()` → `staging-year-N-shortlist` localStorage key
- `planSummary` is computed by `buildProjectPlanSummary()` in `planTableHelpers.js` and attached at save time

### Project object field table

| Field name | Written by (Goals) | Used by Tactics — what for | Used by System — what for | Notes |
|---|---|---|---|---|
| `id` | `crypto.randomUUID()` on `handleAdd` | `highlightedProjects[].id` — used as chip `projectId` key, lookup key in `scheduleLayout.scheduleItemsByProject`, chip ID prefix for schedule chips | Not read directly from staging | Primary key for everything |
| `text` | User input string | Fallback label if `projectNickname` and `projectName` are both empty (`project.text || 'Project'`) | Not read | Original raw input; rarely used in practice |
| `color` | `pickProjectColour()` on add; user can change via colour editor | `highlightedProjects[].color` — chip background colour in Tactics grid | `useProjectsData` does not read colour; but `ProjectRow.jsx` uses colour stored in task rows (not staging directly) | Colour lives on the project object; Tactics reads it; System never reads it from staging |
| `projectName` | User-editable field in Goals UI | `label` fallback: `nickname \|\| projectName \|\| text` | `useProjectsData` → `projectNamesMap[key] = fullProjectName`; used in dropdown display | Full display name |
| `projectNickname` | User-editable field in Goals UI | Primary `label` used for chip display and stored in `projectWeeklyQuotas[].label` | `useProjectsData` → key used as `projectKey`; `ProjectRow` looks up quotas by `projectNickname` | **Critical join key** between Tactics and System — quota map is keyed by nickname; ProjectRow looks up by nickname |
| `planTableVisible` | Set `true` on add | Not read | Not read | UI-only toggle for showing/hiding the plan table on Goals page |
| `planTableCollapsed` | Set `false` on add; toggled by `togglePlanTable` | Not read | Not read | UI-only expand/collapse state |
| `hasPlan` | Set `true` on add | Not read | Not read | Legacy/unused flag |
| `isSimpleTable` | Set `true` on add (new items only) | Not read | Not read | Distinguishes new format from old legacy format |
| `addedToPlan` | Set by user via "Add to Plan" button | **Primary filter** — `filter(p => p.addedToPlan === true)` to build `highlightedProjects` | Not read | If `false` or missing, project is invisible to Tactics |
| `showOutcomeTotals` | Optional UI toggle | Not read | Not read | Goals-only display flag |
| `planTableEntries` | Full array of plan table rows (Reasons / Outcomes / Actions / Subprojects / Schedule sections) | Not read directly; consumed only via `planSummary` | Not read directly | Serialised with row metadata (`__rowType`, `__pairId`, `__sectionType`, `__isTotalRow`) by `stagingStorage.js` |
| `planReasonRowCount` | Legacy row count | Not read | Not read | Kept for backward-compat migration via `ensurePlanPairingMetadata` |
| `planOutcomeRowCount` | Legacy row count | Not read | Not read | Same |
| `planOutcomeQuestionRowCount` | Legacy row count | Not read | Not read | Same |
| `planNeedsQuestionRowCount` | Legacy row count | Not read | Not read | Same |
| `planNeedsPlanRowCount` | Legacy row count | Not read | Not read | Same |
| `planSubprojectRowCount` | Legacy row count | Not read | Not read | Same |
| `planXxxRowCount` | Legacy row count | Not read | Not read | Same |
| `planSummary` | Computed by `buildProjectPlanSummary()` and attached at every save | `highlightedProjects[].planSummary` → passed to `buildScheduleLayout()` which reads `planSummary.subprojects[]{name, timeValue}` to build schedule chip rows | `useProjectsData` reads `planSummary.subprojects[].name` for subproject dropdown options | Computed field; not stored in state directly — rebuilt on every save |
| `planSummary.subprojects` | Array of `{name, timeValue}` from Schedule section prompt rows | Used to build schedule chip rows; each item creates a `schedule-chip-{projectId}-{idx}` chip with a duration derived from `timeValue` | `.name` values populate subproject dropdown; `.timeValue` is ignored by System | `timeValue` is H.MM decimal string (e.g. `"1.30"`) |
| `planSummary.needsPlanTotalMinutes` | Sum of Actions section response row `TIME_VALUE` cells (minutes) | Not read | Not read | Available in the summary object but neither consumer reads it |
| `planSummary.scheduleTotalMinutes` | Sum of Schedule section time values (minutes) | Not read directly — duration is derived per-chip from `subprojects[].timeValue` | Not read | Aggregate version of the per-subproject values |
| `planSummary.totalHours` | `needsPlanTotalMinutes + scheduleTotalMinutes` formatted as H.MM | Not read | Not read | Summary total; neither page reads it |

---

### Fields Goals writes that neither Tactics nor System reads

| Field | Reason it's orphaned |
|---|---|
| `text` | Superseded by `projectName` / `projectNickname` in practice |
| `planTableVisible` | Goals UI state only |
| `planTableCollapsed` | Goals UI state only |
| `hasPlan` | Appears unused everywhere outside Goals |
| `isSimpleTable` | Format flag; not checked outside Goals |
| `showOutcomeTotals` | Goals UI state only |
| `planReasonRowCount` … `planXxxRowCount` (7 legacy fields) | Only used by `ensurePlanPairingMetadata` migration on Goals page mount |
| `planSummary.needsPlanTotalMinutes` | Computed but never consumed |
| `planSummary.scheduleTotalMinutes` | Aggregate; Tactics uses per-item values instead |
| `planSummary.totalHours` | Computed but never consumed |

---

### Fields Tactics or System need but aren't receiving

| Missing field | Which page needs it | What for |
|---|---|---|
| `color` (on project) | System | ProjectRow uses colour stored on task-row data (not from staging), so if a project's colour changes on Goals the old colour in planner rows is never updated |
| `projectName` ↔ `projectNickname` rename notification | System | `useProjectsData` re-reads on STAGING_STORAGE_EVENT but planner task rows store the old name as a string value — there's no migration when a name changes |
| `planTableEntries` (full row content) | System | Actions / Outcomes text (the "why" behind tasks) is never visible in System; there's no way to pre-populate task rows from Goals plan content |
| `planSummary.needsPlanTotalMinutes` / `.totalHours` | Tactics | Tactics computes `projectWeeklyQuotas` from actual chip block durations, not from the Goals-planned total; Goals' time estimate for a project is never surfaced in Tactics |

---

## Part 2: Tactics Output Data (originates on TacticsPage, consumed by System)

### Source files
- **Metrics storage:** `tacticsMetricsStorage.js` → `tactics-year-N-metrics-state`
- **Chips storage:** inline `saveTacticsChipsState` / `loadTacticsChipsState` in `TacticsPage.jsx` → `tactics-year-N-chips-state`
- **Settings storage:** inline `saveTacticsSettings` → `tactics-page-settings` (not year-scoped)
- **Column widths:** direct `storage.setJSON` → `tactics-column-widths-N`

---

### Metrics state object (`tactics-year-N-metrics-state`)

| Field name | Storage key it lives in | Written by Tactics — what for | Read by System — what for | Notes |
|---|---|---|---|---|
| `projectWeeklyQuotas` | `tactics-year-N-metrics-state` | Array of `{id, label, weeklyHours}` — total minutes per project per week derived from chip block durations | `useTacticsMetrics` converts to `Map<label, weeklyHours>`; `ProjectRow` displays quota vs actual total for each project header row | `weeklyHours` is H.MM decimal (e.g. `5.30` = 5h 30m). Keyed by `label` (= nickname). `id` is stored but System ignores it |
| `projectWeeklyQuotas[].id` | same | Project `id` for reference | **Never read** by System | Stored but unused on consumption side |
| `projectWeeklyQuotas[].label` | same | Project nickname / label string | Map key used by `ProjectRow.projectWeeklyQuotas.get(projectNickname)` | Must match `projectNickname` exactly; mismatch silently produces 0 quota |
| `projectWeeklyQuotas[].weeklyHours` | same | Decimal hours total for the week | Displayed in project header row as "quota" | H.MM format |
| `dailyBounds` | `tactics-year-N-metrics-state` | Array of `{day, dailyMaxHours, dailyMinHours}` — available and working hours per day of week | `useTacticsMetrics` → `mapDailyBoundsToTimeline()` maps day names to timeline dates → `dailyMinValues[]` and `dailyMaxValues[]` passed as column metadata | `day` is full day name (e.g. `"Monday"`) |
| `dailyBounds[].day` | same | Day name string | Used as lookup key in `mapDailyBoundsToTimeline` | Must match JS `toLocaleDateString('en-US', {weekday:'long'})` output |
| `dailyBounds[].dailyMaxHours` | same | Available hours (sleep subtracted) for the day | `dailyMaxValues[]` per timeline column | H.MM decimal |
| `dailyBounds[].dailyMinHours` | same | Working (non-buffer) hours for the day | `dailyMinValues[]` per timeline column | H.MM decimal |
| `weeklyTotals` | `tactics-year-N-metrics-state` | `{availableHours, workingHours}` — week-level aggregates | **Never read** by System (`useTacticsMetrics` only extracts `dailyBounds` and `projectWeeklyQuotas`) | Saved to storage but no consumer reads it |
| `weeklyTotals.availableHours` | same | Total available hours for the week | **Never read** | Same as sum of `dailyBounds[].dailyMaxHours` |
| `weeklyTotals.workingHours` | same | Total working hours for the week | **Never read** | Same as sum of `dailyBounds[].dailyMinHours` |

---

### Chips state object (`tactics-year-N-chips-state`)

| Field name | Storage key it lives in | Written by Tactics — what for | Read by System — what for | Notes |
|---|---|---|---|---|
| `projectChips` | `tactics-year-N-chips-state` | Array of chip objects (see sub-fields below) — full schedule state | **Never read by System** | System has no access to chips state at all |
| `projectChips[].id` | same | Unique chip ID; `sleep-N`, `schedule-chip-{projId}-{idx}`, or arbitrary generated ID | — | Prefix determines chip type |
| `projectChips[].columnIndex` | same | Which day column (0 = first displayed weekday) the chip occupies | — | |
| `projectChips[].startRowId` | same | Timeline row ID where the chip starts (e.g. `"hour-9"`, `"sched-0"`) | — | |
| `projectChips[].endRowId` | same | Timeline row ID where the chip ends | — | May equal `startRowId` for single-cell chips |
| `projectChips[].projectId` | same | Project ID this chip represents (`"sleep"`, `"buffer"`, `"rest"`, or a project UUID) | — | |
| `projectChips[].displayLabel` | same | Optional custom label override for the chip | — | |
| `projectChips[].hasScheduleName` | same | Whether chip has a name differing from the default schedule item name | — | |
| `projectChips[].durationMinutes` | same | Stored duration (minutes) used when recalculating spans after increment changes | — | Set on increment change to preserve duration |
| `projectChips[].startMinutes` | same | Clock time in minutes (0–1439) used when recalculating position after increment changes | — | Set on increment change |
| `customProjects` | `tactics-year-N-chips-state` | Array of `{id, label, color}` — projects added directly in Tactics without being on Goals shortlist | **Never read by System** | `id` prefixed `custom-{timestamp}-{seq}` |
| `customProjects[].id` | same | Unique ID for the custom project | — | |
| `customProjects[].label` | same | Display label (stored uppercase) | — | |
| `customProjects[].color` | same | Hex colour string | — | |
| `chipTimeOverrides` | `tactics-year-N-chips-state` | `{[chipId]: minutes}` — manual duration overrides for schedule chips whose `planSummary.timeValue` is sub-increment | **Never read by System** | Used within Tactics to correct durations for short items |

---

### Tactics settings (`tactics-page-settings`, not year-scoped)

| Field name | Storage key | Written by Tactics | Read by System |
|---|---|---|---|
| `startHour` | `tactics-page-settings` | Grid start time | Never |
| `startMinute` | same | Grid end time | Never |
| `incrementMinutes` | same | Row height unit in minutes | Never |
| `showAmPm` | same | AM/PM display toggle | Never |
| `use24Hour` | same | 24h format toggle | Never |
| `startDay` | same | First day of week | Never |

---

### Tactics column widths (`tactics-column-widths-N`, year-scoped)

| Field name | Storage key | Written by Tactics | Read by System |
|---|---|---|---|
| `(array of numbers)` | `tactics-column-widths-N` | Column pixel widths | Never |

---

### Fields Tactics writes that System never reads

| Field | Storage object | Comment |
|---|---|---|
| `weeklyTotals` (entire object) | metrics state | Saved but `useTacticsMetrics` only extracts `dailyBounds` and `projectWeeklyQuotas` |
| `weeklyTotals.availableHours` | metrics state | Same |
| `weeklyTotals.workingHours` | metrics state | Same |
| `projectWeeklyQuotas[].id` | metrics state | Stored; System keys the map by `.label` only |
| Entire `chips-state` blob | chips state | System has no hook or import for `tactics-year-N-chips-state` |
| `projectChips` (all sub-fields) | chips state | Not read by System |
| `customProjects` (all sub-fields) | chips state | Not read by System |
| `chipTimeOverrides` | chips state | Not read by System |
| All settings fields | `tactics-page-settings` | Tactics-only |
| Column widths array | `tactics-column-widths-N` | Tactics-only |

---

### Fields System needs from Tactics but isn't receiving

| Missing data | Where it should come from | Why System needs it |
|---|---|---|
| Per-project, per-day actual scheduled minutes | `projectChips` (chips state) | System shows quota vs. actual totals by project but can only calculate totals from task rows the user manually fills in — the real schedule from Tactics (how many hours are blocked per project per day) is never exposed |
| `customProjects` list with colours | chips state | System's project dropdown only shows staging projects; custom Tactics-only projects (added directly in TacticsPage) are invisible in System |
| `weeklyTotals.availableHours` / `.workingHours` | metrics state | These are already saved; they could inform System's capacity bar but the hook simply doesn't read them |

---

## Part 3: Gaps Summary

### Data that exists somewhere but never reaches where it's needed

1. **`planSummary.totalHours` / `.needsPlanTotalMinutes` / `.scheduleTotalMinutes`**
   Goals computes a total planned-hours figure for every project and stores it in `planSummary`. Neither Tactics nor System ever reads these totals. Tactics does its own duration calculation from chip blocks; System has no concept of a planned estimate at all. The Goals-authored time estimate for a project is captured and then thrown away.

2. **`weeklyTotals` (metrics state)**
   TacticsPage calculates total available and working hours for the week and saves them to the metrics object. `useTacticsMetrics` only extracts `dailyBounds` and `projectWeeklyQuotas` from the same object; the weekly aggregate fields are never unpacked or used anywhere.

3. **`projectWeeklyQuotas[].id`**
   The project `id` is stored alongside `label` and `weeklyHours` in each quota entry. System only ever looks up quotas by `label` (nickname), so the `id` is saved for nothing.

4. **Entire chips state** (`projectChips`, `customProjects`, `chipTimeOverrides`)
   This is the richest data Tactics produces — every chip's position, project, duration, and override. Nothing outside TacticsPage reads it. System cannot see how the week was actually scheduled; it only sees the weekly total (`weeklyHours` in metrics), not the daily breakdown per project.

5. **`customProjects` in Tactics**
   Projects created directly inside Tactics are saved in the chips state but are invisible to System's project dropdown, which only reads from staging. Tasks logged against a custom Tactics project cannot be assigned to the correct project in System.

6. **`color` on the project object (staging)**
   Goals writes and updates each project's colour. Tactics reads it correctly for chip display. System never reads colour from staging; `ProjectRow` instead relies on colour that was baked into task-row data when rows were created. If a user changes a project's colour on Goals, System rows keep the old colour indefinitely.

---

### Data that should logically exist but isn't captured anywhere

1. **Chip-level hours per project per day**
   Tactics computes `projectColumnTotals` (a Map of `projectId → number[]` of per-day minutes) internally but never serialises this to storage. System cannot know that Monday had 2 h on Project A and 3 h on Project B; it only knows the weekly sum. A per-day breakdown would allow System to compare task-row estimates against the scheduled time for each day.

2. **Progress / completion feedback from System → Goals**
   System task rows have status values (e.g. Done) and time values, but there is no mechanism to propagate completion back to Goals' Outcomes/Actions sections. Goals' plan tables are write-only from Goals' perspective.

3. **Progress / completion feedback from System → Tactics**
   Tactics shows a quota (hours planned) vs. nothing (no actuals from System). A "hours logged" field aggregated from System task rows could be surfaced in the Tactics quota column as a burn-down, but no such field is captured or routed.

4. **Year-start pre-population of System rows from Goals structure**
   When a year is archived and a new one starts, `archiveYear.js` clears staging for the new year but does not seed System planner rows with the subproject structure from Goals. Every year the user manually rebuilds their task rows from scratch.

---

### Naming mismatches between pages

| Concept | Name in Goals / staging | Name in Tactics | Name in System |
|---|---|---|---|
| Project short label | `projectNickname` (field on item) | `label` (in `highlightedProjects[]` and `projectWeeklyQuotas[]`) | `projectNickname` (on planner task rows) |
| Project full name | `projectName` | Not used | `projectName` (on planner task rows) |
| Per-day available hours | `planSummary.scheduleTotalMinutes` (aggregate) | `availableColumnTotals[idx]` (array) → `dailyMaxHours` in metrics | `dailyMaxValues[idx]` (from `mapDailyBoundsToTimeline`) |
| Per-day working hours | Not present | `workingColumnTotals[idx]` → `dailyMinHours` in metrics | `dailyMinValues[idx]` |
| Sub-items of a project | `planSummary.subprojects[]{name, timeValue}` (from Schedule section) | `scheduleItems` (alias checked first in `buildScheduleLayout`) then falls back to `subprojects` | `subprojects[]` (from `useProjectsData` → `projectSubprojectsMap`) |
| Chip duration | `timeValue` (H.MM string on `planSummary.subprojects[]`) | `durationMinutes` (number, stored on chip after increment change); `chipTimeOverrides[chipId]` (number, minutes) | Not present |
| Weekly hours target | `planSummary.totalHours` (H.MM string) | `weeklyHours` in `projectWeeklyQuotas[]` (H.MM decimal number) | `rawQuota` in `ProjectRow` → formatted as `formattedQuota` |
