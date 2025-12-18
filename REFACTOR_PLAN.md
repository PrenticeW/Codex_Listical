# TanStack Table Refactor Plan

## Goal
Build a Google Sheets-like spreadsheet using TanStack Table v8 with all standard spreadsheet features, then layer in custom business logic.

## Branch Strategy
- **Old implementation**: Tagged as `v1-custom-implementation`
- **New implementation**: Branch `refactor/tanstack-table-google-sheets`
- Can always reference old code: `git show v1-custom-implementation:path/to/file.js`

## Phase 1: Core Spreadsheet Features (Week 1)

### Must-Have Google Sheets Features
- [ ] **Cell Selection**
  - Single click to select cell
  - Cmd/Ctrl+click for multi-select
  - Shift+click for range selection
  - Click and drag to select range
  - Visual highlight for selected cells

- [ ] **Keyboard Navigation**
  - Arrow keys (↑↓←→) to move between cells
  - Tab to move right, Shift+Tab to move left
  - Enter to move down, Shift+Enter to move up
  - Escape to exit edit mode

- [ ] **Cell Editing**
  - Double-click to edit cell
  - Start typing to replace cell content
  - Click to select, double-click to edit
  - Enter/Tab to commit and move
  - Escape to cancel edit

- [ ] **Copy/Paste**
  - Cmd/Ctrl+C to copy selected cells
  - Cmd/Ctrl+V to paste
  - Single cell copy/paste
  - Range copy/paste (e.g., A1:C5 → D10:F14)
  - Tab-separated values for multi-cell paste

- [ ] **Cell Clearing**
  - Delete/Backspace to clear selected cells
  - Works with single cell or range

- [ ] **Column Operations**
  - Drag column borders to resize
  - Persist column widths
  - Minimum column width enforcement

- [ ] **Performance**
  - Row virtualization with TanStack Virtual
  - Handle 1000+ rows smoothly
  - Smooth scrolling

- [ ] **Cell Types**
  - Text input cells
  - Select/dropdown cells
  - Checkbox cells
  - Read-only cells

## Phase 2: Custom Business Logic (Week 2)

### Features to Port from v1-custom-implementation

- [ ] **Custom Row Types**
  - `projectHeader` - Project section headers
  - `projectGeneral` - General tasks section
  - `projectTask` - Individual tasks
  - `projectUnscheduled` - Unscheduled tasks section
  - `inboxHeader` - Inbox section header
  - `inboxItem` - Inbox tasks
  - `archiveHeader` - Archive section header
  - `archiveRow` - Archived weeks

- [ ] **Archive Functionality**
  - `handleArchiveWeek` - Archive done/abandoned tasks
  - Archive row grouping/collapsing
  - Dynamic total calculations for archived items
  - Week labeling and metadata

- [ ] **Sort Inbox Functionality**
  - `handleSortInbox` - Move inbox items to projects
  - Status-based routing (Done → General, Abandoned → Unscheduled)
  - Project nickname matching

- [ ] **Data Integration**
  - Load from Staging page (`stagingStorage.js`)
  - Load from Tactics page (`tacticsMetricsStorage.js`)
  - LocalStorage persistence
  - Cross-page event synchronization

- [ ] **Timeline/Calendar Headers**
  - Month row
  - Week row
  - Day row
  - Date labels
  - Min/Max daily bounds visualization

- [ ] **Filtering System**
  - Filter by project
  - Filter by status
  - Filter by recurring
  - Filter by estimate
  - Filter by day (has value)

- [ ] **Calculations**
  - Column totals (sum of day entries)
  - Project header totals (scheduled/done tasks)
  - Archive week totals
  - Daily min/max bounds checking

## Library Choice: TanStack Table v8

### Why TanStack Table?
- Already in package.json
- Industry standard, well-documented
- Works with TanStack Virtual (already using)
- Lovable.dev compatible
- Powerful column/row APIs
- Good for custom cell renderers

### Key TanStack Table Features We'll Use
- `getCoreRowModel()` - Basic row rendering
- `getSortedRowModel()` - Sorting support
- `getFilteredRowModel()` - Filtering support
- `getExpandedRowModel()` - Row grouping/expanding (for archive)
- Column definitions with custom cell renderers
- Row selection state management
- Column sizing API

### TanStack Virtual Integration
- Already using `@tanstack/react-virtual`
- Seamless integration with TanStack Table
- Virtual scrolling for performance

## Implementation Strategy

### Week 1: Build Generic Spreadsheet
1. **Days 1-2**: Core table setup
   - TanStack Table configuration
   - Basic column definitions
   - Simple data rendering
   - Cell selection (single)

2. **Days 3-4**: Spreadsheet interactions
   - Multi-cell selection (cmd, shift, drag)
   - Keyboard navigation
   - Copy/paste
   - Cell editing modes

3. **Days 5-7**: Polish & testing
   - Column resizing
   - Virtualization
   - Visual feedback
   - Edge cases

**Milestone**: Generic spreadsheet that feels like Google Sheets

### Week 2: Add Business Logic
1. **Days 1-2**: Custom row types
   - Define row type system
   - Custom cell renderers per row type
   - Project/inbox/archive structure

2. **Days 3-4**: Core features
   - Archive functionality
   - Sort inbox functionality
   - Timeline headers
   - Filtering

3. **Days 5-7**: Integration & testing
   - Tactics/Staging integration
   - LocalStorage persistence
   - Calculations
   - Full feature testing

**Milestone**: Complete app with all original features

## Success Criteria

### Phase 1 Complete When:
- ✅ Can select cells with mouse (single, multi, range, drag)
- ✅ Can navigate with keyboard (arrows, tab, enter)
- ✅ Can edit cells (double-click, type, commit, cancel)
- ✅ Can copy/paste (single cell and ranges)
- ✅ Can delete cell contents
- ✅ Can resize columns
- ✅ Smooth scrolling with 1000+ rows
- ✅ Feels like using Google Sheets

### Phase 2 Complete When:
- ✅ All custom row types working
- ✅ Archive week functionality working
- ✅ Sort inbox functionality working
- ✅ Tactics/Staging integration working
- ✅ All calculations accurate
- ✅ Filtering working
- ✅ Data persistence working
- ✅ Feature parity with v1-custom-implementation

## Risk Mitigation

### If TanStack Table doesn't work:
- **Decision point**: End of Day 3
- **Criteria**: Can we get multi-cell selection + keyboard nav working?
- **Fallback**: Return to v1-custom-implementation and finish it
- **Cost**: 3 days lost

### If business logic doesn't fit:
- **Most business logic is pure functions** - should port easily
- **Archive/Sort are array transformations** - library agnostic
- **Worst case**: Keep business logic, rewrite just the table rendering

## Notes

- Keep old implementation accessible via `git show v1-custom-implementation:file`
- Document any patterns that don't port cleanly
- Prioritize "Google Sheets feel" over feature parity initially
- Add features back incrementally, testing as we go
