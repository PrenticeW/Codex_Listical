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

### Shell only (needs Supabase)
- Notes textarea — visible but unsaved. Needs `notes` column on `planner_rows`.
- Status history preview + full list — shows "No history yet." Needs `task_events` table.
- "See all N changes" count — hardcoded label. Needs event count from `task_events`.
- Created date + age pill — not shown. Needs `task_created_at` column on `planner_rows`.
- Recurring block (completion count + last completed) — shows zeroes. Needs `completion_count` and `last_completed_at` columns on `planner_rows`.

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

## Files likely touched during implementation

- `src/utils/planner/storage.js` — add event writes, notes save, completion count logic
- `src/utils/planner/archiveHelpers.js` — no changes needed; completion is captured upstream at status change
- `src/pages/ProjectTimePlannerV2.jsx` — wire panel open/close to row selection
- `src/components/SystemPanel.jsx` — main panel component (new or extend existing)
- Supabase migration — new `task_events` table + new columns on task rows table
