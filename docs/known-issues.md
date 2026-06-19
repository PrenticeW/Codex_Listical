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

## Open bugs

| Bug | Detail |
|---|---|
| Settings panel closes when "Undo Draft Year" is pressed | Root cause traced to a DOM-position swap race: `undoDraftYear()` fires `yearMetadataStorage` events mid-click which change `draftYear` to null, causing React to replace the "Undo Draft Year" button with "Plan next year" at the same screen coordinates before the click is processed. The browser fires `click` on the newly-appeared button, triggering `handlePlanNextYear → close()`. Attempted fixes (pinning the button with `isUndoing`, calling `open()` after success) did not fully resolve it. Deeper fix likely requires either debouncing the metadata event dispatch inside `undoDraftYear` or decoupling `GearPanel` from the `YearProvider` re-render cycle. |
| **Revert Archive does not work — must fix before testing archive in production** | After archiving Year N and promoting the draft to active, the "Revert Archive" nav button silently fails. Root cause not yet confirmed; error feedback added to `handleRevertArchive` in all three pages so the alert will now surface the actual Supabase error on next test. Do not ship the archive flow to production until revert is verified working. |
| React warning: "Cannot update a component (`ProjectTimePlannerV2`) while rendering a different component (`PlannerTable`)" | Seen in dev console on the System page (June 2026), unrelated to the side-panel work. Something in `PlannerTable`'s render path calls a `ProjectTimePlannerV2` state setter synchronously — likely a setState invoked directly in render instead of inside an effect or event handler. Follow the React stack trace from the warning to locate the call. Harmless in production builds but masks real issues and can cause extra renders; fix before launch. |
| Quota lookup still depends on `projectNickname` one hop upstream | CODE_REVIEW H1 keyed `projectWeeklyQuotas` by stable `id`, but System rows resolve that id via nickname: `ProjectRow.jsx:91` calls `projectIdByNickname.get(projectNickname)`, with the map built in `useProjectsData.js`. If a System row holds a stale nickname after a Goal-side rename (now possible directly from the Goal side panel), the lookup misses and the quota silently shows 0 again. Full fix: store `project_id` on System rows and drop the nickname hop. See `docs/migration.md`. |
| Projects do not carry over into the next year's Goal page | When "Plan Next Year" runs, `createDraftYearFromActive` resets each staging item via `resetItemForDraft` — this preserves identity and subprojects but does carry the shortlisted projects across to the draft year. The shortlist is copied at `draftStagingState.shortlist = (stagingState.shortlist || []).map(resetItemForDraft)`. Investigate whether the Goal page is reading stale data after year switch, or whether `saveStagingState` for the draft year is failing silently. |

---

## Version history snapshot gaps

The snapshot system (`snapshotStorage.js`) captures planner rows, archived weeks, Goal state, Plan chips/settings/metrics, and year metadata — but misses the following. Rolling back a snapshot does **not** restore these domains, and none of them appear in the diff viewer.

| Gap | Impact |
|---|---|
| `years.total_days` not captured | Added or removed weeks are not rolled back. After a snapshot restore the planner grid may have more or fewer week columns than the snapshot reflects. |
| `task_events` not captured | Task status history survives a rollback intact. The history panel will show events that post-date the snapshot, giving a misleading view of what the row looked like at snapshot time. |
| `planner_settings` not captured | Column widths, visible columns, sort order, and other UI prefs are not restored. The grid layout after a rollback may differ from what was active when the snapshot was taken. |
| `tactics_custom_projects` not captured | Custom chip project definitions survive a rollback. A chip project created after the snapshot point will still exist on the Plan page even after restoring. |
| Chip task notes not captured | Notes on chip-task rows are stored per-device (localStorage → Supabase migration pending). They are not included in the snapshot payload and are never restored. See "Migrate chip task notes" below. |
| `tactics_metrics` sent-snapshot not captured separately | The metrics blob written to Supabase when tasks are sent to System is not part of the snapshot. Rolling back planner rows without rolling back the corresponding metrics snapshot can leave quota tracking inconsistent. |
| Sent chips layer (`is_sent=true`) not captured | `capturePlan` only reads the live chip layer (`is_sent=false`). On restore, `saveTacticsChipsState` rewrites the live layer but leaves the sent layer untouched. If the sent layer is from a different point in time, live and sent chips will be out of sync after restore. |
| Week names not captured | `weekNames` is stored in `planner_settings` and excluded from snapshots along with other UI prefs, but it is user-facing content (not a display preference). Restoring a snapshot silently drops any custom week names the user had at snapshot time. |

---

## Pending Supabase migrations — run together before testing

Migrations written but not yet applied to the database. Apply as a batch.

| Migration file | What it does | Blocked features until applied |
|---|---|---|
| `supabase/migrations/20260612000001_add_show_action_times.sql` | Adds `projects.show_action_times` (boolean, default FALSE) | Goal page side-panel "Hide Times" toggle on action rows — saves will fail on the unknown column until applied |

---

## Launch prerequisites — must do before public launch

| Item | Detail |
|---|---|
| Configure custom SMTP | Supabase's built-in mailer is dev-only (roughly 2 auth emails/hour/project). Set up Resend, Postmark, or SendGrid under Auth → Emails → SMTP Settings before any public rollout. |
| B3 end-to-end smoke test | Signup → "Check your inbox" card → email confirmation link → authenticated redirect. Was blocked on Supabase rate limit; unblocks once custom SMTP is configured. |
| OG card / brand asset | `index.html` references `/og-card.png` with a TODO comment. Needed before the app is publicly shareable. |

---

## Remove before launch

| Item | Location |
|---|---|
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
| `src/hooks/planner/usePlannerInteractions.js` | Not imported anywhere |
| `src/hooks/planner/useRowDragSelection.jsx` | Not imported anywhere |
| `src/components/planner/VersionHistoryPanel.jsx` | Never imported anywhere; version history UI lives in `GearPanel.jsx` as `HistoryView` |
| `src/utils/plannerStorage.js` | Legacy; active storage is `src/utils/planner/storage.js` |
| `src/utils/rowDataTransformers.js` | Likely legacy |
| `src/utils/plannerStyles.js` | Likely legacy |
| `src/utils/plannerFormatters.js` | Likely legacy |
| `src/timeline/useTimelineRows.js` | Leftover from earlier architecture |
| `src/constants/plannerConstants.js` | Only referenced by legacy `plannerStorage.js` |
| `src/utils/yearMigration.js` | Not imported anywhere; was a one-time localStorage-to-Supabase migration helper, now dead |
| No-draft else branch in `src/utils/planner/archiveYear.js` | The Archive button only renders when a draft year exists, making the `else` branch (lines ~290–320, "Legacy path: no draft year, create fresh next year") unreachable. Safe to delete along with the unused `loadStagingState` and `loadTacticsMetrics` reads it depends on. |
