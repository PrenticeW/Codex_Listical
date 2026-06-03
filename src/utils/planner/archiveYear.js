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
  getDraftYear,
  promoteDraftToActive,
  calculateNextCycleStartDate,
  readYearMetadata,
  saveYearMetadata,
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
import { clearForYear } from '../../lib/storageCache';

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

  // M2: holds the pre-mutation metadata snapshot for rollback on failure.
  // Stays null through the read-only validation phase so a validation throw
  // skips rollback (nothing to restore). Captured just before the first
  // mutation below.
  let metadataSnapshot = null;

  try {
    // 1. Verify year exists and is active
    const yearInfo = await getYearInfo(yearNumber);
    if (!yearInfo) {
      throw new Error(`Year ${yearNumber} does not exist`);
    }
    if (yearInfo.status !== 'active') {
      throw new Error(`Year ${yearNumber} is not active (status: ${yearInfo.status})`);
    }

    // 1b. If a draft year exists, archiving promotes it to active. Reject the
    //     operation when the draft has no projects shortlisted, so the user
    //     does not land on a fresh active year with an empty Goal page (M3).
    //     This mirrors the guard in validateYearReadyForArchive so a
    //     programmatic call cannot bypass the modal's disabled state.
    const draftYearForGuard = await getDraftYear();
    if (draftYearForGuard) {
      const { shortlist: draftShortlist } = await loadStagingState(draftYearForGuard.yearNumber);
      if (!Array.isArray(draftShortlist) || draftShortlist.length === 0) {
        throw new Error(
          `Year ${draftYearForGuard.yearNumber} has no projects on the Goal page yet. Add at least one project before archiving Year ${yearNumber}.`
        );
      }
    }

    // 2. Read all data from current year
    const [
      taskRows, startDate, columnSizing, sizeScale,
      showRecurring, showSubprojects, showMaxMinRows,
      sortStatuses, totalDays, stagingState, tacticsMetrics,
    ] = await Promise.all([
      readTaskRows(DEFAULT_PROJECT_ID, yearNumber),
      readStartDate(DEFAULT_PROJECT_ID, yearNumber),
      readColumnSizing(DEFAULT_PROJECT_ID, yearNumber),
      readSizeScale(DEFAULT_PROJECT_ID, yearNumber),
      readShowRecurring(DEFAULT_PROJECT_ID, yearNumber),
      readShowSubprojects(DEFAULT_PROJECT_ID, yearNumber),
      readShowMaxMinRows(DEFAULT_PROJECT_ID, yearNumber),
      readSortStatuses(DEFAULT_PROJECT_ID, yearNumber),
      readTotalDays(DEFAULT_PROJECT_ID, yearNumber),
      loadStagingState(yearNumber),
      loadTacticsMetrics(yearNumber),
    ]);
    const visibleDayColumns = await readVisibleDayColumns(DEFAULT_PROJECT_ID, totalDays, yearNumber);

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

    // 5. Capture the metadata blob before the first mutation, so any
    //    subsequent failure can roll Year N back to active and undo any
    //    partial draft promotion or new-year record (M2). Storage keys
    //    written by the no-draft branch's save* calls below may remain
    //    as orphans on failure but do not block a retry — a retry will
    //    overwrite them with the same values.
    const preMutationMeta = await readYearMetadata();
    metadataSnapshot = preMutationMeta
      ? JSON.parse(JSON.stringify(preMutationMeta))
      : null;

    // 6. Archive the year metadata (first mutation)
    await archiveYearMetadata(yearNumber, {
      totalWeeksCompleted: weeksCompleted,
      totalHoursCompleted: totalHours,
    });
    // The archived year's `years.status` flipped; clear any cached row for
    // that year so the next read returns the new state.
    clearForYear(yearNumber);
    console.log(`[Archive Year] Year ${yearNumber} metadata archived`);

    // 7. Determine next year: promote draft if one exists, otherwise create fresh
    const draftYear = await getDraftYear();
    let nextYearNumber;
    let nextStartDate;

    if (draftYear) {
      // Draft year already set up by "Plan Next Year" — just promote it
      nextYearNumber = draftYear.yearNumber;
      nextStartDate = draftYear.startDate;
      await promoteDraftToActive(nextYearNumber);
      // The promoted year's status flipped from 'draft' to 'active'; clear
      // any cached years-row for it so the next read sees the new status.
      clearForYear(nextYearNumber);
      console.log(`[Archive Year] Promoted draft Year ${nextYearNumber} to active`);
    } else {
      // Legacy path: no draft year, create fresh next year
      nextYearNumber = yearNumber + 1;
      nextStartDate = calculateNextCycleStartDate(startDate);

      await createNewYear(nextYearNumber, nextStartDate);
      console.log(`[Archive Year] Year ${nextYearNumber} created with start date: ${nextStartDate}`);

      // Copy settings. All planner writes are now async (Supabase port);
      // parallelise to keep the archive flow snappy and surface errors.
      const freshVisibleDayColumns = {};
      for (let i = 0; i < totalDays; i++) {
        freshVisibleDayColumns[`day-${i}`] = true;
      }
      const initialTaskRows = createInitialDataForNewYear(nextStartDate, recurringTasks, totalDays);
      const freshTacticsMetrics = getDefaultTacticsMetrics();

      await Promise.all([
        saveColumnSizing(columnSizing, DEFAULT_PROJECT_ID, nextYearNumber),
        saveSizeScale(sizeScale, DEFAULT_PROJECT_ID, nextYearNumber),
        saveShowRecurring(showRecurring, DEFAULT_PROJECT_ID, nextYearNumber),
        saveShowSubprojects(showSubprojects, DEFAULT_PROJECT_ID, nextYearNumber),
        saveShowMaxMinRows(showMaxMinRows, DEFAULT_PROJECT_ID, nextYearNumber),
        saveSortStatuses(sortStatuses, DEFAULT_PROJECT_ID, nextYearNumber),
        saveTotalDays(totalDays, DEFAULT_PROJECT_ID, nextYearNumber),
        saveVisibleDayColumns(freshVisibleDayColumns, DEFAULT_PROJECT_ID, nextYearNumber),
        saveStartDate(nextStartDate, DEFAULT_PROJECT_ID, nextYearNumber),
        saveTaskRows(initialTaskRows, DEFAULT_PROJECT_ID, nextYearNumber),
        saveStagingState({ shortlist: [], archived: [] }, nextYearNumber),
        saveTacticsMetrics(freshTacticsMetrics, nextYearNumber),
      ]);

      console.log(`[Archive Year] Year ${nextYearNumber} initialized`);
    }

    // 8. Switch to new year
    await setCurrentYear(nextYearNumber);
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

    // M2: restore the pre-mutation metadata so Year N is active again, any
    // draft promotion is undone, and the currentYear pointer is reset. The
    // user can then retry the archive. Wrapped separately so a rollback
    // failure does not mask the original error in logs or in the return.
    let rolledBack = false;
    if (metadataSnapshot) {
      try {
        await saveYearMetadata(metadataSnapshot);
        rolledBack = true;
        console.log(`[Archive Year] Metadata rolled back to pre-archive state`);
      } catch (rollbackError) {
        console.error('[Archive Year] Rollback failed:', rollbackError);
      }
    }

    return {
      success: false,
      error: error.message,
      archivedYear: yearNumber,
      rolledBack,
    };
  }
}

/**
 * Validate if a year is ready to be archived
 * @param {number} yearNumber - Year to validate
 * @returns {Promise<Object>} Validation result
 */
export async function validateYearReadyForArchive(yearNumber) {
  const yearInfo = await getYearInfo(yearNumber);

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

  // If a draft year exists, archiving will promote it to active. Reject when
  // the draft's Goal page has no projects shortlisted, otherwise the user
  // lands on a fresh active year with nothing planned (M3).
  const draftYear = await getDraftYear();
  if (draftYear) {
    const { shortlist } = await loadStagingState(draftYear.yearNumber);
    if (!Array.isArray(shortlist) || shortlist.length === 0) {
      return {
        ready: false,
        reason: `Year ${draftYear.yearNumber} has no projects on the Goal page yet. Add at least one project before archiving Year ${yearNumber}.`,
      };
    }
  }

  const taskRows = await readTaskRows(DEFAULT_PROJECT_ID, yearNumber);
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
