/**
 * Planner Storage Hook
 * Manages all planner settings, now backed by Supabase (helper #5 port).
 *
 * Pattern: every piece of state starts at its default value, then a single
 * consolidated load effect fetches the saved values in parallel via
 * Promise.all. While the load is in flight, `isLoaded` stays false and
 * useAutoPersist is gated off so an early user interaction cannot be
 * overwritten by the load completing afterward. Once the load resolves,
 * `isLoaded` flips true and the autosaves arm.
 */

import { useState, useEffect } from 'react';
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
  PLANNER_START_DATE_EVENT,
} from '../../utils/planner/storage';
import { DEFAULT_PROJECT_ID } from '../../constants/plannerStorageKeys';

const DEFAULT_TOTAL_DAYS = 84;

const DEFAULT_SORT_STATUSES = new Set([
  'Done',
  'Scheduled',
  'Not Scheduled',
  'Blocked',
  'On Hold',
  'Abandoned',
  'Skipped',
  'Accounted',
]);

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

const defaultVisibleDayColumns = (totalDays) => {
  const visible = {};
  for (let i = 0; i < totalDays; i++) {
    visible[`day-${i}`] = true;
  }
  return visible;
};

const todayIso = () => new Date().toISOString().split('T')[0];

/**
 * Hook to manage planner storage (all settings)
 * Automatically syncs with Supabase.
 *
 * @param {Object} options - Hook options
 * @param {string} options.projectId - Project identifier (defaults to DEFAULT_PROJECT_ID)
 * @param {number|null} options.yearNumber - Year number for year-based storage
 * @returns {Object} Storage state and setters
 */
export default function usePlannerStorage({ projectId = DEFAULT_PROJECT_ID, yearNumber = null } = {}) {
  // All values start at their defaults; the async load below replaces them.
  const [totalDays, setTotalDays] = useState(DEFAULT_TOTAL_DAYS);
  const [columnSizing, setColumnSizing] = useState(() => getDefaultColumnSizing(DEFAULT_TOTAL_DAYS));
  const [sizeScale, setSizeScale] = useState(1.0);
  const [startDate, setStartDate] = useState(todayIso());
  const [showRecurring, setShowRecurring] = useState(true);
  const [showSubprojects, setShowSubprojects] = useState(true);
  const [showMaxMinRows, setShowMaxMinRows] = useState(true);
  const [selectedSortStatuses, setSelectedSortStatuses] = useState(() => new Set(DEFAULT_SORT_STATUSES));
  const [selectedSortPlannerStatuses, setSelectedSortPlannerStatuses] = useState(() => new Set(DEFAULT_SORT_STATUSES));
  const [taskRows, setTaskRows] = useState([]);
  const [visibleDayColumns, setVisibleDayColumns] = useState(() => defaultVisibleDayColumns(DEFAULT_TOTAL_DAYS));

  // isLoaded gates every autosave. Flips true once the load below resolves.
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setIsLoaded(false);

    (async () => {
      try {
        // totalDays is needed for default visibleDayColumns / columnSizing,
        // so read it first and use its value when reading the rest.
        const loadedTotalDays = await readTotalDays(projectId, yearNumber);
        if (cancelled) return;

        const [
          loadedColumnSizing,
          loadedSizeScale,
          loadedStartDate,
          loadedShowRecurring,
          loadedShowSubprojects,
          loadedShowMaxMinRows,
          loadedSortStatuses,
          loadedSortPlannerStatuses,
          loadedTaskRows,
          loadedVisibleDayColumns,
        ] = await Promise.all([
          readColumnSizing(projectId, yearNumber),
          readSizeScale(projectId, yearNumber),
          readStartDate(projectId, yearNumber),
          readShowRecurring(projectId, yearNumber),
          readShowSubprojects(projectId, yearNumber),
          readShowMaxMinRows(projectId, yearNumber),
          readSortStatuses(projectId, yearNumber),
          readSortPlannerStatuses(projectId, yearNumber),
          readTaskRows(projectId, yearNumber),
          readVisibleDayColumns(projectId, loadedTotalDays, yearNumber),
        ]);
        if (cancelled) return;

        setTotalDays(loadedTotalDays);
        setColumnSizing(
          loadedColumnSizing && Object.keys(loadedColumnSizing).length > 0
            ? loadedColumnSizing
            : getDefaultColumnSizing(loadedTotalDays),
        );
        setSizeScale(loadedSizeScale);
        setStartDate(loadedStartDate);
        setShowRecurring(loadedShowRecurring);
        setShowSubprojects(loadedShowSubprojects);
        setShowMaxMinRows(loadedShowMaxMinRows);
        setSelectedSortStatuses(loadedSortStatuses);
        setSelectedSortPlannerStatuses(loadedSortPlannerStatuses);
        setTaskRows(loadedTaskRows);
        setVisibleDayColumns(loadedVisibleDayColumns);
        setIsLoaded(true);
      } catch (error) {
        if (!cancelled) {
          console.error('Failed to load planner storage', error);
          setIsLoaded(true); // unblock saves even on failure
        }
      }
    })();

    return () => { cancelled = true; };
  }, [projectId, yearNumber]);

  // Refresh startDate when another page (e.g. Plan's Send to System) writes
  // it externally. Only react to events for this hook's year.
  useEffect(() => {
    const handler = (e) => {
      if (e.detail?.__eventYear != null && e.detail.__eventYear !== yearNumber) return;
      if (e.detail?.yearNumber === yearNumber) {
        setStartDate(e.detail.startDate);
      }
    };
    window.addEventListener(PLANNER_START_DATE_EVENT, handler);
    return () => window.removeEventListener(PLANNER_START_DATE_EVENT, handler);
  }, [yearNumber]);

  // Auto-persist all settings, gated on isLoaded so early interactions
  // cannot be overwritten by a slow Supabase round-trip.
  const autoOpts = { projectId, yearNumber, enabled: isLoaded };
  useAutoPersist(columnSizing, saveColumnSizing, {
    ...autoOpts,
    shouldSave: (value) => Object.keys(value).length > 0,
  });
  useAutoPersist(sizeScale, saveSizeScale, autoOpts);
  useAutoPersist(startDate, saveStartDate, autoOpts);
  useAutoPersist(showRecurring, saveShowRecurring, autoOpts);
  useAutoPersist(showSubprojects, saveShowSubprojects, autoOpts);
  useAutoPersist(showMaxMinRows, saveShowMaxMinRows, autoOpts);
  useAutoPersist(selectedSortStatuses, saveSortStatuses, autoOpts);
  useAutoPersist(selectedSortPlannerStatuses, saveSortPlannerStatuses, autoOpts);
  useAutoPersist(taskRows, saveTaskRows, autoOpts);
  useAutoPersist(totalDays, saveTotalDays, autoOpts);
  useAutoPersist(visibleDayColumns, saveVisibleDayColumns, {
    ...autoOpts,
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
    isLoaded,
  };
}
