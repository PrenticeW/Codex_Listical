/**
 * Archive Year Operation
 *
 * Handles archiving a complete year (12-week cycle) and creating the next year.
 */

import {
  archiveYear as archiveYearMetadata,
  createNewYear,
  setCurrentYear,
  getYearInfo,
  calculateNextCycleStartDate,
} from '../../lib/yearMetadataStorage';
import {
  readTaskRows,
  saveTaskRows,
  readStartDate,
  saveStartDate,
  readColumnSizing,
  saveColumnSizing,
  readSizeScale,
  saveSizeScale,
  readShowRecurring,
  saveShowRecurring,
  readShowSubprojects,
  saveShowSubprojects,
  readShowMaxMinRows,
  saveShowMaxMinRows,
  readSortStatuses,
  saveSortStatuses,
  readTotalDays,
  saveTotalDays,
  readVisibleDayColumns,
  saveVisibleDayColumns,
} from './storage';
import {
  loadStagingState,
  saveStagingState,
} from '../../lib/stagingStorage';
import {
  loadTacticsMetrics,
  saveTacticsMetrics,
} from '../../lib/tacticsMetricsStorage';
import { isProjectTask } from './rowTypeChecks';

const DEFAULT_PROJECT_ID = 'project-1';

/**
 * Extract recurring tasks from task rows
 * @param {Array} taskRows - All task rows
 * @returns {Array} Recurring tasks only
 */
function extractRecurringTasks(taskRows) {
  return taskRows.filter(row => {
    return isProjectTask(row) && row.recurring === 'Recurring';
  });
}

/**
 * Reset a recurring task for the new year
 * Clears all day allocations and resets status to "Not Scheduled"
 * @param {Object} task - Recurring task to reset
 * @returns {Object} Reset task
 */
function resetRecurringTask(task) {
  const resetTask = { ...task };

  // Reset status
  resetTask.status = 'Not Scheduled';

  // Clear all day allocations (day-0 through day-N)
  Object.keys(resetTask).forEach(key => {
    if (key.startsWith('day-')) {
      resetTask[key] = '';
    }
  });

  return resetTask;
}

/**
 * Calculate total hours completed in a year
 * @param {Array} taskRows - All task rows
 * @returns {number} Total hours as decimal
 */
function calculateTotalHours(taskRows) {
  let totalHours = 0;

  taskRows.forEach(row => {
    if (!isProjectTask(row)) return;

    // Sum all day-N entries
    Object.keys(row).forEach(key => {
      if (key.startsWith('day-')) {
        const value = row[key];
        if (value && typeof value === 'string') {
          // Parse hours.minutes format (e.g., "2.30" = 2 hours 30 minutes)
          const parts = value.split('.');
          const hours = parseInt(parts[0], 10) || 0;
          const minutes = parseInt(parts[1], 10) || 0;
          totalHours += hours + (minutes / 60);
        }
      }
    });
  });

  return parseFloat(totalHours.toFixed(2));
}

/**
 * Calculate total weeks completed
 * Assumes 12 weeks for a complete year
 * @param {Array} taskRows - All task rows
 * @returns {number} Number of weeks (0-12)
 */
function calculateWeeksCompleted(taskRows) {
  // Check if there are any archive rows
  const archiveRows = taskRows.filter(row => row._rowType === 'archiveRow');

  // Each archive row represents one week
  const weeksArchived = archiveRows.length;

  // Maximum 12 weeks per year
  return Math.min(weeksArchived, 12);
}

/**
 * Create initial data structure for new year
 * @param {string} startDate - Start date (YYYY-MM-DD)
 * @param {Array} recurringTasks - Recurring tasks to carry forward
 * @param {number} totalDays - Timeline length (default: 84)
 * @returns {Array} Initial task rows for new year
 */
function createInitialDataForNewYear(startDate, recurringTasks, totalDays = 84) {
  // Import the createInitialData function
  // This creates the timeline rows (month, week, day, day-of-week)
  // We'll need to handle this carefully

  // For now, return just the recurring tasks
  // The actual timeline rows will be created when the planner loads
  const resetTasks = recurringTasks.map(task => resetRecurringTask(task));

  return resetTasks;
}

/**
 * Get default tactics metrics structure
 * @returns {Object} Default metrics
 */
function getDefaultTacticsMetrics() {
  const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  return {
    dailyBounds: daysOfWeek.map(day => ({
      day,
      dailyMinHours: 0,
      dailyMaxHours: 12,
    })),
  };
}

/**
 * Archive a year and create the next year
 * @param {number} yearNumber - Year number to archive
 * @returns {Promise<Object>} Result of the operation
 */
export async function performYearArchive(yearNumber) {
  console.log(`[Archive Year] Starting archive of Year ${yearNumber}...`);

  try {
    // 1. Verify year exists and is active
    const yearInfo = getYearInfo(yearNumber);
    if (!yearInfo) {
      throw new Error(`Year ${yearNumber} does not exist`);
    }
    if (yearInfo.status !== 'active') {
      throw new Error(`Year ${yearNumber} is not active (status: ${yearInfo.status})`);
    }

    // 2. Read all data from current year
    const taskRows = readTaskRows(DEFAULT_PROJECT_ID, yearNumber);
    const startDate = readStartDate(DEFAULT_PROJECT_ID, yearNumber);
    const columnSizing = readColumnSizing(DEFAULT_PROJECT_ID, yearNumber);
    const sizeScale = readSizeScale(DEFAULT_PROJECT_ID, yearNumber);
    const showRecurring = readShowRecurring(DEFAULT_PROJECT_ID, yearNumber);
    const showSubprojects = readShowSubprojects(DEFAULT_PROJECT_ID, yearNumber);
    const showMaxMinRows = readShowMaxMinRows(DEFAULT_PROJECT_ID, yearNumber);
    const sortStatuses = readSortStatuses(DEFAULT_PROJECT_ID, yearNumber);
    const totalDays = readTotalDays(DEFAULT_PROJECT_ID, yearNumber);
    const visibleDayColumns = readVisibleDayColumns(DEFAULT_PROJECT_ID, totalDays, yearNumber);
    const stagingState = loadStagingState(yearNumber);
    const tacticsMetrics = loadTacticsMetrics(yearNumber);

    console.log(`[Archive Year] Data loaded from Year ${yearNumber}`);

    // 3. Calculate statistics
    const totalHours = calculateTotalHours(taskRows);
    const weeksCompleted = calculateWeeksCompleted(taskRows);

    console.log(`[Archive Year] Year ${yearNumber} stats:`, {
      totalHours,
      weeksCompleted,
      taskCount: taskRows.length,
    });

    // 4. Extract recurring tasks
    const recurringTasks = extractRecurringTasks(taskRows);
    console.log(`[Archive Year] Found ${recurringTasks.length} recurring tasks to carry forward`);

    // 5. Archive the year metadata
    archiveYearMetadata(yearNumber, {
      totalWeeksCompleted: weeksCompleted,
      totalHoursCompleted: totalHours,
    });
    console.log(`[Archive Year] Year ${yearNumber} metadata archived`);

    // 6. Create next year
    const nextYearNumber = yearNumber + 1;
    const nextStartDate = calculateNextCycleStartDate(startDate);

    createNewYear(nextYearNumber, nextStartDate);
    console.log(`[Archive Year] Year ${nextYearNumber} created with start date: ${nextStartDate}`);

    // 7. Initialize Year 2 data

    // Copy some settings that should persist
    saveColumnSizing(columnSizing, DEFAULT_PROJECT_ID, nextYearNumber);
    saveSizeScale(sizeScale, DEFAULT_PROJECT_ID, nextYearNumber);
    saveShowRecurring(showRecurring, DEFAULT_PROJECT_ID, nextYearNumber);
    saveShowSubprojects(showSubprojects, DEFAULT_PROJECT_ID, nextYearNumber);
    saveShowMaxMinRows(showMaxMinRows, DEFAULT_PROJECT_ID, nextYearNumber);
    saveSortStatuses(sortStatuses, DEFAULT_PROJECT_ID, nextYearNumber);
    saveTotalDays(totalDays, DEFAULT_PROJECT_ID, nextYearNumber);

    // Initialize visible day columns (all visible)
    const freshVisibleDayColumns = {};
    for (let i = 0; i < totalDays; i++) {
      freshVisibleDayColumns[`day-${i}`] = true;
    }
    saveVisibleDayColumns(freshVisibleDayColumns, DEFAULT_PROJECT_ID, nextYearNumber);

    saveStartDate(nextStartDate, DEFAULT_PROJECT_ID, nextYearNumber);

    // Save recurring tasks (will be integrated with timeline when planner loads)
    const initialTaskRows = createInitialDataForNewYear(nextStartDate, recurringTasks, totalDays);
    saveTaskRows(initialTaskRows, DEFAULT_PROJECT_ID, nextYearNumber);

    console.log(`[Archive Year] Year ${nextYearNumber} planner data initialized`);

    // Fresh staging data (empty shortlist)
    saveStagingState({ shortlist: [], archived: [] }, nextYearNumber);
    console.log(`[Archive Year] Year ${nextYearNumber} staging data initialized`);

    // Fresh tactics data (default metrics)
    const freshTacticsMetrics = getDefaultTacticsMetrics();
    saveTacticsMetrics(freshTacticsMetrics, nextYearNumber);
    console.log(`[Archive Year] Year ${nextYearNumber} tactics data initialized`);

    // 8. Switch to new year
    setCurrentYear(nextYearNumber);
    console.log(`[Archive Year] Switched to Year ${nextYearNumber} as active year`);

    console.log(`[Archive Year] Archive complete!`);

    return {
      success: true,
      archivedYear: yearNumber,
      newYear: nextYearNumber,
      stats: {
        totalHours,
        weeksCompleted,
        recurringTasksCarriedForward: recurringTasks.length,
      },
      nextStartDate,
    };

  } catch (error) {
    console.error(`[Archive Year] Failed to archive Year ${yearNumber}:`, error);
    return {
      success: false,
      error: error.message,
      archivedYear: yearNumber,
    };
  }
}

/**
 * Validate if a year is ready to be archived
 * @param {number} yearNumber - Year to validate
 * @returns {Object} Validation result
 */
export function validateYearReadyForArchive(yearNumber) {
  const yearInfo = getYearInfo(yearNumber);

  if (!yearInfo) {
    return {
      ready: false,
      reason: `Year ${yearNumber} does not exist`,
    };
  }

  if (yearInfo.status !== 'active') {
    return {
      ready: false,
      reason: `Year ${yearNumber} is not active (already archived)`,
    };
  }

  const taskRows = readTaskRows(DEFAULT_PROJECT_ID, yearNumber);
  const weeksCompleted = calculateWeeksCompleted(taskRows);

  // Optional: Check if user has completed at least some weeks
  // You can adjust this threshold as needed
  if (weeksCompleted === 0) {
    return {
      ready: true, // Still allow archiving even with 0 weeks
      warning: 'No weeks have been archived yet. Are you sure you want to archive this year?',
      weeksCompleted,
    };
  }

  return {
    ready: true,
    weeksCompleted,
    totalHours: calculateTotalHours(taskRows),
  };
}
