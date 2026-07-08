# Compliance

## GDPR — hard requirement

Users include students at dance conservatoires and universities, potentially including minors.

### Right to Erasure

All user data must be deletable on request. The `deletion_audit_log` table and `deletion_requested_at` field on `profiles` are the start of this. The Supabase migration must extend Right to Erasure to all planning data tables.

### Database rules (all future Supabase tables)

- Every new table must include a `user_id` FK referencing `auth.users(id)`
- Do not store data that cannot be attributed to a specific user and deleted on request
- RLS policies must be defined on every new table before production use

---

## Age requirement — minimum 16

Operative framework: GDPR-K, default age of digital consent is 16.

**Database (source of truth):** `public.profiles.date_of_birth` is `NOT NULL`. A CHECK constraint and `BEFORE INSERT OR UPDATE` trigger (`validate_age_requirement`) reject any row where DOB is NULL or indicates under 16. Defined in `supabase/migrations/20260425000001_bump_age_requirement_to_16.sql`.

**Client (UX gate):** `src/pages/SignupPage.jsx` caps the year dropdown at `currentYear - 16` and shows a warning message. This is convenience only — the DB is the real gate.

Do not make further assumptions about user age elsewhere in the app. Do not collect data beyond what is necessary for the planning features.

---

## Auth and email infrastructure

Supabase's built-in SMTP is development-only (~2 auth emails per hour per project). Configure a custom SMTP provider (Resend, Postmark, or SendGrid) under Authentication → Emails → SMTP Settings before public launch.

### Signup flow note

`signup` in `AuthContext.signupCore` is intentionally **not** wrapped with `useAsyncHandler`. Wrapping it flips global `isLoading`, which causes `PublicRoute` to render its spinner, unmounting SignupPage mid-flow and wiping local state. Do not re-wrap it. Same applies to `sendOtp` and `verifyOtp`.

---

## Third-party fonts

Fonts (DM Sans, IBM Plex Mono, Mulish) are self-hosted via `@fontsource` packages and imported in `src/index.css`, not loaded from the Google Fonts CDN. Loading fonts directly from `fonts.googleapis.com` sends every visitor's IP address to Google before consent — the pattern a German regional court (LG München, 2022) found to violate GDPR, since self-hosting is trivially possible and no legitimate-interest defense applies. Do not reintroduce a `fonts.googleapis.com` `@import`/`<link>` for any typeface; add new weights via `@fontsource/<family>/<weight>.css` instead.
