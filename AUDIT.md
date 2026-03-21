# Codex Listical — Codebase Audit

_Generated 2026-03-21. No changes made. Observations only._

---

## 1. Application Architecture Overview

Codex Listical is a three-page cycle-planning tool built on React 19 + Vite, with Supabase handling only authentication and the user `profiles` table. **All planning data lives entirely in localStorage** — there is no Supabase database table for tasks, goals, tactics, or any planning content.

The three main pages sit under a single protected route tree:

```
/ (ProtectedRoute → Layout → YearProvider)
  ├── /               → ProjectTimePlannerV2  (called "System" in the nav)
  ├── /staging        → StagingPageV2         (called "Goal" in the nav)
  └── /tactics        → TacticsPage           (called "Plan" in the nav)
```

The page names displayed in the NavigationBar — **Goal, Plan, System** — do not match their URL paths (`/staging`, `/tactics`, `/`). Newcomers to the codebase will find this consistently confusing.

### How the three pages relate

The intended data chain is:

1. **Goal (StagingPageV2 `/staging`)** — User creates a shortlist of projects, writes a plan table for each (Reasons / Outcomes / Actions / Subprojects / Schedule sections). When a project is "added to plan" it is flagged `addedToPlan: true` and gets a colour.
2. **Plan (TacticsPage `/tactics`)** — Reads the Goal shortlist via `loadStagingState`. Projects with `addedToPlan: true` appear as draggable chips that can be allocated to hourly time slots across a 7-day week. Daily min/max bounds and weekly quotas are configured here and saved via `saveTacticsMetrics`.
3. **System (ProjectTimePlannerV2 `/`)** — A spreadsheet where individual tasks are planned against a 12-week (84-day) timeline. It reads project names from Goal via `useProjectsData` (which calls `loadStagingState`) and reads daily bounds / weekly quotas from Plan via `useTacticsMetrics` (which calls `loadTacticsMetrics`).

All cross-page communication goes through localStorage via named storage events (`staging-state-update`, `tactics-metrics-state-update`, `yearMetadataStorage`). There are no React context providers, props, or URL parameters carrying planning data between pages.

### Year system

A "year" is a 12-week cycle. Year metadata (start/end dates, status, current year number) is stored in localStorage under the key `app-year-metadata`. The `YearContext` (provided by `Layout`) distributes this to all three pages. All data keys are scoped by year number, e.g. `staging-year-1-shortlist`, `tactics-year-1-metrics-state`, `planner-year-1-project-1-task-rows`.

---

## 2. Component Map

### Global / Shared

| Component | File | What it does | Props / State |
|---|---|---|---|
| `App` | `App.jsx` | Root. Composes `AuthProvider` → `UserProvider` → `RouterProvider`. | — |
| `Layout` | `components/Layout.jsx` | Protected route shell. Provides `YearProvider`, runs a stub migration check. | Reads `needsUserMigration` from `UserContext` |
| `ProtectedRoute` | `components/ProtectedRoute.jsx` | Auth guard. Also does a one-time Supabase query to check `deletion_requested_at`. Redirects to `/login` or `/account-deleted`. | `children` |
| `PublicRoute` | `components/PublicRoute.jsx` | Reverse guard — redirects already-authenticated users away from login/signup. | `children` |
| `NavigationBar` | `components/planner/NavigationBar.jsx` | Top bar used on all three main pages. Contains page navigation (Goal / Plan / System), YearSelector, a page-size slider, logout button. | `listicalButton`, `yearSelector` (optional override slots) |
| `YearSelector` | `components/YearSelector.jsx` | Dropdown to switch between years. Reads `allYears`, `currentYear` from `YearContext`. | — |
| `ArchiveYearModal` | `components/ArchiveYearModal.jsx` | Confirms year-level archive. Calls `performYearArchive`. | `isOpen`, `onClose`, `onConfirm`, `currentYear` |
| `AddTasksModal` | `components/AddTasksModal.jsx` | Modal to bulk-add empty task rows to the System planner. | `isOpen`, `onClose`, `count`, `setCount`, `onConfirm` |
| `SupabaseTest` | `components/SupabaseTest.jsx` | Debug component — shows Supabase connection status, auth user, and profile data. **Not rendered anywhere in the app.** |  |
| `DragBadge` | `components/DragBadge.jsx` | Visual badge shown during drag operations. | props vary |

### Goal page — StagingPageV2 (`/staging`)

| Component / Hook | File | What it does |
|---|---|---|
| `StagingPageV2` | `pages/StagingPageV2.jsx` | Page root. Owns no state directly; orchestrates ~10 hooks. Renders the shortlist and per-project plan tables. |
| `TableRow` (staging) | `components/staging/TableRow.jsx` | Renders a single row in a plan table. Handles all row types (header, prompt, response, data, total). |
| `ContextMenu` (staging) | `components/staging/ContextMenu.jsx` | Right-click menu for plan table rows. |
| `ProjectEditModal` | `components/staging/ProjectEditModal.jsx` | Floating modal for editing project name, nickname, colour, and "add to plan" status. |
| `ColorSwatchGrid` | `components/staging/ColorSwatchGrid.jsx` | Colour palette picker shown inside `ProjectEditModal`. |
| `ColourPicker` | `components/ColourPicker.jsx` | Full HSL colour picker with eyedropper support. Used within `ProjectEditModal`. |
| `useShortlistState` | `hooks/staging/useShortlistState.js` | Loads/saves shortlist from stagingStorage. Handles add/remove/togglePlanTable. Auto-saves on every change. Also builds `planSummary` on save (subproject extraction). |
| `usePlanTableState` | `hooks/staging/usePlanTableState.js` | Cell changes, estimate changes, row insertion helpers. |
| `usePlanTableSelection` | `hooks/staging/usePlanTableSelection.js` | Cell and row selection state. |
| `usePlanTableDragAndDrop` | `hooks/staging/usePlanTableDragAndDrop.js` | Row reordering via drag. |
| `usePlanTableFocus` | `hooks/staging/usePlanTableFocus.js` | Focus management for inputs. |
| `useRowCommands` | `hooks/staging/useRowCommands.js` | Insert/delete/duplicate row operations with undo support. |
| `useStagingKeyboardHandlers` | `hooks/staging/useStagingKeyboardHandlers.js` | Keyboard shortcuts (undo, redo, delete, copy, paste). |
| `useCommandPattern` (staging) | `hooks/staging/useCommandPattern.js` | Undo/redo stack for the Goal page. |
| `usePlanModal` / `usePlanModalActions` | `hooks/staging/usePlanModal.js`, `hooks/staging/usePlanModalActions.js` | State and actions for the project edit modal. |
| `useContextMenu` (staging) | `hooks/staging/useContextMenu.js` | Context menu visibility/position state. |

**Surprising thing about StagingPageV2:** The page imports and calls `useAuth()` but only uses `isLoading` to show a loading spinner. It does not use auth for data scoping — data scoping for staging is based on year number only.

### Plan page — TacticsPage (`/tactics`)

`TacticsPage` is a single monolithic file (~1,400 lines). It is not broken into sub-components beyond `NavigationBar`, `ColourPicker`, and a small `FitText` local component defined inside the same file.

| Element | What it does |
|---|---|
| `TacticsPage` (main) | Owns all state. Loads staging projects (to show as draggable chips), loads/saves chips state, loads/saves settings. Renders the week grid, timeline, chips, sleep blocks, summary columns. |
| `FitText` (inline) | Local helper component defined inside TacticsPage.jsx. Shrinks font size to fit its container. |
| `ColourPicker` | Used for custom chip colour editing. |
| `buildScheduleLayout` | Imported from `../ScheduleChips` — builds a layout structure for the staging summary columns. |

**Surprising things about TacticsPage:**
- The file imports from `../ScheduleChips` — a path that resolves to `src/ScheduleChips` (no extension found via glob — see Dead Code section).
- All save/load logic is defined as free functions inside the file itself (`loadTacticsSettings`, `saveTacticsSettings`, `loadTacticsChipsState`, `saveTacticsChipsState`) rather than using the existing `tacticsMetricsStorage` lib for everything. The chips state and column widths are stored in separate keys outside of `tacticsMetricsStorage`.
- Column widths are persisted under a non-user-scoped key (`tactics-column-widths-{year}`) written directly with `storage.setJSON` inside a `useEffect`, bypassing the pattern used elsewhere.
- `console.log('[resize]', ...)` calls remain in the production code at line ~813.
- A `dragOverCount` counter variable is created inside a `useEffect` but is not cleaned up between effect re-runs.

### System page — ProjectTimePlannerV2 (`/`)

| Component / Hook | File | What it does |
|---|---|
| `ProjectTimePlannerV2` | `pages/ProjectTimePlannerV2.jsx` | Page root. ~1,400+ lines. Owns core data state. |
| `PlannerTable` | `components/planner/PlannerTable.jsx` | Table container with TanStack Table setup. |
| `TableRow` (planner) | `components/planner/TableRow.jsx` | Dispatcher — routes to specific row renderers based on `_rowType`. |
| `MonthRow` | `components/planner/rows/MonthRow.jsx` | Renders month header spans. |
| `WeekRow` | `components/planner/rows/WeekRow.jsx` | Renders week header spans. |
| `TaskRow` | `components/planner/rows/TaskRow.jsx` | Renders a task data row (the main spreadsheet row). |
| `TimelineHeader` | `components/planner/TimelineHeader.jsx` | Column letter header row. |
| `EditableCell` | `components/planner/EditableCell.jsx` | Generic inline-editable cell. |
| `CheckboxCell` | `components/planner/CheckboxCell.jsx` | Checkbox column cell. |
| `DropdownCell` | `components/planner/DropdownCell.jsx` | Generic dropdown cell. |
| `ProjectDropdownCell` | `components/planner/ProjectDropdownCell.jsx` | Project column dropdown (reads from staging). |
| `SubprojectDropdownCell` | `components/planner/SubprojectDropdownCell.jsx` | Subproject column dropdown. |
| `EstimateDropdownCell` | `components/planner/EstimateDropdownCell.jsx` | Estimate column dropdown. |
| `FilterPanel` | `components/planner/FilterPanel.jsx` | Filter UI for project/status/estimate/recurring/day filters. |
| `ProjectListicalMenu` | `components/planner/ProjectListicalMenu.jsx` | "Listical" dropdown menu for sort inbox, sort planner, add tasks, archive week, archive year. |
| `ContextMenu` (planner) | `components/planner/ContextMenu.jsx` | Right-click menu for task rows. |
| `usePlannerStorage` | `hooks/planner/usePlannerStorage.js` | All planner settings with auto-persist. Scoped by `yearNumber` + `projectId`. |
| `useComputedDataV2` | `hooks/planner/useComputedDataV2.ts` | Derives `timeValue` from `estimate`, auto-sets `status` based on task content and day allocations, detects habit patterns, assigns `parentGroupId`. Has a **sync effect** that writes back to source data. |
| `useComputedData` | `hooks/planner/useComputedData.ts` | **Superseded version** of the above. Exists in the codebase but is not imported anywhere. |
| `useProjectsData` | `hooks/planner/useProjectsData.js` | Reads staging shortlist and extracts project/subproject names for dropdowns. |
| `useTacticsMetrics` | `hooks/planner/useTacticsMetrics.js` | Reads `dailyBounds` and `projectWeeklyQuotas` from tacticsMetricsStorage. |
| `useArchiveOperations` | `hooks/planner/useArchiveOperations.js` | Handles archive-week logic (moves Done/Abandoned tasks to archive section). |
| `useArchiveTotals` | `hooks/planner/useArchiveTotals.js` | Calculates hours per archive-week row. |
| `useCommandPattern` (planner) | `hooks/planner/useCommandPattern.js` | Undo/redo for System page. |
| `usePlannerColumns` | `hooks/planner/usePlannerColumns.js` | Column definitions for TanStack Table. |
| `usePlannerFilters` | `hooks/planner/usePlannerFilters.js` | All filter dropdown state (project, subproject, status, recurring, estimate). |
| `useFilteredData` / `useFilterValues` | `hooks/planner/useFilteredData.js` | Applies all active filters to computed data. |
| `useSpreadsheetSelection` | `hooks/planner/useSpreadsheetSelection.js` | Cell/row selection (single, range, drag). |
| `useEditState` | `hooks/planner/useEditState.ts` | Inline cell editing state. |
| `useDragAndDropRows` | `hooks/planner/useDragAndDropRows.ts` | Row reorder via drag. |
| `useDayColumnFilters` | `hooks/planner/useDayColumnFilters.ts` | Toggle visibility of individual day columns. |
| `useCollapsibleGroups` | `hooks/planner/useCollapsibleGroups.ts` | Collapse/expand archive sections. |
| `useKeyboardHandlers` | `hooks/planner/useKeyboardHandlers.js` | Keyboard shortcuts for System page. |
| `useContextMenu` (planner) | `hooks/planner/useContextMenu.js` | Context menu state for System page. |
| `useTotalsCalculation` | `hooks/planner/useTotalsCalculation.js` | Project totals and daily totals. |

**Surprising things about ProjectTimePlannerV2:**
- The virtualizer (`useVirtualizer` from `@tanstack/react-virtual`) is imported at the top of the file but **it is not actually used** in the current implementation. The table renders all rows directly. (The import exists; no `useVirtualizer(...)` call was found in the component body.)
- The component manually duplicates archive logic: `handleArchiveWeek` is both defined inline in `ProjectTimePlannerV2.jsx` (~lines 1151–1350) AND extracted into `useArchiveOperations.js`. Both versions exist simultaneously. The hook version is also imported and called, but so is the inline version. This means archive logic is defined twice.
- `useComputedData.ts` (old version) still exists alongside `useComputedDataV2.ts`. Only V2 is imported in the page.
- `useCellSelection.js`, `usePlannerRowRendering.js`, `usePlannerInteractions.js` exist in the hooks/planner folder but are **not imported by ProjectTimePlannerV2** — they appear to be remnants of a prior architecture.
- `useRowDragSelection.jsx` also exists but is not imported anywhere visible.

---

## 3. Data Flow & Supabase Connections

### Supabase table access

| Table | Operation | Where | How data reaches component |
|---|---|---|---|
| `auth.users` (via Supabase Auth) | Session read | `AuthContext` on mount | Context value |
| `profiles` | SELECT (`*`) | `UserContext.loadUserData` | Context value (`profile`) |
| `profiles` | INSERT | `UserContext.loadUserData` (if profile missing) | — |
| `profiles` | UPDATE | `UserContext.updateProfile` | — |
| `profiles` | SELECT (`deletion_requested_at`) | `ProtectedRoute` on mount | Local state check, then redirect |
| `deletion_audit_log` | INSERT / UPDATE (via RPC) | `lib/api/accountDeletion.ts`, `lib/server/accountDeletion.ts` | Called from `AccountSettingsPage` via `DeleteAccountModal` |

**That is the complete list.** There are no Supabase reads or writes for tasks, goals, tactics, projects, years, or any planning data. Everything else is localStorage.

### localStorage key inventory

| Key pattern | Who writes | Who reads |
|---|---|---|
| `app-year-metadata` | `yearMetadataStorage` | `YearContext`, all storage functions |
| `staging-year-{N}-shortlist` | `stagingStorage.saveStagingState` | `stagingStorage.loadStagingState` (Goal page, Tactics page, System page via `useProjectsData`) |
| `tactics-year-{N}-metrics-state` | `tacticsMetricsStorage.saveTacticsMetrics` (called from TacticsPage) | `tacticsMetricsStorage.loadTacticsMetrics` (System page via `useTacticsMetrics`) |
| `tactics-year-{N}-chips-state` | TacticsPage inline `saveTacticsChipsState` | TacticsPage inline `loadTacticsChipsState` |
| `tactics-page-settings` | TacticsPage inline `saveTacticsSettings` | TacticsPage inline `loadTacticsSettings` |
| `tactics-column-widths-{year}` | TacticsPage direct `storage.setJSON` | TacticsPage direct `storage.getJSON` |
| `planner-year-{N}-{projectId}-*` | `utils/planner/storage.js` functions | `usePlannerStorage` via `utils/planner/storage.js` |
| `user:{userId}:{key}` | All of the above (when user is logged in) | All of the above |

### Cross-page data events

| Event name | Fired by | Listened to by |
|---|---|---|
| `staging-state-update` | `stagingStorage.saveStagingState` | TacticsPage, `useProjectsData` (System) |
| `tactics-metrics-state-update` | `tacticsMetricsStorage.saveTacticsMetrics` | `useTacticsMetrics` (System) |
| `yearMetadataStorage` | `yearMetadataStorage.saveYearMetadata` | `YearContext` |
| `storage` (native browser event) | Browser (cross-tab) | TacticsPage |

### Flag: duplicate staging reads

`loadStagingState` is called independently in three different places:
- `useShortlistState` (Goal page initial load)
- `useProjectsData` (System page, via `useStorageSync`)
- TacticsPage (directly in `useEffect`s and on storage events)

Each call is independent. If staging data changes, all three must be notified. The custom event system handles this, but there is no guarantee they read the same snapshot if a change fires while any is mid-render.

---

## 4. State Management

### Local component state

Each page manages its own data independently in local React state:
- **Goal page**: `{ shortlist, archived }` via `useState` inside `useShortlistState`. Auto-saved to localStorage on every change via a `useEffect` watching `[shortlist, archived, currentYear]`.
- **System page**: `data` (task rows array) via `useState`. Debounced save (500ms) via `useEffect`.
- **Plan page**: Multiple `useState` calls for chips, settings, custom projects, column widths, UI state. Saved to various localStorage keys on change.

### Shared state

The only shared state is via React contexts:
- `AuthContext` — user/session/isAuthenticated
- `UserContext` — profile data (used mostly by AccountSettingsPage)
- `YearContext` — current year number, year metadata

Planning data is **not** in context. It passes between pages purely via localStorage + custom events.

### Potential stale data / sync issues

1. **Goal → System project list**: If a user renames a project on the Goal page, the System page's dropdown will update reactively (via the `staging-state-update` event), but any existing task rows that already have the old project name in their `project` field will not be updated. The planner has no reconciliation step.

2. **Goal → Tactics chip removal**: When a project's `addedToPlan` flag is set to `false` on the Goal page, TacticsPage has a `useEffect` that filters chips with removed project IDs from `projectChips`. However, this only fires when the Tactics page is mounted and receives the storage event — if the Tactics page is not currently mounted, the chips will persist until next load.

3. **System page data initialisation**: On first load, `ProjectTimePlannerV2` initialises `data` from `taskRows` (localStorage). Then a `useEffect` watching `[projects, projectNamesMap, totalDays]` fires and injects project header/general/unscheduled rows into the data array **after** the initial render. This happens inside a `setTimeout(..., 0)` and calls `setData` — it will trigger a re-render and a re-save (500ms debounce). This is a structural race on every page load.

4. **`useComputedDataV2` circular write-back**: The hook reads `data`, computes derived fields, then writes them back via `setData`. This intentional circular dependency is noted in code comments but creates a persistent update loop on every render cycle where computed values differ from stored values. In theory it converges, but it fires on every status/estimate change.

5. **Preferences are never persisted**: `UserContext.updatePreferences` contains `// TODO: Replace with Supabase database update or localStorage`. It only updates in-memory state. Preferences are lost on refresh.

---

## 5. TanStack Table & Virtual

### TanStack Table usage

`ProjectTimePlannerV2` imports `useReactTable` from `@tanstack/react-table` and `useVirtualizer` from `@tanstack/react-virtual`.

**`useReactTable` is configured but the table's `getRowModel().rows` is not used for rendering.** The component builds its own `filteredData` array and maps over it directly with custom `<TableRow>` components. TanStack Table is providing column definitions and column sizing (`columnResizeMode: 'onChange'`), but the actual row rendering bypasses the table's row model entirely.

**`useVirtualizer` is imported but never called.** There is no virtualizer instance in the component. All rows in `filteredData` are rendered to the DOM unconditionally.

This means:
- With 1,000+ rows (which is plausible once archive data accumulates over 12 weeks), all rows will render at once with no windowing.
- Column resizing works via TanStack Table's resize API.
- The `PlannerTable` component wraps the table element and presumably handles the scroll container, but without virtualisation the performance benefit is absent.

### Archive row generation

When "Archive Week" is triggered:
1. The first visible week's day columns are identified.
2. Done/Abandoned task rows are collected.
3. An `archiveRow` header is created with week metadata and daily min/max values.
4. Project structure rows (`archivedProjectHeader`, `archivedProjectGeneral`, `archivedProjectUnscheduled`) are created.
5. The archived tasks are moved into the archive structure.
6. Recurring tasks are snapshotted (a frozen copy is inserted) and the originals are reset.
7. All of this is pushed into the data array above the current task rows.

This means archived data accumulates inline in the same `data` array. Over 12 weeks, the array can grow substantially. With no virtualisation, this is the primary performance risk.

---

## 6. Authentication

### Session management

`AuthContext` initialises by calling `supabase.auth.getSession()` on mount, then subscribes to `onAuthStateChange`. Both paths call `setCurrentUserId(userId)` on the `storageService` module — this scopes all subsequent localStorage keys to `user:{userId}:{key}`.

### Protected routes

`ProtectedRoute` wraps all planning routes. It:
1. Waits for `AuthContext.isLoading` to resolve.
2. Checks `isAuthenticated`. If false, redirects to `/login`.
3. Performs a one-time Supabase query to `profiles` to check `deletion_requested_at`. If set, logs out and redirects to `/account-deleted`.

The deletion check uses a `hasCheckedDeletion` ref so it only runs once per mount. This means if deletion is requested in another tab, the current tab will not be aware until the user navigates away and back.

### PublicRoute

Redirects authenticated users away from `/login`, `/signup`, `/forgot-password`. The `/reset-password` route is deliberately not wrapped in `PublicRoute` so that authenticated users can still reach it after clicking a password reset email link.

### Where auth state is consumed

| Location | What it uses |
|---|---|
| `ProtectedRoute` | `isAuthenticated`, `isLoading`, `user`, `logout` |
| `PublicRoute` | `isAuthenticated`, `isLoading` |
| `UserContext` | `authUser`, `isAuthenticated`, `authLoading` |
| `AuthContext` → `storageService` | `setCurrentUserId` (to scope localStorage) |
| `NavigationBar` | `logout`, `user` (to conditionally show logout button) |
| `StagingPageV2` | `isLoading` (loading spinner only — not used for data scoping) |
| `AccountSettingsPage` | `user`, `logout` |
| `ResetPasswordPage` | `updatePassword` |

---

## 7. Anything That Looks Wrong or Surprising

### 7.1 `useVirtualizer` imported but never used

`import { useVirtualizer } from '@tanstack/react-virtual';` exists at the top of `ProjectTimePlannerV2.jsx` but no `useVirtualizer()` call exists in the component. All rows render unconditionally. This is a significant performance gap given the potential for 1,000+ rows over a 12-week cycle with archives.

### 7.2 Archive logic duplicated

`handleArchiveWeek` is fully implemented inline in `ProjectTimePlannerV2.jsx` (~200 lines) AND `useArchiveOperations.js` exists as a separate hook that also implements the same logic. The hook is imported and called — but the inline version also appears to be active. This is structurally confusing and may represent incomplete refactoring.

### 7.3 `useComputedData.ts` is dead code

The original `useComputedData.ts` still exists. `useComputedDataV2.ts` superseded it and is what the page uses. The old file is never imported anywhere.

### 7.4 `SupabaseTest` component is orphaned

`SupabaseTest.jsx` exists and contains a working debug UI, but it is not rendered anywhere in the app and not exported from any index. It is dead code that was presumably used during development.

### 7.5 `src/ScheduleChips` — unknown import

`TacticsPage.jsx` imports `buildScheduleLayout` from `'../ScheduleChips'`. The Glob pattern for `.jsx/.js/.ts/.tsx` files did not surface a file called `ScheduleChips` in `src/`. If this file does not exist, the Tactics page would fail to compile/run. This needs verification.

### 7.6 Three separate storage modules for tactics

Tactics data is split across:
- `tacticsMetricsStorage.js` — daily bounds and weekly quotas (readable by System page)
- Inline functions in `TacticsPage.jsx` — chip state, settings (not exported, not accessible cross-page)
- Direct `storage.setJSON` calls in `TacticsPage.jsx` — column widths

This inconsistency means the column widths and chip positions are not read by or accessible to other pages, which is probably intentional, but the inconsistency of approach could cause confusion.

### 7.7 Console.log left in production code

`TacticsPage.jsx` line ~813: `console.log('[resize]', entry.id, 'originalMinutes:', ...)` is inside the production resize logic.

### 7.8 Project name vs nickname mismatch on System page

`useProjectsData` uses `projectNickname` as the dropdown key if available, otherwise `projectName`. Task rows store whichever value was selected. If a user has set a nickname, the planner project column stores the nickname. But the `projectNamesMap` lookup is then used to display the full name in some views. If a project's nickname is later changed on the Goal page, existing task rows will have a stale key that no longer matches any entry in `projectSubprojectsMap`, causing subproject dropdowns to show no options for those rows.

### 7.9 Preferences are never persisted

`UserContext.updatePreferences` is a stub. It updates in-memory state only. The default preferences (`theme: 'light'`, `notifications_enabled: true`, `default_view: 'planner'`) are hardcoded and never stored anywhere. The `theme` preference has no effect anywhere in the app.

### 7.10 Migration stubs in Layout and UserContext

`Layout.jsx` calls `needsUserMigration()` which always returns `false` (stub in `UserContext`). The migration check is wired up with async/await and a loading spinner but never does anything. `yearMigration.js` exists as a complete implementation of data migration but is not called from anywhere.

### 7.11 `planSummary` written on save but `planSummary.subprojects` is what `useProjectsData` reads

When staging is saved, `buildProjectPlanSummary(item)` generates a `planSummary` object that includes `subprojects`. `useProjectsData` on the System page reads `item.planSummary.subprojects` to populate the subproject dropdown. This means subproject names typed on the Goal page's plan table are what appear in the System page's subproject dropdown. However, the `planSummary` is only regenerated when the shortlist changes — if a user edits a subproject name directly in a plan table cell and the save effect does not run immediately, the System page may show stale subproject names until the next save cycle.

### 7.12 `use24Hour` stored in settings but not used in time display

`TacticsPage` has `use24Hour` state that is saved/loaded, but inspection of the `formatTime` function and rendering shows that the `showAmPm` flag and 12-hour format appear to be the primary display path. The 24-hour toggle may not be fully wired.

### 7.13 Year archive creates empty staging for new year

When `performYearArchive` runs, it calls `saveStagingState({ shortlist: [], archived: [] }, nextYearNumber)` — wiping staging for the new year. This means no goals carry forward. Recurring tasks are carried forward in the System planner, but goal planning starts blank.

---

## 8. Dead Code & Loose Ends

### Unused/orphaned files

| File | Status |
|---|---|
| `src/hooks/planner/useComputedData.ts` | Superseded by `useComputedDataV2.ts`. Not imported anywhere. |
| `src/components/SupabaseTest.jsx` | Debug component. Not rendered anywhere. |
| `src/hooks/planner/useCellSelection.js` | Not imported by `ProjectTimePlannerV2` or any current file. |
| `src/hooks/planner/usePlannerRowRendering.js` | Not imported by current page components. |
| `src/hooks/planner/usePlannerInteractions.js` | Not imported by current page components. |
| `src/hooks/planner/useRowDragSelection.jsx` | Not found in any import in the main pages. |
| `src/utils/plannerStorage.js` | Uses `plannerConstants.js` keys that are likely legacy. This is separate from `utils/planner/storage.js` which is the active one. Likely dead. |
| `src/utils/rowDataTransformers.js` | Needs import check — likely legacy utility. |
| `src/utils/plannerStyles.js` | Needs import check — likely legacy utility. |
| `src/utils/plannerFormatters.js` | Needs import check — likely legacy utility. |
| `src/pages/ProjectTimePlannerWireframe.jsx` | Accessible at `/v1`. Legacy wireframe version. Still in the router but labelled as v1. |
| `src/timeline/useTimelineRows.js` | Located in a top-level `timeline/` folder, not under `hooks/`. Likely a leftover from an earlier architecture. Import status unclear. |
| `src/constants/plannerConstants.js` | References `SETTINGS_STORAGE_KEY` and `TASK_ROWS_STORAGE_KEY` used by the legacy `utils/plannerStorage.js`. May be unused by active code. |

### Significant commented-out code

No significant blocks of commented-out code were identified. There are `// TODO` annotations in:
- `UserContext.jsx` (preferences persistence, migration check)
- `Layout.jsx` (migration implementation)
- `useProjectsData.js` (storage key comment in `useStorageSync`)

### Unused imports to verify

- `import { useVirtualizer } from '@tanstack/react-virtual'` in `ProjectTimePlannerV2.jsx` — imported, never called.
- The `rowNum` column appears in `allColumnIds` and `getDefaultColumnSizing` but the System page renders rows without a row number column in some paths — the actual render path should be verified.
