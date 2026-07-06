/**
 * Data Creation Utilities
 * Functions for creating initial planner data structures
 */

/**
 * Creates initial data for the planner table
 * @param {number} rowCount - Number of regular data rows to create
 * @param {number} totalDays - Number of day columns (default 84 for 12 weeks)
 * @param {string} startDate - Start date in YYYY-MM-DD format
 * @returns {Array} Array of row objects
 */
export const createInitialData = (rowCount = 100, totalDays = 84, startDate) => {
  const rows = [];

  // Calculate dates array
  const start = new Date(startDate);
  const dates = Array.from({ length: totalDays }, (_, i) => {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    return date;
  });

  // Row 1: Month row - store month spans info
  const monthRow = {
    id: 'month-row',
    checkbox: '',
    project: '',
    subproject: '',
    status: '',
    task: '',
    recurring: '',
    estimate: '',
    timeValue: '',
    _isMonthRow: true, // Flag to identify this as a month row
    _monthSpans: [], // Will store [{startDay, span, label}]
  };

  // Calculate month spans
  let currentMonth = null;
  let currentSpan = 0;
  let spanStartDay = 0;

  dates.forEach((date, i) => {
    const monthLabel = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    if (monthLabel !== currentMonth) {
      if (currentMonth !== null) {
        monthRow._monthSpans.push({ startDay: spanStartDay, span: currentSpan, label: currentMonth.split(' ')[0].toUpperCase() });
      }
      currentMonth = monthLabel;
      currentSpan = 1;
      spanStartDay = i;
    } else {
      currentSpan++;
    }

    // Push final span
    if (i === dates.length - 1) {
      monthRow._monthSpans.push({ startDay: spanStartDay, span: currentSpan, label: monthLabel.split(' ')[0].toUpperCase() });
    }

    // Still set individual values for fallback
    monthRow[`day-${i}`] = monthLabel.split(' ')[0].toUpperCase();
  });
  rows.push(monthRow);

  // Row 2: Week row - store week spans info
  const weekRow = {
    id: 'week-row',
    checkbox: '',
    project: '',
    subproject: '',
    status: '',
    task: '',
    recurring: '',
    estimate: '',
    timeValue: '',
    _isWeekRow: true, // Flag to identify this as a week row
    _weekSpans: [], // Will store [{startDay, span, label}]
  };

  // Calculate week spans
  let currentWeek = null;
  currentSpan = 0;
  spanStartDay = 0;

  dates.forEach((_, i) => {
    const weekNumber = Math.floor(i / 7) + 1;

    if (weekNumber !== currentWeek) {
      if (currentWeek !== null) {
        weekRow._weekSpans.push({ startDay: spanStartDay, span: currentSpan, weekNumber: currentWeek, label: `Week ${currentWeek}` });
      }
      currentWeek = weekNumber;
      currentSpan = 1;
      spanStartDay = i;
    } else {
      currentSpan++;
    }

    // Push final span
    if (i === dates.length - 1) {
      weekRow._weekSpans.push({ startDay: spanStartDay, span: currentSpan, weekNumber, label: `Week ${weekNumber}` });
    }

    // Still set individual values for fallback
    weekRow[`day-${i}`] = `Week ${weekNumber}`;
  });
  rows.push(weekRow);

  // Row 3: Day number row
  const dayRow = {
    id: 'day-row',
    checkbox: '',
    project: '',
    subproject: '',
    status: '',
    task: '',
    recurring: '',
    estimate: '',
    timeValue: '',
    _isDayRow: true, // Flag to identify this as a day row
  };
  dates.forEach((date, i) => {
    const day = date.getDate().toString().padStart(2, '0');
    const month = date.toLocaleDateString('en-US', { month: 'short' });
    dayRow[`day-${i}`] = `${day}-${month}`;
  });
  rows.push(dayRow);

  // Row 4: Day of week row
  const dayOfWeekRow = {
    id: 'dayofweek-row',
    checkbox: '',
    project: '',
    subproject: '',
    status: '',
    task: '',
    recurring: '',
    estimate: '',
    timeValue: '',
    _isDayOfWeekRow: true, // Flag to identify this as a day of week row
  };
  dates.forEach((date, i) => {
    const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
    // Convert to single letter: Mon->M, Tue->T, Wed->W, Thu->T, Fri->F, Sat->S, Sun->S
    dayOfWeekRow[`day-${i}`] = dayName.charAt(0);
  });
  rows.push(dayOfWeekRow);

  // Row 5: Daily min row
  const dailyMinRow = {
    id: 'daily-min-row',
    checkbox: '',
    project: '',
    subproject: '',
    status: '',
    task: '',
    recurring: '',
    estimate: '',
    timeValue: '',
    _isDailyMinRow: true, // Flag to identify this as a daily min row
  };
  dates.forEach((date, i) => {
    // Placeholder - will be populated from dailyBoundsMap
    dailyMinRow[`day-${i}`] = '';
  });
  rows.push(dailyMinRow);

  // Row 6: Daily max row
  const dailyMaxRow = {
    id: 'daily-max-row',
    checkbox: '',
    project: '',
    subproject: '',
    status: '',
    task: '',
    recurring: '',
    estimate: '',
    timeValue: '',
    _isDailyMaxRow: true, // Flag to identify this as a daily max row
  };
  dates.forEach((date, i) => {
    // Placeholder - will be populated from dailyBoundsMap
    dailyMaxRow[`day-${i}`] = '';
  });
  rows.push(dailyMaxRow);

  // Row 7: Daily total row (day columns only — daily total values + filter icons)
  const dailyTotalRow = {
    id: 'daily-total-row',
    checkbox: '',
    project: '',
    subproject: '',
    status: '',
    task: '',
    recurring: '',
    estimate: '',
    timeValue: '',
    _isDailyTotalRow: true, // Flag to identify this as the daily-total row
  };
  dates.forEach((date, i) => {
    dailyTotalRow[`day-${i}`] = '0.00'; // Default value for calendar area filters
  });
  rows.push(dailyTotalRow);

  // Row 8: Filter row (fixed columns only — Project/Subproject/.../Time Value labels + filter icons)
  const filterRow = {
    id: 'filter-row',
    checkbox: '', // Column A - no filter needed
    project: '',
    subproject: '',
    status: '',
    task: '', // Column E - no filter needed
    recurring: '',
    estimate: '',
    timeValue: '', // Column H - no filter needed
    _isFilterRow: true, // Flag to identify this as a filter row
  };
  rows.push(filterRow);

  // Regular data rows (starting from row 9)
  for (let rowIndex = 0; rowIndex < rowCount; rowIndex++) {
    const row = {
      id: crypto.randomUUID(),
      checkbox: '',
      project: '',
      subproject: '',
      status: '-', // Default status dropdown value
      task: '',
      recurring: '',
      estimate: '',
      timeValue: '0.00',
    };

    // Add day entry columns (84 days)
    for (let dayIndex = 0; dayIndex < totalDays; dayIndex++) {
      row[`day-${dayIndex}`] = '';
    }

    rows.push(row);
  }

  return rows;
};

/**
 * Backfills a missing Daily Total row into previously-saved planner data.
 *
 * The Daily Total row (`_isDailyTotalRow`) was added to `createInitialData`
 * after some accounts' planner data had already been created and persisted,
 * so their saved `data` array never got one. Every piece of code that reads
 * this row (the Daily Total effect in ProjectTimePlannerV2.jsx, the "8 pinned
 * rows" slice in PlannerTable.jsx, the merged-fixed-cols rendering in
 * TableRow.jsx) assumes it exists and is positioned right before the filter
 * row. When it's missing, PlannerTable's hardcoded `rows.slice(0, 8)` for the
 * sticky header ends up one row short and pins the first real data row
 * instead -- which reads as "the filter row is broken / cut off".
 *
 * Call this once when hydrating loaded/persisted rows. It's a no-op if the
 * row already exists. The newly-inserted row's day-* values are placeholder
 * zeros; the existing Daily Total recompute effect fills in real totals on
 * the next data pass, and the normal debounced save persists the row going
 * forward so this only needs to run once per account.
 */
export const ensureDailyTotalRow = (rows) => {
  if (!Array.isArray(rows) || rows.some(row => row._isDailyTotalRow)) {
    return rows;
  }

  // Need a sibling pinned row to know which day-* columns exist -- Daily Max
  // is the row immediately above where Daily Total belongs.
  const referenceRow = rows.find(row => row._isDailyMaxRow) || rows.find(row => row._isDailyMinRow);
  if (!referenceRow) return rows;

  const dailyTotalRow = {
    id: 'daily-total-row',
    checkbox: '',
    project: '',
    subproject: '',
    status: '',
    task: '',
    recurring: '',
    estimate: '',
    timeValue: '',
    _isDailyTotalRow: true,
  };
  Object.keys(referenceRow).forEach(key => {
    if (key.startsWith('day-')) dailyTotalRow[key] = '0.00';
  });

  const filterRowIndex = rows.findIndex(row => row._isFilterRow);
  const insertIndex = filterRowIndex !== -1 ? filterRowIndex : rows.length;

  const next = [...rows];
  next.splice(insertIndex, 0, dailyTotalRow);
  return next;
};
