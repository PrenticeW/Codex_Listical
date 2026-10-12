# Staging & Safe-Release Plan

Written 2026-10-03, after the projects-table loss incident (projects rows and
planner_rows.project_id links wiped on prod during a recovery session; restored
same day via Version History + backup tables). Goal: by the January pilot,
no code fix or database change is ever applied to production first.

Status: NOT STARTED — agreed plan, saved for a future session.
Estimated total effort: ~1 afternoon.

## 1. Staging Supabase project (highest impact, ~1–2h)

- Create a second free-tier Supabase project, "Tacular Staging".
- Mirror the prod schema into it (replay migrations / schema dump).
- Seed with a sanitised copy of prod data (swap real goal text out).
- All experiments, repairs, schema changes and encryption migrations run
  there first. Prod only receives changes already proven on staging.
- (Supabase branch databases exist on paid plans; a second project is
  simpler and free.)

## 2. Migrations as files, not ad-hoc SQL (same session as #1)

- Adopt supabase CLI `supabase/migrations/` in this repo.
- Every schema change = a numbered migration file: apply to staging,
  test, then apply the identical file to prod.
- No more typing SQL into the dashboard against live data.
- Gives a replayable schema history.

## 3. Vercel environment split (~30 min)

- Vercel already builds a preview deployment per branch.
- Preview environment env vars → staging Supabase.
- Production env vars → prod Supabase.
- Workflow: branch → preview URL against staging data → merge to main → live.

## 4. Mobile dev variant + EAS Update channels (~2–3h, closer to pilot)

- Separate bundle id for the dev client (e.g. com.tacular.dev) pointing at
  staging, installable alongside the TestFlight app.
- EAS Update channels `staging` / `production`: push JS-only fixes OTA to
  staging first, then promote the same update to production.
- Conserves the monthly native-build allowance (most fixes won't need a
  native build).
- Costs one native build to create the dev variant.

## 5. Backups (~15 min)

- Enable PITR on prod if the plan allows; otherwise a nightly pg_dump via a
  scheduled job.
- Before ANY prod migration: manual snapshot first, every time.

## Order of work

1. Staging project + migration files (prevents the incident class we hit).
2. Vercel env split.
3. Backups/PITR decision.
4. Mobile variant + update channels, before the January pilot starts.
