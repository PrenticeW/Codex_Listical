# Version History Plan

**Status:** Blocked on Supabase migration (see `SUPABASE_MIGRATION_PLAN.md`)
**Last updated:** 2026-05-01

## Goal

Give the developer (and eventually users) the ability to restore an earlier version of their planning data if something goes wrong. This is disaster recovery, not a Google Sheets style cell-by-cell undo.

## Why

A live site bug or bad deploy could corrupt user data. Manual mistakes (deleting a project by accident, etc.) need an undo path. Provides debugging visibility ("what did the data look like yesterday"). Required-feeling before public launch.

## Decisions made

* **Built on Supabase, not localStorage.** Building a localStorage version was considered and rejected. localStorage is going away in the migration, so any feature built on it is throwaway work.
* **No PITR.** Cost reasons (Supabase Pro is $25/month). The database trigger pattern below covers the realistic disaster scenarios.
* **History per row, not per cell.** Each row write captures the previous version of the whole row. Less granular than Google Sheets but vastly simpler and free on Supabase.

---

## Approach: history table plus triggers

A new table `planning_history` stores the previous version of any row that changes. A trigger on each main planning table fires `BEFORE UPDATE OR DELETE` and inserts the old row into `planning_history` automatically. Application code knows nothing about it. A scheduled cleanup job deletes history rows older than 30 days so the table stays bounded.

### Schema sketch

```sql
CREATE TABLE planning_history (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  table_name    TEXT NOT NULL,
  row_id        UUID NOT NULL,
  previous_data JSONB NOT NULL,
  operation     TEXT NOT NULL CHECK (operation IN ('UPDATE', 'DELETE')),
  changed_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ON planning_history (user_id, table_name, row_id, changed_at DESC);
```

---

## Steps

### 1. Add history table to migration

* [ ] Define `planning_history` table in a new migration file
* [ ] Add RLS policy: users can only read their own history rows
* [ ] Add index on `(user_id, table_name, row_id, changed_at)` for fast lookup

### 2. Write the trigger function

* [ ] Generic PL/pgSQL function that takes the trigger context and inserts into `planning_history`
* [ ] Attach `BEFORE UPDATE OR DELETE` trigger to every main planning table
* [ ] Test by editing a project and confirming a history row appears

### 3. Schedule the cleanup job

* [ ] Pick mechanism: `pg_cron` (built into Supabase) or an Edge Function on a schedule
* [ ] Job deletes rows from `planning_history` where `changed_at < now() - interval '30 days'`
* [ ] Verify it runs (Supabase logs)

### 4. (Optional) Build user-facing restore panel

* [ ] List view of history entries, newest first, grouped by date
* [ ] Each entry shows: timestamp, table affected, row label if available, operation type
* [ ] "Restore" action that:
  * Snapshots current row state first (so the restore is itself undoable)
  * Writes the historical row back over the current one
  * Refreshes the page so React reloads from the database
* [ ] Confirmation modal with warning text

### 5. (Optional) Manual labelled snapshots

A "Save snapshot" button that takes a deliberate full-state snapshot the user can name. Useful before risky operations like Year Archive.

* [ ] New table `planning_snapshots` (similar shape to history but holds full state per snapshot)
* [ ] UI button in gear menu
* [ ] Restore flow same shape as above, but for full snapshots

---

## Cost

Free on Supabase free tier. Storage usage grows with edit volume. The cleanup job keeps it bounded.

## Out of scope

* Cell-by-cell undo and redo like Google Sheets (weeks of work, ongoing maintenance burden)
* Branching version history (this is linear time)
* Cross-user history visibility
