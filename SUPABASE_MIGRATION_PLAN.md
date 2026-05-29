# Supabase Migration Plan

**Status:** Steps 1–7 complete. Next: step 8 (history triggers) then step 9 (deploy).
**Last updated:** 2026-05-27

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

A new migration file `supabase/migrations/20260516000001_planning_schema.sql` was added alongside the stale `20260102000001_initial_schema.sql`. The new file drops the stale planning tables (keeping `profiles` intact) and rebuilds the schema to match `STORAGE_AUDIT.md`.

Known issues from `CLAUDE.md` resolved:

* [x] `years.status` CHECK now includes `'draft'` (plus partial unique indexes enforcing at most one active and one draft per user)
* [x] `tactics_chips` now has `day_name`, `start_minutes`, `duration_minutes`, `duration_override_minutes` (replaces the `chipTimeOverrides` map), `user_modified`, and `display_label`
* [x] `tactics_chips.column_index` constraint widened to `>= 0` so project-column chips are valid
* [x] Sent-snapshot layer implemented with `is_sent` boolean plus partial unique indexes on `tactics_metrics`, `tactics_chips`, and `tactics_custom_projects`
* [x] `project_weekly_quotas.project_label` replaced with `project_id` UUID inside the `tactics_metrics.project_weekly_quotas` JSONB shape
* [x] Every planning table CASCADEs from `auth.users(id)` so deleting a user removes their planning data

Design decisions written into the file:

* [x] Calendar header rows are NOT persisted; the System page reconstructs them from `years.start_date`, `years.total_days`, and `tactics_metrics.daily_bounds`
* [x] Archive week snapshots live in a dedicated `archived_weeks` table, not mixed into `planner_rows`
* [x] `project_id` is the universal join key; `project_nickname` is kept as a display-only field
* [x] Times stored as INTEGER minutes everywhere, not `"H.MM"` strings
* [x] Booleans stored as real BOOLEAN columns, not `'true'` / `'false'` strings
* [x] `planning_history` table from `VERSION_HISTORY_PLAN.md` step 1 is created here (triggers come in step 8)
* [x] `profiles.current_year_id` added so the legacy `currentYear` pointer has a home

Task row metadata placeholder columns (per Prentice's earlier note): only `created_at` and `updated_at` were added. The four status timestamps (`completed_at`, `abandoned_at`, `sent_to_system_at`, `status_changed_at`) are deliberately omitted, to be reassessed when we know which analytics queries matter.

Row Level Security policies are still pending and form step 3 below.

### 3. Add Row Level Security policies

Every new table must have RLS enabled and policies restricting reads and writes to the row's owner. Captured in `supabase/migrations/20260516000002_planning_rls.sql`.

* [x] Enable RLS on every planning table (years, projects, planner_rows, archived_weeks, tactics_year_settings, tactics_metrics, tactics_custom_projects, tactics_chips, planner_settings, planning_history, plus profiles)
* [x] Write SELECT/INSERT/UPDATE/DELETE policy on each: row's `user_id` matches `auth.uid()` (single `FOR ALL` policy per table, equivalent to four separate ones)
* [x] `planning_history` is SELECT-only at the policy level; writes happen via the trigger added in step 8, which bypasses RLS
* [x] Integration test script drafted at `scripts/verify-rls.mjs`. Run after step 4 applies the migrations. Needs two pre-confirmed test accounts and the env vars listed in the script header.

### 4. Run the migration in Supabase

Only one Supabase project exists right now, so "dev" and "production" are the same project. The second project will be added later, before public launch.

* [x] Apply migration on dev project first (both `20260516000001_planning_schema.sql` and `20260516000002_planning_rls.sql` applied via the dashboard SQL editor)
* [x] Verify tables exist with correct shapes via Supabase dashboard (lock icon present on all 11 planning tables in the Table editor)
* [x] Confirm RLS is active (`pg_policies` sanity query returned 11 rows, all with `rls_enabled = true` and `policy_count = 1`)
* [ ] Apply migration on production project (deferred until a separate production project exists)

### 5. Rewrite storage helper internals ✅ DONE (2026-05-23)

Each helper keeps its public function signatures. Internals swap from `localStorage.getItem` and `setItem` to Supabase queries.

* [x] `stagingStorage` ports to Supabase
* [x] `tacticsMetricsStorage` ports to Supabase
* [x] `plannerStorage` ports to Supabase
* [x] `tacticsStorage` ports to Supabase
* [x] `yearMetadataStorage` ports to Supabase
* [x] Custom events (`staging-state-update`, etc.) keep firing with `__eventYear` field intact

### 6. Make helpers async-aware ✅ DONE (2026-05-23)

* [x] Helper signatures return `Promise<T>`
* [x] Callers (pages, hooks) updated to `await` and handle loading states
* [x] In-memory cache layer (`src/lib/storageCache.js`) across all four planning helpers — cache hits return instantly, saves update the cache, sign-out clears all entries
* [x] `useAutoPersist` gained an `enabled` flag so saves are gated until the async load resolves
* [x] Double-row race condition fixed (2026-05-27) — see `MIGRATION_HANDOFF.md` for details

### 7. Test end-to-end on dev ✅ DONE (2026-05-27)

* [x] Create a project on Goal, see it on Plan, schedule chips, send to System
* [x] Edit task rows on System, archive a week
* [x] Plan Next Year flow: create draft, work on draft, archive year N
* [x] Sign out, sign back in, confirm all data restores correctly
* [x] Sign in as a second user, confirm no data crosstalk

The ~20-render cascade on System page mount (documented in MIGRATION_HANDOFF.md item 1c) was also resolved in this session.

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
