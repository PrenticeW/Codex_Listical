/**
 * Planner Storage Hook
 * Manages column sizing and size scale with localStorage persistence
 */

import { useState, useEffect } from 'react';
import {
  readColumnSizing,
  saveColumnSizing,
  readSizeScale,
  saveSizeScale,
} from '../../utils/planner/storage';
import { DEFAULT_PROJECT_ID } from '../../constants/plannerStorageKeys';

/**
 * Hook to manage planner storage (column sizing and size scale)
 * Automatically syncs with localStorage
 *
 * @param {Object} options - Hook options
 * @param {string} options.projectId - Project identifier (defaults to DEFAULT_PROJECT_ID)
 * @returns {Object} Storage state and setters
 */
export default function usePlannerStorage({ projectId = DEFAULT_PROJECT_ID } = {}) {
  // Initialize from storage
  const [columnSizing, setColumnSizing] = useState(() => readColumnSizing(projectId));
  const [sizeScale, setSizeScale] = useState(() => readSizeScale(projectId));

  // Auto-save column sizing to localStorage when it changes
  useEffect(() => {
    if (Object.keys(columnSizing).length > 0) {
      saveColumnSizing(columnSizing, projectId);
    }
  }, [columnSizing, projectId]);

  // Auto-save size scale to localStorage when it changes
  useEffect(() => {
    saveSizeScale(sizeScale, projectId);
  }, [sizeScale, projectId]);

  return {
    columnSizing,
    setColumnSizing,
    sizeScale,
    setSizeScale,
  };
}
