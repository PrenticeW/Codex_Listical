# Supabase Migration Plan

**Status:** Step 1 complete
**Last updated:** 2026-05-16 (storage shape audit complete, task row metadata columns flagged for step 3 reassessment)

## Goal

Move all planning data out of the browser's localStorage and into Supabase tables. The public API of the storage helpers stays the same; only the internals change.

## Why

Data survives browser crashes and accidental localStorage clears. Syncs across devices when a user signs in. Enables proper user accounts and per-user isolation. Required before public launch (UK and European conservatoire students). Acts as the foundation for the version history feature (see `VERSION_HISTORY_PLAN.md`).

## Decisions made

* **Skipping Point-in-Time Recovery.** PITR is a $25/month feature on Supabase Pro. Not using it for cost reasons. The safety net comes from the history-table-with-triggers pattern instead (see version history plan).
* **No data import.** No precious data exists in current localStorage. Fresh start in Supabase rather than writing a one-time data migration script.
* **Storage helpers keep their public API.** All three pages should keep working without page-level code changes.

## Prerequisites

* Supabase project already exists (auth and `profiles` table are live).
* Custom SMTP provider configured (Resend, Postmark, or similar) before public launch. Supabase's built-in SMTP rate-limits at roughly 2 auth emails per hour.

---

## Steps

### 1. Audit current storage shapes

Document the exact keys and JSON shapes used by each storage helper. This is the blueprint for designing the tables.

* [x] `stagingStorage` (Goal page)
* [x] `tacticsMetricsStorage` (Plan page metrics)
* [x] `plannerStorage` (System page task rows)
* [x] `tacticsStorage` (chips state, year settings, column widths)
* [x] `yearMetadataStorage` (year statuses, draft year tracking)

Deliverable: `STORAGE_AUDIT.md` in the project root.

### 2. Rewrite the schema migration file

Replace or update `supabase/migrations/20260102000001_initial_schema.sql` so it matches the audit. Fix the five known issues from `CLAUDE.md`:

* [ ] `years.status` CHECK must include `'draft'`
* [ ] `tactics_chips` needs columns: `day_name`, `duration_minutes`, `start_minutes`, `user_modified`, `chip_time_overrides`
* [ ] `tactics_chips.column_index CHECK (0 to 6)` must be widened to allow project-column chips
* [ ] Add sent-snapshot layer (boolean flag plus partial unique index, or parallel `*_sent` tables)
* [ ] `project_weekly_quotas.project_label` should become `project_id UUID FK`
* [ ] Audit `ON DELETE CASCADE` coverage from `auth.users(id)` through the full planning tree (GDPR right to erasure)

**Also capture task row metadata.** Future analytics ("when was this task created", "how long did it take to complete", "how often does this user abandon tasks") depend on metadata that's cheap to add now and painful to backfill later. When designing `planner_rows` (and any other row-shaped tables like `projects`), include:

* [ ] `created_at TIMESTAMPTZ DEFAULT now()` (standard Postgres convention)
* [ ] `updated_at TIMESTAMPTZ DEFAULT now()` with a trigger to keep it fresh
* [ ] `completed_at TIMESTAMPTZ` (set when status transitions to Done, nulled if reverted)
* [ ] `abandoned_at TIMESTAMPTZ` (set when status transitions to Abandoned, nulled if reverted)
* [ ] `sent_to_system_at TIMESTAMPTZ` on task rows that originate from the Plan page send-to-system flow
* [ ] Consider `status_changed_at TIMESTAMPTZ` as a generic catch-all if specific status timestamps feel noisy

> **Note (2026-05-16):** Prentice wants to reassess this column list before it lands in the migration draft. The five timestamps above were assumed during the original plan write-up, are not personally important, and may be replaced with better columns once we know what queries actually matter. Treat them as placeholders, not requirements, and revisit at the point where we would otherwise write them into the schema file.

The `planning_history` table from the version history plan covers full change history, so don't duplicate that here. These columns are specifically for queries that need a fast direct read on the row itself (sorting by creation date, filtering active tasks by age, etc.).

### 3. Add Row Level Security policies

Every new table must have RLS enabled and policies restricting reads and writes to the row's owner.

* [ ] Enable RLS on every planning table
* [ ] Write SELECT policy on each: row's `user_id` matches `auth.uid()`
* [ ] Write INSERT, UPDATE, DELETE policies likewise
* [ ] Write integration tests confirming user A cannot read user B's data

### 4. Run the migration in Supabase

* [ ] Apply migration on dev project first
* [ ] Verify tables exist with correct shapes via Supabase dashboard
* [ ] Confirm RLS is active
* [ ] Apply migration on production project

### 5. Rewrite storage helper internals

Each helper keeps its public function signatures. Internals swap from `localStorage.getItem` and `setItem` to Supabase queries.

* [ ] `stagingStorage` ports to Supabase
* [ ] `tacticsMetricsStorage` ports to Supabase
* [ ] `plannerStorage` ports to Supabase
* [ ] `tacticsStorage` ports to Supabase
* [ ] `yearMetadataStorage` ports to Supabase
* [ ] Custom events (`staging-state-update`, etc.) keep firing with `__eventYear` field intact

### 6. Make helpers async-aware

Supabase calls travel over the network, so helpers now return promises.

* [ ] Helper signatures return `Promise<T>`
* [ ] Callers (pages, hooks) updated to `await` and handle loading states
* [ ] Loading skeletons or spinners on initial page mount
* [ ] Optimistic updates for rapid edits where it makes sense

### 7. Test end-to-end on dev

* [ ] Create a project on Goal, see it on Plan, schedule chips, send to System
* [ ] Edit task rows on System, archive a week
* [ ] Plan Next Year flow: create draft, work on draft, archive year N
* [ ] Sign out, sign back in, confirm all data restores correctly
* [ ] Sign in as a second user, confirm no data crosstalk

### 8. Add the safety net

Build the history table, triggers, and scheduled cleanup before deploy. UI panel can come later. See `VERSION_HISTORY_PLAN.md` for the detailed steps.

### 9. Deploy to production

* [ ] Final test pass on staging or preview
* [ ] Deploy via Vercel
* [ ] Monitor for 24 to 48 hours
* [ ] Remove `Undo Draft` dev button (B4 from CODE_REVIEW)
* [ ] Delete dead code listed in `CLAUDE.md`

---

## Out of scope

* Real-time multi-device sync (one device at a time is fine for v1)
* Offline editing with conflict resolution
* Multiple workspace support
