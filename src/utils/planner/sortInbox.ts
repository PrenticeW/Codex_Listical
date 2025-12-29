/**
 * Sort Inbox Utilities
 *
 * Provides functionality to sort and move inbox tasks to their
 * appropriate project sections based on status.
 */

import { normalizeProjectKey } from './valueNormalizers';

// Map status values to their target sections for Sort Inbox
export const SORT_INBOX_TARGET_MAP: Record<string, 'general' | 'unscheduled'> = {
  'Done': 'general',
  'Scheduled': 'general',
  'Not Scheduled': 'unscheduled',
  'Abandoned': 'unscheduled',
  'Blocked': 'unscheduled',
  'On Hold': 'unscheduled',
};

/**
 * Check if a row is a special row that should be skipped during sorting
 */
const isSpecialRow = (row: any): boolean => {
  return !!(
    row._isMonthRow ||
    row._isWeekRow ||
    row._isDayRow ||
    row._isDayOfWeekRow ||
    row._isDailyMinRow ||
    row._isDailyMaxRow ||
    row._isFilterRow ||
    row._isInboxRow ||
    row._isArchiveRow ||
    row._rowType
  );
};

/**
 * Build a map of normalized project nicknames
 * @param data - The full data array
 * @returns Map of normalized nicknames to original nicknames
 */
const buildNicknameMap = (data: any[]): Map<string, string> => {
  const nicknameMap = new Map<string, string>();

  data.forEach((row) => {
    if (row._rowType === 'projectGeneral' || row._rowType === 'projectUnscheduled') {
      const nickname = normalizeProjectKey(row.projectNickname);
      nicknameMap.set(nickname, row.projectNickname);
    }
  });

  return nicknameMap;
};

/**
 * Collect tasks from inbox that match selected statuses
 * @param data - The full data array
 * @param inboxStartIndex - Starting index of inbox section
 * @param inboxEndIndex - Ending index of inbox section
 * @param selectedSortStatuses - Set of status values to sort
 * @param nicknameMap - Map of normalized nicknames
 * @returns Object containing task collections and IDs to move
 */
const collectInboxTasks = (
  data: any[],
  inboxStartIndex: number,
  inboxEndIndex: number,
  selectedSortStatuses: Set<string>,
  nicknameMap: Map<string, string>
): {
  generalTasksByProject: Map<string, any[]>;
  unscheduledTasksByProject: Map<string, any[]>;
  inboxTasksToMove: Set<string>;
} => {
  const generalTasksByProject = new Map<string, any[]>();
  const unscheduledTasksByProject = new Map<string, any[]>();
  const inboxTasksToMove = new Set<string>();

  for (let i = inboxStartIndex + 1; i < inboxEndIndex; i++) {
    const row = data[i];

    // Skip special rows - only process regular task rows
    if (isSpecialRow(row)) {
      continue;
    }

    // Check if this task should be sorted
    const status = row.status || '';
    if (!selectedSortStatuses.has(status)) {
      continue;
    }

    // Determine target section
    const target = SORT_INBOX_TARGET_MAP[status];
    if (!target) {
      continue;
    }

    // Match project by nickname
    const taskProjectNickname = normalizeProjectKey(row.project);

    // Check if this nickname exists in our project sections
    if (!nicknameMap.has(taskProjectNickname)) {
      continue;
    }

    // Use the normalized nickname as the map key
    const projectKey = taskProjectNickname;

    // Add to appropriate collection
    if (target === 'general') {
      if (!generalTasksByProject.has(projectKey)) {
        generalTasksByProject.set(projectKey, []);
      }
      generalTasksByProject.get(projectKey)!.push(row);
      inboxTasksToMove.add(row.id);
    } else if (target === 'unscheduled') {
      if (!unscheduledTasksByProject.has(projectKey)) {
        unscheduledTasksByProject.set(projectKey, []);
      }
      unscheduledTasksByProject.get(projectKey)!.push(row);
      inboxTasksToMove.add(row.id);
    }
  }

  return { generalTasksByProject, unscheduledTasksByProject, inboxTasksToMove };
};

/**
 * Execute the sort inbox operation
 * @param prevData - The current data array
 * @param generalTasksByProject - Map of general tasks by project
 * @param unscheduledTasksByProject - Map of unscheduled tasks by project
 * @param tasksToMove - Set of task IDs to move
 * @returns New data array with sorted tasks
 */
const executeSortInbox = (
  prevData: any[],
  generalTasksByProject: Map<string, any[]>,
  unscheduledTasksByProject: Map<string, any[]>,
  tasksToMove: Set<string>
): any[] => {
  const newData: any[] = [];
  // Create fresh copies of the maps for this execution to avoid mutation issues
  const generalTasksCopy = new Map(generalTasksByProject);
  const unscheduledTasksCopy = new Map(unscheduledTasksByProject);

  prevData.forEach((row) => {
    // Skip tasks that are being moved from inbox
    if (tasksToMove.has(row.id)) {
      return;
    }

    // Add the current row
    newData.push(row);

    // If this is a projectGeneral row, insert general tasks for this project
    if (row._rowType === 'projectGeneral') {
      const projectKey = normalizeProjectKey(row.projectNickname);
      const tasksToInsert = generalTasksCopy.get(projectKey);

      if (tasksToInsert && tasksToInsert.length > 0) {
        tasksToInsert.forEach(task => {
          newData.push(task);
        });
        generalTasksCopy.delete(projectKey);
      }
    }

    // If this is a projectUnscheduled row, insert unscheduled tasks for this project
    if (row._rowType === 'projectUnscheduled') {
      const projectKey = normalizeProjectKey(row.projectNickname);
      const tasksToInsert = unscheduledTasksCopy.get(projectKey);

      if (tasksToInsert && tasksToInsert.length > 0) {
        tasksToInsert.forEach(task => {
          newData.push(task);
        });
        unscheduledTasksCopy.delete(projectKey);
      }
    }
  });

  return newData;
};

/**
 * Create a command object for sorting inbox tasks
 * @param params Configuration object
 * @returns Command object with execute and undo functions, or null if nothing to sort
 */
export const createSortInboxCommand = (params: {
  data: any[];
  selectedSortStatuses: Set<string>;
  setData: React.Dispatch<React.SetStateAction<any[]>>;
}): { execute: () => void; undo: () => void } | null => {
  const { data, selectedSortStatuses, setData } = params;

  // Early exit if no statuses are selected
  if (selectedSortStatuses.size === 0) {
    return null;
  }

  // Build a map: normalized nickname -> projectNickname for matching
  const nicknameMap = buildNicknameMap(data);

  // Find inbox section boundaries
  const inboxStartIndex = data.findIndex(row => row._isInboxRow);
  const archiveStartIndex = data.findIndex(row => row._isArchiveRow);

  if (inboxStartIndex === -1) {
    return null;
  }

  // Determine inbox section end (either at archive row or end of data)
  const inboxEndIndex = archiveStartIndex !== -1 ? archiveStartIndex : data.length;

  // Collect inbox tasks that match the selected statuses
  const { generalTasksByProject, unscheduledTasksByProject, inboxTasksToMove } = collectInboxTasks(
    data,
    inboxStartIndex,
    inboxEndIndex,
    selectedSortStatuses,
    nicknameMap
  );

  // If no tasks to move, exit early
  if (inboxTasksToMove.size === 0) {
    return null;
  }

  // Store old data for undo
  const oldData = [...data];

  // Copy the set for closure capture
  const tasksToMove = new Set(inboxTasksToMove);

  // Create command for sort inbox operation
  return {
    execute: () => {
      setData(prevData => {
        return executeSortInbox(prevData, generalTasksByProject, unscheduledTasksByProject, tasksToMove);
      });
    },
    undo: () => {
      setData(oldData);
    },
  };
};
