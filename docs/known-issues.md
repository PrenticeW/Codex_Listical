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
| `src/utils/plannerStorage.js` | Legacy; active storage is `src/utils/planner/storage.js` |
| `src/utils/rowDataTransformers.js` | Likely legacy |
| `src/utils/plannerStyles.js` | Likely legacy |
| `src/utils/plannerFormatters.js` | Likely legacy |
| `src/timeline/useTimelineRows.js` | Leftover from earlier architecture |
| `src/constants/plannerConstants.js` | Only referenced by legacy `plannerStorage.js` |
