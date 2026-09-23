# Implementation brief: "Group selection by" (System page)

Companion to the design bundle (`design_handoff_group_by/`). The bundle's README covers visuals, tokens and states; this brief covers the behaviour decisions and edge cases settled during planning. Where they overlap, the two agree; the bundle wins on visual detail, this brief wins on logic.

## What it is

A one-shot reorder of selected rows in the System spreadsheet (primary use: Inbox; secondary: long lists under a subproject). The user selects a **continuous range of rows** and groups them by **Project**, **Subproject** or **Status**. This is deliberately NOT a persistent view mode: no state is stored, no group header rows are inserted, new/edited rows are never auto-filed, and the app does not remember why rows are in their order. It is a plain reorder, fully reversed by undo.

## Entry points

1. **Row-gutter right-click context menu** — a "GROUP SELECTION BY" section with three options: Project, Subproject, Status. Only shown/usable when rows are selected.
2. **System side panel** — a bento card with the same three options, present for discoverability. Also acts on the current selection only; when nothing is selected it renders greyed out with a "Select rows to group" notice (grey out, never hide).

## Blocking rules

Options are disabled (greyed at opacity 0.42, never hidden) with a single hint line under the section header — one hint, not repeated per option:

1. Selection includes header or subheader rows → "Deselect header rows" (blocks all three).
2. Selection is non-contiguous → "Select a continuous range" (blocks all three). Non-contiguous grouping is out of scope for v1 by decision, not oversight.
3. Subproject only: selected rows span multiple projects → disable Subproject. The design review removed this hint text from the mocks but the logic rule stands (bundle screenshot 07 shows the state). Rationale: subproject ordering is only defined within one project.

## Sort algorithm

Stable sort of the selected rows only, written back into the exact span they occupy. Full tiebreak chain — the chosen field first, then the remaining two fields, then existing order:

- Group by Project → Project, then Subproject, then Status, then current order
- Group by Subproject → Subproject, then Status, then current order (Project is uniform by precondition)
- Group by Status → Status, then Project, then Subproject, then current order

Per-field orders:

- **Project:** alphabetical. (Deliberate v1 choice — if user-defined project ordering from the Goal page lands later, switch to that.)
- **Subproject:** Goal-page order. NOTE: this ordering is per-project. The chain above never compares subprojects across two different projects (Project always sorts first or is uniform), but guard/comment this in code — a cross-project subproject comparison has no defined order.
- **Status:** the order defined in Manage Statuses (side panel).

Rows missing a value for the field being compared sort below rows that have one, at every level of the chain. Known consequence: inside a project cluster, rows with no subproject sink below subprojected ones — accepted (unfiled items drift down in an inbox), revisit if it feels wrong in use.

The final existing-order tiebreak makes the sort fully deterministic and means grouping never scrambles more than it has to.

## After grouping

- Toast, bottom-center: "Grouped by Status" (field name substituted) with an Undo chip; auto-dismiss ~4.5s. Toast Undo restores the exact previous order.
- The reorder is also a normal entry on the undo stack (Cmd+Z reverses it), independent of the toast.
- Optional settle animation: rows translateY to new positions, `.45s cubic-bezier(0.3,0.9,0.35,1)` — see bundle live demo frame.
- No stale-state handling needed: if the user later edits a row's status, it stays where it is until they group again. That is the intended model.

## Sync and mobile compatibility (required)

The feature is web-only for now, but the mobile app syncs against the same data, so the reorder must be invisible to mobile — indistinguishable from a manual drag-reorder. Requirements:

- **Same write path as manual drag-reordering.** One atomic order write plus an inverse op on the undo stack. Do not introduce a second ordering write path, a bulk "replace list order" endpoint, or any new field/flag that records that a grouping happened. If mobile can sync a manual reorder, it can sync this; anything novel breaks that guarantee.
- **Touch only the selected rows' order values.** The write must not rewrite ordering for rows outside the selected span, and must not touch any non-order field on the reordered rows (project, subproject, status, edited-at content timestamps other than what a manual reorder would touch). A grouping is a reorder, never an edit.
- **Read-fresh-then-write.** Compute the sort from current data at the moment of the action and write immediately. Never hold a computed order and apply it later — a deferred apply is exactly the stale-tab replay shape that caused the August overwrites.
- **Undo is a new write, not a replay.** Toast Undo / Cmd+Z must write the restored order as a fresh operation through the same path, not re-send a cached earlier payload, so it also merges correctly against concurrent mobile edits.
- **Verify before shipping:** group rows on web while the mobile app holds fresh unsynced edits to some of those same rows (content edits and its own reorders), then sync both ways. Row content from mobile must survive; order conflicts must resolve by the app's existing last-write rules with no rows lost, duplicated, or reverted. This is the known failure mode for this codebase — test it explicitly.

## State shape (from the design bundle)

- `selection`: row range; contiguity and header detection derived from it
- Per-option enabled/disabled plus a single hint string, derived from selection
- `groupBy(field)`: sort the span per spec, push inverse op to undo stack, show toast
- Toast: `{ label, prevOrder }`, ~4.5s timer

## Out of scope for v1

- Persistent grouping / group header rows / auto-filing
- Non-contiguous selections
- User-defined project ordering as the Project sort key
- Selection count indicator in the side panel card (removed in design review)

---

# Feature 2: Move selection to Planner (UI pending design pass)

A sibling feature sharing the same selection machinery and entry points as Group by. No design mocks exist yet; visuals to follow the existing panel/menu patterns.

## What it is

Moves the selected rows from the Inbox to the Planner using the **exact same code path** as the existing status-filtered move (the `sortInbox` dispatch fired from `SortSection` in `src/components/SystemPanel.jsx`), scoped to the selection instead of a status filter. A move, not a copy; no field changes beyond what the existing move performs. Rows keep their relative order and land wherever the existing move puts them (inherit existing behaviour, no new placement logic).

## Entry points and rules

- **Gutter context menu:** item labelled "Move to Planner", placed at the TOP of the action list (with Duplicate Rows / Delete Rows, deliberately far from Delete). Selection scope is implied by the menu.
- **Side panel:** option labelled "Move selection to Planner", living in the same section as the existing "Move from Inbox to Planner" card (they are two answers to "which rows go to the Planner": by status vs by hand). Greyed with a "Select rows to move" notice when nothing is selected, same empty-state pattern as the Group card.
- **Non-contiguous selections are allowed** (unlike Group by — the two menu items have different disabled rules, which is intentional). Header/subheader rows in the selection are skipped silently rather than blocking.
- Toast on completion ("3 tasks sent to Planner" with Undo); undo restores rows to their original Inbox positions and is also a normal undo-stack entry.

## Sync note

Because this reuses the existing move path unchanged, mobile compatibility is inherited — do not write a new move routine. Order writes follow the order_key rules in CLAUDE.md (rewrite keys only for rows that move, never renumber).

## Related copy fix (small, do alongside)

In the existing "Move from Inbox to Planner" card (`SortSection`, SystemPanel.jsx): the action button currently reads "Sort", which is wrong — nothing sorts; rows are moved. Change the button label to **"Move statuses to Planner"** (disabled state unchanged: no statuses checked). Interim wording, may be refined later. The card title and chips are unchanged. Consider whether the section header "SORT" still fits once the Group card and this option join the panel; renaming/restructuring the sections is a design-pass decision, not required for the build.

---

## Design bundle contents (Feature 1 only)

`Group By.html` (all frames), `group-by-components.jsx` (components + reference sort logic), `PanelPrimitives.jsx` (panel primitives the mocks build on — map to codebase equivalents), `colors_and_type.css`, `screenshots/01–09`. These are design references, not production code: recreate in the codebase's existing menu/panel components, pixel-faithful to the mocks. Icons are inline SVG strokes — swap for the codebase's Lucide equivalents (folder, corner-down-right, check-circle).
