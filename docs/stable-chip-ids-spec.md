# Spec — Stable schedule-item IDs (kill positional chip identity)

Status: implemented (2026-08-30) — amended after code review the same day; amendments marked ⚠. Chip-id helpers live in `src/utils/scheduleChipId.js`; minting helpers in `src/utils/staging/rowPairing.js` (`createScheduleId`, `ensureScheduleRowIds`). Test: `src/utils/staging/__tests__/scheduleIds.test.js`. Prerequisite reading: `CLAUDE.md`, `docs/known-issues.md`
("Chip identity is positional"). The mitigation described there (Step 0 re-link pass +
`_chipOrphaned` safeguard in `ProjectTimePlannerV2.jsx`, added 2026-08-30) is already live
and stays in place — this spec removes the root cause.

## Problem

Chip ids are positional: `schedule-chip-{projectId}-{itemIdx}` (extra placements:
`schedule-chip-{projectId}-{itemIdx}-extra-{seq}`), where `itemIdx` is the item's index in
the project's Goal-page Schedule list at read time. Deleting, reordering, or inserting
mid-list on the Goal page renumbers every item below the change. Everything downstream is
keyed by chip id, so a renumber makes the System page treat surviving chips as new: task
rows, day entries, notes, and time overrides detach from their chip.

The 2026-08-30 mitigation rematches renumbered rows heuristically (same project + chip
name) and keeps unmatched rows flagged instead of deleting them, but it cannot resolve a
rename combined with a renumber, and the heuristic can mis-pair within a same-name group.

## Where chip identity currently comes from

- Goal page schedule rows live in `shortlist[].planTableEntries` (array-of-cells rows with
  non-enumerable metadata `__rowType` / `__pairId` / `__sectionType`, defined in
  `src/utils/staging/planTableHelpers.js` `defineRowMetadata`). Persisted via
  `src/lib/stagingStorage.js` — `serializeRow` writes metadata to `_rowType` / `_pairId` /
  `_sectionType` inside `plan_table_entries` jsonb; `deserializeRow` restores it.
- `buildProjectPlanSummary` (`src/utils/staging/planTableHelpers.js`, ~line 443) walks the
  Schedule section and emits `planSummary.scheduleItems = [{ name, timeValue }]` — **index
  order is the only identity**. The autosave in `src/hooks/staging/useShortlistState.js`
  enriches each shortlist item with this summary before `saveStagingState`.
- `buildScheduleLayout` (`src/ScheduleChips.jsx`) filters/normalises `scheduleItems` into
  `scheduleItemsByProject: Map<projectId, item[]>`. Note: it **filters out placeholders**,
  so the index the Plan page uses is the post-filter index.
- `src/pages/TacticsPage.jsx` builds canonical chip ids from `projectId + itemIdx`
  (`buildAndAddScheduleItemChip` ~line 3357, plus parse sites ~1726, ~2290, ~3373, ~3446,
  ~3539 and the `-extra-` handling ~2136, ~3403). Chips persist through
  `src/lib/tacticsStorage.js` into `tactics_chips.chip_id` (live `is_sent=false` and sent
  `is_sent=true` layers).
- Keyed by chip id downstream: `chipTimeOverrides` (object keyed by chip id, persisted as
  `tactics_chips.override_minutes` per row), `chip_task_notes.chip_id` (Supabase table, see
  `src/utils/planner/storage.js` ~1838), System page rows (`_chipId` in
  `day_entries.__extra`, plus synthetic in-session row ids `chip-task-{chipId}` /
  `chip-header-{chipId}` / groupIds `chip-{chipId}`), snapshots (`snapshotStorage.js`
  captures chips + chipNotes), and the mobile app (tacular-mobile reads the same tables).
- Grouping is by name, not id: `chipGroupKey` (`src/utils/planner/chipGroups.js`) =
  `projectNickname::name` — unaffected by this change.

## Design

### 1. Mint a permanent id per schedule item (Goal page)

Add a `__scheduleId` metadata field on Schedule-section rows, minted lazily at autosave
time (`useShortlistState` runs `ensureScheduleRowIds` on every item before building the
plan summary — the single choke point every save passes through; same backfill pattern as
`ensurePlanPairingMetadata`). ⚠ Ids are **dashless** (`crypto.randomUUID()` with dashes
stripped) so chip-id parsers can split on `-` unambiguously. Persist in
`stagingStorage.serializeRow` / `deserializeRow` as `_scheduleId` alongside `_pairId`.
Duplicating a row mints a fresh id (`useRowCommands` duplicate); moving/reordering carries
it unchanged.

⚠ `__scheduleId` must survive **every** metadata copy path, not just serialize/deserialize
— otherwise undo/redo and drafts silently drop it: `defineRowMetadata` (new `scheduleId`
param), `cloneRowWithMetadata`, `clonePlanTableEntries` (all in `planTableHelpers.js`),
and the hand-copied metadata in `createDraftYear.js` (~line 110 — this is the draft-copy
site the edge case below refers to). `snapshotStorage.captureGoal` goes through
`serializeRow`, so snapshots are covered for free. Goal-page clipboard paste writes cell
content into existing rows, so it keeps the row's identity (correct); only whole-row
duplication mints.

### 2. Thread it through

- `buildProjectPlanSummary`: emit `{ name, timeValue, scheduleId }`.
- `buildScheduleLayout`: pass `scheduleId` through (the placeholder filter no longer
  matters for identity).
- ⚠ Chip id format is `schedule-chip-{projectId}-sid-{scheduleId}` — NOT the bare
  `...-{scheduleId}` originally proposed. The `-sid-` marker makes UUID-form ids
  self-identifying, which matters because the legacy parsers fail **silently**, not
  cleanly: `parseInt("3f2b…", 10)` returns 3 (a UUID starting with a digit reads as a
  valid index), the `/-(\d+)$/` regex matches a UUID's trailing digits, and
  last-dash splitting breaks outright on dashed ids. Every parser branches on the
  marker: has `-sid-` → id lookup; otherwise the legacy positional path runs
  unchanged. All parsing goes through `src/utils/scheduleChipId.js`
  (`buildScheduleChipId`, `resolveScheduleChip`, `splitScheduleChipInner`,
  `canonicalScheduleChipId`, `scheduleItemKey`) — no ad-hoc parsing anywhere.
- ⚠ Extras use the real marker `-extra-chip-{N}` (built as
  `` `${canonicalId}-extra-${createProjectChipId()}` `` where `createProjectChipId()`
  returns `chip-{N}`), not the `-extra-{seq}` shorthand originally written.
- ⚠ Call sites are wider than `TacticsPage.jsx` — the original "grep TacticsPage" note
  was too narrow. Also updated: `src/components/PlanPanel.jsx` and
  `src/components/ScheduleItemPanel.jsx` (both parsed ids by last dash + `parseInt` and
  keyed their `placedChips` maps by numeric index — now keyed by `scheduleItemKey`, with
  legacy positional placements still counted via an index fallback), and the TacticsPage
  copy/paste path (clipboard payload field `scheduleItemIdx` → `scheduleItemRef`, which
  carries `sid-{scheduleId}` or the legacy index; old-field fallback kept for in-flight
  payloads). When hunting for stragglers, grep for `scheduleItemIdx` and `-(\d+)$` as
  well as `schedule-chip-`.
- Fallback: an item with no `scheduleId` (stale cached summary written by an old client)
  falls back to the positional id — identical to today, never worse.

### 3. Migration of existing data

Recommended: **hybrid / lazy**. New and newly-touched schedule items get UUID-based chip
ids; existing chips keep their positional ids until the item is next re-sent, and the live
Step 0 re-link pass on the System page absorbs the transition exactly as it absorbs a
renumber today (a chip whose id changes from positional to UUID form is just an orphan +
unclaimed same-group chip, and re-links; unmatched rows grey out instead of vanishing).
This avoids a big-bang rewrite entirely. Accepted cost: items never re-sent keep the old
fragility until touched. ⚠ Additional accepted cost found in review: `chipDisplayModes`
(per-chip duration/clock display prefs in `tacticsStorage`) is another chip-id-keyed
store — those prefs silently reset when a chip's id changes form, same class as
`chipTimeOverrides` self-healing on the next send.

Only if a hard cutover is later wanted: a one-time per-account routine must rewrite, for
each year and BOTH `is_sent` layers, `tactics_chips.chip_id` (and `-extra-` derivatives),
`chip_task_notes.chip_id`, and `_chipId` inside `planner_rows.day_entries.__extra` —
mapping old positional id → schedule item at that index at migration time. Do not attempt
it mid-flight with unsynced offline saves pending (`plannerOffline`), and gate it on the
mobile app understanding UUID chip ids first (mobile reads `tactics_chips` directly).

## Constraints and edge cases

- `chipTimeOverrides` are persisted per chip row (`override_minutes`), so they follow the
  chip id used at save time — with lazy migration they self-heal on the next send.
- Never rewrite `planner_rows.id` (DB UUID; `task_events` FKs). `_chipId` is the join key.
- Draft year (`docs/year-flow.md`): draft chips are copies — copying must preserve
  `scheduleId` so a draft send matches rows imported from the source year.
- Year-scoping: schedule ids live inside per-year staging state; no cross-year uniqueness
  needed, but UUIDs give it for free.
- Sent snapshot diffing (`_sessionSentFingerprint` in TacticsPage) compares by JSON — id
  churn from lazy minting will read as "plan changed"; acceptable, one-off.
- Do not touch `projectNickname` fallback logic (`docs/known-issues.md` do-not-extend).
- No `console.log`; all storage via the storage modules; year-scoped events carry
  `__eventYear` (per `CLAUDE.md`).

## Acceptance criteria

1. On the Goal page: delete item 2 of 3, or reorder items, or insert mid-list → Send to
   System → item 3's System row keeps its day entries, notes, status, and edits, with no
   `_chipOrphaned` flag and no heuristic re-link involved (verify: row `_chipId` unchanged).
2. Rename a schedule item AND reorder the list in one edit → Send → row survives with its
   data (this is the case the heuristic cannot do today).
3. Chip notes and time overrides follow the chip across a renumber.
4. Old positional-id chips (pre-change data) still load, send, and re-link as today.
5. Duplicating a schedule item yields two distinct ids; undo/redo on the Plan page does
   not mint new ids.
6. `npx vite build` clean; `npx vitest run` green; add a unit test for the id threading
   (buildProjectPlanSummary → buildScheduleLayout → chip id) and for lazy minting.

## Out of scope

The `recurring` value-vocabulary bug and the dormant `_importNeedsSubprojectReview`
treatment (both in `docs/known-issues.md`), and any mobile-app changes beyond confirming it
tolerates UUID-form `chip_id` strings.
