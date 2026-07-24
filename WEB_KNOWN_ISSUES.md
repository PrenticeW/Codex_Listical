# Web App — Weakness Checklist (Known Issues)

_Scope: `Codex_Listical` (React + Vite + Supabase web build). Focus of this pass: behaviour with **multiple users / multiple devices / multiple tabs**. Last reviewed: 2026-07-19._

Legend: `[ ]` open · `[~]` needs verification against live deployment · `[x]` fixed. Severity in **CAPS**.

---

## CRITICAL — fix before real multi-user traffic

- [ ] **CRIT-1 · Cross-user data leak through the shared browser cache**
  - **Where:** `src/lib/storageCache.js` (keys built in `tacticsStorage.js:49-51`, `stagingStorage.js:30`, `tacticsMetricsStorage.js:30`, `utils/planner/storage.js:64-66`)
  - **What:** The `cw-cache:` layer mirrors Supabase rows into device-global `localStorage`, but no cache key contains a user id — keys are only `${module}::${table}:${yearNumber}`. It is cleared solely on the `SIGNED_OUT` / `USER_DELETED` auth event (`storageCache.js:208-216`).
  - **Multi-user failure:** If user A's session ends without a clean sign-out (tab closed, token/session expiry, crash, account switch), no `SIGNED_OUT` fires and the cache survives. When user B signs in on the same browser and opens their planner, `hydrateFromLocalStorage()` (line 132) has already loaded A's rows into memory. Because every new user starts at `year_number` 1, the key collides exactly → B gets a cache **hit** returning A's Plan/Tactics/Goal/Staging data. `useAutoPersist` can then write A's data back into B's own DB rows.
  - **Fix:** Namespace every cache key (and the `cw-cache:` prefix) by user id. Also clear the cache on `SIGNED_IN` when the incoming user id differs from the one the cache was written under, not only on `SIGNED_OUT`.

---

## HIGH

- [~] **HIGH-1 · SECURITY DEFINER functions trust a passed-in user id instead of `auth.uid()`**
  - **Where:** `supabase/migrations/20260102000003_helper_functions.sql`, `20260120000003_add_rate_limiting.sql`
  - **What:** `get_year_stats(p_year_id, p_user_id)`, `get_or_create_current_year(p_user_id)`, `duplicate_planner_row`, `check_deletion_rate_limit(target_user_id)`, `record_deletion_attempt`, `request_account_deletion` are all `SECURITY DEFINER` and key off a caller-supplied id rather than `auth.uid()`. Postgres grants `EXECUTE` to `PUBLIC` by default and no `REVOKE` appears in the migrations.
  - **Multi-user failure (if EXECUTE still public):** a signed-in user could call `record_deletion_attempt(<victim>)` to exhaust another user's deletion rate limit, `request_account_deletion(<victim>)` to flag someone else's account for deletion, or `get_year_stats(...)` to read arbitrary users' stats.
  - **Fix:** Derive the user from `auth.uid()` inside each function; `REVOKE EXECUTE ... FROM public, authenticated` and grant only to `service_role` where the function is meant to be service-side. **Verify current grants against the live DB.**

- [ ] **HIGH-2 · Multi-device / multi-tab edits clobber each other (last-write-wins)**
  - **Where:** `utils/planner/storage.js:196-210` and the tactics / staging / metrics save paths
  - **What:** Settings, tactics, staging and metrics each persist as one whole-blob row via `upsert(..., { onConflict: 'user_id,year_id' })` — no conflict detection, last save wins. `planner_rows` is better (id-level diff, lines 1208-1250) but depends on an in-memory `_knownRowIds` set per tab, and the "realtime refresh" referenced in the comments is not actually subscribed anywhere. The cache header itself documents "two browser tabs on the same account will not see each other's edits until refresh" as an accepted pre-launch trade-off.
  - **Multi-device failure:** phone + laptop (or two tabs) editing the same year → silent data loss on the blob tables.
  - **Fix:** Add a realtime subscription or a version/`updated_at` guard (optimistic concurrency) on the blob rows; reconcile instead of overwrite.

---

## MEDIUM

- [ ] **MED-1 · OAuth-only users cannot delete their account**
  - **Where:** `supabase/functions/account-delete/index.ts:52-125`
  - **What:** Deletion requires a password and verifies it via `signInWithPassword`. Google sign-in users have no password → always "Invalid password", locked out of self-service deletion (GDPR/erasure gap). Verifying via full sign-in also trips Supabase's auth rate limits.
  - **Fix:** Branch on identity provider; for OAuth users require a fresh re-auth / recent session instead of a password.

- [~] **MED-2 · Duplicate-year fragility**
  - **Where:** `supabase/migrations/20260619000001_unique_year_constraint.sql`; workarounds in `snapshotStorage.js:110-118` and elsewhere (`.order('created_at').limit(1)`)
  - **What:** The `UNIQUE(user_id, year_number)` constraint was missing from some deployed DBs. Where duplicates exist, reads and writes can land on different year rows, splitting a user's data. **Verify the constraint is actually applied in production.**

- [ ] **MED-3 · Debug code shipping to users**
  - **Where:** `snapshotStorage.js:59-84` (`showSnapshotToast`, marked "remove before launch"); `utils/planner/storage.js:1231` (`[planner-save] diff` log); `contexts/AuthContext.jsx:78` (`Auth state changed` log)
  - **What:** A user-visible snapshot toast and console logs that leak internal state/auth events. Strip before launch.

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
