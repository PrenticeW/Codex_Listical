# Code Review — Pre-Launch Pass (April 2026)

**Scope:** Orientation and risk-ranked bug audit of the Codex Listical codebase ahead of July 2026 launch. Reviewer: Claude (session with Prentice). Purpose: inform the test plan, surface bugs before they ship, flag pre-launch hygiene.

---

## Progress log (as of 2026-05-01)

Running tally of what's been addressed since this review was authored. Findings are annotated inline below; this log is the single place to see state at a glance.

| ID | Title | Status | Notes |
|---|---|---|---|
| B1 | localStorage not cleared on account deletion | ✅ Done | `clearUserKeys(userId)` added to `storageService.js`; called from `AuthContext` on auth-state drop. |
| B2 | Raw `localStorage` calls bypass user-prefix | ✅ Done | All ten bypass sites routed through `storageService`. |
| B3 | Age verification is client-side only | 🟡 Mostly done | Server-side enforcement at 16 (GDPR-K) shipped in `supabase/migrations/20260425000001_bump_age_requirement_to_16.sql`. Client messaging and date picker cap updated. Signup flow now branches on email-confirmation session. Final smoke test of the "Check your inbox" card pending (blocked on Supabase built-in SMTP rate limit at time of writing). |
| B4 | Dev-only Undo Draft / Revert Archive ship in prod | ⏸ Deferred | Intentionally left in for testing the Plan Next Year flow. Revisit in the final polish pass. |
| H1 | `projectNickname` rename orphans quota data | ✅ Done | `projectWeeklyQuotas` Map now keyed by `id`, lookups switched to `id`. |
| H2 | Stale closure on Send to System listener | 🔵 Downgraded | No actual bug in practice (see V2 addendum). Leave as note. |
| H3 | Cross-year event collisions | ✅ Done | All four custom events (`staging-state-update`, `tactics-metrics-state-update`, `tactics-chips-state-update`, `tactics-send-to-system`) now carry `__eventYear` in detail. Listeners in `useStorageSync`, `ProjectTimePlannerV2`, and `TacticsPage` compare against their own `currentYear` and short-circuit on mismatch. `yearMetadataStorage` intentionally excluded as it's inherently global. |
| H4 | System cold-load race | 🔵 Downgraded | UX edge case, not a race. |
| H5 | Send to System stomps user edits on chip task rows | ✅ Done | `_original*` fields now stamped and compared before overwrite. |
| M1 | Orphaned storage cleanup in undoDraftYear | ✅ Done | `undoDraftYear` now sweeps every key matching `-year-{N}-` plus the `tactics-column-widths-{N}` carve-out via new `removeKeysMatching` helper in storageService. Closed two real orphans the hand-list missed (live metrics typo, sent metrics absent). |
| M2 | Archive flow has no transaction semantics | ✅ Done | `performYearArchive` now snapshots `app-year-metadata` before the first mutation and restores it in catch. Returns additive `rolledBack` field. User can retry from a clean state on mid-flight failure. |
| M3 | No validation before archiving (empty-goal trap) | ✅ Done | `validateYearReadyForArchive` and `performYearArchive` both reject when a draft year exists with an empty Goal shortlist. Modal renders the existing red Cannot Archive panel; programmatic call throws. |
| M4 | Weak password policy (6-character minimum) | ✅ Done | Bumped to 10 in `SignupPage.jsx` (guard, error message, placeholder) and `ResetPasswordPage.jsx` (guard, error message, helper text) so a user cannot weaken their password via reset. |
| M5 | Missing ErrorBoundary and 404 route | ✅ Done | `src/components/ErrorBoundary.jsx` wraps the provider tree in `App.jsx`. `src/pages/NotFoundPage.jsx` registered as catch-all at the end of the routes array, rendered outside the ProtectedRoute tree so unauthenticated visitors to bad URLs do not bounce through `/login`. |
| P1 | `index.html` is default Vite template | ✅ Done | Proper `<title>Listical</title>`, description, OG + Twitter tags (no image yet — TODO when brand asset ships), theme-color `#d5a6bd`, `noindex, nofollow`. `public/favicon.svg` added (rounded pink square with white "L"). `public/vite.svg` deleted. |
| P2 | Legacy `/v1` route still in router | ✅ Done | Route removed from `src/routes/index.jsx`; `src/pages/ProjectTimePlannerWireframe.jsx` deleted. |
| P3 | `console.log` calls in `ProjectTimePlannerWireframe.jsx` | ✅ Done | Moot — file deleted under P2. |
| P4 | `public/robots.txt` missing | ✅ Done | `public/robots.txt` added. Disallows all crawlers while the app is still invite-only. |
| P5 | No security headers in `vercel.json` | ✅ Done | CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, HSTS all added. CSP `connect-src` uses `https://*.supabase.co` + `wss://*.supabase.co` wildcards so it works across Supabase project URLs. |
| NEW | Custom SMTP required before public launch | 🟠 Launch prerequisite | Supabase built-in mailer is dev-only (~2 auth emails/hour/project). Configure Resend, Postmark, SendGrid, or similar under Auth → Emails → SMTP Settings before any public rollout. Currently unaddressed. |
| BUG | Cross-year contamination via global tactics settings | ✅ Done | All eight tactics page settings (`startHour`, `startMinute`, `incrementMinutes`, `showAmPm`, `use24Hour`, `startDay`, `chipDisplayModes`, `summaryRowOrder`) split out of the global `tactics-page-settings` blob and into year-scoped `tactics-year-{N}-settings`. Old helpers deleted; new `loadTacticsYearSettings` / `saveTacticsYearSettings` throw on missing yearNumber. New `tactics-settings-state-update` event dispatched for parity (no current consumer). One-shot cleanup wipes the legacy global key from localStorage on module load. Five files touched: `tacticsStorage.js`, `TacticsPage.jsx`, `useTacticsChips.js`, `ProjectTimePlannerV2.jsx`, `createDraftYear.js`. Manual repro fixed (changing wake time on draft year no longer alters active year). |

Legend: ✅ done, 🟡 mostly done, 🟠 open / queued, ⏸ deferred, 🔵 downgraded, ⬜ not started.

### Remaining pre-launch work

- **Bugs:** none open. M1, M2, M3, M4 all shipped (2026-05-01); the cross-year settings contamination bug (BUG row above) shipped same day. See progress log above for what shipped.
- **Addendum cleanup (from deep-read addenda):** all done. `useTacticsMetrics.js` deleted, `useArchiveOperations.js` deleted, `prevYearRef` effect removed from `ProjectTimePlannerV2.jsx`. The `buildQuotasMap` truthiness guard was already corrected during the H1 rekey work (`ProjectTimePlannerV2.jsx:104` uses `!= null` with an explicit zero-quota comment); the parallel site in `useTacticsMetrics.js` is moot now that the file is deleted.
- **Auth infrastructure:** custom SMTP provider (Resend / Postmark / SendGrid) in Supabase dashboard; then final B3 "Check your inbox" smoke test. Both still open.
- **Final polish pass:** B4 (gate or remove Undo Draft / Revert Archive). Keep until then — Prentice still needs it for manual Plan Next Year testing.
- **Brand asset:** OG card image at `/og-card.png` referenced from `index.html` with a TODO comment, awaiting brand asset.

### Deferred follow-ups (surfaced during the cross-year settings audit, 2026-05-01)

These three items were uncovered while auditing the cross-year contamination bug. None are blocking; bundle them into a future hygiene pass.

1. **No-draft archive branch in `archiveYear.js` (lines 264–296) is likely dead code.** It predates the formal Plan Next Year flow — the comment in the file even labels it "Legacy path: no draft year, create fresh next year". If the gear menu only exposes Archive when a draft exists, this branch is unreachable. Worth confirming: trace the UI gating around the Archive button. If unreachable, delete the branch and the unused `loadStagingState` / `loadTacticsMetrics` reads it depends on. If reachable, mirror `createDraftYear`'s settings copy so newly created years inherit the predecessor year's tactics settings instead of falling through to defaults.
2. **Silent global-fallback footgun across storage modules.** Several storage helpers fall back to a legacy unscoped key when called with `yearNumber === null`: `getChipsStorageKey` (`tactics-chips-state`), `getColumnWidthsStorageKey` (`tactics-column-widths`), `getSentChipsKey` (`tactics-sent-chips`), and the corresponding helpers in `stagingStorage` / `tacticsMetricsStorage` / `plannerStorage`. No current caller omits `yearNumber`, so the vector is latent — but a future caller that drops the argument would silently read or write a global key, recreating the same class of bug we just fixed. The new `getYearSettingsKey` throws instead of falling back; the same posture should be considered across the other modules in a hygiene pass. Either throw uniformly, or document the legacy keys explicitly and add them to `undoDraftYear`'s sweep allow-list.
3. **Dead re-exports at `src/utils/planner/storage.js:512–517`.** Four globally-scoped functions (`readStoredSettings`, `saveSettings`, `readStoredTaskRows`, `saveLegacyTaskRows`) are re-exported from the legacy `plannerStorage.js`. Nothing in current code imports them. Safe to delete in a tidying pass; check first that no edge-case caller (e.g. a debug script, a Storybook fixture) still leans on them.


**Coverage:** Full structural read of routing, contexts, storage modules, auth flow, deletion flow, draft year flow. Targeted reads of auth pages and components. Parallel explorer audits on storage isolation, cross-page event wiring, draft year flow, and pre-launch hygiene. Deeper line-by-line review of `TacticsPage.jsx` (5,042 lines) and `ProjectTimePlannerV2.jsx` (2,523 lines) deferred — flagged below as needing targeted follow-up.

---

## TL;DR

The codebase is more structured than a "vibecoded" origin would suggest. Core patterns (storage modules, scoped keys, custom events) are well-intentioned and mostly consistent. However I found **13 meaningful issues**, four of which I'd consider **launch blockers** for the stated audience (dance students, potentially minors, on potentially shared devices):

1. **Account deletion does not clear localStorage on the device.** Data for deleted users persists and is reachable with dev tools.
2. **Several raw `localStorage` calls bypass the per-user prefix.** Planning state leaks across users on the same device.
3. **Age verification is client-side only.** A user who disables JS or manipulates the date picker can sign up under 13.
4. **Dev-only "Undo Draft" and "Revert Archive" buttons ship in production.** A misclick wipes a user's draft year irretrievably.

Plus a handful of high-severity data-flow bugs (the `projectNickname` rename bug, stale closures on event listeners, cross-year event collisions) and standard pre-launch cleanup (favicon, title, error boundary, 404 page).

Suggested order of operations: fix the four launch blockers, then tackle the high-severity data-flow bugs, then do the pre-launch polish, then run the test plan I'll draft next.

---

## Findings by Severity

### 🔴 LAUNCH BLOCKERS

#### B1 — Account deletion leaves all localStorage data on the device ✅ DONE (2026-04)

**Files:** `src/components/DeleteAccountModal.jsx`, `src/lib/api/accountDeletion.ts`, `supabase/functions/account-delete/index.ts`, `src/contexts/AuthContext.jsx`.

**What happens today:** The flow calls the `account-delete` Edge Function, which flags the profile for 30-day soft deletion (the cron job at `api/cron/process-deletions.ts` actually hard-deletes later). The client then calls `supabase.auth.signOut()`, which triggers `setCurrentUserId(null)` via the `AuthContext` listener. **At no point does anything clear localStorage keys prefixed with `user:{deletedUserId}:`**. The data stays on that browser forever until manually cleared.

**Why it matters:** Dance schools frequently have shared devices. User A deletes their account, User B signs up on the same browser. User A's data is no longer reachable through normal app flow (good), but it's trivially reachable via browser dev tools by reading keys matching `user:*`.

**Also note:** The server-side `hardDeleteUser` function (`src/lib/server/accountDeletion.ts:391`) has a comment: `// Add explicit deletes here for any tables that don't have CASCADE delete // For example: user_lists, user_preferences, etc.` followed by no code. Currently only the auth user and profile are deleted. This is a placeholder waiting for the Supabase migration; fine for now since planning data lives only in localStorage, but must be completed before or alongside the Supabase migration.

**Fix direction:** On successful deletion request, enumerate and remove all `user:{userId}:*` keys from localStorage before `signOut()`. Storage service already has a `getCurrentUserId` and the scoped keys follow a predictable pattern.

---

#### B2 — Raw `localStorage` calls bypass user-prefix scoping (leaks across users) ✅ DONE (2026-04)

**Files & lines:**
- `src/pages/TacticsPage.jsx:2608` — `localStorage.setItem(getSendToSystemTsKey(currentYear), ...)`
- `src/pages/ProjectTimePlannerV2.jsx:214, 397, 1337, 1349` — `localStorage.getItem(getSendToSystemTsKey(...))`
- `src/pages/SignupPage.jsx:11, 22, 28` — `localStorage.{get,set,remove}Item(AGE_BLOCK_KEY)`
- `src/utils/planner/undoDraftYear.js:100` and `src/utils/planner/createDraftYear.js:282` — raw `localStorage.removeItem(...)`

**What happens today:** Every call to `storageService.get/set/removeItem` prepends `user:{currentUserId}:` when a user is authenticated. These direct `localStorage.*` calls skip that, so keys like `tactics-year-1-send-to-system-ts` and `listical_age_block` are stored without the user prefix. On a shared device: User A's "sent to system" timestamp gets seen by User B. The age-block timer is also shared across users on the same device (a user who fails age verification can block a legitimate signup by another user for 24 hours).

**Fix direction:** Route every one of these through `storageService`. For the send-to-system timestamp, either route through the storage service or tombstone it into a proper user-scoped key. For the age block, this is subtler (see B3 below) — the intent is anti-abuse so it needs to be server-side anyway.

---

#### B3 — Age verification is client-side only 🟡 MOSTLY DONE (2026-04)

**File:** `src/pages/SignupPage.jsx:104–133`.

**What happens today:** Age is computed from a date picker and checked in the browser. If the age check fails, a localStorage flag blocks the user on that device for 24 hours. A user who disables JS, or who intercepts the form submission, or who simply clears localStorage can sign up at any age. The date of birth is passed to Supabase signup metadata, but there's no server-side constraint that rejects signups under 13.

**Why it matters:** COPPA (US) and GDPR-K (EU) both require real protection for children under 13. Client-side checks don't meet that bar. The app is specifically targeted at dance students, so this is a concrete risk.

**Fix direction:** Add a Postgres trigger (or Edge Function) that rejects signups where `date_of_birth` indicates under 13. The client-side check should stay as UX, but the server check is what actually prevents non-compliant signups. Related: consider whether you need parental consent for 13–15 (GDPR-K specifies 16 as the default, with member states allowed to lower to 13; the UK has set it at 13).

**Also flag:** `navigate('/')` fires immediately after signup (line 162). If Supabase email confirmation is enabled (and it should be), this navigation will fail silently and the user will just sit on an unauthenticated `/` route. If email confirmation is disabled, users can sign up with other people's emails without access to that mailbox — an abuse vector. Confirm which setting is in Supabase dashboard, and make the post-signup UX match.

**Update 2026-04-24:** Decision taken to treat UK/Europe as first-client market and align with GDPR-K default of **16**, not 13. Work completed:

- New migration `supabase/migrations/20260425000001_bump_age_requirement_to_16.sql` makes `profiles.date_of_birth` `NOT NULL`, swaps the CHECK constraint to `>= 16`, and replaces `validate_age_requirement()` to reject NULL and under-16 rows. Applied to the live DB after backfilling one test account and deleting another stale NULL row.
- `SignupPage.jsx` year dropdown capped at `currentYear - 16`; age check raised to 16; user-facing copy updated in three places; added `confirmationPendingEmail` state and a "Check your inbox" card rendered when Supabase returns a null session post-signup.
- `AuthContext.signupCore` now returns `{ user, session, error }`. `signup` is deliberately **not** wrapped with `useAsyncHandler` because flipping AuthContext's global `isLoading` caused `PublicRoute` to render its loading spinner, unmounting `SignupPage` mid-flow and wiping the confirmation state. Same reasoning as existing `sendOtp` / `verifyOtp`.

**Remaining:** End-to-end smoke test of signup → "Check your inbox" card → email confirmation link → authenticated redirect. Blocked at time of writing on Supabase built-in mailer's rate limit (429). Unblocks once Supabase rate-limit window clears or custom SMTP is configured (see new finding below).

---

#### B4 — Dev-only "Undo Draft" and "Revert Archive" buttons ship in production ⏸ DEFERRED (retained for testing)

**File:** `src/components/planner/NavigationBar.jsx` (around lines 177–200, per explorer agent).

**What happens today:** CLAUDE.md says these are dev-only and must be removed before launch. They aren't gated behind any environment check. The only guard is that the button only renders when a draft year (or archived year) exists, which is the normal production state after someone plans their second year.

**Why it matters:** One misclick on "Undo Draft" wipes all of the user's draft-year Goal and Plan data with no undo and no confirmation modal. This is the single most destructive action in the app.

**Fix direction:** Gate both buttons behind `import.meta.env.DEV` or a feature flag, or remove them. If you want to keep the ability to undo a draft for real users, it needs a confirmation modal ("This will delete all draft data. Are you sure?") and the button wording should be less alarming.

---

### 🟠 HIGH SEVERITY

#### H1 — `projectNickname` rename orphans quota data, silently returns 0 ✅ DONE (2026-04)

**File:** `src/components/planner/rows/ProjectRow.jsx:86` and related.

**What happens today:** When a user renames a project on Goal (Staging) from "web-app" to "mobile-app", the new name flows to Plan (Tactics). Plan recomputes `projectWeeklyQuotas` keyed by the new nickname. But the OLD nickname still lives in the metrics map. More importantly, if System has cached state from before, it calls `projectWeeklyQuotas.get(oldNickname)` and gets `undefined`, which JS coerces to `0` with the `??` fallback. **No warning, no error, just a silent zero.**

**Reproduction:** Create project "Planning" (nickname "plan-v1"), set weekly quota = 10 on Plan, confirm System shows 10. Rename on Goal to "plan-v2". Refresh System. Quota shows 0.

**Fix direction:** This is the issue CLAUDE.md flags as "do not extend". The real fix is the Supabase migration that switches the join key to `id`. As an interim measure: when a nickname changes, also write the new name under the old-nickname key for one cycle, or emit an explicit warning when a lookup misses. Until the migration, this is a real bug that will hit at least some users.

---

#### H2 — Stale closure on `TACTICS_SEND_TO_SYSTEM_EVENT` listener

**File:** `src/pages/ProjectTimePlannerV2.jsx:1348–1360`.

**What happens today:** The `useEffect` that registers the listener depends on `[currentYear, resetSubprojectLabels]`. `resetSubprojectLabels` is likely a function that recreates every render unless wrapped in `useCallback`. Each render adds a new listener and removes the old one, but during heavy rerenders (table updates, filter changes), listeners can briefly accumulate, causing the same event to fire more handlers than expected.

**Fix direction:** Memoize `resetSubprojectLabels` with `useCallback`. Audit other listeners for the same pattern (`useStorageSync.js:76` has the same shape).

---

#### H3 — Cross-year event collisions ✅ DONE (2026-04-24)

**Files:** `src/lib/stagingStorage.js:125`, `src/lib/tacticsMetricsStorage.js:38`.

**What happens today:** Storage keys are year-scoped (`staging-year-1-shortlist`), but the events that announce updates are NOT year-scoped (`staging-state-update` is a flat event name). If a user switches years, the listeners don't know which year fired the event. They re-read whatever year their context thinks is current, which can be stale.

**Reproduction:** Open Goal on Year 1, open Plan in a second tab on Year 2. Edit on Goal Year 1. Plan tab receives `staging-state-update` and re-reads, potentially with stale year context.

**Fix direction:** Include yearNumber in event `detail`, and have listeners compare to their own `currentYear` before acting. Small change, removes a class of bugs.

**What shipped:** All four cross-page custom events now carry an `__eventYear` tag on their `CustomEvent` detail payloads:

| Event | Dispatcher | Listener(s) |
|---|---|---|
| `staging-state-update` | `src/lib/stagingStorage.js` (saveStagingState) | `TacticsPage.jsx` inline listener + `useStorageSync` (from `useProjectsData`) |
| `tactics-metrics-state-update` | `src/lib/tacticsMetricsStorage.js` (saveTacticsMetrics) | `useStorageSync` (from `useTacticsMetrics`, two call sites) |
| `tactics-chips-state-update` | `src/lib/tacticsStorage.js` (saveTacticsChipsState) | `useStorageSync` (from `useTacticsChips`) |
| `tactics-send-to-system` | `TacticsPage.jsx` (handleSendToSystem) | `ProjectTimePlannerV2.jsx` send-to-system listener |

Implementation uses a reserved `__eventYear` key spread alongside payload fields rather than changing detail shape — backwards-compatible because existing consumers read named fields (e.g. `payload?.shortlist`). `useStorageSync` accepts a new optional `currentYearNumber` prop; when present, the handler short-circuits if `event.detail.__eventYear` is set and does not match. Untagged events fall through to existing behaviour. `yearMetadataStorage` intentionally excluded — it's inherently global (metadata blob including year list and currentYear), not year-scoped.

---

#### H4 — System page cold-load race on direct navigation

**File:** `src/pages/ProjectTimePlannerV2.jsx` (load pattern around line 389).

**What happens today:** If a user opens the app directly on `/` (System page), only System mounts. Goal and Plan never mount on initial load. System subscribes to events but the events fired by Goal/Plan happen at save time, not load time, so System reads whatever was last persisted to storage. If storage is empty (fresh session) or stale, System renders with defaults or zeros. It only recovers once the user navigates away and back.

**Fix direction:** On System mount, explicitly load from storage (don't rely solely on events). Verify `loadMetricsData(currentYear)` actually reads all needed keys synchronously during `useState` initialization. This is probably mostly OK, but worth a deliberate check.

---

### 🟡 MEDIUM SEVERITY

#### M1 — Draft year and orphaned storage cleanup is incomplete ✅ DONE (2026-05-01)

`undoDraftYear` removes a known list of keys but doesn't fully cover all year-scoped keys that may have been created. Not destructive (orphans are inert) but creates cruft and eventually localStorage quota pressure for heavy users.

**What shipped:** New `removeKeysMatching(predicate)` helper in `src/lib/storageService.js` enumerates all keys in the current user's scope (or unprefixed keys when signed out), strips the user prefix, and removes any whose unscoped form satisfies the caller's predicate. Errors are swallowed per-key so one bad removal does not abort the sweep. `src/utils/planner/undoDraftYear.js` now uses it with a single `isKeyForYear` predicate that matches the standard `-year-{N}-` substring (flanking dashes prevent `year-1` from clobbering `year-12`) plus the exact `tactics-column-widths-{N}` carve-out. The hand-maintained list of twelve planner key templates plus seven other patterns is gone, along with all the unused `KEY_TEMPLATE` imports. The audit also turned up two real orphans the previous list had been leaking on every Undo Draft: a typo on the live metrics key (`tactics-metrics-year-{N}` was being removed instead of the actual `tactics-year-{N}-metrics-state`) and the sent metrics key (`tactics-year-{N}-sent-metrics`) which was missing from the list entirely. Both now caught by the sweep. Carve-outs verified: `app-year-metadata`, `tactics-page-settings`, `listical_age_block`, and any other-user keys are never matched. Return shape extended with `removedKeyCount` (additive; existing call sites only inspect `success`).

#### M2 — Archive flow has no transaction semantics ✅ DONE (2026-05-01)

`performYearArchive` has multiple independent storage writes. If one fails mid-way, the user can land in an inconsistent state (old year marked archived, new year not ready). Wrapped in try/catch but no rollback. Rare but unpleasant when it happens.

**What shipped:** `performYearArchive` in `src/utils/planner/archiveYear.js` now snapshots the `app-year-metadata` blob just before the first mutation (between the read pass and the metadata flip) and attempts to restore it in the catch block. `let metadataSnapshot = null` is declared outside the try so the catch can see it. JSON round-trip provides a fully detached copy. Validation throws (year does not exist, year not active, M3 empty-shortlist guard) all fire before the snapshot, so the snapshot stays null and rollback is correctly skipped. Mid-flight mutation throws (metadata flip, draft promotion, fresh-year writes, `setCurrentYear`) trigger `saveYearMetadata(metadataSnapshot)` to restore Year N to active, undo any draft promotion, and reset the currentYear pointer. Rollback is itself wrapped in try/catch so a rollback failure does not mask the original error. Return shape extended with `rolledBack: true|false` (additive; the only consumer, `ArchiveYearModal.jsx:37`, only reads `success`, `error`, `archivedYear`, and `newYear`). Storage keys written by the no-draft branch's twelve `save*` calls are not rolled back — they remain as inert orphans on failure and a retry will overwrite them with the same values. Decision documented in catch-block comment.

#### M3 — No validation before archiving (empty-goal trap) ✅ DONE (2026-05-01)

A user can press "Archive Year N?" with an empty Goal page on the draft. The draft promotes to active, and the user starts a new year with no projects defined. Recoverable but jarring. Add a pre-archive validation check.

**What shipped:** Two-layer guard added to `src/utils/planner/archiveYear.js`. `validateYearReadyForArchive` now calls `getDraftYear()` after the active-status check and returns `{ ready: false, reason }` when the draft exists with an empty shortlist. The reason string names the draft year and the active year, asks for at least one project on the Goal page, and avoids dashes per UI copy preference. `ArchiveYearModal.jsx` already renders `validation.reason` in the existing red Cannot Archive panel and disables the Archive button when not ready, so no new UI surface needed. `performYearArchive` mirrors the same guard inside its try block (after the active-status check, before the read pass) and throws a matching error if the draft shortlist is empty — defense in depth so a programmatic call cannot bypass the modal's disabled state. Three states walk cleanly: no draft → guard skipped, draft with non-empty shortlist → falls through to existing logic, draft with empty shortlist → blocked at both layers.

#### M4 — Weak password policy (6-character minimum) ✅ DONE (2026-05-01)

`SignupPage.jsx:142–144`. Industry baseline is 8+ with complexity or 12+ without. For an app that will have hundreds of users on potentially shared devices, 6 characters is not enough.

**What shipped:** Three sites in `src/pages/SignupPage.jsx` updated: the guard at line 150 (`< 6` → `< 10`), the error message at line 151, and the input placeholder at line 306 (`Minimum 6 characters` → `Minimum 10 characters`). A grep across `src` after the change found one additional bad site in `src/pages/ResetPasswordPage.jsx` that also enforced 6 characters (the guard at line 29, the error message at line 30, and the helper text at line 109). All three reset-password sites also bumped to 10, closing the loophole where a user could sign up at 10 then immediately reset to 6. No complexity rules added; threshold-only matches the review's recommendation and standard NIST guidance for length-without-complexity. Decision can be revisited when adding a strength meter.

#### M5 — Missing ErrorBoundary and 404 route ✅ DONE (2026-04-24)

If any component throws, the user sees a white screen with no recovery. Any unrecognized URL behaves unpredictably in React Router. Low-effort fix, meaningful UX win.

**What shipped:** `src/components/ErrorBoundary.jsx` (class component with `getDerivedStateFromError` + `componentDidCatch`, reload + return-home buttons, styled to match LoginPage gradient) wraps the provider tree in `App.jsx`. `src/pages/NotFoundPage.jsx` registered as `{ path: '*', element: <NotFoundPage /> }` at the end of the routes array, rendered outside the ProtectedRoute tree so unauthenticated visitors to bad URLs do not bounce through `/login`. `logError` contains a plain `console.error` for now; noted in comments to swap in Sentry/LogRocket when observability lands.

---

### 🟢 LOW SEVERITY / Pre-Launch Polish

#### P1 — `index.html` is default Vite template ✅ DONE (2026-04-24)
Title is `codex-listical` (lowercase). Favicon is `/vite.svg`. No `<meta name="description">`, no OG tags, no theme-color, no manifest. Would look unpolished at launch.

**What shipped:** `index.html` rewritten with `<title>Listical</title>`, meta description, OG + Twitter tags (no image — TODO comment notes to add `/og-card.png` when the brand asset ships), `theme-color="#d5a6bd"`, `<meta name="robots" content="noindex, nofollow">` since invite-only, favicon pointing at `/favicon.svg`. `public/favicon.svg` added (rounded pink #d5a6bd square with white "L"). `public/vite.svg` deleted.

#### P2 — Legacy `/v1` route still in router ✅ DONE (2026-04-24)
`src/routes/index.jsx:78–84` still mounts `ProjectTimePlannerWireframe`. CLAUDE.md calls this legacy. Remove before launch; the route is accessible to any authenticated user who types the URL.

**What shipped:** `/v1` route removed from `src/routes/index.jsx`; `src/pages/ProjectTimePlannerWireframe.jsx` deleted. Grep confirms no remaining references under `src/`.

#### P3 — `console.log` calls in `ProjectTimePlannerWireframe.jsx` ✅ DONE (2026-04-24)
Lines 1498, 1501, 1513, 1526, 1534, 1542, 1547, 1554, 1558, 1559. Becomes moot when you delete the `/v1` route.

**What shipped:** Moot — file deleted under P2.

#### P4 — `public/robots.txt` missing ✅ DONE (2026-04-24)
Vercel will index the site on launch. Decide what you want crawled; at minimum add a `robots.txt` that disallows authenticated areas.

**What shipped:** `public/robots.txt` disallows all crawlers (`User-agent: *` / `Disallow: /`) while the app is still invite-only with no public marketing surface. Revisit when a marketing site exists or when the app has any publicly indexable content.

#### P5 — No security headers in `vercel.json` ✅ DONE (2026-04-24)
Consider adding CSP, X-Frame-Options, Referrer-Policy. Not blocking but good hygiene.

**What shipped:** `vercel.json` `headers` block now sets Content-Security-Policy (default-src self, script-src self, style-src self + unsafe-inline for Tailwind runtime styles, img-src self/data/blob, connect-src self + `https://*.supabase.co` + `wss://*.supabase.co`, frame-ancestors none, form-action self, object-src none, base-uri self), X-Frame-Options DENY, X-Content-Type-Options nosniff, Referrer-Policy strict-origin-when-cross-origin, Permissions-Policy (camera / mic / geo / interest-cohort all off), Strict-Transport-Security (2-year max-age, includeSubDomains, preload). Wildcard on Supabase hosts is deliberate: project URL is env-dependent. Revisit CSP if fonts / analytics / Sentry are added later.

---

## UI Consistency Inventory (for future overhaul)

**Structural observations:**

1. **`NavigationBar` is shared across all three pages** (imported by `StagingPageV2`, `TacticsPage`, `ProjectTimePlannerV2`), but it lives under `src/components/planner/` — misleading location. Move to `src/components/` or `src/components/shared/` when you do the overhaul.

2. **Duplicated components** between `src/components/planner/` and `src/components/staging/`:
   - `ContextMenu.jsx` exists in both folders.
   - `TableRow.jsx` exists in both folders.
   These likely have diverged over time. Candidate #1 for consolidation.

3. **No design tokens.** Tailwind classes are inline everywhere. Colors like `bg-gradient-to-br from-blue-50 via-white to-[#f2e5eb]` and `from-blue-600 to-[#d5a6bd]` appear scattered across pages rather than being defined in a shared theme.

4. **No shared modal primitive.** `DeleteAccountModal`, `ArchiveYearModal`, `AddTasksModal`, `ProjectEditModal` each implement their own overlay, close button, and focus management. Consolidation opportunity.

5. **Page-level gradient backgrounds and headers are styled per page.** Evidence of drift: the login page and signup page both do `from-blue-50 via-white to-[#f2e5eb]` but that's a magic string hex, not a token. Other pages do their own thing.

**No data-flow symptoms promoted to bug list from UI consistency (yet).** The deeper reviews of the three big pages may surface some (e.g., the same value rendering differently on Goal vs Plan). I'll flag any I find when we do the focused reviews.

---

## CLAUDE.md drift

CLAUDE.md is mostly accurate but has these outdated claims you should update:

1. **"the Plan (Tactics) page is approximately halfway through its second pass. System is pending"** — you told me all three pages are done. Update the status paragraph.

2. **List of dead files** is accurate as stated — none of the flagged files are imported in active code. You can continue to ignore them or delete them.

3. **"`TacticsPage.jsx` line ~813 has a stray `console.log`"** — I didn't independently verify the exact line, but confirm with a grep before updating CLAUDE.md.

4. **Undo Draft button status:** "Remove this button before launch" is still accurate. Consider updating to note whether it'll be removed or gated.

5. **Scope of the account deletion flow:** CLAUDE.md says "The Supabase migration must extend Right to Erasure to all planning data tables." Accurate. But it doesn't currently mention the localStorage cleanup gap. Add a note.

Proposed draft of new CLAUDE.md section: "**localStorage cleanup on deletion (TODO before launch):** On account deletion, all `user:{userId}:*` keys must be removed from the client's localStorage. Currently not implemented."

---

## Deeper review candidates (not yet done)

I did not do a line-by-line read of `TacticsPage.jsx` (5,042 lines) or `ProjectTimePlannerV2.jsx` (2,523 lines). These are the largest single files in the project and the highest density of complex logic. I recommend a targeted read pass on each, focused on:

- **TacticsPage.jsx:** the metrics save path, the chips save path, the projectWeeklyQuotas computation, and the "Send to System" handler.
- **ProjectTimePlannerV2.jsx:** the task row save path, the recurring task logic, the handleArchiveWeek inline duplication (CLAUDE.md flags this), and the computed-data write-back loop in `useComputedDataV2.ts`.

Best done with you in the loop so I can ask specific questions about the intended flow.

---

## What this means for the test plan

The code review sharpens the test plan's focus areas:

- **Must test hard:** account deletion end to end on a shared browser, multi-user sign-in on the same device, age verification (try to bypass it), nickname rename propagation across pages, year-switching while pages are open, direct-URL cold loads.
- **Test smartly:** draft year create/archive/undo flow, persistence across logout/login, error recovery when storage fails.
- **Can test lightly for now:** cross-browser compatibility (you said this is fine to defer).

Next step is for us to agree on the test plan shape and then execute it. I'll draft that separately.

---

## Addendum — Deep read of TacticsPage.jsx (April 22)

Continued the deep read focused on the Send to System commit path and the metrics pipeline. Confirms several earlier findings and surfaces a few new ones.

### Confirmed: two-layer data model (live vs committed snapshot)

The Plan page maintains two parallel copies of chip state and metrics:

| Layer | Keys | Writer | Reader |
|---|---|---|---|
| Live | `tactics-year-{N}-metrics-state`, `tactics-year-{N}-chips-state` | TacticsPage (continuous, on every change) | Only TacticsPage itself, plus archive/draft copy helpers |
| Sent snapshot | `tactics-year-{N}-sent-metrics`, `tactics-year-{N}-sent-chips` | `handleSendToSystem` only (user press) | `ProjectTimePlannerV2` (System page) |

This is a clean separation. System is insulated from in-flight changes on Plan — it only updates when the user explicitly commits with the Send to System button. Good architecture; keep it.

### Confirmed H1 at the exact join point

`TacticsPage.jsx:2580–2584` builds `projectWeeklyQuotas` as `[{ id, label, weeklyHours }]` where `label = projectNickname || projectName`. `ProjectTimePlannerV2.jsx:93–103` then builds a Map keyed by **label only** — the `id` field is discarded. `ProjectRow.jsx:86` looks up by nickname and silently falls back to 0 on miss. Both ends have the id available; neither side uses it. This is a one-line fix (key the Map by id, look up by id) that eliminates the rename bug without waiting for the Supabase migration. Given that CLAUDE.md says "do not extend nickname as a join key," the current state is actually worse than fixing it, because new code keeps landing on top of a known-broken join.

### New: `useTacticsMetrics` hook is dead code ✅ DONE (2026-05-01)
*File deleted. Confirmed orphaned across all `.js/.jsx/.ts/.tsx/.json` (the only reference inside `src/` was the file's own export). With it gone, `tactics-metrics-state-update` now has zero consumers in the active app — the live metrics layer is genuinely write-only, consistent with the audit's two-layer-data-model finding. CLAUDE.md updated to reflect this in the same batch.*


`src/hooks/planner/useTacticsMetrics.js` is defined and exported but not imported anywhere. It reads from `loadTacticsMetrics` (live), which is the wrong layer for a System-facing consumer. Safe to delete; add to the dead-code list in CLAUDE.md.

### New: live metrics writes have no reader in production

`TacticsPage.jsx:2543–2571` fires `saveTacticsMetrics` on every change of `projectSummaries`. But `loadTacticsMetrics` is only read by (a) the dead `useTacticsMetrics` hook, (b) the legacy `/v1` wireframe, (c) `archiveYear.js` and `createDraftYear.js` when copying state forward. Nothing in the active UI reads the live metrics storage. The continuous writes are effectively generating garbage. Options: remove the live save entirely and only write on Send to System (simpler model), or keep it for future reactive use. If the live save stays, it should at least debounce — currently it runs on every chip drag tick.

### New: `saveTacticsSettings` is not year-scoped ✅ DONE (2026-05-01)
*All eight tactics page settings (`startHour`, `startMinute`, `incrementMinutes`, `showAmPm`, `use24Hour`, `startDay`, `chipDisplayModes`, `summaryRowOrder`) split out of the global `tactics-page-settings` blob into a year-scoped `tactics-year-{N}-settings` key. Old `loadTacticsSettings` / `saveTacticsSettings` deleted; replaced with `loadTacticsYearSettings(yearNumber)` / `saveTacticsYearSettings(payload, yearNumber)` that throw on missing `yearNumber` so any future caller without a year fails loud rather than silently corrupting data. Save dispatches a new `tactics-settings-state-update` event with `__eventYear` per the H3 contract; no current consumer, fired for parity with the other year-scoped storage modules. One-shot module-load cleanup wipes the legacy global key so existing pre-split data does not linger. Five files touched: `tacticsStorage.js`, `TacticsPage.jsx`, `useTacticsChips.js`, `ProjectTimePlannerV2.jsx`, `createDraftYear.js`. `archiveYear.js` and `undoDraftYear.js` untouched (the existing `-year-{N}-` predicate already catches the new key). Manual repro confirmed fixed: changing wake/sleep on a draft year no longer mutates the active year.*


`src/lib/tacticsStorage.js:3` — `TACTICS_SETTINGS_KEY = 'tactics-page-settings'`. User-scoped (via storageService) but not year-scoped. Settings include `startHour`, `startMinute`, `incrementMinutes`, `startDay`, `chipDisplayModes`, `summaryRowOrder`. If a user changes these on the draft year, they apply to the active year too. In particular, `incrementMinutes` affects how chips resolve their row positions — so changing the increment on one year can visually shift chips on the other. Severity: medium. Fix direction: year-scope the settings, or document that these settings are intentionally global and handle the increment-change case explicitly.

### New: another raw localStorage bypass in draft creation

`src/utils/planner/createDraftYear.js:282` — `localStorage.removeItem(\`tactics-year-${draftYearNumber}-send-to-system-ts\`)`. Same pattern as B2 but in helper code. Roll into the same fix (route through storageService).

### New: latent bug in `buildQuotasMap` truthiness check ✅ DONE (already fixed during H1 work)
*The brief's line numbers were slightly stale. The current `buildQuotasMap` in `ProjectTimePlannerV2.jsx` (now line 104, after intervening edits) already uses `quota.weeklyHours != null` with an explicit comment noting that zero-hour quotas must be preserved. That fix landed during the H1 rekey work (when the Map switched from keying on `label` to keying on `id`). Single grep across the file confirms only one occurrence of `weeklyHours`. The parallel site at `useTacticsMetrics.js:23` is moot because that file was deleted in this batch.*


`ProjectTimePlannerV2.jsx:97` and `useTacticsMetrics.js:23` both do `if (quota?.label && quota?.weeklyHours)`. Since `weeklyHours` is a number and can legitimately be `0`, a project with zero scheduled minutes is silently dropped from the map. Currently this has the same user-visible effect as ProjectRow's `?? 0` fallback, so no bug in practice. But if the payload format ever changes (e.g. `weeklyHours: "0:00"` string form), both checks will still pass for truthy strings but fail for numeric zero. Change the guard to `quota?.label != null && quota?.weeklyHours != null`.

### Summary for testing

From this deeper read, the three things that would most benefit from a direct test are:

1. **Rename a project on Goal after pressing Send to System.** Expected: System continues to show the correct quota. Actual with current code: System shows 0 until the user presses Send to System again on Plan. This is H1, confirmed at the exact join point.
2. **Create a draft year after Send to System on the active year.** Expected: the draft year's System page shows empty / defaults until the user commits on the draft. Actual: probably correct, because `createDraftYear` clears the sent chips snapshot — but worth a dry run.
3. **Change `incrementMinutes` on the draft year.** Expected: affects only the draft. Actual: affects the active year too, because settings are global.

---

## Addendum — Deep read of ProjectTimePlannerV2.jsx (April 22)

Line-by-line read of the System page focused on save paths, listeners, and the archive flow. A few earlier findings get revised based on what I actually saw.

### Architectural discovery: `<Outlet key={currentYear}>` remounts pages on year change

`src/components/Layout.jsx:8` wraps the router outlet in `<Outlet key={currentYear} />`. Changing `currentYear` changes the key, so the entire page tree is torn down and rebuilt. This has several downstream consequences worth stating plainly because it changes the risk assessment:

- All `useState(() => readFoo(yearNumber))` initializers re-run on year change → state is fresh. Good.
- Unmount cleanups capture the `currentYear` that was in scope at mount, which is the correct year to flush to. The empty-deps flush at V2:315–320 is therefore safe.
- `useAutoPersist` saving `taskRows` with the new `yearNumber` is never called with stale data, because the hook's state itself is remounted.
- Any ref or memo that tries to detect a year change inside a single page instance is dead code, because the page never sees a change — it just gets a new instance.

### Revised: H4 (cold-load race) downgraded

With the remount behavior and the fact that V2's `useState(() => loadMetricsData(currentYear))` and `useState(() => loadEnrichedChips(currentYear))` run synchronously on mount, there is no real race on direct-URL navigation to `/`. If the sent snapshot is empty (because the user has never pressed Send to System for this year) the page correctly renders empty/defaults; that's the intended state, not a bug. **Downgrade H4 from high to medium** — the only legitimate concern left is ergonomic: a user who lands on System on a fresh year may not understand why quotas are zero until they press Send to System on Plan.

### Revised: H2 (stale closure on Send to System listener) downgraded

The listener at V2:1347–1360 depends on `[currentYear, resetSubprojectLabels]`. `resetSubprojectLabels` is wrapped in `useCallback` with deps `[totalDays]`. So the listener re-registers cleanly whenever `totalDays` changes — no stale closure, no accumulation under normal use. **Downgrade H2 from high to low**. The original concern was overstated; the code is correct. Leave it as a note rather than a fix.

### New: `prevYearRef` effect at V2:391–399 is dead code ✅ DONE (2026-05-01)
*Effect removed. Replaced with a short comment block explaining why no year-change effect is needed (the `<Outlet key={currentYear}>` remount in `Layout.jsx` makes the `useState` initialisers re-run on year switch). The two state setters the effect called (`setMetricsData`, `setTacticsChips`) are still used by the live `tactics-send-to-system` listener at lines 1411 to 1430, so the destructuring stays. `useRef` is still used four other places in the file, so the import is unaffected.*


```js
const prevYearRef = useRef(currentYear);
useEffect(() => {
  if (currentYear !== prevYearRef.current) { … }
}, [currentYear]);
```

Because the component is force-remounted on year change, `prevYearRef.current` always equals `currentYear` on every render within the same instance. The `if` branch never fires. Safe to delete, but confusing to new readers (me, today). Recommend removing.

### New: `useArchiveOperations` is dead code, not a live duplication ✅ DONE (2026-05-01)
*File deleted. Confirmed orphaned across all `.js/.jsx/.ts/.tsx/.json` (only reference inside `src/` was the file's own export). The CLAUDE.md "Known issues" bullet that called this a duplication has been replaced in the same batch — the inline `handleArchiveWeek` in `ProjectTimePlannerV2.jsx` is now the only implementation, full stop.*


CLAUDE.md says `handleArchiveWeek` is duplicated between the inline V2 version and `useArchiveOperations.js`. I checked: `useArchiveOperations` is not imported anywhere. The inline V2 version is the only live implementation. The CLAUDE.md note should change from "duplication, don't add a third" to "`useArchiveOperations` is orphaned, delete it." Add to the dead-code list.

### Confirmed: raw localStorage bypass count and locations

Full inventory of B2 bypasses for the fix PR:

| File | Line | Operation | Key pattern |
|---|---|---|---|
| `src/pages/TacticsPage.jsx` | 2608 | `setItem` | `tactics-year-{N}-send-to-system-ts` |
| `src/pages/ProjectTimePlannerV2.jsx` | 214 | `getItem` | same |
| `src/pages/ProjectTimePlannerV2.jsx` | 397 | `getItem` | same |
| `src/pages/ProjectTimePlannerV2.jsx` | 1337 | `getItem` | same |
| `src/pages/ProjectTimePlannerV2.jsx` | 1349 | `getItem` | same |
| `src/utils/planner/createDraftYear.js` | 282 | `removeItem` | same |
| `src/utils/planner/undoDraftYear.js` | 100 | `removeItem` | same |
| `src/pages/SignupPage.jsx` | 11 | `getItem` | `listical_age_block` |
| `src/pages/SignupPage.jsx` | 22 | `removeItem` | same |
| `src/pages/SignupPage.jsx` | 28 | `setItem` | same |

Ten total. The send-to-system-ts ones should go through `storageService` (they're meant to be user-scoped). The age-block ones are a separate problem (see B3) and need a server-side solution anyway.

### Concrete fix path for B1 (localStorage cleanup on account deletion)

`src/lib/storageService.js:263` exports `getAllKeys()`. The B1 cleanup is a one-function addition to the storage service plus a call from the deletion flow before `signOut()`:

```js
// In storageService.js
export function clearUserKeys(userId) {
  if (!isBrowserEnvironment() || !userId) return;
  const prefix = `user:${userId}:`;
  const keys = getAllKeys().filter(k => k.startsWith(prefix));
  keys.forEach(k => window.localStorage.removeItem(k));
}

// In src/lib/api/accountDeletion.ts, before supabase.auth.signOut()
const userId = getCurrentUserId();
if (userId) clearUserKeys(userId);
```

Low risk, small change, closes the leak.

### Confirmed: `useComputedDataV2` write-back loop converges in one cycle

The loop at V2-hook:111–153 compares only four fields (`status`, `estimate`, `timeValue`, `_originalEstimate`). If they differ from computed, `setData` is called with computed values merged in. Next render: useMemo recomputes from the updated `data`, comparison matches, no write. Single extra render per real change. Works; not efficient but not broken. CLAUDE.md's warning ("do not remove without fully understanding") is correct.

### Revised finding summary

With this pass, the launch-blocker and high-severity list becomes:

- **B1**: confirmed, concrete fix path given above.
- **B2**: confirmed, full inventory above.
- **B3**: confirmed. Still needs server-side fix.
- **B4**: confirmed.
- **H1**: confirmed at the exact join point in the Plan deep read; Plan sends `id` + `label`, System throws `id` away and keys by `label`. One-line Map change fixes it.
- **H2**: downgrade to low — not an actual bug in practice.
- **H3**: confirmed, still valid.
- **H4**: downgrade to medium — more of a UX edge case than a bug.
- **M1–M5**: unchanged.
- **New**: three findings added in the previous TacticsPage addendum. Two more added here (dead prevYearRef effect, useArchiveOperations is orphaned not duplicated).

### Summary for testing

The System page specifically benefits from these targeted tests:

1. **Rename a project on Goal, then refresh System.** Should show correct quotas. H1 says it will show 0 until Send to System runs again.
2. **Switch year while editing a task row.** The debounced 500ms save should flush on unmount via the cleanup at V2:315–320. Verify the edit is persisted to the original year (not the new year).
3. **Archive a week, then undo immediately.** `handleArchiveWeek` uses command pattern with undo — verify the undo restores the exact prior state, including recurring task statuses.
4. **Press Send to System while System is open on another tab (if supported) or just while mounted.** Verify the listener re-runs and subproject labels refresh without needing to navigate away.
5. **Direct-URL cold load on `/`.** Verify correct behavior even if the user has never visited Plan that session.

### H5 (new) — Send to System stomps user edits on chip task rows ✅ DONE (2026-04)

**File:** `src/pages/ProjectTimePlannerV2.jsx:1281–1295` (inside `resetSubprojectLabels`).

**What happens today:** The subproject header row tracks a `_chipLabel` field and compares it to the current `subprojectName` to detect user edits, preserving manual changes across Send to System runs. The chip *task* row underneath has no equivalent tracking. The comparison at line 1289 is `row.task !== shortLabel || row.estimate !== estimateLabel || row.timeValue !== timeVal || row.recurring !== 'true'`, and any difference triggers a full overwrite to canonical values. This means the user's manual edits to chip task `task` text, `estimate`, `timeValue`, or `recurring` flag are silently reverted on every Send to System — the very action that's supposed to sync from Plan *to* System without destroying user work on System.

**Why it matters:** The user has confirmed the intended behavior is "edits are honoured" — so this is a behavior bug, not a design question. The edit-protection logic exists for the header but was never extended to the task row. Likely just a half-implemented feature from an earlier pass.

**Reproduction:**
1. On Plan, place a chip for project X on Saturday with duration 3 hours. Press Send to System.
2. On System, edit the chip task row — change task from "X" to "Custom name", flip recurring to false.
3. Go back to Plan. Without changing anything, press Send to System again.
4. Return to System. Task is back to "X", recurring is back to true.

**Fix direction:** Mirror the header logic. Stamp `_originalTask`, `_originalEstimate`, `_originalTimeValue`, `_originalRecurring` at the time the chip task is created or last synced from Plan. On each subsequent Send to System, only overwrite fields where `row.field === row._originalField` (user hasn't diverged from canonical). Update `_originalField` whenever the canonical side actually changes. Alternative: compare against the last-known-canonical per-chip and only write if Plan's canonical value changed on this press.

**Priority:** High. Silent data loss on every Send to System press is among the worst bug classes for user trust.

---

## Addendum 4 — Supabase schema vs current storage shape audit (2026-04-22)

**Context:** A full planning schema already exists in `supabase/migrations/20260102000001_initial_schema.sql`, but no client code reads from or writes to these tables today. All three pages have been rewritten since that migration was authored, so the schema is stale against current shapes. This addendum catalogues the deltas per storage module so the Supabase migration work has a concrete starting point.

### Schema tables (reference)

`profiles`, `years`, `projects`, `subprojects`, `planner_rows`, `day_entries`, `tactics_daily_bounds`, `project_weekly_quotas`, `tactics_chips`, `user_preferences`, `deletion_audit_log`.

### Top-level schema issues (apply across modules)

1. **`years.status CHECK` allows only `'active'` and `'archived'`.** Current app has a first-class `'draft'` status (see CLAUDE.md Plan Next Year flow, `createDraftYearFromActive`, `ArchiveYearModal`, dev-only Undo Draft). **Blocker for migration.** Fix by `ALTER TYPE` / `DROP CHECK + ADD CHECK` with `('active','draft','archived')`.
2. **No sent-snapshot tables.** The current architecture has two layers per Plan surface: a live layer (continuous autosave) and a committed snapshot (Send to System). Schema represents only one layer. Options: add `is_sent_snapshot BOOLEAN` plus `sent_at TIMESTAMPTZ` columns on `tactics_daily_bounds`, `project_weekly_quotas`, and `tactics_chips`; or create parallel `*_sent` tables. Leaning toward the boolean + unique partial index (`UNIQUE (user_id, year_id) WHERE is_sent_snapshot = true`) for simplicity.
3. **CASCADE DELETE coverage for B1 / Right to Erasure.** Every user-owned row must cascade from `auth.users(id)` deletion. The migration file defines FKs but I did not verify each has `ON DELETE CASCADE` end-to-end through `years → projects → subprojects → planner_rows → day_entries`. Must be audited before launch regardless of whether client migration is complete — this is GDPR, not a nice-to-have.
4. **`project_weekly_quotas` is keyed by `project_label` (TEXT) at the schema level.** This bakes H1 into the database. If the user renames a project on Goal, the quota row for the old label orphans. Migration opportunity: replace with `project_id UUID REFERENCES projects(id)` FK before any writes land.

### Module-by-module delta

#### `stagingStorage` (Goal page)

Current key: `staging-year-{N}-shortlist` → `{ shortlist: [...], archived: [...] }`. Each item carries a `planTableEntries` array of rows with custom metadata (`__rowType`, `__pairId`, `__sectionType`, `__isTotalRow`) that has to be JSON-round-tripped.

| Current field | Schema column | Status |
|---|---|---|
| item identity (nickname, color, etc.) | `projects.nickname`, `projects.color`, etc. | Mostly aligned |
| `planTableEntries` | `projects.plan_table_entries JSONB` | Exists but smells legacy — the `plan_*_row_count` columns next to it imply an earlier typed shape. Decide: keep as JSONB (fast migration) or normalize into rows (slower, cleaner). |
| shortlist vs archived separation | `projects.status` or parent `projects.year_id` targeting an archived year | Schema does not encode "archived item inside active year." Need either a `status` column on `projects` or a dedicated `archived_at` timestamp. |
| row metadata (`_rowType`, `_pairId`, `_sectionType`, `_isTotalRow`) | Lives inside the JSONB blob | Fine as JSONB if that path is chosen; would need enum columns + join table if normalized. |

**Recommendation:** Keep `plan_table_entries` as JSONB for first migration pass. Add `projects.archived_at TIMESTAMPTZ` to replace the `shortlist` / `archived` bifurcation. Drop the unused `plan_*_row_count` columns.

#### `tacticsMetricsStorage` (Plan page metrics)

Current keys: `tactics-year-{N}-metrics-state` (live) and `tactics-year-{N}-sent-metrics` (snapshot). Payload contains `dailyBounds` and `projectWeeklyQuotas` arrays.

| Current field | Schema table | Status |
|---|---|---|
| `dailyBounds` (per-day min/max minutes) | `tactics_daily_bounds` | Shape exists; needs verification that columns include `day_index`, `min_minutes`, `max_minutes`, `year_id`, `user_id`. |
| `projectWeeklyQuotas` entries: `{ id, label, weeklyHours }` | `project_weekly_quotas` | Keyed by `project_label`; should be keyed by `project_id` (see top-level issue 4). Current code already carries `id` in the payload — System just discards it. Migration is a clean moment to fix. |
| Sent snapshot vs live | No equivalent | Need the boolean + partial-unique-index approach from top-level issue 2. |

#### `tacticsStorage` (Plan page settings + chips)

Multiple keys. Most relevant:
- `tactics-page-settings` — **not year-scoped.** Global UI settings (start hour, increment minutes, 24-hour toggle, start day, chip display modes, summary row order).
- `tactics-year-{N}-chips-state` → `{ projectChips, customProjects, chipTimeOverrides }`.
- `tactics-year-{N}-sent-chips` → same shape.
- `tactics-column-widths-{N}`.

| Current field | Schema column | Status |
|---|---|---|
| Settings (global) | `user_preferences` (generic `setting_key/setting_value` JSONB) | Fits. One row per setting, or one row with the blob; either works. |
| Chip: `dayName`, `columnIndex`, `durationMinutes`, `startMinutes`, `userModified`, `label`, `subprojectLabel`, `color` | `tactics_chips` | **Missing columns.** Schema has `column_index` (CHECK 0–6, days only) but not `dayName`, `durationMinutes`, `startMinutes`, or `userModified`. Either widen to day 0–6 only (breaks project-column chips) or drop the CHECK and allow `column_index >= 0` with a separate `column_kind ENUM('day','project')`. |
| `chipTimeOverrides` (per-chip minute adjustments) | Missing | Add as JSONB column on the chip row, or a second `tactics_chip_time_overrides` table. |
| `customProjects` (user-added chip templates not tied to Goal projects) | Missing | Needs a new table or a nullable `project_id` on `tactics_chips` with an accompanying `custom_project_name TEXT`. |
| Column widths | Could live in `user_preferences` | Low priority. |
| Live vs sent | Same boolean partial-index approach as metrics |

**Recommendation:** Plan on widening `tactics_chips` significantly before migrating chips. The schema as-is cannot represent today's chip object without data loss.

#### `plannerStorage` (System page, in `src/utils/planner/storage.js`)

Per-project, per-year keys. Many UI-preference keys (`show-recurring`, `show-subprojects`, `collapsed-groups`, `column-sizing`, `size-scale`, `sort-statuses`, `sort-planner-statuses`, `visible-day-columns`) plus the payload-heavy `task-rows` key.

| Current field | Schema table | Status |
|---|---|---|
| Task rows (task, estimate, status, recurring, day-cell entries, subproject, metadata like `_chipLabel`) | `planner_rows` + `day_entries` | Shape is roughly right. Must verify: does `planner_rows` include `recurring BOOLEAN`, `estimate_text`, `status`, `subproject_id FK`, `chip_label TEXT`, `original_task/estimate/etc.` (for H5 fix)? |
| Day cell entries (status per day per row) | `day_entries` | Correct shape if it has `(planner_row_id, day_index, status)`. |
| Sort / visibility / size-scale / column-sizing / collapsed-groups | `user_preferences` | All UI state. Fine to serialize as JSONB. |
| Start date (`planner-v2-project-{id}-year-{N}-start-date`) | `years.start_date` or `projects.start_date` | Confirm which. Today each project can have its own start date; schema should reflect that. |

### Fields current code writes that schema does not represent (the fix list)

1. `years.status` missing `'draft'` enum value.
2. `tactics_chips` missing: `day_name`, `duration_minutes`, `start_minutes`, `user_modified`, `chip_time_overrides`, support for `column_index > 6`, support for custom (non-project) chips.
3. `project_weekly_quotas` keyed by label instead of `project_id`.
4. No sent-snapshot layer.
5. No `archived_at` / soft-archive on `projects` (today encoded via the `archived` array inside the staging JSON blob).
6. No `_original*` fields on task rows to fix H5 (Send to System stomp).

### Schema fields that current code does not write (candidate drops)

1. `projects.plan_*_row_count` — smells like an old typed-shape attempt superseded by `plan_table_entries` JSONB. Verify before dropping.
2. Any `tactics_chips` fields tied to day-only assumption that were never populated.
3. Anything under `user_preferences` with a `setting_key` value that no current code references.

*This is a schema-side inventory only — a migration PR should run a grep across the storage modules for each column reference before deleting anything.*

### Migration ordering (to unblock client work)

1. Add `'draft'` to `years.status` CHECK. (blocker #1)
2. Widen `tactics_chips`: add missing columns, drop day-only CHECK or split into `column_kind`. (blocker #2)
3. Add sent-snapshot boolean + partial unique indexes on `tactics_daily_bounds`, `project_weekly_quotas`, `tactics_chips`. (blocker #3)
4. Swap `project_weekly_quotas.project_label` → `project_id UUID FK`. Fixes H1 at the schema level.
5. Add `projects.archived_at`. Let staging shortlist/archived derive from it.
6. Audit and add `ON DELETE CASCADE` everywhere that chains to `auth.users(id)`. Cross-reference with `deletion_audit_log` tests.
7. Only now port `stagingStorage` internals to write to Supabase. Keep the module's public API identical.
8. Port `tacticsMetricsStorage`, then `tacticsStorage`, then `plannerStorage` — in that order, each behind a feature flag, with localStorage as read-through fallback during rollout.

---

*Report generated during a code review session. All findings based on code as it exists in the repo on 2026-04-22.*
