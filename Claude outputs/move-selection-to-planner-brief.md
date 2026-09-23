# Implementation brief: Move selection to Planner (plus copy fixes)

System page feature. No design mocks; follow the existing panel and context menu patterns, including the Group Selection By card and menu section already in the codebase (`SystemPanel.jsx`, the row-gutter context menu, `utils/planner/groupSelection.js` for the shared selection/action-event pattern).

## What it is

Moves the currently selected rows from the Inbox to the Planner. Today rows only move via the status-filtered sweep (the `sortInbox` dispatch fired from `SortSection`); this adds a selection-scoped version. It is a move, not a copy, with no field changes beyond what the existing move performs. Reuse the existing move code path scoped to the selected rows — do not write a new move routine. Moved rows keep their relative order and land wherever the existing move puts them (inherit existing behaviour, no new placement logic).

## Entry points

1. **Row-gutter context menu:** new item labelled **"Move to Planner"**, placed at the TOP of the action list — with Duplicate Rows / Delete Rows but deliberately far from Delete. Selection scope is implied by the menu, so the label stays short.
2. **Side panel:** new option labelled **"Move selection to Planner"**, in the same section as the existing "Move from Inbox to Planner" card — they are two answers to "which rows go to the Planner": by status, or by hand. Greyed with a "Select rows to move" notice when nothing is selected — grey out, never hide, same empty-state pattern as the Group Selection By card. Acts on the current selection via the shared action event, same as that card.

## Selection rules

- **Non-contiguous selections are allowed.** This deliberately differs from Group Selection By (which requires a continuous range) — the two menu entries have independent disabled rules.
- Header and subheader rows in the selection are **skipped silently**, not a blocking condition.
- The action is available only when at least one movable (non-header) row is selected.

## After the move

- Toast, matching the Group by toast pattern: "3 tasks sent to Planner" (count substituted) with an Undo chip, ~4.5s auto-dismiss.
- Undo restores the rows to their original Inbox positions and is also a normal undo-stack entry (Cmd+Z).

## Sync and ordering

Reusing the existing move path means mobile compatibility is inherited — nothing new to sync. Order writes follow the order_key rules in CLAUDE.md: rewrite keys only for rows that move, never renumber, no `display_order` writes. Undo is a fresh write through the same path, not a replayed earlier payload.

## Copy fixes (do alongside)

In the existing "Move from Inbox to Planner" card (`SortSection`, `src/components/SystemPanel.jsx`):

- The action button currently reads **"Sort"** — wrong, nothing sorts; rows are moved. Relabel to **"Move statuses to Planner"**. Disabled behaviour unchanged (disabled when no statuses checked). Interim wording, may be refined later.
- Card title and status chips unchanged.
- The section header "SORT" no longer describes what the section contains; leave as is for now unless a rename falls out naturally — a proper restructure is a later design decision.
