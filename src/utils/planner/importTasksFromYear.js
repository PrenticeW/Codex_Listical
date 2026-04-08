/**
 * Import Tasks From Year
 *
 * Filters task rows from a source year and prepares them for import
 * into the draft year's System page.
 *
 * Rules:
 * - Only projectTask rows are imported (no structure, timeline, or archive rows)
 * - Only tasks whose status matches the selected set are included
 * - Only tasks belonging to projects that exist in the draft year's Goal page are included
 * - All day allocations are cleared (tasks arrive as "not yet scheduled" in the new year)
 * - Status is reset to "Not Scheduled"
 */

import { isProjectTask } from './rowTypeChecks';

export const IMPORTABLE_STATUSES = ['Scheduled', 'Not Scheduled', 'Blocked', 'On Hold'];
export const DEFAULT_IMPORT_STATUSES = new Set(['Scheduled', 'Not Scheduled', 'Blocked', 'On Hold']);

/**
 * Reset a task for the new year: clear day allocations and reset status.
 * @param {Object} task
 * @returns {Object}
 */
function resetTaskForNewYear(task) {
  const reset = { ...task, status: 'Not Scheduled' };
  Object.keys(reset).forEach((key) => {
    if (key.startsWith('day-')) {
      reset[key] = '';
    }
  });
  return reset;
}

/**
 * Import tasks from a source year into a draft year.
 *
 * @param {Object[]} sourceRows - Task rows from the active year
 * @param {string[]} draftProjectNicknames - projectNickname values that exist in the draft year
 * @param {Set<string>} selectedStatuses - Statuses to include
 * @returns {Object[]} Filtered, reset task rows ready to save into the draft year
 */
export function importTasksFromYear(sourceRows, draftProjectNicknames, selectedStatuses) {
  const nicknameSet = new Set(draftProjectNicknames);

  return sourceRows
    .filter((row) => {
      if (!isProjectTask(row)) return false;
      if (!selectedStatuses.has(row.status)) return false;
      if (!nicknameSet.has(row.projectNickname)) return false;
      return true;
    })
    .map(resetTaskForNewYear);
}
