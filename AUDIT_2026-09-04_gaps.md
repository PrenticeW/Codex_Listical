# Code + UX gap audit (web + mobile), 4 Sep 2026

Scope: `Codex_Listical` (web, React/Vite) and `tacular-mobile` (Expo). Focus: things that leak, linger, or never get cleaned up, plus UX gaps. Items already tracked in `WEB_KNOWN_ISSUES.md` / `KNOWN_ISSUES.md` are only listed where still open.

Severity: HIGH = data or privacy impact, MED = correctness under real use, LOW = hygiene.

---

## WEB

### HIGH

**W1. Planner rows stay on disk (IndexedDB) after sign out.**
`src/lib/plannerOffline.js` writes `snapshot:{uid}:{year}` and `pending:{uid}:{year}` records. Nothing ever deletes a snapshot (only `clearPendingState` exists, called after a successful save), and no sign out or `USER_DELETED` handler touches IndexedDB. The CRIT-1 fix scoped `localStorage`, but the offline layer landed afterwards with the same gap: on a shared browser, user A's full task list remains readable in DevTools after logging out. Fix: on `SIGNED_OUT` / `USER_DELETED` (and on account deletion), delete every key with the old uid prefix; also add a small age based sweep so abandoned years do not accumulate.

**W2. In memory bookkeeping is keyed by year, not user, and is not reset on sign out.**
`utils/planner/storage.js` (`_knownRowIds`, `_baselineRows`, `_readHighWater`, `_serverReadYears`, `_syntheticRowIds`, `chipNotesCache`), `lib/stagingStorage.js` (`_knownProjectIds`, `_systemOrders`), `lib/tacticsStorage.js` (`_chipLiveVersions`), `lib/tacticsMetricsStorage.js` (`_metricsLiveVersions`). These are only cleared by `markPlannerRowsStale` (tab wake / online) or the next preload. Sign out A, sign in B in the same tab (no reload): B's first planner diff runs against A's baseline and known ids, B's chip layer save uses A's version number (guaranteed conflict, and a spurious "updated from another device"), and `loadChipTaskNote` can return A's notes until B's preload finishes. Fix: one `resetSessionState()` per storage module, called from the `SIGNED_OUT` branch in `AuthContext` (or from `storageCache.adoptUser` when the owner changes).

### MED

**W3. Edits made in the last 500 ms before closing the tab are lost.**
`ProjectTimePlannerV2.jsx:484` debounces `setTaskRows` by 500 ms; the durable pending record in `plannerOffline` is only written once that fires. There is no `beforeunload` / `pagehide` handler anywhere in `src`. Fix: on `pagehide`, flush the debounce synchronously (call the save immediately, or at least write the pending IndexedDB record).

**W4. Realtime channel status is logged but not acted on.**
`ProjectTimePlannerV2.jsx:658` `.subscribe((status) => console.log(...))`. `CHANNEL_ERROR` / `TIMED_OUT` / `CLOSED` are not handled, so after a laptop sleep or a network blip the page can sit with a dead channel until the 60 s tab wake rule or an `online` event happens to fire. Fix: on those statuses call `scheduleRefresh(0)` and re-subscribe with backoff.

**W5. IndexedDB connection is cached forever, including a failed one.**
`plannerOffline.js:48` caches `_dbPromise`; a rejected open (Safari private mode, storage pressure) is never retried for the session, and there is no `onversionchange` / `onclose` handler, so a browser evicting the DB leaves every later offline write failing silently. Fix: reset `_dbPromise = null` on rejection and in `db.onclose`.

**W6. Year metadata retry loop has no backoff and no cancel.**
`contexts/YearContext.jsx:67` retries `load()` every 3 s forever on error. A user with an expired session or a Supabase outage generates a request every 3 s per open tab indefinitely. Fix: exponential backoff with a cap, stop when signed out, clear the timer on unmount.

**W7. Debug code still ships (open MED-3, re-confirmed).**
`DebugSnapshotButton` in `Layout.jsx:29/152`, `showSnapshotToast` in `snapshotStorage.js:724/825`, `[realtime]` and `[planner-save]` logs, `Auth state changed` log. 41 `console.log` calls in `src` outside tests. The realtime logs include the user id.

### LOW

**W8. Fire and forget timers/rAF in components.** `ArchiveYearModal.jsx:70` calls `onClose()` 2 s later even if the modal is gone; `AddTasksModal`, `DeleteAccountModal`, `MultiPasteModal` focus timers; `ProjectTimePlannerV2` uses 5 `requestAnimationFrame` calls with no cancel. Harmless individually (React 19 ignores setState after unmount), but `ArchiveYearModal` can close a parent that has since reopened.

**W9. `alert()` for failures.** Six `alert(\`Could not ...\`)` calls across the three pages (`ProjectTimePlannerV2.jsx:342/361`, `TacticsPage.jsx:387/399`, `StagingPageV2.jsx:122/134`). Blocking, unstyled, and not reachable by screen readers consistently. Route through the existing toast/badge pattern.

**W10. Stray files at repo root.** `_t.mjs`, `_theme_check.mjs`, empty `vite.config.js.bak`. `.env.local` and `.env.vercel` sit next to `.env.example`; confirm both are gitignored.

**W11. Size.** `TacticsPage.jsx` ~5,000 lines with 27 listener registrations; `ProjectTimePlannerV2.jsx` similar. Every effect there is cleaned up correctly today, but the file size is what will make the next W4 style bug hard to spot. 53 `eslint-disable` comments, most for `exhaustive-deps`.

### UX (web)

- **No unsaved changes guard** (see W3). A quick edit then Cmd+W silently loses it.
- **Failure paths use `alert()`** (W9).
- **Only 20 `aria-label`s across all components; 69 `title=` tooltips carry the meaning instead.** Icon only buttons in the toolbars are unnamed for screen readers.
- **Only one `@media` query and one Tailwind breakpoint in the whole app.** The site is desktop only by design, but there is no "open on a bigger screen" message for phone visitors, who get a horizontally scrolling table.
- **Modals:** only `AddLinkDialog` declares `role="dialog"`; Escape handling exists (29 sites) but no focus trap, so Tab leaves the modal.
- **Sign in on a shared machine:** because of W1, "sign out" does not mean "my data is gone from this browser". Worth a line in the account panel until W1 lands.

---

## MOBILE

### HIGH

**M1. Outbox keeps user A's queued writes when user B signs in.**
`lib/outbox.js:139` `init()` sets `userId` to the new user, then `if (initialized) return;` before the ops array is inspected. The on disk check ("discard outbox from a different account") only runs on the first init per process. Sequence on one phone without a kill: A edits offline, signs out, B signs in, B's `usePlannerData` calls `init(B)` and then `flush()`. A's inserts/patches/deletes are sent under B's session. RLS rejects them, they retry 5 times with backoff, then are dropped with a console warning. Net effect: A's offline edits are silently destroyed, and B sees a "syncing" pill for a while for writes that are not theirs. Fix: when `currentUserId !== userId`, clear `ops`, cancel `retryTimer`, reset `failCount`, and persist an empty queue for the new user.

**M2. Snapshot and outbox stay on disk after sign out.**
`offlineStore.js` is single slot (`tacular.planner.snapshot.v1` / `outbox.v1`) with a `userId` field. They are only cleared when a *different* user's `usePlannerData` runs. Signing out leaves the previous user's full task list in AsyncStorage (unencrypted, by design). Fix: clear both in the `SIGNED_OUT` branch of the `onAuthStateChange` listener in `App.js:127`, and in `accountDeletion.js` before `signOut()`.

### MED

**M3. Signing out with pending writes silently discards them.**
`SystemScreen.js:2913` and `App.js:111` call `signOut()` with no check on `outbox.pendingCount()`. The sync pill shows the count, but the confirm dialog does not mention it. Fix: if `pendingCount() > 0`, change the dialog copy to "You have N unsynced changes. Sign out anyway?" and try one `flush()` first.

**M4. Long lived timers in `SystemScreen.js` not cleared on unmount.**
`autoscrollTimerRef` (`setInterval`, line 3069), `longPressTimerRef` (2072), `hScrollSaveTimerRef` (2816), and the `flashTasks` 1 s timeout (3288) are only cleared on gesture end. Only the sync pill timers (2964) have an unmount cleanup. The screen unmounts on sign out and on the account deletion path; a drag in flight at that moment leaves an interval running for the life of the process, and `hScrollSaveTimerRef` fires `saveSettings` after the session that owned it is gone. Fix: one `useEffect(() => () => {...}, [])` that clears all four.

**M5. Realtime subscriptions ignore channel status.**
`plannerApi.js:296/320` `.subscribe()` with no status callback. Same failure mode as W4; on mobile the foreground `refetch()` masks it, but a phone left on screen through a network change keeps a dead channel until the next background/foreground.

**M6. Screen size captured once at module load.**
`SystemScreen.js:109` and `SignInScreen.js:23` read `Dimensions.get('window')` at import. Rotation, iPad split view, and Stage Manager all break the canvas maths (already noted in KNOWN_ISSUES; still open). `useWindowDimensions()` is the drop in fix.

### LOW

**M7. `SystemScreen.js` is 5,958 lines**, 21 `useEffect`s, 7 cleanups, plus a 4,580 line `_to_delete_SystemScreen.fresh.js` sibling and a `_to_delete/` folder still in the tree. The CANVAS_REFACTOR_PLAN exists; the leak class in M4 is a direct symptom of the file size.

**M8. `outbox.persist()` writes the whole queue on every op** and `flush()` persists after every shift. Fine at tens of ops; a fortnight offline (the stated design target) with hundreds of ops turns each keystroke into a full JSON rewrite of the queue. Consider batching persist behind a microtask.

### UX (mobile)

- **Zero `accessibilityLabel` / `accessibilityRole` across all three screens** (42 `Pressable`/`TouchableOpacity` in `SystemScreen` alone, 5 with `hitSlop`). VoiceOver reads icon buttons as "button" with no name. This is also an App Store review risk; `APP_STORE_CHECKLIST.md` does not mention it.
- **Sign out does not warn about unsynced edits** (M3).
- **Error state only on first load** (`SystemScreen.js:4024` gated on `dataVersion === 0`). After a snapshot seeds the screen, a permanently failing refetch (expired session, deleted year) shows stale data with no banner; `lastSyncedAt` exists in the hook but is not surfaced with an age ("last synced 3 days ago").
- **Dropped writes are invisible.** `outbox.js` drops an op after 5 permanent failures with only `console.warn`. The user's edit vanishes on the next refetch with no message. Surface a one line "1 change could not be saved" toast via the existing `subscribe` channel.
- **Rotation / split view** (M6).

---

## What is in good shape (checked, no action)

- Every `addEventListener` inside a React effect on web has a matching remove (TacticsPage 27/26 is explained by a `{ once: true }` listener). All 12 `ResizeObserver`s disconnect. Module level listeners (`storage.js`, `plannerOffline.js`, `main.jsx`, `supabase.js`) are intentionally app lifetime.
- `AppState`, `Keyboard`, and auth listeners on mobile all clean up. `usePlannerData` clears its retry/debounce timers on unmount.
- Supabase channels are removed on unmount on both platforms.
- Offline layers on both platforms carry a per record baseline so a stale replay cannot clobber newer writes (verified in `offlineReplay.test.js` and `outbox.js` three way merge).
- `storageCache` user scoping (CRIT-1) is implemented as described.

## Suggested order

1. W1 + M2 (data left on shared devices after sign out) and M1 (wrong user's writes) — same afternoon, all three are small.
2. W2 session reset per storage module.
3. M3 + W3 (losing edits at sign out / tab close).
4. W4 + M5 realtime status handling.
5. Accessibility labels on mobile, then web.
6. W7 debug strip, W10 stray files, then the timer hygiene items.

---

## Fixed 4 Sep 2026 (same day)

Verified on the laptop: web `vitest` 100/100 (8 new in `src/lib/__tests__/sessionReset.test.js`), `vite build` clean, ESLint unchanged from before the edits; mobile: Metro bundle of all modules succeeds, plus a throwaway Node harness covering the outbox account switch (stuck op with an armed retry is discarded, never sent under the next user) and the channel recovery helper (error → backoff → resubscribe → `onReconnect`; unsubscribe cancels a pending reconnect).

- **W4 + M5 (stale data after sleep / network change).** Web: `ProjectTimePlannerV2.jsx` realtime effect now reacts to `CHANNEL_ERROR` / `TIMED_OUT` / `CLOSED` — refetches immediately and resubscribes with capped backoff (2s → 60s), refetches again once `SUBSCRIBED` returns; also refetches on window `focus` / `pageshow` (throttled to once per 30s) so a laptop lid reopened with the tab in front no longer waits for the 60s hidden rule. The `[realtime]` debug logs in that effect are gone. Mobile: `plannerApi.subscribeWithRecovery` does the same for both channels; `usePlannerData` and the settings subscription in `SystemScreen` refetch on reconnect.
- **W1 (planner rows on disk after sign out).** `plannerOffline.clearUserOfflineData(uid)` deletes every `snapshot:`/`pending:` record for the user; wired to sign out, account deletion and account switch via the new `storageCache.onSessionReset` hook. Also: a failed IndexedDB open is no longer cached for the session, and `onclose`/`onversionchange` drop the connection so the next call re-opens.
- **W2 (in-memory bookkeeping not user scoped).** `storageCache.onSessionReset(fn)` runs on `SIGNED_OUT`, `USER_DELETED` and owner change with the previous user id. `plannerStorage`, `stagingStorage`, `tacticsStorage`, `tacticsMetricsStorage` each register a reset for their maps (known ids, baselines, high-water marks, CAS versions, chip notes cache).
- **M1 (outbox carries A's queue into B's session).** `outbox.init()` now compares the incoming user to the current one and drops the in-memory queue, retry timer and fail count on a switch; new `outbox.reset()` clears memory + disk.
- **M2 (snapshot/outbox on disk after sign out).** `App.js` auth listener calls `outbox.reset()` and `clearSnapshot()` on `SIGNED_OUT` / `USER_DELETED`.
- **M3 (sign out discards unsynced edits silently).** Sign out dialog in `SystemScreen` now tries one flush and, if anything is still queued, says how many changes will be lost and relabels the button "Sign out anyway".

Not done, still open from the list above: W3 (tab close within 500 ms of an edit), W6 (year metadata retry loop), W7 remaining debug code (`DebugSnapshotButton`, snapshot toast, `[planner-save]` log), M4 timers, accessibility labels.
