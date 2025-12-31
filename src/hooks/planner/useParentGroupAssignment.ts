/**
 * Parent Group Assignment Hook
 * Assigns parentGroupId to tasks based on their position under project sections
 */

import type { PlannerRow } from '../../types/planner';

/**
 * Assign parentGroupId to all rows based on their hierarchical position
 * Tracks the current group context as we iterate through rows
 */
export function assignParentGroupIds(data: PlannerRow[]): PlannerRow[] {
  let currentProjectGroupId: string | null = null;

  return data.map(row => {
    // Track current project group as we iterate
    if (row._rowType === 'projectHeader') {
      currentProjectGroupId = row.groupId || null;
    }

    // When we hit Inbox or Archive, clear the project group
    if (row._isInboxRow || row._rowType === 'archiveHeader') {
      currentProjectGroupId = null;
    }

    // Skip special rows - they don't need parentGroupId
    if (row._isMonthRow || row._isWeekRow || row._isDayRow ||
        row._isDayOfWeekRow || row._isDailyMinRow || row._isDailyMaxRow || row._isFilterRow ||
        row._isInboxRow || row._isArchiveRow ||
        row._rowType === 'projectHeader' || row._rowType === 'projectGeneral' || row._rowType === 'projectUnscheduled' ||
        row._rowType === 'subprojectHeader' || row._rowType === 'subprojectGeneral' || row._rowType === 'subprojectUnscheduled') {
      return row;
    }

    // For regular task rows, assign parentGroupId if we're under a project
    if (currentProjectGroupId && !row.parentGroupId) {
      return {
        ...row,
        parentGroupId: currentProjectGroupId,
      };
    }

    return row;
  });
}
