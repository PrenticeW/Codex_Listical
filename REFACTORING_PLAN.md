# ProjectTimePlannerV2 - Complete Refactoring Plan

## Current State
**File:** `src/pages/ProjectTimePlannerV2.jsx`
**Lines:** 1,802
**Problem:** Monolithic component doing too many things

---

## What We've Done So Far ✅

### Phase 1 & 2 Complete
1. ✅ Generic persistence hooks (`useAutoPersist`, `useStorageSync`, `useAsyncHandler`)
2. ✅ Split `useComputedData` (353 lines) into 3 focused utilities
3. ✅ Added React.memo to expensive components
4. ✅ Created `useArchiveOperations` hook

**Result:** Good progress on utilities, but main component still 1,802 lines

---

## Remaining Work - The Big Split 🏗️

### Component Breakdown Analysis

**ProjectTimePlannerV2 Current Structure:**
```
ProjectTimePlannerV2 (1,802 lines)
├── State Management (~150 lines)
│   ├── 12+ useState declarations
│   ├── Storage hook integrations
│   └── Computed data hooks
│
├── Event Handlers (~600 lines)
│   ├── Cell/row selection handlers
│   ├── Edit handlers
│   ├── Drag and drop handlers
│   ├── Keyboard handlers
│   ├── Context menu handlers
│   ├── Archive operations (NOW EXTRACTED ✅)
│   ├── Sort operations
│   └── Add/delete operations
│
├── Data Operations (~400 lines)
│   ├── useEffect for data sync
│   ├── Timeline calculations
│   ├── Month/week span calculations
│   └── Project synchronization
│
└── Rendering (~650 lines)
    ├── Archived year banner
    ├── NavigationBar with ProjectListicalMenu
    ├── PlannerTable with all props
    ├── FilterPanel
    ├── ContextMenu
    └── ArchiveYearModal
```

---

## Refactoring Strategy

### Option A: Extract More Hooks (Recommended)
Keep ProjectTimePlannerV2 as the orchestrator, but extract logic into focused hooks.

**New Hooks to Create:**
1. `useTableState` - Consolidate all table-related useState
2. `useTableHandlers` - Extract all event handlers
3. `usePlannerOperations` - Sort, add, delete operations
4. `useTimelineCalculations` - Month/week/day calculations

**Pros:**
- Incremental refactor (lower risk)
- Maintains single source of truth
- Easier to test hooks in isolation
- Component stays under 500 lines

**Cons:**
- Still one large component file
- Lots of prop passing to PlannerTable

---

### Option B: Split into Multiple Components
Break ProjectTimePlannerV2 into separate component files.

**New Components:**
1. `PlannerContainer` - Top-level orchestrator (~200 lines)
2. `PlannerHeader` - Navigation + archive banner (~100 lines)
3. `PlannerToolbar` - Listical menu + filters (~150 lines)
4. `PlannerGrid` - Table wrapper (~100 lines)
5. Keep hooks for logic

**Pros:**
- Clearer separation of concerns
- Each component focused on one thing
- Easier to navigate codebase

**Cons:**
- More files to maintain
- Potential prop drilling
- Bigger refactor (higher risk)

---

### Option C: Hybrid Approach (RECOMMENDED)
Combine both strategies for maximum benefit.

**Step 1: Extract Remaining Hooks**
- ✅ `useArchiveOperations` (DONE)
- 🔲 `useTableState` - Consolidate useState
- 🔲 `usePlannerHandlers` - All event handlers
- 🔲 `useTimelineData` - Timeline calculations

**Step 2: Simplify Main Component**
After extraction, `ProjectTimePlannerV2` becomes:
```javascript
export default function ProjectTimePlannerV2() {
  // Hooks (one-liners)
  const state = useTableState();
  const handlers = usePlannerHandlers(state);
  const timeline = useTimelineData(state);
  const archive = useArchiveOperations(state);

  // Render (clean JSX)
  return (
    <PlannerLayout>
      <PlannerHeader {...headerProps} />
      <PlannerToolbar {...toolbarProps} />
      <PlannerTable {...tableProps} />
    </PlannerLayout>
  );
}
```

**Target:** ~300 lines (83% reduction!)

---

## Implementation Plan

### Phase 3A: Extract Table State Hook
**File:** `src/hooks/planner/useTableState.js`

Consolidate:
- `data`, `setData`
- `selectedCells`, `setSelectedCells`
- `selectedRows`, `setSelectedRows`
- `anchorRow`, `anchorCell`
- `isDragging`, `dragStartCell`
- `isListicalMenuOpen`, `addTasksCount`
- `isArchiveModalOpen`

**Benefit:** Single source for all table state

---

### Phase 3B: Extract Event Handlers Hook
**File:** `src/hooks/planner/usePlannerHandlers.js`

Consolidate:
- Selection handlers (cell, row, range)
- Edit handlers (start, complete, cancel)
- Drag and drop handlers
- Keyboard handlers
- Context menu handlers

**Benefit:** Clean separation of logic from rendering

---

### Phase 3C: Extract Timeline Calculations
**File:** `src/hooks/planner/useTimelineData.js`

Consolidate:
- `dates` calculation
- Month span calculations
- Week span calculations
- Daily min/max row updates

**Benefit:** Focused data transformation

---

### Phase 3D: Simplify Main Component
**File:** `src/pages/ProjectTimePlannerV2.jsx`

After all extractions:
```javascript
// Hooks only
const { currentYear, isCurrentYearArchived, activeYear } = useYear();
const storage = usePlannerStorage({ yearNumber: currentYear });
const state = useTableState(storage);
const handlers = usePlannerHandlers(state);
const timeline = useTimelineData(state);
const archive = useArchiveOperations(state);
const filters = usePlannerFilters();
// ... other existing hooks

// Render
return <PlannerLayout>...</PlannerLayout>
```

---

## Expected Outcomes

### Before
```
ProjectTimePlannerV2.jsx: 1,802 lines
├── Mixed concerns
├── Hard to test
├── Cognitive overload
└── Difficult to modify
```

### After
```
ProjectTimePlannerV2.jsx: ~300 lines (orchestrator)
├── useTableState.js: ~100 lines
├── usePlannerHandlers.js: ~400 lines
├── useTimelineData.js: ~150 lines
├── useArchiveOperations.js: ~200 lines ✅ DONE
└── Clean, testable, maintainable
```

**Total Reduction:** 1,802 → 300 lines in main file (83% reduction)

---

## Risk Assessment

**Low Risk:**
- Extracting hooks (no breaking changes)
- Adding tests for extracted logic
- Incremental refactor

**Medium Risk:**
- Large refactor in one go
- Potential for introduced bugs
- Prop drilling issues

**Mitigation:**
- Extract one hook at a time
- Test after each extraction
- Keep git history clean
- Use TypeScript for type safety

---

## Timeline Estimate

**Remaining Work:**
1. Extract `useTableState` - 1-2 hours
2. Extract `usePlannerHandlers` - 2-3 hours
3. Extract `useTimelineData` - 1-2 hours
4. Simplify main component - 1 hour
5. Testing & integration - 2 hours

**Total:** 7-10 hours of focused work

---

## Next Steps

1. **Immediate:** Extract `useTableState` hook
2. **Next:** Extract `usePlannerHandlers` hook
3. **Then:** Extract `useTimelineData` hook
4. **Finally:** Clean up main component and test

Would you like me to proceed with Phase 3A (useTableState)?
