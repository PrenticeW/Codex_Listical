# Goals Page Refactoring Plan

This document outlines refactoring opportunities for the Goals page (StagingPageV2) identified during code review. The changes improve maintainability for human developers and prepare the codebase for multi-user support.

## Critical: Multi-User Issues

### 1. Race Condition: Data Loads Before Auth Completes
**Files:** `src/hooks/staging/useShortlistState.js`, `src/pages/StagingPageV2.jsx`

**Problem:** `useShortlistState` loads data synchronously during initialization via `useState(() => loadStagingState(currentYear))`. But `AuthProvider` sets `currentUserId` asynchronously after checking the Supabase session. This means:
1. User refreshes page
2. Component mounts, calls `loadStagingState()`
3. `currentUserId` is still `null` → loads from non-scoped storage key
4. Auth completes, `setCurrentUserId(userId)` is called
5. User sees wrong data or empty state

**Fix:** Add auth loading guard to `StagingPageV2` before rendering content:
```javascript
const { isLoading } = useAuth();
if (isLoading) return <LoadingSpinner />;
```

### 2. Verify Storage Keys Are User-Scoped
**Files:** `src/lib/stagingStorage.js`, `src/lib/yearMetadataStorage.js`

**Problem:** Storage keys like `staging-year-{yearNumber}-shortlist` don't explicitly include user ID. The `storageService.js` has user-scoping via `getScopedKey()`, but we need to verify:
- `stagingStorage.js` is actually using the scoped path (not passing `global: true`)
- `yearMetadataStorage.js` uses `storageService` with user scoping
- Manual test: login as two different users and confirm data isolation

**Action:** Review both storage files and add integration test or manual verification.

---

## High Impact: Code Organization

### 3. Extract Inline Modal Component
**File:** `src/pages/StagingPageV2.jsx` (lines 492-588)

**Problem:** The project edit modal is ~100 lines of JSX defined inline within the `shortlist.map()` loop, making the main component hard to read.

**Fix:** Extract to `src/components/staging/ProjectEditModal.jsx` with props:
- `item`, `planModal`, `updatePlanModal`, `handlePlanNext`, `handleRemove`, `handleTogglePlanStatus`, `onClose`

### 4. Consolidate Row Metadata Handling
**Files:** Multiple locations define row metadata using `Object.defineProperty`
- `src/hooks/staging/useShortlistState.js` (lines 31-46, 56-62)
- `src/utils/staging/planTableHelpers.js` (lines 90-126, 164-201)
- `src/hooks/staging/useRowCommands.js` (lines 305-310)
- `src/lib/stagingStorage.js` (lines 54-84)

**Problem:** Row metadata (`__rowType`, `__pairId`, `__sectionType`, `__isTotalRow`) is defined identically in 5+ places. If a new metadata property is added, all locations must be updated.

**Fix:** Create a single utility in `planTableHelpers.js`:
```javascript
export const defineRowMetadata = (row, { rowType, pairId, sectionType, isTotalRow }) => {
  if (rowType) {
    Object.defineProperty(row, '__rowType', { value: rowType, writable: true, configurable: true, enumerable: false });
  }
  // ... same for other properties
  return row;
};
```

---

## Medium Impact: Reduce Duplication

### 5. Share Command Pattern Helper
**Files:** `src/hooks/staging/usePlanTableState.js`, `src/hooks/staging/useShortlistState.js`, `src/hooks/staging/useRowCommands.js`, `src/pages/StagingPageV2.jsx`

**Problem:** The undo/redo command pattern appears identically ~12 times:
```javascript
let capturedState = null;
const command = {
  execute: () => {
    setState((prev) => {
      if (capturedState === null) capturedState = cloneStagingState(prev);
      // mutation
    });
  },
  undo: () => { if (capturedState) setState(capturedState); },
};
executeCommand(command);
```

**Fix:** The `executeStateMutation` helper in `usePlanTableState.js` (lines 30-59) already abstracts this. Export it from a shared location (e.g., `src/utils/staging/commandHelpers.js`) and use in all hooks.

### 6. Extract Section Boundaries Calculator
**Files:** `src/hooks/staging/usePlanTableState.js` (lines 93-111, 336-354), `src/utils/staging/planTableHelpers.js` (lines 271-285)

**Problem:** Complex row position calculations are duplicated:
```javascript
const reasonRowLimit = 2 + reasonCount;
const outcomeHeadingRow = reasonRowLimit;
const outcomePromptStart = outcomeHeadingRow + 1;
// ... 15+ more lines
```

**Fix:** Create `calculateSectionBoundaries(item)` in `planTableHelpers.js` that returns all positions as an object.

### 7. Simplify TableRow Component
**File:** `src/components/staging/TableRow.jsx` (440 lines)

**Problem:** Five separate `<tr>` return statements with significant duplication between row types (header, prompt, response, data).

**Fix:** Consider a configuration-driven approach where each row type specifies cell configuration, reducing to one dynamic renderer. Lower priority due to higher effort.

---

## Low Impact: Cleanup

### 8. Remove Dead Code
**Files:**
- `src/pages/StagingPageV2.jsx` line 87: `currentPath` declared but never used
- `src/hooks/staging/useShortlistState.js` lines 223-230: Legacy row counts initialized to 0 with comment about "simple tables" but still referenced in `usePlanTableState.js`

### 9. Add Constants for Magic Numbers and Strings
**Files:** Various (`StagingPageV2.jsx`, `usePlanTableState.js`, `TableRow.jsx`, `planTableHelpers.js`)

**Problem:**
- Column indices like `row[5]` for time values, `row[4]` for estimates appear without explanation
- Section names like `'Actions'`, `'Schedule'`, `'Outcomes'` are string literals scattered throughout (should use `SECTION_CONFIG` keys consistently)

**Fix:**
- Add column constants in `planTableHelpers.js`:
  ```javascript
  export const COL = {
    DRAG_HANDLE: 0,
    LABEL: 1,
    CONTENT: 2,
    // ...
    ESTIMATE: 4,
    TIME_VALUE: 5,
  };
  ```
- Ensure all section type checks use `SECTION_CONFIG` keys or a `SECTION_TYPES` constant

### 10. Add Type Definitions
**Files:** Various hooks and utilities

**Problem:** Complex data structures are hard to understand:
- Item objects with nested `planTableEntries` arrays
- Row arrays with non-enumerable metadata properties (`__rowType`, `__pairId`, etc.)
- `planModal` state shape
- Command pattern structure

**Fix:** Add JSDoc type definitions at minimum. Consider TypeScript migration for new files. Key types to document:
```javascript
/**
 * @typedef {Object} StagingItem
 * @property {string} id
 * @property {string} text
 * @property {string} [projectName]
 * @property {string} [color]
 * @property {boolean} planTableVisible
 * @property {boolean} planTableCollapsed
 * @property {Array<RowArray>} planTableEntries
 * @property {boolean} [showOutcomeTotals]
 * @property {boolean} [addedToPlan]
 * ...
 */

/**
 * @typedef {Array<string> & { __rowType?: string, __pairId?: string, __sectionType?: string }} RowArray
 */
```

---

## Future: Backend Storage Strategy

**Problem:** All data is in localStorage. For true multi-user support with data sync across devices:
- Server-side storage needed (Supabase Postgres)
- Sync between local cache and server
- Conflict resolution for offline edits

**Recommendation:** Create a `StagingService` abstraction layer that hooks call. This service can switch between localStorage (offline) and Supabase (online) without changing hook code.

---

## Priority Order

| Priority | Item | Effort | Impact |
|----------|------|--------|--------|
| 1 | Auth loading guard (race condition) | Low | Critical |
| 2 | Verify storage user-scoping | Low | Critical |
| 3 | Extract inline modal | Low | High |
| 4 | Consolidate row metadata | Medium | High |
| 5 | Share command pattern helper | Low | Medium |
| 6 | Extract section boundaries calc | Medium | Medium |
| 7 | Simplify TableRow | High | Medium |
| 8 | Remove dead code | Low | Low |
| 9 | Add constants for magic numbers/strings | Low | Low |
| 10 | Add type definitions (JSDoc) | Medium | Medium |
