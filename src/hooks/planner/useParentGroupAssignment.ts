/**
 * Parent Group Assignment Hook
 * Assigns parentGroupId to tasks based on their position under project sections
 */

import type { PlannerRow } from '../../types/planner';

/**
 * Assign parentGroupId to all rows based on their hierarchical position.
 * Tracks both project-level and subproject-level group context as we iterate.
 *
 * Rules:
 * - Tasks beneath a subprojectHeader get parentGroupId = subprojectHeader.groupId
 * - Tasks beneath a projectHeader (but not under any subheader) get parentGroupId = projectHeader.groupId
 * - Archive rows keep their explicitly-set parentGroupId (they live inside archive week groups)
 * - Assignment always overwrites existing parentGroupId so moving a task updates its membership
 */
export function assignParentGroupIds(data: PlannerRow[]): PlannerRow[] {
  let currentProjectGroupId: string | null = null;
  let currentSubprojectGroupId: string | null = null;

  // Archive row types — these have parentGroupId set explicitly and must not be overwritten
  const ARCHIVE_ROW_TYPES = new Set([
    'archiveRow',
    'archiveHeader',
    'archivedProjectHeader',
    'archivedProjectGeneral',
    'archivedProjectUnscheduled',
  ]);

  return data.map(row => {
    // Track current project group
    if (row._rowType === 'projectHeader') {
      currentProjectGroupId = row.groupId || null;
      currentSubprojectGroupId = null; // entering a new project resets subproject context
    }

    // Entering a subproject header — tasks beneath it belong to this subgroup
    if (row._rowType === 'subprojectHeader') {
      currentSubprojectGroupId = row.groupId || null;
    }

    // Leaving subproject context: a project-level section row or another project resets it
    if (row._rowType === 'projectGeneral' || row._rowType === 'projectUnscheduled') {
      currentSubprojectGroupId = null;
    }

    // Inbox or Archive boundary — clear all context
    if (row._isInboxRow || row._rowType === 'archiveHeader') {
      currentProjectGroupId = null;
      currentSubprojectGroupId = null;
    }

    // Skip special rows — they don't need positional parentGroupId assignment
    if (row._isMonthRow || row._isWeekRow || row._isDayRow ||
        row._isDayOfWeekRow || row._isDailyMinRow || row._isDailyMaxRow || row._isFilterRow ||
        row._isInboxRow || row._isArchiveRow ||
        row._rowType === 'projectHeader' || row._rowType === 'projectGeneral' || row._rowType === 'projectUnscheduled' ||
        row._rowType === 'subprojectHeader' || row._rowType === 'subprojectGeneral' || row._rowType === 'subprojectUnscheduled') {
      return row;
    }

    // Archive rows have explicit parentGroupId pointing into archive week groups — don't overwrite
    if (row._rowType && ARCHIVE_ROW_TYPES.has(row._rowType)) {
      return row;
    }

    // Archived tasks — leave their parentGroupId intact
    if (row.archiveWeekLabel || row._isArchivedTask) {
      return row;
    }

    // For live task rows: assign to innermost group context (subproject > project)
    const targetGroupId = currentSubprojectGroupId || currentProjectGroupId;
    if (targetGroupId) {
      if (row.parentGroupId === targetGroupId) return row; // no change needed
      return { ...row, parentGroupId: targetGroupId };
    }

    // Outside any project — clear parentGroupId if it was set
    if (row.parentGroupId) {
      return { ...row, parentGroupId: undefined };
    }

    return row;
  });
}
