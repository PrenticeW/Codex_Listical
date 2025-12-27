# Implementation Plan: Daily Max/Min Rows for ProjectTimePlannerV2

## Overview
Reimplement the daily max and min rows feature from the main branch's ProjectTimePlannerWireframe, adapting it to work with the new TanStack Table architecture in ProjectTimePlannerV2 and following the "No direct localStorage" pattern.

---

## Background: How It Works in Main Branch

### Data Source (TacticsPage)
- **Storage Key**: `'tactics-metrics-state'`
- **Data Structure**:
  ```javascript
  {
    projectWeeklyQuotas: [...],
    dailyBounds: [
      { day: 'Sunday', dailyMaxHours: 10.50, dailyMinHours: 5.00 },
      { day: 'Monday', dailyMaxHours: 12.00, dailyMinHours: 6.30 },
      // ... one per day of week
    ],
    weeklyTotals: {...}
  }
  ```

- **Calculation** (TacticsPage.jsx:1498-1511):
  - `dailyMaxHours`: Sum of working hours + buffer hours (available time)
  - `dailyMinHours`: Sum of all committed working hours (minimum required)
  - Both converted to decimal hours via `minutesToHourMinuteDecimal()`

### Data Consumption (ProjectTimePlannerWireframe)
- **State**: `const [dailyBoundsMap, setDailyBoundsMap] = useState(() => new Map())`
- **Loading**: On mount, loads from `loadTacticsMetrics()` and converts array to Map
- **Sync**: Listens to `storage` event to update when TacticsPage changes
- **Usage**: Passes `dailyMinValues` and `dailyMaxValues` arrays to `useTimelineRows` hook

### Display (useTimelineRows Hook)
- Creates two special rows:
  - **Daily Min Row**: Pink background (#ead1dc), shows minimum committed hours
  - **Daily Max Row**: Light pink (#f2e5eb), shows maximum available hours
- Values formatted via `formatHoursValue()` (returns '0.00' format)

---

## New Architecture Considerations

### Storage Pattern
Following the established "No direct localStorage" pattern:

1. **Existing Abstraction**: `src/lib/tacticsMetricsStorage.js`
   - ✅ Already exists with `loadTacticsMetrics()` and `saveTacticsMetrics()`
   - ✅ No custom events currently (unlike stagingStorage.js)

2. **Hook Pattern**: Create `useTacticsMetrics` hook (similar to `usePlannerStorage`)
   - Initialize state from `loadTacticsMetrics()`
   - Listen for storage updates (native `storage` event or add custom event)
   - Return daily bounds data to components

### Component Structure
ProjectTimePlannerV2 uses TanStack Table, not custom row rendering:
- Special rows are part of the main `data` array
- Already has row type flags: `_isMonthRow`, `_isWeekRow`, `_isDayRow`, etc.
- Need to add: `_isDailyMinRow` and `_isDailyMaxRow`

---

## Implementation Plan

### Step 1: Add Custom Event to tacticsMetricsStorage.js
**File**: `src/lib/tacticsMetricsStorage.js`

**Changes**:
```javascript
// Add custom event constant
export const TACTICS_METRICS_STORAGE_EVENT = 'tactics-metrics-state-update';

// Update saveTacticsMetrics to dispatch event
const saveTacticsMetrics = (payload) => {
  const win = getBrowserWindow();
  if (!win) return;
  try {
    win.localStorage.setItem(TACTICS_METRICS_STORAGE_KEY, JSON.stringify(payload));

    // Dispatch custom event for sync
    const event = typeof CustomEvent === 'function'
      ? new CustomEvent(TACTICS_METRICS_STORAGE_EVENT, { detail: payload })
      : new Event(TACTICS_METRICS_STORAGE_EVENT);
    win.dispatchEvent(event);
  } catch (error) {
    console.error('Failed to save tactics metrics', error);
  }
};
```

**Rationale**: Matches the pattern used in `stagingStorage.js`, enables reactive updates

---

### Step 2: Create useTacticsMetrics Hook
**File**: `src/hooks/planner/useTacticsMetrics.js` (NEW)

**Purpose**:
- Load tactics metrics on mount
- Listen for updates from TacticsPage
- Return daily bounds data in a component-friendly format

**Implementation**:
```javascript
import { useState, useEffect } from 'react';
import {
  loadTacticsMetrics,
  TACTICS_METRICS_STORAGE_EVENT
} from '../../lib/tacticsMetricsStorage';

/**
 * Hook to load and sync tactics metrics (daily min/max bounds)
 * @returns {Object} Tactics metrics data
 */
export default function useTacticsMetrics() {
  const [dailyBounds, setDailyBounds] = useState(() => {
    const metrics = loadTacticsMetrics();
    return metrics?.dailyBounds || [];
  });

  useEffect(() => {
    const handleMetricsUpdate = (event) => {
      // event.detail contains the full payload from saveTacticsMetrics
      const payload = event.detail || loadTacticsMetrics();
      setDailyBounds(payload?.dailyBounds || []);
    };

    if (typeof window !== 'undefined') {
      window.addEventListener(TACTICS_METRICS_STORAGE_EVENT, handleMetricsUpdate);

      // Also listen to native storage event for cross-tab sync
      window.addEventListener('storage', (e) => {
        if (e.key === 'tactics-metrics-state') {
          const metrics = loadTacticsMetrics();
          setDailyBounds(metrics?.dailyBounds || []);
        }
      });

      return () => {
        window.removeEventListener(TACTICS_METRICS_STORAGE_EVENT, handleMetricsUpdate);
      };
    }
  }, []);

  return { dailyBounds };
}
```

**Rationale**:
- Follows same pattern as `useProjectsData.js`
- Encapsulates all localStorage logic
- Provides reactive updates

---

### Step 3: Create Utility to Map Daily Bounds to Timeline Dates
**File**: `src/utils/planner/dailyBoundsMapper.js` (NEW)

**Purpose**: Convert dailyBounds array (keyed by day name) to match actual timeline dates

**Implementation**:
```javascript
/**
 * Maps daily bounds (by day of week) to specific timeline dates
 * @param {Array} dailyBounds - Array of {day, dailyMaxHours, dailyMinHours}
 * @param {Array} dates - Array of Date objects for the timeline
 * @returns {Object} { dailyMinValues: [], dailyMaxValues: [] }
 */
export const mapDailyBoundsToTimeline = (dailyBounds, dates) => {
  if (!dailyBounds || dailyBounds.length === 0) {
    return {
      dailyMinValues: dates.map(() => '0.00'),
      dailyMaxValues: dates.map(() => '0.00'),
    };
  }

  // Create a map from day name to bounds
  const boundsMap = new Map();
  dailyBounds.forEach((bound) => {
    boundsMap.set(bound.day, {
      minHours: bound.dailyMinHours,
      maxHours: bound.dailyMaxHours,
    });
  });

  // Map each timeline date to its day-of-week bounds
  const dailyMinValues = [];
  const dailyMaxValues = [];

  dates.forEach((date) => {
    const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
    const bounds = boundsMap.get(dayName);

    if (bounds) {
      dailyMinValues.push(formatHoursValue(bounds.minHours));
      dailyMaxValues.push(formatHoursValue(bounds.maxHours));
    } else {
      dailyMinValues.push('0.00');
      dailyMaxValues.push('0.00');
    }
  });

  return { dailyMinValues, dailyMaxValues };
};

/**
 * Format hours value to fixed 2 decimal places
 * @param {number} value - Hours value
 * @returns {string} Formatted value like "10.50"
 */
const formatHoursValue = (value) => {
  if (!Number.isFinite(value)) return '0.00';
  return value.toFixed(2);
};
```

**Rationale**:
- dailyBounds from Tactics is by day-of-week (Sunday, Monday, etc.)
- Timeline has actual dates (2025-12-27, 2025-12-28, etc.)
- Need to map each date's day-of-week to the corresponding bounds

---

### Step 4: Update dataCreators to Include Daily Min/Max Rows
**File**: `src/utils/planner/dataCreators.js`

**Current Structure**:
```javascript
export const createInitialData = (rowCount, totalDays, startDate) => {
  const dates = calculateDates(startDate, totalDays);
  const rows = [];

  // Row 0: Month row
  rows.push(createMonthRow(dates));

  // Row 1: Week row
  rows.push(createWeekRow(dates));

  // Row 2: Day row (1-31)
  rows.push(createDayRow(dates));

  // Row 3: Day of week row (Sun, Mon, etc.)
  rows.push(createDayOfWeekRow(dates));

  // Row 4: Filter row (placeholder)
  rows.push(createFilterRow(totalDays));

  // Rows 5+: Task rows
  // ...

  return rows;
};
```

**Changes**:
```javascript
// Add new row creators
const createDailyMinRow = (dailyMinValues) => ({
  id: 'daily-min',
  _isDailyMinRow: true,
  rowNum: '',
  checkbox: false,
  project: 'Daily Min',
  subproject: '',
  status: '',
  task: '',
  recurring: '',
  estimate: '',
  timeValue: '',
  ...Object.fromEntries(
    dailyMinValues.map((value, i) => [`day-${i}`, value])
  ),
});

const createDailyMaxRow = (dailyMaxValues) => ({
  id: 'daily-max',
  _isDailyMaxRow: true,
  rowNum: '',
  checkbox: false,
  project: 'Daily Max',
  subproject: '',
  status: '',
  task: '',
  recurring: '',
  estimate: '',
  timeValue: '',
  ...Object.fromEntries(
    dailyMaxValues.map((value, i) => [`day-${i}`, value])
  ),
});

// Update createInitialData signature
export const createInitialData = (
  rowCount,
  totalDays,
  startDate,
  { dailyMinValues = null, dailyMaxValues = null } = {}
) => {
  const dates = calculateDates(startDate, totalDays);
  const rows = [];

  // Row 0: Month row
  rows.push(createMonthRow(dates));

  // Row 1: Week row
  rows.push(createWeekRow(dates));

  // Row 2: Day row (1-31)
  rows.push(createDayRow(dates));

  // Row 3: Day of week row (Sun, Mon, etc.)
  rows.push(createDayOfWeekRow(dates));

  // Row 4: Daily Min row (conditional)
  if (dailyMinValues && dailyMinValues.length === totalDays) {
    rows.push(createDailyMinRow(dailyMinValues));
  }

  // Row 5: Daily Max row (conditional)
  if (dailyMaxValues && dailyMaxValues.length === totalDays) {
    rows.push(createDailyMaxRow(dailyMaxValues));
  }

  // Row 6: Filter row (placeholder)
  rows.push(createFilterRow(totalDays));

  // Rows 7+: Task rows
  // ... existing task row creation

  return rows;
};
```

**Rationale**:
- Rows inserted between day-of-week row and filter row
- Conditional rendering based on whether bounds are available
- Follows existing special row pattern

---

### Step 5: Update ProjectTimePlannerV2 to Use Daily Bounds
**File**: `src/pages/ProjectTimePlannerV2.jsx`

**Changes**:

1. **Import hook and mapper**:
```javascript
import useTacticsMetrics from '../hooks/planner/useTacticsMetrics';
import { mapDailyBoundsToTimeline } from '../utils/planner/dailyBoundsMapper';
```

2. **Load tactics metrics** (after line 71):
```javascript
// Load daily bounds from Tactics page
const { dailyBounds } = useTacticsMetrics();
```

3. **Map bounds to timeline dates** (after line 190):
```javascript
// Map daily bounds to timeline dates
const { dailyMinValues, dailyMaxValues } = useMemo(() => {
  return mapDailyBoundsToTimeline(dailyBounds, dates);
}, [dailyBounds, dates]);
```

4. **Update initial data creation** (line 46):
```javascript
// OLD
const [data, setData] = useState(() => createInitialData(100, totalDays, startDate));

// NEW
const [data, setData] = useState(() => {
  // Initial load won't have bounds yet, will update via useEffect
  return createInitialData(100, totalDays, startDate);
});
```

5. **Add effect to update data when bounds change**:
```javascript
// Update data when daily bounds change
useEffect(() => {
  setData(prevData => {
    // Find indices of special rows
    const filterRowIndex = prevData.findIndex(row => row._isFilterRow);
    const existingMinRowIndex = prevData.findIndex(row => row._isDailyMinRow);
    const existingMaxRowIndex = prevData.findIndex(row => row._isDailyMaxRow);

    let newData = [...prevData];

    // Remove existing daily min/max rows if present
    if (existingMaxRowIndex !== -1) {
      newData.splice(existingMaxRowIndex, 1);
    }
    if (existingMinRowIndex !== -1) {
      newData.splice(existingMinRowIndex, 1);
    }

    // If we have bounds, insert new rows before filter row
    if (dailyMinValues && dailyMaxValues) {
      const currentFilterIndex = newData.findIndex(row => row._isFilterRow);

      const minRow = {
        id: 'daily-min',
        _isDailyMinRow: true,
        rowNum: '',
        checkbox: false,
        project: 'Daily Min',
        subproject: '',
        status: '',
        task: '',
        recurring: '',
        estimate: '',
        timeValue: '',
        ...Object.fromEntries(
          dailyMinValues.map((value, i) => [`day-${i}`, value])
        ),
      };

      const maxRow = {
        id: 'daily-max',
        _isDailyMaxRow: true,
        rowNum: '',
        checkbox: false,
        project: 'Daily Max',
        subproject: '',
        status: '',
        task: '',
        recurring: '',
        estimate: '',
        timeValue: '',
        ...Object.fromEntries(
          dailyMaxValues.map((value, i) => [`day-${i}`, value])
        ),
      };

      newData.splice(currentFilterIndex, 0, minRow, maxRow);
    }

    return newData;
  });
}, [dailyMinValues, dailyMaxValues, totalDays]);
```

6. **Update computedData to skip daily min/max rows** (line 80):
```javascript
// OLD
if (row._isMonthRow || row._isWeekRow || row._isDayRow ||
    row._isDayOfWeekRow || row._isFilterRow) {
  return row;
}

// NEW
if (row._isMonthRow || row._isWeekRow || row._isDayRow ||
    row._isDayOfWeekRow || row._isDailyMinRow || row._isDailyMaxRow ||
    row._isFilterRow) {
  return row;
}
```

7. **Update sync effect** (line 168):
```javascript
// Add flags to condition
if (computedRow && row.status !== computedRow.status && !row._isMonthRow &&
    !row._isWeekRow && !row._isDayRow && !row._isDayOfWeekRow &&
    !row._isDailyMinRow && !row._isDailyMaxRow && !row._isFilterRow) {
  // ...
}
```

---

### Step 6: Add Styling for Daily Min/Max Rows
**File**: `src/components/planner/TableRow.jsx`

**Changes**:
Check for `_isDailyMinRow` and `_isDailyMaxRow` flags and apply appropriate styling:

```javascript
// Determine row background color
let rowBgClass = 'bg-white';
if (row.original._isMonthRow) {
  rowBgClass = 'bg-gray-100';
} else if (row.original._isWeekRow) {
  rowBgClass = 'bg-blue-50';
} else if (row.original._isDayRow) {
  rowBgClass = 'bg-green-50';
} else if (row.original._isDayOfWeekRow) {
  rowBgClass = 'bg-purple-50';
} else if (row.original._isDailyMinRow) {
  rowBgClass = 'bg-pink-100'; // Pink background (#ead1dc equivalent)
} else if (row.original._isDailyMaxRow) {
  rowBgClass = 'bg-pink-50'; // Light pink (#f2e5eb equivalent)
} else if (row.original._isFilterRow) {
  rowBgClass = 'bg-yellow-50';
}
```

**Rationale**: Matches the color scheme from the original implementation

---

### Step 7: Add Toggle Control in ProjectListicalMenu
**File**: `src/components/planner/ProjectListicalMenu.jsx`

**Current State**: Already has `showMaxMinRows` toggle (lines 63 and 514-515)

**Changes**: The toggle already exists but may not be functional. Verify it works with the new implementation.

**In ProjectTimePlannerV2.jsx**:
```javascript
// The state already exists (line 63)
const [showMaxMinRows, setShowMaxMinRows] = useState(true);

// Update the useEffect to respect this setting
useEffect(() => {
  if (!showMaxMinRows) {
    // Remove daily min/max rows
    setData(prevData => {
      return prevData.filter(row => !row._isDailyMinRow && !row._isDailyMaxRow);
    });
    return;
  }

  // ... existing logic to add rows
}, [dailyMinValues, dailyMaxValues, totalDays, showMaxMinRows]);
```

---

### Step 8: Update TacticsPage to Use Custom Event
**File**: `src/pages/TacticsPage.jsx`

**Current**: Uses `saveTacticsMetrics()` at line 1504

**Change**: No change needed! Once we update `tacticsMetricsStorage.js` to dispatch custom events (Step 1), TacticsPage will automatically emit events when saving.

**Verify**: Check that TacticsPage is using the correct import and calling `saveTacticsMetrics()`

---

## Implementation Order

1. ✅ Add custom event to `tacticsMetricsStorage.js`
2. ✅ Create `useTacticsMetrics.js` hook
3. ✅ Create `dailyBoundsMapper.js` utility
4. ✅ Update `dataCreators.js` to support daily min/max rows
5. ✅ Update `ProjectTimePlannerV2.jsx` to load and display rows
6. ✅ Add styling in `TableRow.jsx`
7. ✅ Wire up `showMaxMinRows` toggle
8. ✅ Test with TacticsPage to verify sync

---

## Testing Checklist

- [ ] Open TacticsPage and verify dailyBounds are saved to localStorage
- [ ] Open ProjectTimePlannerV2 and verify daily min/max rows appear
- [ ] Verify row colors match (pink backgrounds)
- [ ] Verify values match day-of-week from TacticsPage
- [ ] Update TacticsPage metrics and verify ProjectTimePlannerV2 updates automatically
- [ ] Toggle "Show Max/Min Rows" in Listical menu and verify rows hide/show
- [ ] Verify rows appear in correct position (between day-of-week and filter)
- [ ] Verify row numbers don't apply to special rows
- [ ] Verify rows can't be edited or selected
- [ ] Test with no tactics data (should show 0.00 values)

---

## Edge Cases to Handle

1. **No Tactics Data**: If `loadTacticsMetrics()` returns null, show rows with all zeros
2. **Mismatched Days**: If dailyBounds has fewer than 7 days, use fallback zeros
3. **Invalid Values**: If dailyMaxHours or dailyMinHours is not a number, use 0.00
4. **Toggle Off**: When `showMaxMinRows` is false, remove rows cleanly
5. **Date Range Changes**: When startDate changes, recalculate bounds mapping
6. **Multi-tab Sync**: Verify native storage event handling for cross-tab updates

---

## Files to Create
1. `src/hooks/planner/useTacticsMetrics.js`
2. `src/utils/planner/dailyBoundsMapper.js`

## Files to Modify
1. `src/lib/tacticsMetricsStorage.js`
2. `src/utils/planner/dataCreators.js`
3. `src/pages/ProjectTimePlannerV2.jsx`
4. `src/components/planner/TableRow.jsx`

---

## Compatibility Notes

### TanStack Table Compatibility
- Special rows are regular data rows with flag properties
- No changes needed to column definitions
- Row virtualization handles special rows automatically

### Storage Architecture Compliance
- ✅ No direct localStorage access in components
- ✅ Uses hook abstraction (`useTacticsMetrics`)
- ✅ Uses storage utility functions (`loadTacticsMetrics`, `saveTacticsMetrics`)
- ✅ Custom events for reactive updates
- ✅ SSR-safe (all localStorage access guarded)

### Future Enhancements
- Add column totals that sum daily min/max for week view
- Add visual indicators when actual hours exceed max or fall below min
- Add ability to edit bounds directly in planner (saves back to Tactics)
- Add tooltips showing day-of-week bounds on hover
