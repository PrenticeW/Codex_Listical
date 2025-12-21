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
    project: '',
    status: '',
    task: '',
    estimate: '',
    timeValue: '',
    col_f: '',
    col_g: '',
    col_h: '',
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
    project: '',
    status: '',
    task: '',
    estimate: '',
    timeValue: '',
    col_f: '',
    col_g: '',
    col_h: '',
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
        weekRow._weekSpans.push({ startDay: spanStartDay, span: currentSpan, label: `Week ${currentWeek}` });
      }
      currentWeek = weekNumber;
      currentSpan = 1;
      spanStartDay = i;
    } else {
      currentSpan++;
    }

    // Push final span
    if (i === dates.length - 1) {
      weekRow._weekSpans.push({ startDay: spanStartDay, span: currentSpan, label: `Week ${weekNumber}` });
    }

    // Still set individual values for fallback
    weekRow[`day-${i}`] = `Week ${weekNumber}`;
  });
  rows.push(weekRow);

  // Row 3: Day number row
  const dayRow = {
    id: 'day-row',
    project: '',
    status: '',
    task: '',
    estimate: '',
    timeValue: '',
    col_f: '',
    col_g: '',
    col_h: '',
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
    project: '',
    status: '',
    task: '',
    estimate: '',
    timeValue: '',
    col_f: '',
    col_g: '',
    col_h: '',
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
    project: '',
    status: '',
    task: '',
    estimate: '',
    timeValue: '',
    col_f: '',
    col_g: '',
    col_h: '',
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
    project: '',
    status: '',
    task: '',
    estimate: '',
    timeValue: '',
    col_f: '',
    col_g: '',
    col_h: '',
    _isDailyMaxRow: true, // Flag to identify this as a daily max row
  };
  dates.forEach((date, i) => {
    // Placeholder - will be populated from dailyBoundsMap
    dailyMaxRow[`day-${i}`] = '';
  });
  rows.push(dailyMaxRow);

  // Row 7: Filter row
  const filterRow = {
    id: 'filter-row',
    project: '', // Column A - no filter needed
    status: '',
    task: '',
    estimate: '', // Column E - no filter needed
    timeValue: '', // Column F - no filter needed
    col_f: '',
    col_g: '',
    col_h: '', // Column H - no filter needed
    _isFilterRow: true, // Flag to identify this as a filter row
  };
  dates.forEach((date, i) => {
    filterRow[`day-${i}`] = '0.00'; // Default value for calendar area filters
  });
  rows.push(filterRow);

  // Regular data rows (starting from row 8)
  // Create just a few task rows for testing, leave rest as placeholder
  for (let rowIndex = 0; rowIndex < rowCount; rowIndex++) {
    const row = {
      id: `row-${rowIndex}`,
      type: rowIndex < 5 ? 'task' : undefined, // Only first 5 rows are tasks for now
      project: '',
      status: rowIndex < 5 ? '-' : '', // Task rows get default status
      task: '',
      estimate: rowIndex < 5 ? '-' : '', // Task rows get default estimate
      timeValue: rowIndex < 5 ? '0.00' : '', // Task rows get default time value
      col_f: '',
      col_g: '',
      col_h: '',
    };

    // Add day entry columns (84 days)
    for (let dayIndex = 0; dayIndex < totalDays; dayIndex++) {
      row[`day-${dayIndex}`] = '';
    }

    rows.push(row);
  }

  return rows;
};
