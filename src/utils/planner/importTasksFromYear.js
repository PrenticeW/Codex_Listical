/**
 * Import Tasks From Year
 *
 * Prepares task rows from the active year for import into a draft year.
 *
 * Rules:
 * - Done and Abandoned tasks are excluded
 * - Empty rows (no task name and no project) are excluded
 * - Structural/special rows are excluded
 * - All day allocations are cleared and status reset to "Not Scheduled"
 * - If project exists in draft: task keeps its project, subproject is cleared
 *   if it no longer exists in the draft
 * - If project doesn't exist in draft: task is sent to inbox (project/subproject cleared)
 */

import { isSpecialRow, isProjectStructureRow } from './rowTypeChecks';

export const EXCLUDED_STATUSES = new Set(['Done', 'Abandoned']);

/**
 * Reset a task for the new year: clear day allocations and reset status.
 */
export function resetTaskForNewYear(task) {
  const reset = { ...task, status: 'Not Scheduled' };
  Object.keys(reset).forEach((key) => {
    if (key.startsWith('day-')) {
      reset[key] = '';
    }
  });
  return reset;
}

/**
 * Import tasks from the active year into a draft year.
 *
 * @param {Object[]} sourceRows - All rows from the active year
 * @param {string[]} draftProjectNicknames - Project nicknames that exist in the draft Goal page
 * @param {Record<string, string[]>} draftSubprojectsMap - nickname → subproject names in draft
 * @returns {Object[]} Tasks ready to be placed via placeImportedTasks
 */
export function importTasksForDraftYear(sourceRows, draftProjectNicknames, draftSubprojectsMap) {
  const nicknameSet = new Set(draftProjectNicknames);

  const tasks = [];

  for (const row of sourceRows) {
    // Skip structural/special rows
    if (isSpecialRow(row) || isProjectStructureRow(row)) continue;
    // Skip Done and Abandoned
    if (EXCLUDED_STATUSES.has(row.status)) continue;
    // Skip empty rows
    if (!(row.task || '').trim() && !(row.project || '').trim()) continue;

    const reset = resetTaskForNewYear(row);
    const nickname = row.projectNickname || row.project || '';

    if (nicknameSet.has(nickname)) {
      // Project exists in draft — keep project, check subproject
      const subproject = (row.subproject || '').trim();
      const draftSubs = draftSubprojectsMap[nickname] || ['-'];
      const subprojectExists = !subproject || subproject === '-' || draftSubs.includes(subproject);

      tasks.push({
        ...reset,
        subproject: subprojectExists ? subproject : '',
        parentGroupId: undefined, // will be assigned by position
      });
    } else {
      // Project doesn't exist in draft — send to inbox
      tasks.push({
        ...reset,
        project: '',
        projectNickname: '',
        subproject: '',
        parentGroupId: undefined,
      });
    }
  }

  return tasks;
}
