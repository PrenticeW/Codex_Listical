# Status Manager Spec (v1 test run)

Editable status chips: a "Manage Statuses" panel plus the plumbing that makes
statuses data instead of hardcoded constants. Design handoff:
`design_handoff_manage_statuses/` (PanelShell + ChipEditorUI reuse, screenshots
in that bundle). This doc is the source of truth for decisions and progress —
update the checklist as work lands.

## Decisions (agreed with Prentice, 2026-08-31)

1. **All current statuses appear in the panel**: Not Scheduled, Scheduled,
   Done, Blocked, On Hold, Abandoned, Skipped, Accounted, Special.
   `-` stays hidden as the blank default (non-listed).
2. **Locked (undeletable)**: `-` (hidden), `Not Scheduled`, `Scheduled`
   (auto-assigned by time-value logic), `Done` (checkbox / archive targets).
   Everything else — Blocked, On Hold, Abandoned, Skipped, Accounted,
   Special — is deletable, as are user-created statuses. Lock = "the app
   needs this to function", not "shipped with the app".
3. **Static IDs**: statuses are stored records keyed by a stable id; task rows
   store the id. Migration trick: existing statuses use their current label
   string as their id ("Done", "Blocked"…), so no row data migration is
   needed. New custom statuses get generated ids; labels are display-only.
4. **No rename of locked built-ins**; custom + unlocked statuses can be
   renamed freely (safe because rows store ids).
5. **Archive toggle = "finished"**: one flag (`archive_sweep`) drives both the
   Archive Week sweep AND terminal semantics for Multi rows. Seeded on:
   Done, Abandoned, Accounted (current ARCHIVE_SWEEP_STATUSES); Skipped also
   seeds on (it is terminal today) — confirm with Prentice if that changes
   sweep behaviour undesirably.
6. **Soft delete**: deleted statuses keep their record with `active=false` so
   archived weeks still render name + colour. Grey fallback only for labels
   with no record at all. Colour edits are retroactive everywhere (colour
   lives on the status, not the row).
7. **Delete flow**: unused → delete immediately; in use → dialog with
   "Reassign to" picker (default Not Scheduled). Reassignment sweeps live
   rows' `status` AND `multiStatus-<n>` keys. Archived weeks untouched.
8. **Storage**: per-user `statuses` table (follows the user into new years),
   RLS-protected. Columns: id text, user_id, label, bg, sort_order,
   archive_sweep bool, built_in bool, locked bool, active bool.
   Text colour always derived from bg (ceContrast); only bg stored.
9. **Sort targets** for custom statuses: archive_sweep on → 'general',
   off → 'unscheduled' (mirrors today's mapping closely; Blocked/On Hold/
   Skipped keep 'unscheduled' via their records).

## Hardcoded sets being replaced (all become lookups on status records)

- `STATUS_VALUES` / dropdown lists — src/constants/planner/rowTypes.js,
  src/components/planner/DropdownCell.jsx, MultiStatusDropdownCell.jsx
- `STATUS_COLOR_MAP` / PILLBOX colours — rowTypes.js, plannerConstants.js,
  DropdownCell.jsx
- `TERMINAL_STATUSES` — src/utils/planner/multiStatus.js (→ archive_sweep)
- `ARCHIVE_SWEEP_STATUSES` — src/utils/planner/archiveHelpers.js
- `EXCLUDED_STATUSES` (year import) — importTasksFromYear.js (→ archive_sweep)
- Sort maps — sortInbox.ts, sortPlanner.ts, archiveHelpers.js:512
- `SORTABLE_STATUSES` / `SORT_STATUSES` — plannerConstants.js,
  SystemPanel.jsx:331, ProjectTimePlannerV2.jsx
- `PROTECTED_STATUSES` — plannerConstants.js (superseded by locked flag)
- `manualStatuses` — useComputedDataV2.ts:120

## Progress checklist

- [x] Spec written (this file)
- [x] Explore existing patterns (planner_settings sync, contexts, panels)
- [x] Supabase migration: statuses table + RLS
      (supabase/migrations/20260831000001_statuses_table.sql; client-side
      seed in statusesStorage.loadStatuses — NOT yet applied to the project:
      run `supabase db push` / apply in dashboard)
- [x] Status store: src/lib/statusesStorage.js (registry + CRUD + soft
      delete), src/hooks/useStatuses.js; load kicked from AuthContext
- [x] Data-driven refactor: multiStatus.js, archiveHelpers.js, sortInbox.ts,
      sortPlanner.ts, importTasksFromYear.js, useComputedDataV2.ts,
      rowDataTransformers.js, plannerStyles.js, DropdownCell.jsx (dynamic
      options + PILLBOX_COLORS proxy), MultiStatusDropdownCell, TaskRow,
      TaskRowPanel, FilterPanel, SystemPanel SortSection
- [x] Manage Statuses panel: src/components/ManageStatusesPanel.jsx, opened
      from a new "Statuses" card in the System panel; chip editor extracted
      to src/components/ChipEditorView.jsx (shared with PlanPanel)
- [x] Delete/reassign flow: 'reassignStatus' action in
      ProjectTimePlannerV2 sweeps row.status + multiStatus-<n> keys on live
      rows, then soft delete
- [x] Vite build green; vitest 70/70 green; eslint clean on new files
- [ ] Apply the migration to Supabase (db push) before testing in-app
- [ ] Manual QA pass (see Known gaps)

## Deviations from the design handoff / legacy behaviour

1. **Chip editor slides within the tray** (GoalPanel/SystemPanel pattern)
   instead of a second side-by-side PanelShell — PanelShell anchors to the
   right edge and doesn't support side-by-side stacking.
2. **Delete always shows the reassign dialog**, even for unused statuses
   (the panel has no cheap "in use" count without asking the planner).
   Harmless: reassigning nothing is a no-op.
3. **Skipped now sweeps into week archives** (its terminal flag merged into
   archive_sweep). Toggle it off in the panel to restore the old sweep
   behaviour (which then also makes it non-terminal for Multi rows).
4. **Sort Planner now files Accounted/Special rows** (legacy
   SORT_PLANNER_TARGET_MAP silently skipped statuses missing from its map;
   getSortTarget always answers).
5. Seeded chips keep their original tinted text colours while their bg is
   unchanged; recoloured/custom chips derive black/white text from bg.
6. **Reassignment is not undoable** (plain setData, not a command) — v1.
7. Archive-header and lock tooltips use the styled dark bubble (Tip in
   ManageStatusesPanel, pattern from staging/TableRow.jsx), per the handoff.

## Known gaps / follow-ups

- planner_rows history trigger will record reassignments as ordinary edits.
- Renaming a custom status is instant everywhere (rows store ids), but any
  free-text references (notes etc.) are untouched — expected.
- localStorage-era code paths (plannerStorage.js) untouched; statuses are
  Supabase-only with in-code defaults as fallback.
- No drag-handle keyboard reordering; HTML5 drag only.
