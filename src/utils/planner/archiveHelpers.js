/**
 * Archive Helper Utilities
 * Pure functions for archive operations - no side effects, no localStorage calls
 */

import {
  ARCHIVE_ROW_TYPES,
  ARCHIVE_WEEK_ID_PREFIX,
  ARCHIVED_ROW_ID_PREFIX,
  ARCHIVE_HEADER_ID,
} from '../../constants/planner/rowTypes';
import { createEmptyDayColumns } from './dayColumnHelpers';

/**
 * Generate a unique ID for archive-related rows
 * @param {string} prefix - ID prefix
 * @returns {string} Unique ID
 */
const generateUniqueId = (prefix) => {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 9);
  return `${prefix}${timestamp}-${random}`;
};

/**
 * Calculate week range string from dates array
 * @param {Date[]} dates - Array of dates
 * @returns {string} Week range (e.g., "Dec 29 - Jan 4")
 */
export const calculateWeekRange = (dates) => {
  if (!dates || dates.length === 0) return '';

  const firstDate = dates[0];
  const lastDate = dates[Math.min(6, dates.length - 1)]; // First 7 days or less

  const formatDate = (date) => {
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    });
  };

  return `${formatDate(firstDate)} - ${formatDate(lastDate)}`;
};

/**
 * Calculate week number from start date
 * @param {string} startDate - Start date in YYYY-MM-DD format (currently displayed first day)
 * @param {Date} currentDate - Current date (unused, kept for compatibility)
 * @param {number} displayedWeekNumber - The week number shown in the week row (from day columns)
 * @returns {object} { year, week } - Year and week number
 */
export const calculateWeekNumber = (startDate, currentDate, displayedWeekNumber = 1) => {
  // Year is always 1 (placeholder)
  const year = 1;

  // Use the displayed week number from the timeline
  const week = displayedWeekNumber;

  return { year, week };
};

/**
 * Create an archive week row
 * @param {object} options - Archive week options
 * @param {string} options.weekRange - Week range string
 * @param {object} options.weekNumber - { year, week } object
 * @param {object} options.dailyMinValues - Daily min values object
 * @param {object} options.dailyMaxValues - Daily max values object
 * @param {number} options.totalDays - Total number of days
 * @returns {object} Archive week row object
 */
export const createArchiveWeekRow = ({
  weekRange,
  weekNumber,
  dailyMinValues = {},
  dailyMaxValues = {},
  totalDays = 84,
}) => {
  const archiveWeekId = generateUniqueId(ARCHIVE_WEEK_ID_PREFIX);

  // Calculate min and max from first 7 days
  let weeklyMin = 0;
  let weeklyMax = 0;

  for (let i = 0; i < Math.min(7, totalDays); i++) {
    const minValue = parseFloat(dailyMinValues[i]) || 0;
    const maxValue = parseFloat(dailyMaxValues[i]) || 0;
    weeklyMin += minValue;
    weeklyMax += maxValue;
  }

  return {
    id: archiveWeekId,
    _rowType: ARCHIVE_ROW_TYPES.ARCHIVE_WEEK,
    archiveLabel: weekRange,
    archiveWeekLabel: `Year ${weekNumber.year}, Week ${weekNumber.week}`,
    archiveWeeklyMin: weeklyMin.toFixed(2),
    archiveWeeklyMax: weeklyMax.toFixed(2),
    archiveTotalHours: '0.00', // Will be calculated from archived tasks
    groupId: archiveWeekId,
    isGroupHeader: true,
    rowNum: '',
    checkbox: '',
    project: '',
    subproject: '',
    status: '',
    task: '',
    recurring: '',
    estimate: '',
    timeValue: '',
    ...createEmptyDayColumns(totalDays),
  };
};

/**
 * Create archived project structure (header + general + unscheduled + subproject sections)
 * @param {object[]} projectRows - Array of project rows (projectHeader, projectGeneral, projectUnscheduled)
 * @param {object[]} subprojectRows - Array of subproject section rows (subprojectGeneral, subprojectUnscheduled)
 * @param {string} archiveWeekId - Archive week ID for grouping
 * @param {number} totalDays - Total number of days
 * @returns {object[]} Array of archived project rows (including subproject sections)
 */
export const createArchivedProjectStructure = (projectRows, subprojectRows, archiveWeekId, totalDays = 84) => {
  const archivedRows = [];

  // Group rows by project
  const projectGroups = {};

  projectRows.forEach(row => {
    const projectKey = row.projectNickname || row.id;
    if (!projectGroups[projectKey]) {
      projectGroups[projectKey] = [];
    }
    projectGroups[projectKey].push(row);
  });

  // Create archived versions
  Object.entries(projectGroups).forEach(([projectKey, rows]) => {
    const headerRow = rows.find(r => r._rowType === 'projectHeader');
    const generalRow = rows.find(r => r._rowType === 'projectGeneral');
    const unscheduledRow = rows.find(r => r._rowType === 'projectUnscheduled');

    if (!headerRow) return;

    const groupId = generateUniqueId(`${ARCHIVED_ROW_ID_PREFIX}${projectKey}-group-`);

    // Create archived project header
    const archivedHeader = {
      ...headerRow,
      id: generateUniqueId(`${ARCHIVED_ROW_ID_PREFIX}${headerRow.id}-`),
      _rowType: ARCHIVE_ROW_TYPES.ARCHIVED_PROJECT_HEADER,
      parentGroupId: archiveWeekId,
      groupId: groupId,
      isGroupHeader: false,
    };
    archivedRows.push(archivedHeader);

    // Create archived general section
    if (generalRow) {
      const archivedGeneral = {
        ...generalRow,
        id: generateUniqueId(`${ARCHIVED_ROW_ID_PREFIX}${generalRow.id}-`),
        _rowType: ARCHIVE_ROW_TYPES.ARCHIVED_PROJECT_GENERAL,
        parentGroupId: groupId, // Point to the archived project header's groupId
        isGroupHeader: false,
      };
      archivedRows.push(archivedGeneral);
    }

    // Create archived unscheduled section
    if (unscheduledRow) {
      const archivedUnscheduled = {
        ...unscheduledRow,
        id: generateUniqueId(`${ARCHIVED_ROW_ID_PREFIX}${unscheduledRow.id}-`),
        _rowType: ARCHIVE_ROW_TYPES.ARCHIVED_PROJECT_UNSCHEDULED,
        parentGroupId: groupId, // Point to the archived project header's groupId
        isGroupHeader: false,
      };
      archivedRows.push(archivedUnscheduled);
    }

    // Archive custom subproject section rows that belong to this project
    const projectSubprojectRows = subprojectRows.filter(row => {
      // Match by parentGroupId - subproject rows have parentGroupId pointing to their project's groupId
      return row.parentGroupId === headerRow.groupId;
    });

    projectSubprojectRows.forEach(subRow => {
      const archivedSubRow = {
        ...subRow,
        id: generateUniqueId(`${ARCHIVED_ROW_ID_PREFIX}${subRow.id}-`),
        // Keep the original _rowType (subprojectGeneral or subprojectUnscheduled)
        parentGroupId: groupId, // Point to the archived project header's groupId
        isGroupHeader: false,
      };
      archivedRows.push(archivedSubRow);
    });
  });

  return archivedRows;
};

/**
 * Collect tasks matching filter criteria
 * @param {object[]} data - Data array
 * @param {function} filterFn - Filter function (task => boolean)
 * @returns {object[]} Array of matching tasks (including subproject section rows)
 */
export const collectTasksForArchive = (data, filterFn) => {
  return data.filter(row => {
    // Exclude special header rows, but INCLUDE subproject section rows
    if (row._isMonthRow || row._isWeekRow || row._isDayRow ||
        row._isDayOfWeekRow || row._isDailyMinRow || row._isDailyMaxRow ||
        row._isFilterRow || row._isInboxRow || row._isArchiveRow) {
      return false;
    }

    // Exclude project structure rows (but keep subproject section rows)
    if (row._rowType === 'projectHeader' ||
        row._rowType === 'projectGeneral' ||
        row._rowType === 'projectUnscheduled' ||
        row._rowType === 'subprojectHeader' ||
        row._rowType === 'archiveHeader' ||
        row._rowType === 'archiveRow' ||
        row._rowType === 'archivedProjectHeader' ||
        row._rowType === 'archivedProjectGeneral' ||
        row._rowType === 'archivedProjectUnscheduled') {
      return false;
    }

    // Include subproject section rows (subprojectGeneral, subprojectUnscheduled) and regular task rows
    return filterFn(row);
  });
};

/**
 * Create a deep copy snapshot of a recurring task
 * @param {object} task - Task object
 * @returns {object} Deep copy of task with new ID
 */
export const snapshotRecurringTask = (task) => {
  return {
    ...task,
    id: generateUniqueId(`${ARCHIVED_ROW_ID_PREFIX}${task.id}-snapshot-`),
    // Deep copy day entries if they exist
    ...(task.dayEntries ? { dayEntries: [...task.dayEntries] } : {}),
  };
};

/**
 * Insert archive week row after existing archive rows (or after archive header)
 * @param {object[]} data - Data array
 * @param {object} archiveWeekRow - Archive week row to insert
 * @returns {object[]} New data array with archive week row inserted
 */
export const insertArchiveRow = (data, archiveWeekRow) => {
  const newData = [...data];

  // Find archive header
  const archiveHeaderIndex = newData.findIndex(row => row._rowType === ARCHIVE_ROW_TYPES.ARCHIVE_HEADER);

  if (archiveHeaderIndex === -1) {
    // Archive header doesn't exist, insert at end
    newData.push(archiveWeekRow);
    return newData;
  }

  // Find the last archive row (after archive header)
  let insertIndex = archiveHeaderIndex + 1;
  for (let i = archiveHeaderIndex + 1; i < newData.length; i++) {
    if (newData[i]._rowType === ARCHIVE_ROW_TYPES.ARCHIVE_WEEK ||
        newData[i]._rowType === ARCHIVE_ROW_TYPES.ARCHIVED_PROJECT_HEADER ||
        newData[i]._rowType === ARCHIVE_ROW_TYPES.ARCHIVED_PROJECT_GENERAL ||
        newData[i]._rowType === ARCHIVE_ROW_TYPES.ARCHIVED_PROJECT_UNSCHEDULED ||
        newData[i].parentGroupId) {
      insertIndex = i + 1;
    } else {
      break;
    }
  }

  newData.splice(insertIndex, 0, archiveWeekRow);
  return newData;
};

/**
 * Insert archived projects after archive week row
 * @param {object[]} data - Data array
 * @param {object[]} archivedProjects - Archived project rows
 * @param {string} archiveWeekId - Archive week ID
 * @returns {object[]} New data array with archived projects inserted
 */
export const insertArchivedProjects = (data, archivedProjects, archiveWeekId) => {
  const newData = [...data];

  // Find the archive week row
  const archiveWeekIndex = newData.findIndex(row => row.id === archiveWeekId);

  if (archiveWeekIndex === -1) {
    return newData;
  }

  // Insert archived projects right after archive week row
  newData.splice(archiveWeekIndex + 1, 0, ...archivedProjects);

  return newData;
};

/**
 * Move tasks to archive sections
 * @param {object[]} data - Data array
 * @param {object[]} tasksToArchive - Tasks to archive
 * @param {string} archiveWeekId - Archive week ID
 * @returns {object[]} New data array with tasks moved to archive
 */
export const moveTasksToArchive = (data, tasksToArchive, archiveWeekId) => {
  let newData = [...data];

  // Remove tasks from their current positions
  tasksToArchive.forEach(task => {
    const index = newData.findIndex(row => row.id === task.id);
    if (index !== -1) {
      newData.splice(index, 1);
    }
  });

  // Group tasks by project and status target (general vs unscheduled)
  const tasksByProject = {};

  tasksToArchive.forEach(task => {
    const projectKey = task.project || '-';
    const targetSection = task.status === 'Done' ? 'general' : 'unscheduled';

    if (!tasksByProject[projectKey]) {
      tasksByProject[projectKey] = { general: [], unscheduled: [] };
    }

    tasksByProject[projectKey][targetSection].push({
      ...task,
      parentGroupId: archiveWeekId,
    });
  });

  // Insert tasks into their archived sections
  Object.entries(tasksByProject).forEach(([projectKey, sections]) => {
    // Find the archived project header to get its groupId
    const archivedProjectHeader = newData.find(row =>
      row._rowType === ARCHIVE_ROW_TYPES.ARCHIVED_PROJECT_HEADER &&
      row.projectNickname === projectKey &&
      row.parentGroupId === archiveWeekId
    );

    if (!archivedProjectHeader) return;

    const archivedProjectGroupId = archivedProjectHeader.groupId;

    // Find the archived general section for this project
    const generalSectionIndex = newData.findIndex(row =>
      row._rowType === ARCHIVE_ROW_TYPES.ARCHIVED_PROJECT_GENERAL &&
      row.projectNickname === projectKey &&
      row.parentGroupId === archivedProjectGroupId
    );

    // Find the archived unscheduled section for this project
    const unscheduledSectionIndex = newData.findIndex(row =>
      row._rowType === ARCHIVE_ROW_TYPES.ARCHIVED_PROJECT_UNSCHEDULED &&
      row.projectNickname === projectKey &&
      row.parentGroupId === archivedProjectGroupId
    );

    // Insert general tasks with correct parentGroupId
    if (generalSectionIndex !== -1 && sections.general.length > 0) {
      const tasksWithCorrectParent = sections.general.map(task => ({
        ...task,
        parentGroupId: archivedProjectGroupId, // Point to archived project, not archive week
      }));
      newData.splice(generalSectionIndex + 1, 0, ...tasksWithCorrectParent);
    }

    // Insert unscheduled tasks (need to recalculate index after general insertion)
    if (unscheduledSectionIndex !== -1 && sections.unscheduled.length > 0) {
      const newUnscheduledIndex = newData.findIndex(row =>
        row._rowType === ARCHIVE_ROW_TYPES.ARCHIVED_PROJECT_UNSCHEDULED &&
        row.projectNickname === projectKey &&
        row.parentGroupId === archivedProjectGroupId
      );
      if (newUnscheduledIndex !== -1) {
        const tasksWithCorrectParent = sections.unscheduled.map(task => ({
          ...task,
          parentGroupId: archivedProjectGroupId, // Point to archived project, not archive week
        }));
        newData.splice(newUnscheduledIndex + 1, 0, ...tasksWithCorrectParent);
      }
    }
  });

  return newData;
};

/**
 * Insert recurring task snapshots into archive
 * @param {object[]} data - Data array
 * @param {object[]} snapshots - Recurring task snapshots
 * @param {string} archiveWeekId - Archive week ID
 * @returns {object[]} New data array with snapshots inserted
 */
export const insertRecurringSnapshots = (data, snapshots, archiveWeekId) => {
  // Add parentGroupId to snapshots
  const snapshotsWithGroup = snapshots.map(snapshot => ({
    ...snapshot,
    parentGroupId: archiveWeekId,
  }));

  return moveTasksToArchive(data, snapshotsWithGroup, archiveWeekId);
};

/**
 * Reset recurring tasks (clear day entries, set status to "Not Scheduled")
 * @param {object[]} data - Data array
 * @param {number} totalDays - Total number of days
 * @returns {object[]} New data array with recurring tasks reset
 */
export const resetRecurringTasks = (data, totalDays = 84) => {
  return data.map(row => {
    // Only reset recurring tasks with Done or Abandoned status
    if (row.recurring && ['Done', 'Abandoned'].includes(row.status)) {
      const updates = {
        status: 'Not Scheduled',
      };

      // Clear all day entries
      for (let i = 0; i < totalDays; i++) {
        updates[`day-${i}`] = '';
      }

      return { ...row, ...updates };
    }

    return row;
  });
};
