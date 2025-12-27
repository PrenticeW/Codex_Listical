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
  readTaskRows,
  saveTaskRows,
} from '../../utils/planner/storage';
import { DEFAULT_PROJECT_ID } from '../../constants/plannerStorageKeys';

/**
 * Hook to manage planner storage (all settings)
 * Automatically syncs with localStorage
 *
 * @param {Object} options - Hook options
 * @param {string} options.projectId - Project identifier (defaults to DEFAULT_PROJECT_ID)
 * @returns {Object} Storage state and setters
 */
export default function usePlannerStorage({ projectId = DEFAULT_PROJECT_ID } = {}) {
  // Track if this is the initial mount to avoid saving default values on load
  const isInitialMount = useRef(true);

  // Initialize from storage
  const [columnSizing, setColumnSizing] = useState(() => readColumnSizing(projectId));
  const [sizeScale, setSizeScale] = useState(() => readSizeScale(projectId));
  const [startDate, setStartDate] = useState(() => readStartDate(projectId));
  const [showRecurring, setShowRecurring] = useState(() => readShowRecurring(projectId));
  const [showSubprojects, setShowSubprojects] = useState(() => readShowSubprojects(projectId));
  const [showMaxMinRows, setShowMaxMinRows] = useState(() => readShowMaxMinRows(projectId));
  const [selectedSortStatuses, setSelectedSortStatuses] = useState(() => readSortStatuses(projectId));
  const [taskRows, setTaskRows] = useState(() => readTaskRows(projectId));

  // Mark initial mount as complete after first render
  useEffect(() => {
    isInitialMount.current = false;
  }, []);

  // Auto-save column sizing to localStorage when it changes (skip initial mount)
  useEffect(() => {
    if (!isInitialMount.current && Object.keys(columnSizing).length > 0) {
      saveColumnSizing(columnSizing, projectId);
    }
  }, [columnSizing, projectId]);

  // Auto-save size scale to localStorage when it changes (skip initial mount)
  useEffect(() => {
    if (!isInitialMount.current) {
      saveSizeScale(sizeScale, projectId);
    }
  }, [sizeScale, projectId]);

  // Auto-save start date to localStorage when it changes (skip initial mount)
  useEffect(() => {
    if (!isInitialMount.current) {
      saveStartDate(startDate, projectId);
    }
  }, [startDate, projectId]);

  // Auto-save show recurring to localStorage when it changes (skip initial mount)
  useEffect(() => {
    if (!isInitialMount.current) {
      console.log('Saving showRecurring:', showRecurring);
      saveShowRecurring(showRecurring, projectId);
    } else {
      console.log('Skipping save on initial mount, showRecurring:', showRecurring);
    }
  }, [showRecurring, projectId]);

  // Auto-save show subprojects to localStorage when it changes (skip initial mount)
  useEffect(() => {
    if (!isInitialMount.current) {
      console.log('Saving showSubprojects:', showSubprojects);
      saveShowSubprojects(showSubprojects, projectId);
    }
  }, [showSubprojects, projectId]);

  // Auto-save show max/min rows to localStorage when it changes (skip initial mount)
  useEffect(() => {
    if (!isInitialMount.current) {
      console.log('Saving showMaxMinRows:', showMaxMinRows);
      saveShowMaxMinRows(showMaxMinRows, projectId);
    }
  }, [showMaxMinRows, projectId]);

  // Auto-save sort statuses to localStorage when it changes (skip initial mount)
  useEffect(() => {
    if (!isInitialMount.current) {
      console.log('Saving selectedSortStatuses:', Array.from(selectedSortStatuses));
      saveSortStatuses(selectedSortStatuses, projectId);
    }
  }, [selectedSortStatuses, projectId]);

  // Auto-save task rows to localStorage when it changes (skip initial mount)
  useEffect(() => {
    if (!isInitialMount.current) {
      saveTaskRows(taskRows, projectId);
    }
  }, [taskRows, projectId]);

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
    taskRows,
    setTaskRows,
  };
}
