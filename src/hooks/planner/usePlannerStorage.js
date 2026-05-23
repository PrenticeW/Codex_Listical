/**
 * Planner Storage Hook
 * Manages all planner settings, now backed by Supabase (helper #5 port).
 *
 * Sync-on-cache-hit: every useState initialiser below calls
 * `peekPlannerCache(yearNumber)` to read any data already in the in-memory
 * (and localStorage-backed) cache. If the cache has the row, the very
 * first render shows real data instead of defaults. The async load below
 * still fires to refresh from Supabase; if the fresh data matches the
 * cache, React's setState bail-out means no visible re-render. If it
 * differs, the user briefly sees the cache, then it updates.
 */

import { useState, useEffect, useRef } from 'react';
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
  peekPlannerCache,
} from '../../utils/planner/storage';
import { DEFAULT_PROJECT_ID } from '../../constants/plannerStorageKeys';

const DEFAULT_TOTAL_DAYS = 84;

const DEFAULT_SORT_STATUSES = [
  'Done',
  'Scheduled',
  'Not Scheduled',
  'Blocked',
  'On Hold',
  'Abandoned',
  'Skipped',
  'Accounted',
];

/**
 * Get default column sizing based on column definitions
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

// Initialiser helpers: each takes the cached row (or null) plus the
// fallback default, and returns the right initial value for useState.
const initTotalDays = (yearRow) => {
  const v = typeof yearRow?.total_days === 'number' ? yearRow.total_days : Number(yearRow?.total_days);
  return Number.isFinite(v) && v > 0 ? v : DEFAULT_TOTAL_DAYS;
};
const initStartDate = (yearRow) => yearRow?.start_date || todayIso();
const initColumnSizing = (settingsRow, totalDays) => {
  const v = settingsRow?.column_sizing;
  if (v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length > 0) return v;
  return getDefaultColumnSizing(totalDays);
};
const initSizeScale = (settingsRow) => {
  const v = typeof settingsRow?.size_scale === 'number' ? settingsRow.size_scale : Number(settingsRow?.size_scale);
  return Number.isFinite(v) ? v : 1.0;
};
const initShow = (settingsRow, field) => {
  if (!settingsRow) return true;
  return settingsRow[field] !== false;
};
const initSortSet = (settingsRow, field) => {
  const arr = Array.isArray(settingsRow?.[field]) ? settingsRow[field] : DEFAULT_SORT_STATUSES;
  return new Set(arr);
};
const initVisibleDayColumns = (settingsRow, totalDays) => {
  const v = settingsRow?.visible_day_columns;
  if (v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length > 0) return v;
  return defaultVisibleDayColumns(totalDays);
};

export default function usePlannerStorage({ projectId = DEFAULT_PROJECT_ID, yearNumber = null } = {}) {
  // Synchronous cache peek. If anything is cached, the initialisers below
  // give the real data on the very first render. If nothing is cached,
  // they fall back to defaults and the async load swaps them in shortly.
  const initialCache = peekPlannerCache(yearNumber);
  const cachedHadData =
    initialCache.plannerSettings != null ||
    initialCache.yearRow != null ||
    initialCache.taskRows != null;

  const initialTotalDays = initTotalDays(initialCache.yearRow);

  const [totalDays, setTotalDays] = useState(initialTotalDays);
  const [columnSizing, setColumnSizing] = useState(() =>
    initColumnSizing(initialCache.plannerSettings, initialTotalDays),
  );
  const [sizeScale, setSizeScale] = useState(() => initSizeScale(initialCache.plannerSettings));
  const [startDate, setStartDate] = useState(() => initStartDate(initialCache.yearRow));
  const [showRecurring, setShowRecurring] = useState(() =>
    initShow(initialCache.plannerSettings, 'show_recurring'),
  );
  const [showSubprojects, setShowSubprojects] = useState(() =>
    initShow(initialCache.plannerSettings, 'show_subprojects'),
  );
  const [showMaxMinRows, setShowMaxMinRows] = useState(() =>
    initShow(initialCache.plannerSettings, 'show_max_min_rows'),
  );
  const [selectedSortStatuses, setSelectedSortStatuses] = useState(() =>
    initSortSet(initialCache.plannerSettings, 'sort_statuses'),
  );
  const [selectedSortPlannerStatuses, setSelectedSortPlannerStatuses] = useState(() =>
    initSortSet(initialCache.plannerSettings, 'sort_planner_statuses'),
  );
  const [taskRows, setTaskRows] = useState(() =>
    Array.isArray(initialCache.taskRows) ? initialCache.taskRows : [],
  );
  const [visibleDayColumns, setVisibleDayColumns] = useState(() =>
    initVisibleDayColumns(initialCache.plannerSettings, initialTotalDays),
  );

  // isLoaded starts true if the cache had anything for this year, so
  // dependent effects (data hydration, autosave gating) don't briefly see
  // a false → true flip on cache hit. The async load will set it again on
  // miss after the first network response.
  const [isLoaded, setIsLoaded] = useState(cachedHadData);

  // The async load fires on mount and every year change. On cache hit it
  // effectively re-reads from cache and is near-instant; on miss it does
  // the actual round-trip. Either way, results are set into state — if
  // they match what's already there, React bails out and there's no
  // visible re-render.
  const loadGen = useRef(0);
  useEffect(() => {
    const gen = ++loadGen.current;
    let cancelled = false;

    (async () => {
      try {
        const loadedTotalDays = await readTotalDays(projectId, yearNumber);
        if (cancelled || gen !== loadGen.current) return;

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
        if (cancelled || gen !== loadGen.current) return;

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
        if (!cancelled && gen === loadGen.current) {
          console.error('Failed to load planner storage', error);
          setIsLoaded(true);
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
  // cannot be overwritten by a slow Supabase round-trip on cold cache.
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
