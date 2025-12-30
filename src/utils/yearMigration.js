/**
 * Year Migration Utility
 *
 * Migrates existing (non-year-based) data to the new year-based system.
 * This is a one-time migration that runs automatically on first load.
 */

import {
  readYearMetadata,
  initializeYearMetadata,
} from '../lib/yearMetadataStorage';
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
} from './planner/storage';
import {
  loadStagingState,
  saveStagingState,
} from '../lib/stagingStorage';
import {
  loadTacticsMetrics,
  saveTacticsMetrics,
} from '../lib/tacticsMetricsStorage';

const DEFAULT_PROJECT_ID = 'project-1';

/**
 * Check if migration is needed
 * @returns {boolean} True if migration needs to run
 */
export function needsMigration() {
  const metadata = readYearMetadata();
  return metadata === null;
}

/**
 * Migrate all existing data to Year 1
 * This copies data from non-year-based keys to year-1-based keys
 */
export function migrateToYearSystem() {
  console.log('[Year Migration] Starting migration to year-based system...');

  try {
    // 1. Read all existing data (using null yearNumber = legacy keys)
    const existingTaskRows = readTaskRows(DEFAULT_PROJECT_ID, null);
    const existingStartDate = readStartDate(DEFAULT_PROJECT_ID, null);
    const existingColumnSizing = readColumnSizing(DEFAULT_PROJECT_ID, null);
    const existingSizeScale = readSizeScale(DEFAULT_PROJECT_ID, null);
    const existingShowRecurring = readShowRecurring(DEFAULT_PROJECT_ID, null);
    const existingShowSubprojects = readShowSubprojects(DEFAULT_PROJECT_ID, null);
    const existingShowMaxMinRows = readShowMaxMinRows(DEFAULT_PROJECT_ID, null);
    const existingSortStatuses = readSortStatuses(DEFAULT_PROJECT_ID, null);
    const existingTotalDays = readTotalDays(DEFAULT_PROJECT_ID, null);
    const existingVisibleDayColumns = readVisibleDayColumns(DEFAULT_PROJECT_ID, existingTotalDays, null);
    const existingStagingState = loadStagingState(null);
    const existingTacticsMetrics = loadTacticsMetrics(null);

    console.log('[Year Migration] Existing data loaded:', {
      taskRowsCount: existingTaskRows.length,
      startDate: existingStartDate,
      stagingShortlistCount: existingStagingState.shortlist.length,
      stagingArchivedCount: existingStagingState.archived.length,
      hasTacticsMetrics: existingTacticsMetrics !== null,
    });

    // 2. Create Year 1 metadata
    const metadata = initializeYearMetadata(existingStartDate);
    console.log('[Year Migration] Year 1 metadata created');

    // 3. Write all data to Year 1 keys
    if (existingTaskRows.length > 0) {
      saveTaskRows(existingTaskRows, DEFAULT_PROJECT_ID, 1);
      console.log('[Year Migration] Task rows migrated to Year 1');
    }

    saveStartDate(existingStartDate, DEFAULT_PROJECT_ID, 1);

    if (Object.keys(existingColumnSizing).length > 0) {
      saveColumnSizing(existingColumnSizing, DEFAULT_PROJECT_ID, 1);
    }

    saveSizeScale(existingSizeScale, DEFAULT_PROJECT_ID, 1);
    saveShowRecurring(existingShowRecurring, DEFAULT_PROJECT_ID, 1);
    saveShowSubprojects(existingShowSubprojects, DEFAULT_PROJECT_ID, 1);
    saveShowMaxMinRows(existingShowMaxMinRows, DEFAULT_PROJECT_ID, 1);
    saveSortStatuses(existingSortStatuses, DEFAULT_PROJECT_ID, 1);
    saveTotalDays(existingTotalDays, DEFAULT_PROJECT_ID, 1);
    saveVisibleDayColumns(existingVisibleDayColumns, DEFAULT_PROJECT_ID, 1);

    console.log('[Year Migration] Planner settings migrated to Year 1');

    // Migrate staging data
    if (existingStagingState.shortlist.length > 0 || existingStagingState.archived.length > 0) {
      saveStagingState(existingStagingState, 1);
      console.log('[Year Migration] Staging data migrated to Year 1');
    }

    // Migrate tactics data
    if (existingTacticsMetrics) {
      saveTacticsMetrics(existingTacticsMetrics, 1);
      console.log('[Year Migration] Tactics metrics migrated to Year 1');
    }

    console.log('[Year Migration] Migration complete!');
    console.log('[Year Migration] Year 1 is now the active year');

    return {
      success: true,
      metadata,
      migratedData: {
        taskRows: existingTaskRows.length,
        stagingItems: existingStagingState.shortlist.length + existingStagingState.archived.length,
        hasTacticsData: existingTacticsMetrics !== null,
      }
    };
  } catch (error) {
    console.error('[Year Migration] Migration failed:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Optional: Clean up old keys after successful migration
 * WARNING: This is irreversible! Only use after confirming migration succeeded.
 */
export function cleanupLegacyKeys() {
  if (typeof window === 'undefined' || !window.localStorage) return;

  const legacyKeys = [
    'planner-v2-project-1-task-rows',
    'planner-v2-project-1-start-date',
    'planner-v2-project-1-column-sizing',
    'planner-v2-project-1-size-scale',
    'planner-v2-project-1-show-recurring',
    'planner-v2-project-1-show-subprojects',
    'planner-v2-project-1-show-max-min-rows',
    'planner-v2-project-1-sort-statuses',
    'planner-v2-project-1-total-days',
    'planner-v2-project-1-visible-day-columns',
    'staging-shortlist',
    'tactics-metrics-state',
    'listical-settings', // Very old legacy key
    'listical-task-rows', // Very old legacy key
  ];

  let cleanedCount = 0;
  legacyKeys.forEach(key => {
    if (window.localStorage.getItem(key) !== null) {
      window.localStorage.removeItem(key);
      cleanedCount++;
    }
  });

  console.log(`[Year Migration] Cleaned up ${cleanedCount} legacy keys`);
  return cleanedCount;
}

/**
 * Get migration status
 * @returns {Object} Migration status info
 */
export function getMigrationStatus() {
  const metadata = readYearMetadata();
  const hasMigrated = metadata !== null;

  return {
    hasMigrated,
    currentYear: metadata?.currentYear || null,
    yearCount: metadata?.years.length || 0,
    activeYear: metadata?.years.find(y => y.status === 'active') || null,
  };
}
