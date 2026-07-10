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
|---|---|
| Blank task rows retain history after accidental edits | If a user types into an empty task row and commits (Enter/Tab/blur), `writeTaskEvent` fires and `task_created_at` is stamped on the row — even if they then delete the text and leave the row blank again. The row quietly carries that history and creation date, which will surface on the next task written into the same row. Fix considered (clearing `task_events` and `task_created_at` when task name is set to empty) but deferred — risk of unintended data loss outweighed the edge-case frequency. Workaround: delete and re-add the row instead. |
| Legacy rows may lack `project_id` | The `projectNickname` quota-lookup bug was fixed June 2026 (`projectId` stamped at creation, stored in `project_id`, read on load). `ProjectRow.jsx` still falls back to the nickname map for rows created before the fix — renaming a project with such rows can break quota lookups until those rows are re-saved. |

---

## Open bugs

| Bug | Detail |
|---|---|
| Settings panel closes when "Undo Draft Year" is pressed | Root cause traced to a DOM-position swap race: `undoDraftYear()` fires `yearMetadataStorage` events mid-click which change `draftYear` to null, causing React to replace the "Undo Draft Year" button with "Plan next year" at the same screen coordinates before the click is processed. The browser fires `click` on the newly-appeared button, triggering `handlePlanNextYear → close()`. Attempted fixes (pinning the button with `isUndoing`, calling `open()` after success) did not fully resolve it. Deeper fix likely requires either debouncing the metadata event dispatch inside `undoDraftYear` or decoupling `GearPanel` from the `YearProvider` re-render cycle. |

---

## Version history snapshot gaps

The snapshot system (`snapshotStorage.js`) captures planner rows, archived weeks, Goal state, Plan chips/settings/metrics/custom projects/sent layers/chip notes, planner settings (incl. week names), `years.total_days`, and `task_events`. No known gaps remain.

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
