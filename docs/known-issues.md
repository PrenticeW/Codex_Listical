# Known Issues and Dead Code

## Do not make worse

| Issue | Detail |
|---|---|
| `handleArchiveWeek` is inline in `ProjectTimePlannerV2.jsx` | A previous `useArchiveOperations.js` hook was deleted in 2026-05. Do not reintroduce a hook version unless you also remove the inline implementation. |
| `useComputedDataV2.ts` has an intentional write-back loop | Reads `data`, computes derived fields, writes back via `setData`. This converges intentionally. Do not remove the write-back. |
| `projectColumnTotals` in TacticsPage is computed but never serialised | Do not use it in System until the Supabase migration creates a proper read path. |
| `tactics-column-widths-{year}` bypasses the storage module pattern | Written directly with `storage.setJSON` inside a `useEffect` in TacticsPage. Do not replicate this. |
| System page `setData` effects are deliberately coalesced | Three derived-totals effects (filter row, archive week, min/max rows) share one `useEffect` with a combined dep array. Project injection and chip sync are direct `setData` calls with no `setTimeout` wrapper. Do not split them back out or add new `setTimeout`-wrapped `setData` calls — each one spawns its own render cascade. The functional updater form (`setData(prev => ...)`) guarantees project injection's update is applied before chip sync's in the same React flush, so no timing delay is needed. |

---

## Needs testing before launch

| Item | Detail |
|---|---|
| GearPanel logout | Calls `logout()` from AuthContext then navigates to `/login`. Needs end-to-end test to confirm session is fully cleared and redirect lands correctly. |
| GearPanel delete account | Now opens `DeleteAccountModal` directly from the panel (previously navigated to `/settings`). Test the full flow: password entry, success redirect to `/account-deleted`, and error states (wrong password, too many attempts). |

---

## Known UX limitations — deferred

| Item | Detail |
| Post-confirmation redirect hangs on a loading screen | Clicking the signup confirmation email link confirms the account server-side, but the redirect back into the app (observed 18 Jul 2026, referer `/reset-password`) gets stuck on an indefinite loading screen instead of landing signed-in. Workaround: open the login page fresh and sign in normally — the confirmation itself succeeded. Likely the auth-callback/redirect handling doesn't cover the `signup` confirmation type. |
|---|---|
| Blank task rows retain history after accidental edits | If a user types into an empty task row and commits (Enter/Tab/blur), `writeTaskEvent` fires and `task_created_at` is stamped on the row — even if they then delete the text and leave the row blank again. The row quietly carries that history and creation date, which will surface on the next task written into the same row. Fix considered (clearing `task_events` and `task_created_at` when task name is set to empty) but deferred — risk of unintended data loss outweighed the edge-case frequency. Workaround: delete and re-add the row instead. |
| Archive Week panel delta compares weeks, not plan | The Comparison card's +/− column shows current week minus previous week. An alternative (or additional) delta of current week minus frozen quota ("over or under plan") was considered and deferred. The data exists: `archivedWeeklyQuota` is frozen on each archived project header at archive time. Revisit after the panel ships. |
| Native browser `alert()` used for year-flow errors | Six error paths pop a native browser alert instead of an in-app dialog/toast: draft-year creation failure (`ProjectTimePlannerV2.jsx` ~340, `TacticsPage.jsx` ~362, `StagingPageV2.jsx` ~133) and archive-revert failure (`ProjectTimePlannerV2.jsx` ~359, `TacticsPage.jsx` ~350, `StagingPageV2.jsx` ~121). To trigger: press "Plan next year" or the dev-only "Revert Archive" nav button while the Supabase call fails (e.g. offline, or a draft year already exists at the DB level). Replace with a shared error dialog/toast component before launch — a modal pattern already exists (`ArchiveYearModal`, `DeleteAccountModal`). |
| Legacy rows may lack `project_id` | The `projectNickname` quota-lookup bug was fixed June 2026 (`projectId` stamped at creation, stored in `project_id`, read on load). `ProjectRow.jsx` still falls back to the nickname map for rows created before the fix — renaming a project with such rows can break quota lookups until those rows are re-saved. |

---

## Open bugs

| Bug | Detail |
|---|---|
| Settings panel closes when "Undo Draft Year" is pressed | Root cause traced to a DOM-position swap race: `undoDraftYear()` fires `yearMetadataStorage` events mid-click which change `draftYear` to null, causing React to replace the "Undo Draft Year" button with "Plan next year" at the same screen coordinates before the click is processed. The browser fires `click` on the newly-appeared button, triggering `handlePlanNextYear → close()`. Attempted fixes (pinning the button with `isUndoing`, calling `open()` after success) did not fully resolve it. Deeper fix likely requires either debouncing the metadata event dispatch inside `undoDraftYear` or decoupling `GearPanel` from the `YearProvider` re-render cycle. |

---

## Version history snapshot gaps

The snapshot system (`snapshotStorage.js`) captures planner rows, archived weeks, Goal state, Plan chips/settings/metrics/custom projects/sent layers/chip notes, planner settings (incl. week names), `years.total_days`, and `task_events`.

**Gap: snapshots are web-only.** `debounceSiteSnapshot` and `maybeSnapshotOnSessionStart` run inside an open web tab. Days of edits made from the mobile app produce no restore point, which is why the 2026-08-27 overwrite (below) was unrecoverable. `20260827000001_planner_rows_history_trigger.sql` now captures the previous version of every `planner_rows` UPDATE/DELETE at the database into `planning_history` (30-day retention), regardless of client. Nothing reads `planning_history` yet — a restore helper (rebuild the row set as of a timestamp) is still to build.

---

## Stale-client overwrite — 2026-08-27 incident and guards

**What happened.** A web tab on a machine last used weeks earlier was reopened. Its rows came from the `storageCache` localStorage mirror (`readTaskRows` short-circuits on `hasCached` with no revalidation), it had no `_baselineRows` / `_knownRowIds` for the year (those are only set by a real server read), and its autosave / unmount flush ran the diff save in the old fallback mode: row-level last-writer-wins for rows without a baseline, and deletes against `known = every server row`. Days of mobile edits were overwritten. Separately, `profiles.current_year_id` had gone NULL (`ON DELETE SET NULL`) and `readYearMetadata` fell back to `rows[0]`, so every device opened on year 1.

**Guards now in place** (do not remove; `offlineReplay.test.js` covers them):

| Guard | Where |
|---|---|
| `_readHighWater` per year: newest `planner_rows.updated_at` seen at the last real read. A row with no baseline is only overwritten if the server copy is not newer than it. No basis at all → restricted mode: no deletes, no overwrites, inserts only for rows minted this session. | `storage.js` `_saveTaskRowsImpl` |
| Bookkeeping (known ids, baseline, high-water) is persisted with the IndexedDB snapshot and restored on cache-hit reads, and captured synchronously into every pending record / queued save. | `storage.js` `snapshotPayload`, `captureBookkeeping` |
| `isPlannerYearServerFresh` + `planner-rows-stale` event: the System page refetches on mount when the year has not been server-read this session, and whenever the tab wakes after ≥60s hidden or regains connectivity (`markPlannerRowsStale`). | `storage.js`, `ProjectTimePlannerV2.jsx` realtime effect |
| Pending offline saves older than 30 days are discarded, not replayed (younger ones replay under their own baseline, so a long offline stretch still syncs). | `plannerOffline.js` `PENDING_MAX_AGE_MS` |
| Service worker checks for a new build on every tab wake and hourly, so a long-lived tab cannot keep running old save logic. | `main.jsx` |
| `readYearMetadata` falls back to the active year (then newest) and repairs `current_year_id`. | `yearMetadataStorage.js` |

**Second incident, same day (2026-08-27 afternoon, one browser open).** Two holes in the guards above, fixed the same day (`offlineReplay.test.js` covers the row side):

| Hole | Fix |
|---|---|
| `readYearMetadata` returned `null` on ANY error, and `YearContext` treated `null` as "new account" → `initializeYearMetadata` repointed `profiles.current_year_id` at year 1 for every device. A transient failure on a page reload (auth session not ready, network blip — the new service-worker auto-reload makes these more likely) was enough. | `readYearMetadataStrict` throws on failure and returns `null` only for a genuine "no years rows"; `YearContext.load` uses it and retries on failure instead of initialising. `initializeYearMetadata` only sets the pointer when it is NULL. |
| Restricted mode allowed inserts for "rows minted this session", but `mintedHere` included every synthetic id mapped this session — including ids re-minted from the row cache / snapshot, which persisted rows under synthetic ids and never persisted the synthetic→UUID map. The System page also rewrote the Archive header's UUID to `'archive-header'` on every mount. Result: Inbox/Archive/project headers and recently created tasks inserted a second time beside the server's copies, with clashing `display_order`. | Cache and IndexedDB snapshot now store rows under their UUIDs and the snapshot carries `synIds` (adopted on restore). `mintedHere` is only UUIDs minted in the current save. Restricted mode never inserts a structural row (inbox, archive header, project header) whose kind already exists on the server. The Archive header keeps its id. `isPlannerYearServerFresh` is now a per-session server-read set, not the snapshot-restored high-water mark, so a cache-hit load always revalidates on mount. |

**Cleanup still needed:** the duplicate rows this produced are still in `planner_rows` — the client's mount effect hides extra Archive headers but does not delete them. Remove the later-created duplicates of each Inbox/Archive/project header (and any task rows duplicated with a newer `created_at`) by hand in Supabase, then re-check row order.

**Third incident (2026-08-28): opening a stale browser still overwrote the whole System page.** Two remaining holes, addressed 2026-08-28:

| Hole | Fix |
|---|---|
| **The stale browser runs the pre-fix bundle first.** The app is a PWA: an old machine's service-worker cache serves its old bundle instantly, that bundle autosaves ~500ms after load with the OLD save logic (delete-all-then-reinsert), and the damage lands before the auto-update fetches the new build and reloads. No client-side guard can reach a bundle that is already cached. | DB-side gate: web now sends `x-tacular-client: <build>` on every request (`src/lib/supabase.ts`, `CLIENT_BUILD`); migration `20260828000001_stale_client_write_gate.sql` (written, **NOT applied** — would break current mobile builds, see its header) rejects UPDATE/DELETE on `planner_rows` and DELETE on `archived_weeks` from clients without a new-enough header. |
| **Even on the new bundle, a cache-hydrated tab saved before revalidating.** On a cache hit the page counts as hydrated at mount, normalisation `setData` calls trigger the 500ms autosave, and the mount refetch then defers itself 5s behind that very save (echo mute). The archive rewrite was also wholly unguarded — every save delete-all-then-reinserts `archived_weeks`, so a stale tab replaced the whole archive. | Autosave and the unmount flush are skipped while online until `isPlannerYearServerFresh` (offline saves still allowed — they replay under their own bookkeeping); the mount refetch ignores the save-mute until the year is server-fresh (draft years exempt — they never revalidate, known gap); `archived_weeks` is only rewritten when the session has server-read the year (an offline-archived week syncs on the next fresh-session save). |

**Not covered:** draft and archived years skip the realtime effect, so they get no wake revalidation (mobile does not write them). The mobile app's own stale-write behaviour lives in tacular-mobile and is out of scope here.

---

## Pending Supabase migrations — run together before testing

Migrations written but not yet applied to the database. Apply as a batch.

| Migration file | What it does | Blocked features until applied |
|---|---|---|
| `supabase/migrations/20260612000001_add_show_action_times.sql` | Adds `projects.show_action_times` (boolean, default FALSE) | Goal page side-panel "Hide Times" toggle on action rows — saves will fail on the unknown column until applied |
| `supabase/migrations/20260827000002_add_project_tagline.sql` | Adds `projects.project_tagline` | Project taglines (Goal page "Add tagline", System header rows, mobile header subtitle) — before this the field was never persisted, so taglines vanished on reload. Without the column, staging saves fail on the unknown column. |
| `supabase/migrations/20260827000001_planner_rows_history_trigger.sql` | UPDATE/DELETE triggers on `planner_rows` writing the previous row to `planning_history`; 30-day per-user prune | Nothing in the client depends on it; without it, app-side edits still have no history |
| `supabase/migrations/20260828000001_stale_client_write_gate.sql` | Rejects destructive planner writes from clients not sending `x-tacular-client` ≥ min build (blocks pre-fix PWA bundles) | **Applied to the live DB 2026-08-28**, after mobile shipped the header (tacular-mobile `6365aad`) and web deployed `CLIENT_BUILD` — both prerequisites met |

---

## Launch prerequisites — must do before public launch

| Item | Detail |
|---|---|
| Configure custom SMTP | Done (June 2026) — Brevo configured via Auth → Emails → SMTP. Free tier supports 300 auth emails/day. If daily signups exceed that, upgrade Brevo or switch to Resend (requires a custom domain). |
| B3 end-to-end smoke test | Done (June 2026) — invite email confirmed delivered. Lands in spam on the current shared Brevo domain; will improve once a custom domain is set up. |
| OG card / brand asset | `index.html` references `/og-card.png` with a TODO comment. Needed before the app is publicly shareable. |

---

## Remove before launch

| Item | Location |
|---|---|
| Snapshot toast (`showSnapshotToast`) | `src/lib/snapshotStorage.js` — two `showSnapshotToast()` calls and the function itself. Search `DEBUG — remove before launch`. |
| `[Probe]` render counter and `setData` probes | `ProjectTimePlannerV2.jsx` (top of component + each `setData` effect call) and `useComputedDataV2.ts`. Search for `// RENDER PROBE`. |
| **Undo Draft** button | Nav bar on all three pages. See `docs/year-flow.md`. |
| **Revert Archive** button | Nav bar (dev-only). |

---

## Dead code — do not import or build on

| File | Status |
|---|---|
| `src/hooks/planner/useComputedData.ts` | Superseded by `useComputedDataV2.ts` |
| `src/components/SupabaseTest.jsx` | Debug component, not rendered anywhere |
| `src/hooks/planner/useCellSelection.js` | Not imported anywhere |
| `src/hooks/planner/usePlannerRowRendering.js` | Not imported anywhere |
| `src/hooks/planner/useRowRenderers.jsx` | Only imported by dead `usePlannerRowRendering.js`. Contains native `<select>` cell renderers superseded by the custom dropdown cells in `components/planner/rows/TaskRow.jsx` |
| `src/components/staging/ColorSwatchGrid.jsx` | Not imported anywhere |
| `src/components/planner/ProjectListicalMenu.jsx` | Removed Aug 2026 (moved to `_to_delete/`) — was imported in `ProjectTimePlannerV2.jsx` but never rendered; superseded by `SystemPanel.jsx` and its `SYSTEM_PANEL_*` events. The unused import was removed at the same time |
| `src/hooks/planner/usePlannerInteractions.js` | Not imported anywhere |
| `src/hooks/planner/useRowDragSelection.jsx` | Not imported anywhere |
| `src/components/planner/VersionHistoryPanel.jsx` | Never imported anywhere; version history UI lives in `GearPanel.jsx` as `HistoryView` |
| `src/utils/plannerStorage.js` | Legacy; active storage is `src/utils/planner/storage.js` |
| `src/utils/rowDataTransformers.js` | Likely legacy |
| `src/utils/plannerStyles.js` | Likely legacy |
| `src/utils/plannerFormatters.js` | Likely legacy |
| `src/timeline/useTimelineRows.js` | Leftover from earlier architecture |
| `src/constants/plannerConstants.js` | Only referenced by legacy `plannerStorage.js` |
| `ProjectTimePlannerV2.jsx` Listical menu leftovers | `isListicalMenuOpen` / `addTasksCount` state and the `handleAddTasks`-style callback (~line 2436) are remnants of the removed Listical menu. Rows are now added via the right-click context menu (`addTasksWithCount`) and multi-line paste. `taskRowGenerator.js` header comment still references the Listical menu. Safe to remove |
| `src/utils/yearMigration.js` | Not imported anywhere; was a one-time localStorage-to-Supabase migration helper, now dead |
| No-draft else branch in `src/utils/planner/archiveYear.js` | The Archive button only renders when a draft year exists, making the `else` branch (lines ~290–320, "Legacy path: no draft year, create fresh next year") unreachable. Safe to delete along with the unused `loadStagingState` and `loadTacticsMetrics` reads it depends on. |
