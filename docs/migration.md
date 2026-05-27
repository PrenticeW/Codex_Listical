# Supabase Migration

## Status

Planning schema exists in `supabase/migrations/20260102000001_initial_schema.sql`. The client has zero references to any planning tables. All three pages have been rewritten since the migration was authored — the schema is drifted.

**Do not begin client porting until the schema blockers below are resolved in a new migration.**

---

## Schema blockers (must fix before client porting)

1. `years.status` CHECK allows only `'active'` and `'archived'` — missing `'draft'`
2. `tactics_chips` is missing columns: `day_name`, `duration_minutes`, `start_minutes`, `user_modified`, `chip_time_overrides`. Its `column_index CHECK (0–6)` also excludes project-column chips.
3. No sent-snapshot layer — the two-layer live/committed model needs either a boolean flag + partial unique index, or parallel `*_sent` tables
4. `project_weekly_quotas.project_label` should be `project_id UUID FK`
5. `ON DELETE CASCADE` coverage from `auth.users(id)` through the full planning table tree must be audited before launch (GDPR)

Full per-module delta lists are in the code review doc (Addendum 4).

---

## Migration goal

Move all planning data into Supabase, replacing localStorage. **The storage module API stays the same — only the internals change.** Consumers of `stagingStorage`, `tacticsMetricsStorage`, and `plannerStorage` should not need to change.

---

## Critical path

Menu reorganisation → UI revamp → migration → mobile app
