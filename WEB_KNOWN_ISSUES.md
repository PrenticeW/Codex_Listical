# Web App — Weakness Checklist (Known Issues)

_Scope: `Codex_Listical` (React + Vite + Supabase web build). Focus of this pass: behaviour with **multiple users / multiple devices / multiple tabs**. Last reviewed: 2026-07-24._

Legend: `[ ]` open · `[~]` needs verification against live deployment · `[x]` fixed. Severity in **CAPS**.

---

## CRITICAL — fix before real multi-user traffic

- [x] **CRIT-1 · Cross-user data leak through the shared browser cache** — **fixed and verified live 2026-07-24**
  - **Where:** `src/lib/storageCache.js` (helper key builders in `tacticsStorage.js`, `stagingStorage.js`, `tacticsMetricsStorage.js`, `utils/planner/storage.js` unchanged)
  - **What (was):** The `cw-cache:` layer mirrored Supabase rows into device-global `localStorage` with no user id in any key (`${module}::${table}:${yearNumber}`), cleared only on `SIGNED_OUT` / `USER_DELETED`. If A's session ended without a clean sign-out, B signing in on the same browser got cache hits on A's data (confirmed on the live deployment 2026-07-24: all 11 `cw-cache:` keys un-scoped).
  - **Fix applied (storageCache.js rewrite, callers untouched):** localStorage keys are now `cw-cache:${userId}::${namespace}::${key}`. Nothing hydrates blind at module init — the module adopts a user (a) synchronously via a best-effort read of the `sb-*-auth-token` user id, and (b) on every auth event carrying a session (`INITIAL_SESSION`/`SIGNED_IN`/`TOKEN_REFRESHED`/...). Adopting a different user than the cache owner clears memory and deletes the previous user's mirror — covering account switches where no `SIGNED_OUT` fires. Legacy un-scoped entries are deleted on first hydration. Persistence is disabled while signed out (memory-only).
  - **Verified so far:** ESLint + `vite build` clean; 15-assertion Node harness covering the B-after-A leak path, legacy-entry purge, warm-start hydration, cold-start-without-token, sign-out clearing, and `clearForYear`/`invalidate` under the new prefix — all pass.
  - **Verified live (2026-07-24, post-deploy):** first load purged all 11 legacy un-scoped keys and rewrote the mirror as `cw-cache:<uid>::...` (all keys scoped to the signed-in user). Planted a foreign user's scoped entry and a legacy un-scoped entry → both deleted on the next load, neither readable. App renders with warm first paint after hard refresh; zero console errors.
  - **Caveats:** (1) A still-open tab running the pre-deploy bundle keeps writing old-format un-scoped keys until it is refreshed (observed once during verification); the new code never reads them and purges them on the next load, so no leak path — just refresh any old tabs. (2) The sign-out sweep (zero `cw-cache:` keys after logout, no persistence while signed out) is covered by the Node harness but was not exercised live; it will be covered by the GearPanel logout end-to-end test already on the "needs testing before launch" list in `docs/known-issues.md`.

---

## HIGH

- [~] **HIGH-1 · SECURITY DEFINER functions trust a passed-in user id instead of `auth.uid()`**
  - **Where:** `supabase/migrations/20260102000003_helper_functions.sql`, `20260120000003_add_rate_limiting.sql`
  - **What:** `get_year_stats(p_year_id, p_user_id)`, `get_or_create_current_year(p_user_id)`, `duplicate_planner_row`, `check_deletion_rate_limit(target_user_id)`, `record_deletion_attempt`, `request_account_deletion` are all `SECURITY DEFINER` and key off a caller-supplied id rather than `auth.uid()`. Postgres grants `EXECUTE` to `PUBLIC` by default and no `REVOKE` appears in the migrations.
  - **Multi-user failure (if EXECUTE still public):** a signed-in user could call `record_deletion_attempt(<victim>)` to exhaust another user's deletion rate limit, `request_account_deletion(<victim>)` to flag someone else's account for deletion, or `get_year_stats(...)` to read arbitrary users' stats.
  - **Fix:** Derive the user from `auth.uid()` inside each function; `REVOKE EXECUTE ... FROM public, authenticated` and grant only to `service_role` where the function is meant to be service-side. **Verify current grants against the live DB.**

- [~] **HIGH-2 · Multi-device / multi-tab edits clobber each other (last-write-wins)**
  - **Where:** the tactics / staging / metrics save paths (planner_rows now handled, see below)
  - **Status by surface (updated 2026-07-24):**
    - `planner_rows` — **done, needs live verification.** Diff-based save with serialized queue + `_knownRowIds` (no resurrecting remote deletes, no deleting remote inserts), plus a realtime subscription in `ProjectTimePlannerV2.jsx:540` with a mute window around local saves. Verify on the live deployment, then strip the `[realtime]` / `[planner-save]` debug logs (MED-3).
    - `tactics_chips` / `tactics_custom_projects` — **done, verified live 2026-07-24.** The live-layer replace-the-layer save does a compare-and-set on `tactics_year_settings.chips_live_version` (migration `20260724000001_chip_layer_version.sql`, applied) before its delete+insert. On conflict the stale client's save is dropped, the layer is refetched, and `tactics-chips-conflict` is broadcast; TacticsPage listens and snaps its chip state to server truth (verified: stale tab warns + snaps, other client's chips survive in DB). The observed version is persisted into the `cw-cache` mirror alongside the layer, so cache-hydrated tabs (including same-browser multi-tab, which shares localStorage) pin the version matching the state they actually loaded. Sent layer intentionally unguarded (last Send-press wins). Losing client drops its very last local edit — accepted trade-off vs wiping the other device's chips. Not yet exercised: two fully separate localStorage contexts (incognito / second browser / real second device) and the first-chip-on-a-fresh-year path (`expected = 0` settings-row insert). Follow-up (post-launch nice-to-have): user-visible "Updated from another device" toast instead of a console warning.
    - `projects` (staging) — **done, needs live verification (2026-07-24).** `saveStagingState` is now a serialized diff save with a `_knownProjectIds` guard (ported from the planner pattern): stale tabs no longer delete rows created on another device, don't resurrect remote deletes, and unchanged rows are not rewritten (so remote field edits on untouched rows survive). Rows edited on both sides stay row-level LWW — same accepted trade-off as planner. Known ids are recorded on both the cache-hit and DB-fetch load paths. Covered by a 10-assertion Node harness (mock Supabase): remote insert survives, remote delete not resurrected, no-op save writes nothing, local create/delete work.
    - `tactics_metrics` — **done, needs live verification + migration (2026-07-24).** Live row now carries `tactics_metrics.live_version` (migration `20260724000002_metrics_live_version.sql` — **apply to the live DB before deploy**); saves are serialized and CAS-bump the version keyed on the (user, year, is_sent=false) slice. On conflict the stale save is dropped, the row refetched, cache + version adopted, and the storage event rebroadcast with server truth. No page-side conflict handler needed: live metrics are derived from chip state, which has its own guard — once chips converge the next recompute re-saves correct metrics. Identical payloads are skipped (no spurious version bumps). First-save race handled via `one_live_metrics_per_year` 23505 → conflict. Sent snapshot intentionally unguarded (last Send-press wins, same as chips). Covered by an 8-assertion Node harness (insert v1, CAS bump, no-op skip, stale-save drop, post-conflict recovery, cold-start divergence, insert race, sent-layer unguarded).
    - `planner_settings` / `tactics_year_settings` columns — **low risk, open.** Per-column upserts so callers only clobber their own column; residual LWW within a column is UI preferences only.
  - **Multi-device failure:** phone + laptop (or two tabs) editing the same year → silent data loss on the remaining open surfaces above.
  - **Fix pattern chosen:** version guard + refetch-on-conflict (no new realtime channels beyond the existing planner one); reconcile instead of overwrite.

---

## MEDIUM

- [ ] **MED-1 · OAuth-only users cannot delete their account**
  - **Where:** `supabase/functions/account-delete/index.ts:52-125`
  - **What:** Deletion requires a password and verifies it via `signInWithPassword`. Google sign-in users have no password → always "Invalid password", locked out of self-service deletion (GDPR/erasure gap). Verifying via full sign-in also trips Supabase's auth rate limits.
  - **Fix:** Branch on identity provider; for OAuth users require a fresh re-auth / recent session instead of a password.

- [x] **MED-2 · Duplicate-year fragility** — **verified live 2026-07-24**
  - **Where:** `supabase/migrations/20260619000001_unique_year_constraint.sql`; defensive workarounds in `snapshotStorage.js:110-118` and elsewhere (`.order('created_at').limit(1)`)
  - **What:** The `UNIQUE(user_id, year_number)` constraint was missing from some deployed DBs. Where duplicates exist, reads and writes can land on different year rows, splitting a user's data.
  - **Verified against production (SQL editor, 2026-07-24):** `pg_constraint` shows `years_user_id_year_number_key · UNIQUE (user_id, year_number)` on `public.years`, and a `GROUP BY user_id, year_number HAVING COUNT(*) > 1` sweep returned zero rows — no duplicates survive. Client insert paths (`initializeYearMetadata`, `createDraftYear`) both handle `23505`, and `get_or_create_current_year` is not called from the client. The `.order('created_at').limit(1)` guards are now defense-in-depth only — keep them.

- [ ] **MED-3 · Debug code shipping to users**
  - **Where:** `snapshotStorage.js:59-84` (`showSnapshotToast`, marked "remove before launch"); `components/Layout.jsx` (`DebugSnapshotButton`, added 2026-07-24, marked "remove before launch"); `utils/planner/storage.js:1231` (`[planner-save] diff` log); `pages/ProjectTimePlannerV2.jsx` (`[realtime]` logs); `contexts/AuthContext.jsx:78` (`Auth state changed` log)
  - **What:** A user-visible snapshot toast, a manual snapshot test button, and console logs that leak internal state/auth events. Strip before launch (the `[tactics-chips] save conflict` warn in `tacticsStorage.js` can stay, or be replaced by the HIGH-2 follow-up toast).

---

## LOW

- [ ] **LOW-1 · Wildcard CORS on the delete function** — `supabase/functions/_shared/cors.ts` sets `Access-Control-Allow-Origin: *`. Mitigated because it requires a Bearer JWT browsers won't auto-attach cross-origin, but tighten to the app origin.

---

## Verified OK (not issues)

- [x] Row Level Security is enabled with correct owner-only policies on every user table (`20260102000002_enable_rls.sql`, `20260516000002_planning_rls.sql`, `20260529000001_site_snapshots.sql`).
- [x] `clearUserKeys` / `removeKeysMatching` correctly scope by `user:{id}:` prefix and never touch other users' keys (`storageService.js:296-395`).
- [x] Sign-out path clears user-scoped `localStorage` and resets the storage-service user id (`AuthContext.jsx:91-104`).
- [x] Security headers in `vercel.json` are strong (CSP, HSTS, `X-Frame-Options: DENY`, `frame-ancestors 'none'`).
- [x] Only the anon/public Supabase key is exposed client-side (`src/lib/supabase.ts`); the service-role key stays server-side in the edge function.

---

_How to use this doc: work top-down by severity. CRIT-1 is reproducible by anyone who signs in and out with two accounts on one browser, and can write one user's data into another's account — treat it as blocking._
