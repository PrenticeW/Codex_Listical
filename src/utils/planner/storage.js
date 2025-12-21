/**
 * Centralized Storage Manager for Project Time Planner V2
 * Handles all localStorage operations with multi-project support
 */

import isBrowserEnvironment from '../isBrowserEnvironment';
import {
  COLUMN_SIZING_KEY_TEMPLATE,
  SIZE_SCALE_KEY_TEMPLATE,
  DEFAULT_PROJECT_ID,
} from '../../constants/plannerStorageKeys';

// ============================================================
// STORAGE KEY GENERATORS (Multi-Project Support)
// ============================================================

/**
 * Generates namespaced storage key for a specific project
 * @param {string} template - Key template with {projectId} placeholder
 * @param {string} projectId - Project identifier (defaults to DEFAULT_PROJECT_ID)
 * @returns {string} Namespaced storage key
 */
const getProjectKey = (template, projectId = DEFAULT_PROJECT_ID) => {
  return template.replace('{projectId}', projectId);
};

// ============================================================
// COLUMN SIZING
// ============================================================

/**
 * Reads column sizing settings for a project
 * @param {string} projectId - Project identifier (defaults to DEFAULT_PROJECT_ID)
 * @returns {Object} Column sizing object (e.g., { "project": 120, "status": 150 })
 */
export const readColumnSizing = (projectId = DEFAULT_PROJECT_ID) => {
  if (!isBrowserEnvironment()) return {};
  try {
    const key = getProjectKey(COLUMN_SIZING_KEY_TEMPLATE, projectId);
    const raw = window.localStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed ? parsed : {};
  } catch (error) {
    console.error('Failed to read column sizing', error);
    return {};
  }
};

/**
 * Saves column sizing settings for a project
 * @param {Object} columnSizing - Column sizing object
 * @param {string} projectId - Project identifier (defaults to DEFAULT_PROJECT_ID)
 */
export const saveColumnSizing = (columnSizing, projectId = DEFAULT_PROJECT_ID) => {
  if (!isBrowserEnvironment()) return;
  try {
    const key = getProjectKey(COLUMN_SIZING_KEY_TEMPLATE, projectId);
    window.localStorage.setItem(key, JSON.stringify(columnSizing));
  } catch (error) {
    console.error('Failed to save column sizing', error);
  }
};

// ============================================================
// SIZE SCALE
// ============================================================

/**
 * Reads UI size scale for a project
 * @param {string} projectId - Project identifier (defaults to DEFAULT_PROJECT_ID)
 * @returns {number} Size scale (defaults to 1.0, range: 0.5 to 3.0)
 */
export const readSizeScale = (projectId = DEFAULT_PROJECT_ID) => {
  if (!isBrowserEnvironment()) return 1.0;
  try {
    const key = getProjectKey(SIZE_SCALE_KEY_TEMPLATE, projectId);
    const raw = window.localStorage.getItem(key);
    if (!raw) return 1.0;
    const parsed = parseFloat(raw);
    return Number.isFinite(parsed) ? parsed : 1.0;
  } catch (error) {
    console.error('Failed to read size scale', error);
    return 1.0;
  }
};

/**
 * Saves UI size scale for a project
 * @param {number} sizeScale - Size scale value (0.5 to 3.0)
 * @param {string} projectId - Project identifier (defaults to DEFAULT_PROJECT_ID)
 */
export const saveSizeScale = (sizeScale, projectId = DEFAULT_PROJECT_ID) => {
  if (!isBrowserEnvironment()) return;
  try {
    const key = getProjectKey(SIZE_SCALE_KEY_TEMPLATE, projectId);
    window.localStorage.setItem(key, sizeScale.toString());
  } catch (error) {
    console.error('Failed to save size scale', error);
  }
};

// ============================================================
// RE-EXPORT EXISTING STORAGE FUNCTIONS (Backward Compatibility)
// ============================================================

// Re-export existing storage functions from plannerStorage.js
// These maintain backward compatibility with existing code
export {
  readStoredSettings,
  saveSettings,
  readStoredTaskRows,
  saveTaskRows,
} from '../plannerStorage';
