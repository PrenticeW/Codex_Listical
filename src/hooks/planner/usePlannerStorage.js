/**
 * Planner Storage Hook
 * Manages all planner settings with localStorage persistence
 */

import { useState, useEffect, useRef } from 'react';
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
 * Hook to manage planner storage (all settings)
 * Automatically syncs with localStorage
 *
 * @param {Object} options - Hook options
 * @param {string} options.projectId - Project identifier (defaults to DEFAULT_PROJECT_ID)
 * @param {number|null} options.yearNumber - Year number for year-based storage (null for legacy)
 * @returns {Object} Storage state and setters
 */
export default function usePlannerStorage({ projectId = DEFAULT_PROJECT_ID, yearNumber = null } = {}) {
  // Track if this is the initial mount to avoid saving default values on load
  const isInitialMount = useRef(true);

  // Initialize totalDays first since it's needed for visibleDayColumns
  const [totalDays, setTotalDays] = useState(() => readTotalDays(projectId, yearNumber));

  // Initialize from storage
  const [columnSizing, setColumnSizing] = useState(() => readColumnSizing(projectId, yearNumber));
  const [sizeScale, setSizeScale] = useState(() => readSizeScale(projectId, yearNumber));
  const [startDate, setStartDate] = useState(() => readStartDate(projectId, yearNumber));
  const [showRecurring, setShowRecurring] = useState(() => readShowRecurring(projectId, yearNumber));
  const [showSubprojects, setShowSubprojects] = useState(() => readShowSubprojects(projectId, yearNumber));
  const [showMaxMinRows, setShowMaxMinRows] = useState(() => readShowMaxMinRows(projectId, yearNumber));
  const [selectedSortStatuses, setSelectedSortStatuses] = useState(() => readSortStatuses(projectId, yearNumber));
  const [selectedSortPlannerStatuses, setSelectedSortPlannerStatuses] = useState(() => readSortPlannerStatuses(projectId, yearNumber));
  const [taskRows, setTaskRows] = useState(() => readTaskRows(projectId, yearNumber));
  const [visibleDayColumns, setVisibleDayColumns] = useState(() => readVisibleDayColumns(projectId, totalDays, yearNumber));

  // Mark initial mount as complete after first render
  useEffect(() => {
    isInitialMount.current = false;
  }, []);

  // Auto-save column sizing to localStorage when it changes (skip initial mount)
  useEffect(() => {
    if (!isInitialMount.current && Object.keys(columnSizing).length > 0) {
      saveColumnSizing(columnSizing, projectId, yearNumber);
    }
  }, [columnSizing, projectId, yearNumber]);

  // Auto-save size scale to localStorage when it changes (skip initial mount)
  useEffect(() => {
    if (!isInitialMount.current) {
      saveSizeScale(sizeScale, projectId, yearNumber);
    }
  }, [sizeScale, projectId, yearNumber]);

  // Auto-save start date to localStorage when it changes (skip initial mount)
  useEffect(() => {
    if (!isInitialMount.current) {
      saveStartDate(startDate, projectId, yearNumber);
    }
  }, [startDate, projectId, yearNumber]);

  // Auto-save show recurring to localStorage when it changes (skip initial mount)
  useEffect(() => {
    if (!isInitialMount.current) {
      saveShowRecurring(showRecurring, projectId, yearNumber);
    }
  }, [showRecurring, projectId, yearNumber]);

  // Auto-save show subprojects to localStorage when it changes (skip initial mount)
  useEffect(() => {
    if (!isInitialMount.current) {
      saveShowSubprojects(showSubprojects, projectId, yearNumber);
    }
  }, [showSubprojects, projectId, yearNumber]);

  // Auto-save show max/min rows to localStorage when it changes (skip initial mount)
  useEffect(() => {
    if (!isInitialMount.current) {
      saveShowMaxMinRows(showMaxMinRows, projectId, yearNumber);
    }
  }, [showMaxMinRows, projectId, yearNumber]);

  // Auto-save sort statuses to localStorage when it changes (skip initial mount)
  useEffect(() => {
    if (!isInitialMount.current) {
      saveSortStatuses(selectedSortStatuses, projectId, yearNumber);
    }
  }, [selectedSortStatuses, projectId, yearNumber]);

  // Auto-save sort planner statuses to localStorage when it changes (skip initial mount)
  useEffect(() => {
    if (!isInitialMount.current) {
      saveSortPlannerStatuses(selectedSortPlannerStatuses, projectId, yearNumber);
    }
  }, [selectedSortPlannerStatuses, projectId, yearNumber]);

  // Auto-save task rows to localStorage when it changes (skip initial mount)
  useEffect(() => {
    if (!isInitialMount.current) {
      saveTaskRows(taskRows, projectId, yearNumber);
    }
  }, [taskRows, projectId, yearNumber]);

  // Auto-save total days to localStorage when it changes (skip initial mount)
  useEffect(() => {
    if (!isInitialMount.current) {
      saveTotalDays(totalDays, projectId, yearNumber);
    }
  }, [totalDays, projectId, yearNumber]);

  // Auto-save visible day columns to localStorage when it changes (skip initial mount)
  useEffect(() => {
    if (!isInitialMount.current && Object.keys(visibleDayColumns).length > 0) {
      saveVisibleDayColumns(visibleDayColumns, projectId, yearNumber);
    }
  }, [visibleDayColumns, projectId, yearNumber]);

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
