/**
 * Undo Draft Year
 *
 * Deletes all data for the draft year and removes it from metadata,
 * then switches the UI back to the active year.
 *
 * DEV ONLY — remove the trigger before launch.
 */

import storage from '../../lib/storageService';
import {
  getDraftYear,
  getActiveYear,
  deleteDraftYearRecord,
  setCurrentYear,
} from '../../lib/yearMetadataStorage';

const DEFAULT_PROJECT_ID = 'project-1';

/**
 * All storage key patterns that a draft year may have written.
 * We delete them by reconstructing the keys for the given year number.
 */
function getDraftYearStorageKeys(yearNumber) {
  const pid = DEFAULT_PROJECT_ID;
  return [
    // Planner storage (storage.js key builder inserts year before last segment)
    `planner-v2-${pid}-year-${yearNumber}-column-sizing`,
    `planner-v2-${pid}-year-${yearNumber}-size-scale`,
    `planner-v2-${pid}-year-${yearNumber}-start-date`,
    `planner-v2-${pid}-year-${yearNumber}-show-recurring`,
    `planner-v2-${pid}-year-${yearNumber}-show-subprojects`,
    `planner-v2-${pid}-year-${yearNumber}-show-max-min-rows`,
    `planner-v2-${pid}-year-${yearNumber}-sort-statuses`,
    `planner-v2-${pid}-year-${yearNumber}-sort-planner-statuses`,
    `planner-v2-${pid}-year-${yearNumber}-task-rows`,
    `planner-v2-${pid}-year-${yearNumber}-total-days`,
    `planner-v2-${pid}-year-${yearNumber}-visible-day-columns`,
    `planner-v2-${pid}-year-${yearNumber}-collapsed-groups`,
    // Staging (Goal page)
    `staging-year-${yearNumber}-shortlist`,
    // Tactics (Plan page)
    `tactics-year-${yearNumber}-chips-state`,
    `tactics-column-widths-${yearNumber}`,
    // Tactics metrics
    `tactics-metrics-year-${yearNumber}`,
  ];
}

/**
 * Remove a draft year and all its storage data.
 * Switches the UI back to the active year.
 *
 * @returns {{ success: boolean, error?: string }}
 */
export function undoDraftYear() {
  try {
    const draft = getDraftYear();
    if (!draft) {
      return { success: false, error: 'No draft year found' };
    }

    const active = getActiveYear();
    if (!active) {
      return { success: false, error: 'No active year found — cannot switch back' };
    }

    // Delete all draft year storage keys
    const keys = getDraftYearStorageKeys(draft.yearNumber);
    keys.forEach((key) => {
      try {
        storage.removeItem(key);
      } catch {
        // Best effort — continue deleting remaining keys
      }
    });

    // Remove draft year from metadata
    deleteDraftYearRecord(draft.yearNumber);

    // Switch back to active year
    setCurrentYear(active.yearNumber);

    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}
