# Code Review — Pre-Launch Pass (April 2026)

**Scope:** Orientation and risk-ranked bug audit of the Codex Listical codebase ahead of July 2026 launch. Reviewer: Claude (session with Prentice). Purpose: inform the test plan, surface bugs before they ship, flag pre-launch hygiene.

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

#### B1 — Account deletion leaves all localStorage data on the device

**Files:** `src/components/DeleteAccountModal.jsx`, `src/lib/api/accountDeletion.ts`, `supabase/functions/account-delete/index.ts`, `src/contexts/AuthContext.jsx`.

**What happens today:** The flow calls the `account-delete` Edge Function, which flags the profile for 30-day soft deletion (the cron job at `api/cron/process-deletions.ts` actually hard-deletes later). The client then calls `supabase.auth.signOut()`, which triggers `setCurrentUserId(null)` via the `AuthContext` listener. **At no point does anything clear localStorage keys prefixed with `user:{deletedUserId}:`**. The data stays on that browser forever until manually cleared.

**Why it matters:** Dance schools frequently have shared devices. User A deletes their account, User B signs up on the same browser. User A's data is no longer reachable through normal app flow (good), but it's trivially reachable via browser dev tools by reading keys matching `user:*`.

**Also note:** The server-side `hardDeleteUser` function (`src/lib/server/accountDeletion.ts:391`) has a comment: `// Add explicit deletes here for any tables that don't have CASCADE delete // For example: user_lists, user_preferences, etc.` followed by no code. Currently only the auth user and profile are deleted. This is a placeholder waiting for the Supabase migration; fine for now since planning data lives only in localStorage, but must be completed before or alongside the Supabase migration.

**Fix direction:** On successful deletion request, enumerate and remove all `user:{userId}:*` keys from localStorage before `signOut()`. Storage service already has a `getCurrentUserId` and the scoped keys follow a predictable pattern.

---

#### B2 — Raw `localStorage` calls bypass user-prefix scoping (leaks across users)

**Files & lines:**
- `src/pages/TacticsPage.jsx:2608` — `localStorage.setItem(getSendToSystemTsKey(currentYear), ...)`
- `src/pages/ProjectTimePlannerV2.jsx:214, 397, 1337, 1349` — `localStorage.getItem(getSendToSystemTsKey(...))`
- `src/pages/SignupPage.jsx:11, 22, 28` — `localStorage.{get,set,remove}Item(AGE_BLOCK_KEY)`
- `src/utils/planner/undoDraftYear.js:100` and `src/utils/planner/createDraftYear.js:282` — raw `localStorage.removeItem(...)`

**What happens today:** Every call to `storageService.get/set/removeItem` prepends `user:{currentUserId}:` when a user is authenticated. These direct `localStorage.*` calls skip that, so keys like `tactics-year-1-send-to-system-ts` and `listical_age_block` are stored without the user prefix. On a shared device: User A's "sent to system" timestamp gets seen by User B. The age-block timer is also shared across users on the same device (a user who fails age verification can block a legitimate signup by another user for 24 hours).

**Fix direction:** Route every one of these through `storageService`. For the send-to-system timestamp, either route through the storage service or tombstone it into a proper user-scoped key. For the age block, this is subtler (see B3 below) — the intent is anti-abuse so it needs to be server-side anyway.

---

#### B3 — Age verification is client-side only

**File:** `src/pages/SignupPage.jsx:104–133`.

**What happens today:** Age is computed from a date picker and checked in the browser. If the age check fails, a localStorage flag blocks the user on that device for 24 hours. A user who disables JS, or who intercepts the form submission, or who simply clears localStorage can sign up at any age. The date of birth is passed to Supabase signup metadata, but there's no server-side constraint that rejects signups under 13.

**Why it matters:** COPPA (US) and GDPR-K (EU) both require real protection for children under 13. Client-side checks don't meet that bar. The app is specifically targeted at dance students, so this is a concrete risk.

**Fix direction:** Add a Postgres trigger (or Edge Function) that rejects signups where `date_of_birth` indicates under 13. The client-side check should stay as UX, but the server check is what actually prevents non-compliant signups. Related: consider whether you need parental consent for 13–15 (GDPR-K specifies 16 as the default, with member states allowed to lower to 13; the UK has set it at 13).

**Also flag:** `navigate('/')` fires immediately after signup (line 162). If Supabase email confirmation is enabled (and it should be), this navigation will fail silently and the user will just sit on an unauthenticated `/` route. If email confirmation is disabled, users can sign up with other people's emails without access to that mailbox — an abuse vector. Confirm which setting is in Supabase dashboard, and make the post-signup UX match.

---

#### B4 — Dev-only "Undo Draft" and "Revert Archive" buttons ship in production

**File:** `src/components/planner/NavigationBar.jsx` (around lines 177–200, per explorer agent).

**What happens today:** CLAUDE.md says these are dev-only and must be removed before launch. They aren't gated behind any environment check. The only guard is that the button only renders when a draft year (or archived year) exists, which is the normal production state after someone plans their second year.

**Why it matters:** One misclick on "Undo Draft" wipes all of the user's draft-year Goal and Plan data with no undo and no confirmation modal. This is the single most destructive action in the app.

**Fix direction:** Gate both buttons behind `import.meta.env.DEV` or a feature flag, or remove them. If you want to keep the ability to undo a draft for real users, it needs a confirmation modal ("This will delete all draft data. Are you sure?") and the button wording should be less alarming.

---

### 🟠 HIGH SEVERITY

#### H1 — `projectNickname` rename orphans quota data, silently returns 0

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

#### H3 — Cross-year event collisions

**Files:** `src/lib/stagingStorage.js:125`, `src/lib/tacticsMetricsStorage.js:38`.

**What happens today:** Storage keys are year-scoped (`staging-year-1-shortlist`), but the events that announce updates are NOT year-scoped (`staging-state-update` is a flat event name). If a user switches years, the listeners don't know which year fired the event. They re-read whatever year their context thinks is current, which can be stale.

**Reproduction:** Open Goal on Year 1, open Plan in a second tab on Year 2. Edit on Goal Year 1. Plan tab receives `staging-state-update` and re-reads, potentially with stale year context.

**Fix direction:** Include yearNumber in event `detail`, and have listeners compare to their own `currentYear` before acting. Small change, removes a class of bugs.

---

#### H4 — System page cold-load race on direct navigation

**File:** `src/pages/ProjectTimePlannerV2.jsx` (load pattern around line 389).

**What happens today:** If a user opens the app directly on `/` (System page), only System mounts. Goal and Plan never mount on initial load. System subscribes to events but the events fired by Goal/Plan happen at save time, not load time, so System reads whatever was last persisted to storage. If storage is empty (fresh session) or stale, System renders with defaults or zeros. It only recovers once the user navigates away and back.

**Fix direction:** On System mount, explicitly load from storage (don't rely solely on events). Verify `loadMetricsData(currentYear)` actually reads all needed keys synchronously during `useState` initialization. This is probably mostly OK, but worth a deliberate check.

---

### 🟡 MEDIUM SEVERITY

#### M1 — Draft year and orphaned storage cleanup is incomplete

`undoDraftYear` removes a known list of keys but doesn't fully cover all year-scoped keys that may have been created. Not destructive (orphans are inert) but creates cruft and eventually localStorage quota pressure for heavy users.

#### M2 — Archive flow has no transaction semantics

`performYearArchive` has multiple independent storage writes. If one fails mid-way, the user can land in an inconsistent state (old year marked archived, new year not ready). Wrapped in try/catch but no rollback. Rare but unpleasant when it happens.

#### M3 — No validation before archiving (empty-goal trap)

A user can press "Archive Year N?" with an empty Goal page on the draft. The draft promotes to active, and the user starts a new year with no projects defined. Recoverable but jarring. Add a pre-archive validation check.

#### M4 — Weak password policy (6-character minimum)

`SignupPage.jsx:142–144`. Industry baseline is 8+ with complexity or 12+ without. For an app that will have hundreds of users on potentially shared devices, 6 characters is not enough.

#### M5 — Missing ErrorBoundary and 404 route

If any component throws, the user sees a white screen with no recovery. Any unrecognized URL behaves unpredictably in React Router. Low-effort fix, meaningful UX win.

---

### 🟢 LOW SEVERITY / Pre-Launch Polish

#### P1 — `index.html` is default Vite template
Title is `codex-listical` (lowercase). Favicon is `/vite.svg`. No `<meta name="description">`, no OG tags, no theme-color, no manifest. Would look unpolished at launch.

#### P2 — Legacy `/v1` route still in router
`src/routes/index.jsx:78–84` still mounts `ProjectTimePlannerWireframe`. CLAUDE.md calls this legacy. Remove before launch; the route is accessible to any authenticated user who types the URL.

#### P3 — `console.log` calls in `ProjectTimePlannerWireframe.jsx`
Lines 1498, 1501, 1513, 1526, 1534, 1542, 1547, 1554, 1558, 1559. Becomes moot when you delete the `/v1` route.

#### P4 — `public/robots.txt` missing
Vercel will index the site on launch. Decide what you want crawled; at minimum add a `robots.txt` that disallows authenticated areas.

#### P5 — No security headers in `vercel.json`
Consider adding CSP, X-Frame-Options, Referrer-Policy. Not blocking but good hygiene.

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

### New: `useTacticsMetrics` hook is dead code

`src/hooks/planner/useTacticsMetrics.js` is defined and exported but not imported anywhere. It reads from `loadTacticsMetrics` (live), which is the wrong layer for a System-facing consumer. Safe to delete; add to the dead-code list in CLAUDE.md.

### New: live metrics writes have no reader in production

`TacticsPage.jsx:2543–2571` fires `saveTacticsMetrics` on every change of `projectSummaries`. But `loadTacticsMetrics` is only read by (a) the dead `useTacticsMetrics` hook, (b) the legacy `/v1` wireframe, (c) `archiveYear.js` and `createDraftYear.js` when copying state forward. Nothing in the active UI reads the live metrics storage. The continuous writes are effectively generating garbage. Options: remove the live save entirely and only write on Send to System (simpler model), or keep it for future reactive use. If the live save stays, it should at least debounce — currently it runs on every chip drag tick.

### New: `saveTacticsSettings` is not year-scoped

`src/lib/tacticsStorage.js:3` — `TACTICS_SETTINGS_KEY = 'tactics-page-settings'`. User-scoped (via storageService) but not year-scoped. Settings include `startHour`, `startMinute`, `incrementMinutes`, `startDay`, `chipDisplayModes`, `summaryRowOrder`. If a user changes these on the draft year, they apply to the active year too. In particular, `incrementMinutes` affects how chips resolve their row positions — so changing the increment on one year can visually shift chips on the other. Severity: medium. Fix direction: year-scope the settings, or document that these settings are intentionally global and handle the increment-change case explicitly.

### New: another raw localStorage bypass in draft creation

`src/utils/planner/createDraftYear.js:282` — `localStorage.removeItem(\`tactics-year-${draftYearNumber}-send-to-system-ts\`)`. Same pattern as B2 but in helper code. Roll into the same fix (route through storageService).

### New: latent bug in `buildQuotasMap` truthiness check

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

### New: `prevYearRef` effect at V2:391–399 is dead code

```js
const prevYearRef = useRef(currentYear);
useEffect(() => {
  if (currentYear !== prevYearRef.current) { … }
}, [currentYear]);
```

Because the component is force-remounted on year change, `prevYearRef.current` always equals `currentYear` on every render within the same instance. The `if` branch never fires. Safe to delete, but confusing to new readers (me, today). Recommend removing.

### New: `useArchiveOperations` is dead code, not a live duplication

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

### H5 (new) — Send to System stomps user edits on chip task rows

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
