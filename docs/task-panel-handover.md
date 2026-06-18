# Task Row Side Panel — Handover

## Implementation status (as of June 2026)

### Done
- `src/contexts/TaskRowPanelContext.jsx` — context holding `selectedTask`, `openPanel`, `closePanel`. Listens for `task-row-detail-open` custom event.
- `src/components/planner/TaskRowPanel.jsx` — exports `TaskDetailContent`: inner slide pair (task detail main + history sub-view). Shell only for notes and history.
- `src/components/SystemPanel.jsx` — hosts the outer slide (`system content ↔ task detail`). Auto-opens when a task is selected. Escape key navigates back before closing.
- `src/components/Layout.jsx` — `TaskRowPanelProvider` wraps the tree.
- `src/components/planner/rows/TaskRow.jsx` — single left-click on the `task` column cell dispatches `task-row-detail-open` with `row.original`.
- `src/components/planner/DropdownCell.jsx` — `PILLBOX_COLORS` is now a named export so panel chips stay in sync with table chips.
- Recurring toggle chip is fully wired: toggles local state + dispatches `updateTaskField` via `system-panel-action`, which calls `handleEditComplete` in `ProjectTimePlannerV2.jsx` and saves to Supabase.

### Done (2026-06-17 — session 2)
- `supabase/migrations/20260617000001_task_panel_columns.sql` — adds `notes`, `task_created_at`, `completion_count`, `last_completed_at` to `planner_rows`; creates `task_events` table with RLS.
- `src/utils/planner/storage.js` — `FIRST_CLASS_KEYS` updated; `plannerRowPayloadToDb` and `plannerRowDbToPayload` round-trip all four new columns (camelCase in JS, snake_case in DB). New exports: `saveTaskNote`, `writeTaskEvent`, `readTaskEvents`.
- `src/contexts/PagePanelContext.jsx` — `open`, `close`, `toggle` now memoized with `useCallback` so `SystemPanel`'s auto-open `useEffect` dep array stays stable.
- `src/components/planner/TaskRowPanel.jsx` — camelCase property names fixed (`taskCreatedAt`, `completionCount`, `lastCompletedAt`) to match what `plannerRowDbToPayload` returns.

### Done (2026-06-17 — session 3)
- **Status history** — `readTaskEvents` called when panel opens and when task changes. Preview shows 3 most recent; "See all N changes" button slides to history sub-view with full list. Count is live from DB.
- **`writeTaskEvent` wiring** — called from `useEditState.ts` (`handleEditComplete`) for every status change (including Abandoned/Skipped special path) and task name changes. Also called from `useComputedDataV2.ts` for computed auto-transitions (e.g. `'-' → 'Scheduled'`) that never go through `handleEditComplete`. Each write dispatches `TASK_ROW_DETAIL_RELOAD_HISTORY_EVENT` after the DB write resolves to avoid a race where `readTaskEvents` fires before the new row is committed.
- **`HeaderStatusChip`** — updates immediately when the selected task's status changes in the table (via `TASK_ROW_DETAIL_UPDATE_EVENT` dispatched from `ProjectTimePlannerV2` chip-sync effect and from `handleEditComplete`).
- **Recurring completion tracking** — `completion_count` and `last_completed_at` incremented optimistically in local state when status → Done on a recurring task (`useEditState.ts`). DB increment via `increment_completion_count` RPC with manual read-increment-write fallback. Panel recurring block reflects updated count immediately via `TASK_ROW_DETAIL_UPDATE_EVENT`.
- **Notes** — textarea saves on a 800ms debounce as you type; blur flushes immediately. `saveTaskNote` does a direct `UPDATE planner_rows SET notes` (bypasses the full row replace). `updateTaskField` event also dispatched on save so local `data` state stays in sync and notes survive task navigation within the session.
- **Notes — chip tasks** — chip task IDs (`chip-task-<chipId>`) are not valid UUIDs and have no stable DB row, so `saveTaskNote` routes them to `localStorage` instead (key `listical-chip-note-<chipId>`). `loadChipTaskNote` is called at both chip task row creation sites in `ProjectTimePlannerV2.jsx` so notes are restored when chip rows are rebuilt.
- **Notes — legacy `row-N` IDs** — old rows created before the UUID migration still have `row-N` IDs in local state. The UUID guard in `saveTaskNote` was changed to a chip-task prefix check so `row-N` rows are now allowed to attempt a DB save. After the next save+reload cycle their IDs become proper UUIDs and everything works normally.

### Shell only (needs wiring)
- **Created date + age pill** — `task_created_at` column exists in DB. Stamping not yet wired: on every task name save in `useEditState.ts`, if `task_created_at` is null and the new value is non-empty, stamp it (update the row + write a synthetic `task_events` row or just use the column directly). The "Created" entry in the full history sub-view is hardcoded/absent — needs to be rendered as the final list item using `task_created_at` with an age pill and a grey "Created" chip.
- **Status event notes** — `note` column exists on `task_events`. No UI to enter it yet. Spec says: prompt for an optional note when status is set to Blocked or On Hold. Low priority.

---

## What this is

A fixed 320px side panel that opens when a task row is selected on the System page. Slides between a main view and a full history sub-view.

---

## Scope: In and Out

**In**
- Notes (free-text field, saved per task)
- Status change history (with optional per-event note, shown as a timeline)
- Task name change history (same `task_events` table)
- Date created + age (surfaced as the final "Created" entry in full history)
- Recurring block: `completion_count` badge + `last_completed_at`

**Out (for now)**
- Days at current status
- Linked goal / dependency
- Archive Week completion nudge
- Multi-row day entries (needs its own status model first — nested dropdowns under consideration)

---

## UI structure (matches `listical_task_row_panel.html`)

### Main view
- **Header:** task name, project / subproject, status chip, recurring toggle chip
- **Notes section:** textarea, saves to task row
- **Status history preview:** 3 most recent events + "See all N changes" button that slides to history sub-view

### History sub-view (slides in from right)
- Back button → "Task detail"
- Full chronological event list, oldest at bottom
- Bottom entry is always "Created" with the age pill inline
- **Recurring block** at the bottom (only shown when recurring toggle is active): completions count badge + last completed date

### Recurring toggle (header chip)
- Active state: green, checkmark icon — recurring block visible
- Inactive state: grey, + icon — recurring block hidden
- Toggling this also controls `recurring` field on the task row

---

## Data model

### New Supabase table: `task_events`

| column | type | notes |
|---|---|---|
| `id` | uuid | PK |
| `task_id` | uuid | FK to task row |
| `user_id` | uuid | FK to profiles |
| `field` | text | `'status'` or `'task_name'` |
| `old_value` | text | nullable (null on first status set) |
| `new_value` | text | |
| `note` | text | nullable, user-entered (e.g. on Blocked) |
| `changed_at` | timestamptz | default now() |

Index on `task_id`. RLS: user can only read/write their own rows.

### New columns on task rows table

| column | type | notes |
|---|---|---|
| `notes` | text | nullable |
| `task_created_at` | timestamptz | nullable — stamped when task name is first entered, NOT on row insert |
| `completion_count` | int | default 0, recurring tasks only |
| `last_completed_at` | timestamptz | nullable, recurring tasks only |

Note: `task_created_at` is a separate column from Supabase's built-in `created_at` because rows are created empty and sit nameless for an indeterminate period. The "born" moment is when the task name is first typed.

---

## Key architecture decisions

### Storage
All reads/writes go through `plannerStorage` (`src/utils/planner/storage.js`). Do not call Supabase directly from components or the panel.

### When to write a `task_events` row
- On every status change (via the existing status dropdown)
- On task name change (debounced, only write when value actually differs)
- Do NOT write an event for the weekly recurring reset — that is a mechanical operation, not a user action

### When to stamp `task_created_at`
- Check on every task name save: if `task_created_at` is null and the new value is non-empty, stamp it now

### Recurring completion tracking
- Increment `completion_count` and stamp `last_completed_at` when status changes **to Done** on a recurring task
- This happens at status change time, not at Archive Week time
- `resetRecurringTasks` in `src/utils/planner/archiveHelpers.js` (line 475) is the reset — by the time it runs, the count is already updated

### Status event notes
- The note field is optional and only meaningful on certain statuses (Blocked, On Hold)
- Prompt for a note at the moment the user selects one of those statuses — do not require it
- Stored as `note` on the `task_events` row, not on the task itself

### Non-recurring completed-at
- Non-recurring tasks do not get a dedicated `completed_at` column
- Completed date is read from the `→ Done` event timestamp in `task_events`

### Panel header fallbacks
- If a task has no project assigned, omit the project/subproject line entirely rather than rendering empty or placeholder text
- If a project exists but no subproject, show project name only (no slash separator)

### "Created" history entry
- Rendered as the final item in the full history list
- Timestamp = `task_created_at`, age pill = `now() - task_created_at`
- Uses a neutral grey spine dot and an "Inbox" chip labelled "Created"

---

## Files remaining to touch

- `src/hooks/planner/useEditState.ts` — stamp `task_created_at` when task name is first saved (if `task_created_at` is null and new value is non-empty, include it in the command's `setData` update and write it to the DB)
- `src/components/planner/TaskRowPanel.jsx` — render "Created" as the final entry in the full history sub-view, using `selectedTask.taskCreatedAt` with an age pill and a grey "Created" chip

## Files already touched

- `src/utils/planner/storage.js` ✅ — `saveTaskNote`, `writeTaskEvent`, `readTaskEvents`, `saveChipTaskNote`, `loadChipTaskNote`
- `src/hooks/planner/useEditState.ts` ✅ — `writeTaskEvent` on status + task name changes; recurring completion optimistic update
- `src/hooks/planner/useComputedDataV2.ts` ✅ — `writeTaskEvent` for computed auto-transitions
- `src/pages/ProjectTimePlannerV2.jsx` ✅ — chip-sync effect dispatches `TASK_ROW_DETAIL_UPDATE_EVENT`; `loadChipTaskNote` injected at both chip row creation sites
- `src/contexts/PagePanelContext.jsx` ✅
- `src/components/planner/TaskRowPanel.jsx` ✅ — notes debounce, history wiring, status chip, recurring block
- `src/components/SystemPanel.jsx` ✅
- `src/components/planner/rows/TaskRow.jsx` ✅
- `src/contexts/TaskRowPanelContext.jsx` ✅ — exports `TASK_ROW_DETAIL_EVENT`, `TASK_ROW_DETAIL_UPDATE_EVENT`, `TASK_ROW_DETAIL_RELOAD_HISTORY_EVENT`
- `src/components/Layout.jsx` ✅
- `supabase/migrations/20260617000001_task_panel_columns.sql` ✅
- `src/utils/planner/archiveHelpers.js` — no changes needed
