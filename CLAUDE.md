# CLAUDE.md — Codex Listical

## Project overview

Listical is a 12-week cycle-planning tool for creative practitioners, structured around a three-page flow: **Goal** (define and plan projects), **Plan** (schedule weekly time blocks per project), and **System** (track individual tasks across an 84-day timeline). A "year" is a 12-week cycle. The three pages are exposed under the nav labels Goal / Plan / System but their URL paths are `/staging`, `/tactics`, and `/` respectively — keep this mismatch in mind. The app is currently in a second-pass refinement phase: the Goal page is complete and the Plan (Tactics) page is approximately halfway through its second pass. System is pending until Tactics is done.

---

## Stack

| Layer | Technology |
|---|---|
| Framework | React 19 + Vite |
| Language | JavaScript (primary), TypeScript (some hooks) |
| Routing | React Router |
| Table | TanStack Table (`@tanstack/react-table`) |
| Virtualisation | `@tanstack/react-virtual` — imported and called via `useVirtualizer` in `ProjectTimePlannerV2.jsx`. |
| Auth + profiles | Supabase (auth + `profiles` table only — no planning data in Supabase yet) |
| Styling | Tailwind CSS |
| Icons | Lucide React |
| Deployment | Vercel |

---

## Architecture decisions — do not contradict these

### Storage modules — always use them, never bypass them

All planning data currently lives in localStorage. Three named storage modules own this:

- `stagingStorage` — Goal page data (`src/lib/stagingStorage.js`)
- `tacticsMetricsStorage` — Plan page metrics (`src/lib/tacticsMetricsStorage.js`)
- `plannerStorage` — System page task rows (`src/utils/planner/storage.js`)

**Never add raw `localStorage.getItem` / `setItem` / `removeItem` calls to page or component code.** Always go through the storage modules. The storage service (`storageService`) automatically prefixes keys with `user:{userId}:` when a user is authenticated — bypassing it breaks per-user data isolation.

### Cross-page communication — custom events only

Pages communicate via custom browser events:

- `staging-state-update` — fired by `stagingStorage.saveStagingState`; listened to by TacticsPage and `useProjectsData` (System)
- `tactics-metrics-state-update` — fired by `tacticsMetricsStorage.saveTacticsMetrics`; listened to by `useTacticsMetrics` (System)
- `yearMetadataStorage` — fired by `yearMetadataStorage.saveYearMetadata`; listened to by `YearContext`

**Do not add direct imports between page components** (Goal, Plan, System) to share data. The event system is the contract.

### Storage key scoping

All storage keys are scoped by year number, e.g. `staging-year-1-shortlist`, `planner-year-1-project-1-task-rows`. When a user is authenticated, the storageService further prefixes all keys with `user:{userId}:`. Follow the pattern `{domain}-year-{N}-{descriptor}` for any new keys.

### `projectNickname` as join key — known fragility, do not extend

`projectNickname` is the current join key between the Plan and System pages. Weekly quota lookups in System are performed via `projectWeeklyQuotas.get(projectNickname)`. This is fragile: if a nickname is changed on the Goal page, quota lookups in System silently return zero. **Do not add any new logic that depends on `projectNickname` as a join key.** When the Supabase migration happens, `id` will replace `nickname` as the join key everywhere.

---

## Draft year / Plan Next Year flow

A draft year (`status: 'draft'`) can exist alongside the active year. Only one draft year may exist at a time.

### Year statuses

- `active` — the current working year; fully writable
- `draft` — the next year, in planning mode; all three pages are writable but it is not the "live" year
- `archived` — a completed year; read-only

### Plan Next Year flow

1. User presses **Plan Next Year** in the gear menu → `createDraftYearFromActive` (`src/utils/planner/createDraftYear.js`) is called
2. Year N+1 is created with `status: 'draft'`; Year N data is copied into Year N+1 (Goal page, Plan chips/metrics, UI settings). Year N's task rows are **not** copied — the user imports them separately.
3. The UI switches to the draft year. A violet nav group appears to the right of the main nav for quick access to the draft year's pages.
4. The user works through Goal → Plan → System on the draft year freely. Changes save immediately (same autosave as other years).
5. On the draft year's System page, an **Import tasks from Year N** panel appears when task rows are empty. The user selects which statuses to import (default: all except Done/Abandoned) and presses Import — one time only.
6. When ready, user presses **Archive Year N?** in the gear menu → `ArchiveYearModal` + `performYearArchive` archives Year N and promotes the draft to `active`.

### Chip persistence

Tactics chips are persisted per year to `tactics-year-{N}-chips-state` via `saveTacticsChipsState` / `loadTacticsChipsState` in `src/lib/tacticsStorage.js`. Chips are loaded on mount via `useState` initialiser — they are not deferred. The previously planned `scheduled_blocks` Supabase table is no longer needed.

### Dev-only: Undo Draft

An **Undo Draft** button in the nav bar (all three pages) calls `undoDraftYear` (`src/utils/planner/undoDraftYear.js`), which deletes all draft year storage keys, removes the draft year record from metadata, and switches back to the active year. Remove this button before launch.

---

## Planned migration — work in progress

### Supabase migration (scheduled after Tactics second pass)

The goal is to move all planning data — goals, tactics metrics, chips state, task rows — into Supabase tables, replacing localStorage. **The storage module API will stay the same; only the internals change.** Consumers of `stagingStorage`, `tacticsMetricsStorage`, and `plannerStorage` should not need to change.

---

## Known issues — do not make worse

- **Archive logic is duplicated.** `handleArchiveWeek` is implemented both inline in `ProjectTimePlannerV2.jsx` and in `useArchiveOperations.js`. Do not add a third version.
- **`useComputedDataV2.ts` has an intentional write-back loop.** It reads `data`, computes derived fields, then writes them back via `setData`. This is intentional and converges. Do not remove the write-back without fully understanding the convergence behaviour.
- **`projectColumnTotals` in TacticsPage is computed but never serialised.** Do not attempt to use it in System until the Supabase migration creates a proper read path.
- **`TacticsPage` has inline `loadTacticsChipsState` / `saveTacticsChipsState` / `loadTacticsSettings` / `saveTacticsSettings` functions** defined directly in the file rather than in a storage module. This is a known inconsistency; do not further extend the inline pattern.
- **`tactics-column-widths-{year}` is written directly with `storage.setJSON`** inside a `useEffect` in TacticsPage, bypassing the storage module pattern. Do not replicate this.

---

## Dead code — do not import or build on these

The following files are orphaned or superseded. Do not import them, reference them, or build new code on top of them:

| File | Status |
|---|---|
| `src/hooks/planner/useComputedData.ts` | Superseded by `useComputedDataV2.ts` |
| `src/components/SupabaseTest.jsx` | Debug component; not rendered anywhere |
| `src/hooks/planner/useCellSelection.js` | Not imported by any current page |
| `src/hooks/planner/usePlannerRowRendering.js` | Not imported by any current page |
| `src/hooks/planner/usePlannerInteractions.js` | Not imported by any current page |
| `src/hooks/planner/useRowDragSelection.jsx` | Not imported anywhere |
| `src/utils/plannerStorage.js` | Legacy; active storage is `src/utils/planner/storage.js` |
| `src/utils/rowDataTransformers.js` | Likely legacy utility |
| `src/utils/plannerStyles.js` | Likely legacy utility |
| `src/utils/plannerFormatters.js` | Likely legacy utility |
| `src/pages/ProjectTimePlannerWireframe.jsx` | Legacy v1 wireframe; still in router at `/v1` |
| `src/timeline/useTimelineRows.js` | Leftover from earlier architecture |
| `src/constants/plannerConstants.js` | Only referenced by legacy `plannerStorage.js` |

---

## Conventions

- **Storage modules** live in `src/lib/` (staging, tactics) and `src/utils/planner/` (system). Follow existing patterns when extending storage.
- **Hooks** are split by page under `src/hooks/staging/` and `src/hooks/planner/`. New hooks go in the relevant folder.
- **Year-scoped keys** follow the pattern `{domain}-year-{N}-{descriptor}`.
- **Do not add `console.log` calls to production code.** There are already stray ones (e.g. `TacticsPage.jsx` line ~813) — do not add more.
- Page names in the nav (Goal / Plan / System) do not match their URL paths (`/staging`, `/tactics`, `/`). Always use the nav names when talking about features; use paths only when discussing routing.

---

## User context and compliance requirements

Listical will be used by students at dance conservatoires and universities, potentially including minors. **GDPR compliance is a hard requirement.**

### Right to Erasure

When a user requests deletion, all their data must be removable. The `deletion_audit_log` table and `deletion_requested_at` field on `profiles` are the start of this. The Supabase migration must extend Right to Erasure to all planning data tables.

### Database design rules (applies to all future Supabase tables)

- **Every new table must include a `user_id` foreign key** referencing `auth.users(id)` so data can be located and deleted per user.
- Do not store any data that cannot be attributed to a specific user and deleted on request.
- Row-level security (RLS) policies must be defined on every new table before it is used in production.

### Age and consent

Users may be minors. Do not make assumptions about user age in any auth or data flow work. Do not collect data beyond what is necessary for the planning features.

### Debugging
Always ask for permission to start systematic debugging. 