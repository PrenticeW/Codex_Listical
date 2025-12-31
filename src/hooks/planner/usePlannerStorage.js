/**
 * Planner Storage Hook
 * Manages all planner settings with localStorage persistence
 */

import { useState } from 'react';
import useAutoPersist from '../common/useAutoPersist';
import {
  readColumnSizing,
  saveColumnSizing,
  readSizeScale,
  saveSizeScale,
  readStartDate,
  saveStartDate,
  readShowRecurring,
  saveShowRecurring,
  readShowSubprojects,
  saveShowSubprojects,
  readShowMaxMinRows,
  saveShowMaxMinRows,
  readSortStatuses,
  saveSortStatuses,
  readSortPlannerStatuses,
  saveSortPlannerStatuses,
  readTaskRows,
  saveTaskRows,
  readTotalDays,
  saveTotalDays,
  readVisibleDayColumns,
  saveVisibleDayColumns,
} from '../../utils/planner/storage';
import { DEFAULT_PROJECT_ID } from '../../constants/plannerStorageKeys';

/**
 * Get default column sizing based on column definitions
 * @param {number} totalDays - Total number of day columns
 * @returns {Object} Default column sizing object
 */
const getDefaultColumnSizing = (totalDays) => {
  const sizing = {
    rowNum: 36,
    checkbox: 34,
    project: 156,
    subproject: 142,
    status: 143,
    task: 356,
    recurring: 37,
    estimate: 164,
    timeValue: 117,
  };

  // Add day columns (default 59px each)
  for (let i = 0; i < totalDays; i++) {
    sizing[`day-${i}`] = 59;
  }

  return sizing;
};

/**
 * Hook to manage planner storage (all settings)
 * Automatically syncs with localStorage
 *
 * @param {Object} options - Hook options
 * @param {string} options.projectId - Project identifier (defaults to DEFAULT_PROJECT_ID)
 * @param {number|null} options.yearNumber - Year number for year-based storage (null for legacy)
 * @returns {Object} Storage state and setters
 */
export default function usePlannerStorage({ projectId = DEFAULT_PROJECT_ID, yearNumber = null } = {}) {
  // Initialize totalDays first since it's needed for visibleDayColumns and column sizing
  const [totalDays, setTotalDays] = useState(() => readTotalDays(projectId, yearNumber));

  // Initialize from storage, with defaults for new users
  const [columnSizing, setColumnSizing] = useState(() => {
    const stored = readColumnSizing(projectId, yearNumber);
    // If empty object (new user), return defaults
    if (Object.keys(stored).length === 0) {
      return getDefaultColumnSizing(totalDays);
    }
    return stored;
  });
  const [sizeScale, setSizeScale] = useState(() => readSizeScale(projectId, yearNumber));
  const [startDate, setStartDate] = useState(() => readStartDate(projectId, yearNumber));
  const [showRecurring, setShowRecurring] = useState(() => readShowRecurring(projectId, yearNumber));
  const [showSubprojects, setShowSubprojects] = useState(() => readShowSubprojects(projectId, yearNumber));
  const [showMaxMinRows, setShowMaxMinRows] = useState(() => readShowMaxMinRows(projectId, yearNumber));
  const [selectedSortStatuses, setSelectedSortStatuses] = useState(() => readSortStatuses(projectId, yearNumber));
  const [selectedSortPlannerStatuses, setSelectedSortPlannerStatuses] = useState(() => readSortPlannerStatuses(projectId, yearNumber));
  const [taskRows, setTaskRows] = useState(() => readTaskRows(projectId, yearNumber));
  const [visibleDayColumns, setVisibleDayColumns] = useState(() => readVisibleDayColumns(projectId, totalDays, yearNumber));

  // Auto-persist all settings using the generic hook (replaces 11 separate useEffect hooks)
  useAutoPersist(columnSizing, saveColumnSizing, {
    projectId,
    yearNumber,
    shouldSave: (value) => Object.keys(value).length > 0,
  });
  useAutoPersist(sizeScale, saveSizeScale, { projectId, yearNumber });
  useAutoPersist(startDate, saveStartDate, { projectId, yearNumber });
  useAutoPersist(showRecurring, saveShowRecurring, { projectId, yearNumber });
  useAutoPersist(showSubprojects, saveShowSubprojects, { projectId, yearNumber });
  useAutoPersist(showMaxMinRows, saveShowMaxMinRows, { projectId, yearNumber });
  useAutoPersist(selectedSortStatuses, saveSortStatuses, { projectId, yearNumber });
  useAutoPersist(selectedSortPlannerStatuses, saveSortPlannerStatuses, { projectId, yearNumber });
  useAutoPersist(taskRows, saveTaskRows, { projectId, yearNumber });
  useAutoPersist(totalDays, saveTotalDays, { projectId, yearNumber });
  useAutoPersist(visibleDayColumns, saveVisibleDayColumns, {
    projectId,
    yearNumber,
    shouldSave: (value) => Object.keys(value).length > 0,
  });

  return {
    columnSizing,
    setColumnSizing,
    sizeScale,
    setSizeScale,
    startDate,
    setStartDate,
    showRecurring,
    setShowRecurring,
    showSubprojects,
    setShowSubprojects,
    showMaxMinRows,
    setShowMaxMinRows,
    selectedSortStatuses,
    setSelectedSortStatuses,
    selectedSortPlannerStatuses,
    setSelectedSortPlannerStatuses,
    taskRows,
    setTaskRows,
    totalDays,
    setTotalDays,
    visibleDayColumns,
    setVisibleDayColumns,
  };
}
