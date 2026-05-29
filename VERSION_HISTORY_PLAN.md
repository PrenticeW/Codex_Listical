# Version History Plan

**Status:** In planning. Schema needs updating (replace `planning_history` with `site_snapshots`). No code written yet.
**Last updated:** 2026-05-29

## Goal

Give Prentice (and eventually users) the ability to step back through recent versions of their planning data if something goes wrong — whether that's an accidental edit, a bug that corrupts data, or an unexpected bulk change. Must survive a page refresh and a browser crash. Must be usable without technical knowledge.

## Core concern this solves

Bugs or mistakes that affect many rows at once — chips disappearing, rows duplicating, data getting into a bad state across one or more pages. The restore needs to be one action ("put everything back to how it looked 8 minutes ago"), not a row-by-row manual process.

## Decisions made

* **Snapshot-based, not trigger-based.** Triggers capturing individual row changes were considered and rejected. They don't handle bulk changes well, can't capture new rows being inserted, and require row-by-row restoration. Full site snapshots are simpler and match the actual failure scenarios.
* **Whole-site snapshots.** Every snapshot captures all three pages at once — Goal, Plan, and System — as a single bundle. Restoring means picking one point in time and getting everything back together. This eliminates cross-page sync issues (e.g. a bug that affects both Plan and System simultaneously). The trade-off is that restoring also rolls back whichever pages weren't affected, but in practice Goal and Plan are only actively edited during the first 1 to 2 weeks of a 12-week cycle, so the cost of rolling them back is low for most of the year.
* **Activity-driven, not time-driven.** A snapshot is taken before each save if at least 2 minutes have passed since the last snapshot. Snapshots cluster around periods of active editing rather than firing at arbitrary times of day.
* **Session-aware.** When the app is opened after 4 or more hours of inactivity, a snapshot is taken immediately before any new edits land. This ensures there is always a clean "before this session" restore point available, even if the previous session's snapshots have since been pushed out.
* **Rolling window of 50 snapshots.** When a 51st snapshot is saved, the oldest is deleted. At one snapshot per 2 minutes of activity, this covers roughly 100 minutes of active editing — enough to span multiple sessions across several days of realistic use before older snapshots are dropped.
* **Stored in Supabase.** Must survive a refresh and a browser crash, so in-memory undo is not sufficient.
* **No named manual snapshots.** Automatic snapshots on activity are sufficient. A manual "save checkpoint" button adds complexity without meaningfully improving safety.
* **No triggers or `planning_history` table.** The existing `planning_history` table in the schema is a leftover from the earlier trigger-based plan. It will be dropped in the migration for this feature and replaced with `site_snapshots`.

---

## How it works

Every page in the app autosaves continuously. Before each autosave, the app checks: has it been at least 2 minutes since the last snapshot? If yes, it captures the complete current state of all three pages together and stores it in Supabase as a single bundle. Up to 50 snapshots are kept; the oldest is dropped when a new one would exceed that limit. A fresh snapshot is also taken automatically when you open the app after being away for 4 or more hours.

If something goes wrong, you open the gear menu, navigate to the history panel, and choose a restore point from the list. The app replaces the current state of all three pages with the chosen snapshot and reloads. One action, everything restored together.

---

## Schema

Replace the existing `planning_history` table with `site_snapshots`:

```sql
CREATE TABLE site_snapshots (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  year_number  INTEGER NOT NULL,
  goal         JSONB NOT NULL,
  plan         JSONB NOT NULL,
  system       JSONB NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ON site_snapshots (user_id, year_number, created_at DESC);
```

No cleanup job needed. The 50-snapshot cap is enforced at write time — when a new snapshot is inserted, a delete fires for any rows beyond the 50 most recent for that user and year_number combination.

---

## What each snapshot contains

Every snapshot is a bundle of all three pages captured at the same moment:

| Field | What gets snapshotted |
|---|---|
| `goal` | Full shortlist and archived projects array (`stagingStorage`) |
| `plan` | Chips state, custom projects, chip time overrides, year settings (`tacticsStorage` + `tacticsMetricsStorage`) |
| `system` | All task rows including archived weeks (`plannerStorage`) |

Year metadata (which year is active, draft status) and UI preferences (column widths, sort order, show/hide toggles) are **not** snapshotted. Year metadata changes are rare and deliberate; UI preferences are low-stakes.

---

## Steps

### 1. Update the schema migration

* [ ] Write a new migration file that drops `planning_history` and creates `site_snapshots` with the shape above
* [ ] Add RLS policy: users can only read and write their own snapshot rows
* [ ] Apply migration to dev Supabase project
* [ ] Confirm table exists with correct shape in Supabase dashboard

### 2. Build the snapshot module

* [ ] Create `src/lib/snapshotStorage.js` with two functions: `saveSiteSnapshot(yearNumber)` and `loadSiteSnapshots(yearNumber)`
* [ ] `saveSiteSnapshot` reads the current state from all three storage helpers in parallel, bundles them, and writes to `site_snapshots`. Before writing, checks the most recent snapshot's `created_at` — skips the write if it was less than 2 minutes ago
* [ ] `saveSiteSnapshot` also enforces the 50-snapshot cap by deleting the oldest row if the new insert would exceed it
* [ ] Add session-start detection: on app load, if the most recent snapshot is older than 4 hours, trigger a snapshot immediately before any edits can land
* [ ] Hook `saveSiteSnapshot` into any of the three storage helper save paths — one hook is enough since all three pages are bundled together
* [ ] Verify snapshots are appearing in the Supabase dashboard during a normal editing session

### 3. Build the restore panel (required before Prentice goes live)

A simple panel in the gear menu. Functional over polished.

**What it shows:**
* A list of snapshots newest first, each showing the timestamp and a brief summary of all three pages at that moment (e.g. "8 projects, 12 chips, 34 task rows")
* A restore button on each entry

**What restore does:**
* Shows a confirmation modal: "This will replace your Goal, Plan, and System pages with the version from [time]. This cannot be undone."
* Writes each page's data back through its respective storage helper's save function so normal caching and events fire correctly
* Navigates to the home page so the user immediately sees the restored state

**Where it lives:**
* Gear menu, alongside Archive Year and other admin actions
* Modal or slide-out panel — no new nav item needed

### 4. Test before going live

* [ ] Edit across all three pages for 10 minutes, confirm snapshots accumulate correctly (roughly one every 2 minutes)
* [ ] Deliberately corrupt state (delete all chips, add duplicate rows) and confirm a whole-site restore brings everything back correctly
* [ ] Confirm the 50-snapshot cap works (51st snapshot drops the oldest)
* [ ] Confirm snapshots survive a hard refresh and a simulated browser crash (close tab without saving, reopen)
* [ ] Close the app for 4 hours, reopen, and confirm a session-start snapshot fires before the first edit lands

---

## Out of scope

* Cell-by-cell undo and redo like Google Sheets
* Branching version history
* Cross-user history visibility
* Named manual snapshots
* Restoring year metadata or UI preferences
