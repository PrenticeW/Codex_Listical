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

// Terminal statuses that should not be carried into a new year.
export const EXCLUDED_STATUSES = new Set(['Done', 'Abandoned', 'Accounted']);

/**
 * True when `rows` contains at least one real (non-chip, non-structural,
 * non-archived) task row with content. Used as the "draft year has tasks"
 * gate: once true, project headers and chip rows are injected and the
 * Import panel is hidden. Plain task rows carry no `_rowType`, so this must
 * NOT be keyed on `_rowType === 'projectTask'` (only chip rows set that).
 */
export function hasImportedTasks(rows) {
  if (!Array.isArray(rows)) return false;
  return rows.some((row) => {
    if (!row || row._chipId) return false;
    if (isSpecialRow(row) || isProjectStructureRow(row)) return false;
    if (row._isArchivedTask || row.archiveWeekLabel) return false;
    return !!((row.task || '').trim() || (row.project || '').trim());
  });
}

/**
 * Reset a task for the new year: clear day allocations, reset status,
 * strip chip metadata (chip IDs from the source year are meaningless in
 * the draft year and would cause the chip-sync effect to delete the row),
 * and assign a fresh id to avoid collisions.
 */
export function resetTaskForNewYear(task) {
  const reset = { ...task, status: 'Not Scheduled' };
  Object.keys(reset).forEach((key) => {
    if (key.startsWith('day-')) {
      reset[key] = '';
    }
  });

  // Strip chip-related metadata — the source year's chip IDs don't exist in
  // the draft year, so keeping them causes the chip-sync effect to remove
  // the imported row on the next mount. _rowType is intentionally kept so
  // that extractRecurringTasks can detect these rows on the next archive.
  delete reset._chipId;
  delete reset._chipLabel;

  // Archive flags from the source year must not follow the task: a draft
  // year has no archive block and these flags make the row render (and be
  // skipped by reconciliation) as an archived row.
  delete reset._isArchivedTask;
  delete reset.archiveWeekLabel;

  // projectId is reassigned by importTasksForDraftYear: draft-year projects
  // are minted with fresh UUIDs, so the source year's id must never be kept.
  delete reset.projectId;

  // Per-task history/state belongs to the old year.
  reset.checkbox = false;
  reset.completionCount = 0;
  reset.lastCompletedAt = null;
  reset.taskCreatedAt = new Date().toISOString();
  reset.dayTag = null;
  reset.dayTagLocked = false;

  // Fresh id so the imported row doesn't collide with an existing row
  reset.id = `imported-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  return reset;
}

/**
 * Import tasks from the active year into a draft year.
 *
 * @param {Object[]} sourceRows - All rows from the active year
 * @param {string[]} draftProjectNicknames - Project nicknames that exist in the draft Goal page
 * @param {Record<string, string[]>} draftSubprojectsMap - nickname → subproject names in draft
 * @param {Map<string, string>} [draftProjectIdByNickname] - nickname → draft project UUID
 * @returns {Object[]} Tasks ready to be placed via placeImportedTasks
 */
export function importTasksForDraftYear(sourceRows, draftProjectNicknames, draftSubprojectsMap, draftProjectIdByNickname) {
  const nicknameSet = new Set(draftProjectNicknames);
  const idByNickname = draftProjectIdByNickname instanceof Map ? draftProjectIdByNickname : new Map();

  const tasks = [];

  for (const row of sourceRows) {
    // Skip structural/special rows
    if (isSpecialRow(row) || isProjectStructureRow(row)) continue;
    // Skip Done and Abandoned
    if (EXCLUDED_STATUSES.has(row.status)) continue;
    // Skip archived tasks (archives are a frozen record of the old year)
    if (row._isArchivedTask || row.archiveWeekLabel) continue;
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
        projectNickname: nickname,
        projectId: idByNickname.get(nickname) ?? null,
        subproject: subprojectExists ? subproject : '',
        parentGroupId: undefined, // will be assigned by position
      });
    } else {
      // Project doesn't exist in draft — send to inbox
      tasks.push({
        ...reset,
        project: '',
        projectNickname: '',
        projectId: null,
        subproject: '',
        parentGroupId: undefined,
      });
    }
  }

  return tasks;
}
