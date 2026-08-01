# Compliance

## GDPR — hard requirement

Users include students at dance conservatoires and universities, potentially including minors.

### Right to Erasure

All user data must be deletable on request. The `deletion_audit_log` table and `deletion_requested_at` field on `profiles` are the start of this. The Supabase migration must extend Right to Erasure to all planning data tables.

**Deletion verification by account type:** the `account-delete` Edge Function decides the check from the user's own identities (never from which request fields were sent). Password accounts (an `email` identity exists) must supply their password; OAuth-only accounts (Google, Apple) have no password and must type the confirmation phrase `DELETE` instead. `DeleteAccountModal` mirrors this client-side.

### Data export (Right of Access / Portability — UK GDPR Art. 15 / Art. 20)

The privacy policy promises users a machine readable copy of their data. This is served by "Download my data" in the gear panel's Account section.

- **Endpoint:** `POST /api/export-data` (Vercel serverless, `api/export-data.ts`, logic in `src/lib/server/dataExport.ts`). Authenticates the caller from their Supabase JWT (`Authorization: Bearer`) — a user id is never accepted from the request body. Returns a JSON attachment named `Tacular-data-export-YYYY-MM-DD.json` shaped `{ exportedAt, user: { email, dateOfBirth }, data: { <tableName>: [rows] } }`.
- **Scope:** all years (deliberately not year-scoped, unlike the client storage modules). Includes profiles (minus internal deletion flags `deletion_requested_at` / `deleted_at`), all planning tables, and the theme preference (`profiles.theme_family`). Excludes `deletion_audit_log` and the rate-limit bookkeeping tables.
- **Table list source of truth:** `EXPORT_TABLES` in `src/lib/server/dataExport.ts` must match the deletion flow's explicit purge list (`purge_user_data` in `supabase/migrations/20260801000001_complete_deletion_purge.sql`). `node scripts/verify-export-tables.mjs` parses both, cross-checks against every table created in `supabase/migrations` with a `user_id` column, and fails on undocumented drift — run it whenever either list or the schema changes.
- **Rate limit:** 3 exports per hour per user, via `export_rate_limits` and `check_export_rate_limit` / `record_export_attempt` (migration `20260801000002_add_export_rate_limiting.sql`, mirroring the deletion rate limiting in `20260120000003`).
- **Client:** components call `downloadDataExport()` in `src/lib/api/dataExport.ts` (mirrors `src/lib/api/accountDeletion.ts`); never fetch or call Supabase directly from components.

**Gear panel Account section:** shows Log out and an "Edit account" button (both in the panel's standard bento button style with the brand-tint hover state) — Edit account expands in place to reveal Download my data (local loading/disabled state — intentionally not wrapped with `useAsyncHandler`, see the signup flow note below) and Delete account (destructive, last, opens `DeleteAccountModal`).

### Database rules (all future Supabase tables)

- Every new table must include a `user_id` FK referencing `auth.users(id)`
- Do not store data that cannot be attributed to a specific user and deleted on request
- RLS policies must be defined on every new table before production use

---

## Age requirement — minimum 18

Product decision: the floor is 18 (legal adult), not the GDPR-K minimum of 16. GDPR-K's default age of digital consent is 16 and remains the legal floor across the EU/UK, but 18 was chosen deliberately for broader coverage.

**Database (source of truth):** `public.profiles.date_of_birth` is `NOT NULL`. A CHECK constraint and `BEFORE INSERT OR UPDATE` trigger (`validate_age_requirement`) reject any row where DOB is NULL or indicates under 18. Originally set to 16 in `supabase/migrations/20260425000001_bump_age_requirement_to_16.sql`, bumped to 18 in `supabase/migrations/20260708220000_bump_age_requirement_to_18.sql`.

**Client (UX gate):** `src/pages/SignupPage.jsx` caps the year dropdown at `currentYear - 18` and shows a warning message. This is convenience only — the DB is the real gate.

Do not make further assumptions about user age elsewhere in the app. Do not collect data beyond what is necessary for the planning features.

---

## Auth and email infrastructure

Supabase's built-in SMTP is development-only (~2 auth emails per hour per project). Configure a custom SMTP provider (Resend, Postmark, or SendGrid) under Authentication → Emails → SMTP Settings before public launch.

### Signup flow note

`signup` in `AuthContext.signupCore` is intentionally **not** wrapped with `useAsyncHandler`. Wrapping it flips global `isLoading`, which causes `PublicRoute` to render its spinner, unmounting SignupPage mid-flow and wiping local state. Do not re-wrap it. Same applies to `sendOtp` and `verifyOtp`.

---

## Third-party fonts

Fonts (DM Sans, IBM Plex Mono, Mulish) are self-hosted via `@fontsource` packages and imported in `src/index.css`, not loaded from the Google Fonts CDN. Loading fonts directly from `fonts.googleapis.com` sends every visitor's IP address to Google before consent — the pattern a German regional court (LG München, 2022) found to violate GDPR, since self-hosting is trivially possible and no legitimate-interest defense applies. Do not reintroduce a `fonts.googleapis.com` `@import`/`<link>` for any typeface; add new weights via `@fontsource/<family>/<weight>.css` instead.
