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
import { getProjectKey } from './storage';
import {
  COLUMN_SIZING_KEY_TEMPLATE,
  SIZE_SCALE_KEY_TEMPLATE,
  START_DATE_KEY_TEMPLATE,
  SHOW_RECURRING_KEY_TEMPLATE,
  SHOW_SUBPROJECTS_KEY_TEMPLATE,
  SHOW_MAX_MIN_ROWS_KEY_TEMPLATE,
  SORT_STATUSES_KEY_TEMPLATE,
  SORT_PLANNER_STATUSES_KEY_TEMPLATE,
  TASK_ROWS_KEY_TEMPLATE,
  TOTAL_DAYS_KEY_TEMPLATE,
  VISIBLE_DAY_COLUMNS_KEY_TEMPLATE,
  COLLAPSED_GROUPS_KEY_TEMPLATE,
  DEFAULT_PROJECT_ID,
} from '../../constants/plannerStorageKeys';

/**
 * All storage keys that a draft year may have written.
 * Planner keys are derived via getProjectKey (same builder used to write them)
 * so this list stays correct if key templates ever change.
 */
function getDraftYearStorageKeys(yearNumber) {
  const pid = DEFAULT_PROJECT_ID;
  const pk = (template) => getProjectKey(template, pid, yearNumber);
  return [
    // Planner storage — derived via the same key builder used to write them
    pk(COLUMN_SIZING_KEY_TEMPLATE),
    pk(SIZE_SCALE_KEY_TEMPLATE),
    pk(START_DATE_KEY_TEMPLATE),
    pk(SHOW_RECURRING_KEY_TEMPLATE),
    pk(SHOW_SUBPROJECTS_KEY_TEMPLATE),
    pk(SHOW_MAX_MIN_ROWS_KEY_TEMPLATE),
    pk(SORT_STATUSES_KEY_TEMPLATE),
    pk(SORT_PLANNER_STATUSES_KEY_TEMPLATE),
    pk(TASK_ROWS_KEY_TEMPLATE),
    pk(TOTAL_DAYS_KEY_TEMPLATE),
    pk(VISIBLE_DAY_COLUMNS_KEY_TEMPLATE),
    pk(COLLAPSED_GROUPS_KEY_TEMPLATE),
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
