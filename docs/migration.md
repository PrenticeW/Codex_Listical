# Supabase Migration

## Status

**Steps 1–7 complete as of 2026-05-27.** All five storage helpers (`yearMetadataStorage`, `stagingStorage`, `tacticsMetricsStorage`, `tacticsStorage`, `plannerStorage`) are fully Supabase-backed. No planning data touches localStorage anymore.

For the detailed step-by-step log, see `SUPABASE_MIGRATION_PLAN.md` and `MIGRATION_HANDOFF.md`.

---

## What shipped

| Step | Description | Status |
|---|---|---|
| 1 | Storage shape audit | ✅ Done — `STORAGE_AUDIT.md` |
| 2 | Schema migration | ✅ Done — `20260516000001_planning_schema.sql` |
| 3 | Row Level Security | ✅ Done — `20260516000002_planning_rls.sql` |
| 4 | Migration applied to live project | ✅ Done — RLS verified via `pg_policies` |
| 5 | Storage helper rewrites | ✅ Done — all five helpers async + Supabase-backed |
| 6 | Async-aware sweep + cache layer | ✅ Done — `storageCache.js`, `useAutoPersist` `enabled` flag |
| 7 | End-to-end testing | ✅ Done |
| 8 | History table triggers + cleanup job | ⬜ Next |
| 9 | Deploy + remove dev controls | ⬜ After step 8 |

---

## Known open issues before launch

**`projectNickname` as join key** — still in use as the join between Plan and System for quota lookups in `ProjectTimePlannerV2`. A rename silently returns zero quotas. The Supabase migration switched `projectWeeklyQuotas` to use `id` internally, but the System page display still leans on nickname for some lookups. Full fix is to plumb `project_id` through to all quota read sites. See `docs/known-issues.md`.

**No production Supabase project yet.** Dev and prod are the same project. A separate production project should be created before public launch and the schema migrations applied there.

**Custom SMTP not configured.** Supabase's built-in mailer is rate-limited to ~2 auth emails/hour. Required before any public user can sign up. See the NEW row in `CODE_REVIEW_April2026.md`.

---

## Critical path

End-to-end testing (step 7) → history triggers (step 8) → deploy (step 9) → public launch
