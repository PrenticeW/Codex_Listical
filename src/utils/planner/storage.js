/**
 * Centralized Storage Manager for Project Time Planner V2
 * Handles all localStorage operations with multi-project support
 */

import isBrowserEnvironment from '../isBrowserEnvironment';
import {
  COLUMN_SIZING_KEY_TEMPLATE,
  SIZE_SCALE_KEY_TEMPLATE,
  START_DATE_KEY_TEMPLATE,
  SHOW_RECURRING_KEY_TEMPLATE,
  SHOW_SUBPROJECTS_KEY_TEMPLATE,
  SHOW_MAX_MIN_ROWS_KEY_TEMPLATE,
  SORT_STATUSES_KEY_TEMPLATE,
  TASK_ROWS_KEY_TEMPLATE,
  TOTAL_DAYS_KEY_TEMPLATE,
  VISIBLE_DAY_COLUMNS_KEY_TEMPLATE,
  DEFAULT_PROJECT_ID,
} from '../../constants/plannerStorageKeys';

// ============================================================
// STORAGE KEY GENERATORS (Multi-Project Support)
// ============================================================

/**
 * Generates namespaced storage key for a specific project and year
 * @param {string} template - Key template with {projectId} placeholder
 * @param {string} projectId - Project identifier (defaults to DEFAULT_PROJECT_ID)
 * @param {number|null} yearNumber - Year number (null for year-agnostic keys)
 * @returns {string} Namespaced storage key
 */
const getProjectKey = (template, projectId = DEFAULT_PROJECT_ID, yearNumber = null) => {
  let key = template.replace('{projectId}', projectId);

  // If yearNumber is provided, insert it before the final part of the key
  // e.g., "planner-v2-project-1-task-rows" becomes "planner-v2-project-1-year-2-task-rows"
  if (yearNumber !== null && yearNumber !== undefined) {
    const parts = key.split('-');
    const lastPart = parts.pop(); // Remove the last part (e.g., "rows", "date", etc.)
    parts.push('year', yearNumber.toString(), lastPart);
    key = parts.join('-');
  }

  return key;
};

// ============================================================
// COLUMN SIZING
// ============================================================

/**
 * Reads column sizing settings for a project
 * @param {string} projectId - Project identifier (defaults to DEFAULT_PROJECT_ID)
 * @param {number|null} yearNumber - Year number (null for year-agnostic)
 * @returns {Object} Column sizing object (e.g., { "project": 120, "status": 150 })
 */
export const readColumnSizing = (projectId = DEFAULT_PROJECT_ID, yearNumber = null) => {
  if (!isBrowserEnvironment()) return {};
  try {
    const key = getProjectKey(COLUMN_SIZING_KEY_TEMPLATE, projectId, yearNumber);
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
 * @param {number|null} yearNumber - Year number (null for year-agnostic)
 */
export const saveColumnSizing = (columnSizing, projectId = DEFAULT_PROJECT_ID, yearNumber = null) => {
  if (!isBrowserEnvironment()) return;
  try {
    const key = getProjectKey(COLUMN_SIZING_KEY_TEMPLATE, projectId, yearNumber);
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
 * @param {number|null} yearNumber - Year number (null for year-agnostic)
 * @returns {number} Size scale (defaults to 1.0, range: 0.5 to 3.0)
 */
export const readSizeScale = (projectId = DEFAULT_PROJECT_ID, yearNumber = null) => {
  if (!isBrowserEnvironment()) return 1.0;
  try {
    const key = getProjectKey(SIZE_SCALE_KEY_TEMPLATE, projectId, yearNumber);
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
 * @param {number|null} yearNumber - Year number (null for year-agnostic)
 */
export const saveSizeScale = (sizeScale, projectId = DEFAULT_PROJECT_ID, yearNumber = null) => {
  if (!isBrowserEnvironment()) return;
  try {
    const key = getProjectKey(SIZE_SCALE_KEY_TEMPLATE, projectId, yearNumber);
    window.localStorage.setItem(key, sizeScale.toString());
  } catch (error) {
    console.error('Failed to save size scale', error);
  }
};

// ============================================================
// START DATE
// ============================================================

/**
 * Reads start date for a project
 * @param {string} projectId - Project identifier (defaults to DEFAULT_PROJECT_ID)
 * @param {number|null} yearNumber - Year number (null for year-agnostic)
 * @returns {string} Start date in YYYY-MM-DD format, or today's date if not set
 */
export const readStartDate = (projectId = DEFAULT_PROJECT_ID, yearNumber = null) => {
  if (!isBrowserEnvironment()) {
    const today = new Date();
    return today.toISOString().split('T')[0];
  }
  try {
    const key = getProjectKey(START_DATE_KEY_TEMPLATE, projectId, yearNumber);
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      const today = new Date();
      return today.toISOString().split('T')[0];
    }
    return raw;
  } catch (error) {
    console.error('Failed to read start date', error);
    const today = new Date();
    return today.toISOString().split('T')[0];
  }
};

/**
 * Saves start date for a project
 * @param {string} startDate - Start date in YYYY-MM-DD format
 * @param {string} projectId - Project identifier (defaults to DEFAULT_PROJECT_ID)
 * @param {number|null} yearNumber - Year number (null for year-agnostic)
 */
export const saveStartDate = (startDate, projectId = DEFAULT_PROJECT_ID, yearNumber = null) => {
  if (!isBrowserEnvironment()) return;
  try {
    const key = getProjectKey(START_DATE_KEY_TEMPLATE, projectId, yearNumber);
    window.localStorage.setItem(key, startDate);
  } catch (error) {
    console.error('Failed to save start date', error);
  }
};

// ============================================================
// UI TOGGLES (Show Recurring, Show Subprojects, Show Max/Min Rows)
// ============================================================

/**
 * Reads show recurring column setting for a project
 * @param {string} projectId - Project identifier (defaults to DEFAULT_PROJECT_ID)
 * @param {number|null} yearNumber - Year number (null for year-agnostic)
 * @returns {boolean} Show recurring column (defaults to true)
 */
export const readShowRecurring = (projectId = DEFAULT_PROJECT_ID, yearNumber = null) => {
  if (!isBrowserEnvironment()) return true;
  try {
    const key = getProjectKey(SHOW_RECURRING_KEY_TEMPLATE, projectId, yearNumber);
    const raw = window.localStorage.getItem(key);
    if (raw === null) return true;
    return raw === 'true';
  } catch (error) {
    console.error('Failed to read show recurring', error);
    return true;
  }
};

/**
 * Saves show recurring column setting for a project
 * @param {boolean} showRecurring - Show recurring column
 * @param {string} projectId - Project identifier (defaults to DEFAULT_PROJECT_ID)
 * @param {number|null} yearNumber - Year number (null for year-agnostic)
 */
export const saveShowRecurring = (showRecurring, projectId = DEFAULT_PROJECT_ID, yearNumber = null) => {
  if (!isBrowserEnvironment()) return;
  try {
    const key = getProjectKey(SHOW_RECURRING_KEY_TEMPLATE, projectId, yearNumber);
    window.localStorage.setItem(key, showRecurring.toString());
  } catch (error) {
    console.error('Failed to save show recurring', error);
  }
};

/**
 * Reads show subprojects column setting for a project
 * @param {string} projectId - Project identifier (defaults to DEFAULT_PROJECT_ID)
 * @param {number|null} yearNumber - Year number (null for year-agnostic)
 * @returns {boolean} Show subprojects column (defaults to true)
 */
export const readShowSubprojects = (projectId = DEFAULT_PROJECT_ID, yearNumber = null) => {
  if (!isBrowserEnvironment()) return true;
  try {
    const key = getProjectKey(SHOW_SUBPROJECTS_KEY_TEMPLATE, projectId, yearNumber);
    const raw = window.localStorage.getItem(key);
    if (raw === null) return true;
    return raw === 'true';
  } catch (error) {
    console.error('Failed to read show subprojects', error);
    return true;
  }
};

/**
 * Saves show subprojects column setting for a project
 * @param {boolean} showSubprojects - Show subprojects column
 * @param {string} projectId - Project identifier (defaults to DEFAULT_PROJECT_ID)
 * @param {number|null} yearNumber - Year number (null for year-agnostic)
 */
export const saveShowSubprojects = (showSubprojects, projectId = DEFAULT_PROJECT_ID, yearNumber = null) => {
  if (!isBrowserEnvironment()) return;
  try {
    const key = getProjectKey(SHOW_SUBPROJECTS_KEY_TEMPLATE, projectId, yearNumber);
    window.localStorage.setItem(key, showSubprojects.toString());
  } catch (error) {
    console.error('Failed to save show subprojects', error);
  }
};

/**
 * Reads show max/min rows setting for a project
 * @param {string} projectId - Project identifier (defaults to DEFAULT_PROJECT_ID)
 * @param {number|null} yearNumber - Year number (null for year-agnostic)
 * @returns {boolean} Show max/min rows (defaults to true)
 */
export const readShowMaxMinRows = (projectId = DEFAULT_PROJECT_ID, yearNumber = null) => {
  if (!isBrowserEnvironment()) return true;
  try {
    const key = getProjectKey(SHOW_MAX_MIN_ROWS_KEY_TEMPLATE, projectId, yearNumber);
    const raw = window.localStorage.getItem(key);
    if (raw === null) return true;
    return raw === 'true';
  } catch (error) {
    console.error('Failed to read show max/min rows', error);
    return true;
  }
};

/**
 * Saves show max/min rows setting for a project
 * @param {boolean} showMaxMinRows - Show max/min rows
 * @param {string} projectId - Project identifier (defaults to DEFAULT_PROJECT_ID)
 * @param {number|null} yearNumber - Year number (null for year-agnostic)
 */
export const saveShowMaxMinRows = (showMaxMinRows, projectId = DEFAULT_PROJECT_ID, yearNumber = null) => {
  if (!isBrowserEnvironment()) return;
  try {
    const key = getProjectKey(SHOW_MAX_MIN_ROWS_KEY_TEMPLATE, projectId, yearNumber);
    window.localStorage.setItem(key, showMaxMinRows.toString());
  } catch (error) {
    console.error('Failed to save show max/min rows', error);
  }
};

// ============================================================
// SORT STATUSES
// ============================================================

/**
 * Reads selected sort statuses for a project
 * @param {string} projectId - Project identifier (defaults to DEFAULT_PROJECT_ID)
 * @param {number|null} yearNumber - Year number (null for year-agnostic)
 * @returns {Set<string>} Set of selected status values (defaults to all sortable statuses)
 */
export const readSortStatuses = (projectId = DEFAULT_PROJECT_ID, yearNumber = null) => {
  if (!isBrowserEnvironment()) {
    return new Set(['Done', 'Scheduled', 'Not Scheduled', 'Blocked', 'On Hold', 'Abandoned']);
  }
  try {
    const key = getProjectKey(SORT_STATUSES_KEY_TEMPLATE, projectId, yearNumber);
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      return new Set(['Done', 'Scheduled', 'Not Scheduled', 'Blocked', 'On Hold', 'Abandoned']);
    }
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch (error) {
    console.error('Failed to read sort statuses', error);
    return new Set(['Done', 'Scheduled', 'Not Scheduled', 'Blocked', 'On Hold', 'Abandoned']);
  }
};

/**
 * Saves selected sort statuses for a project
 * @param {Set<string>} sortStatuses - Set of selected status values
 * @param {string} projectId - Project identifier (defaults to DEFAULT_PROJECT_ID)
 * @param {number|null} yearNumber - Year number (null for year-agnostic)
 */
export const saveSortStatuses = (sortStatuses, projectId = DEFAULT_PROJECT_ID, yearNumber = null) => {
  if (!isBrowserEnvironment()) return;
  try {
    const key = getProjectKey(SORT_STATUSES_KEY_TEMPLATE, projectId, yearNumber);
    const statusArray = Array.from(sortStatuses);
    window.localStorage.setItem(key, JSON.stringify(statusArray));
  } catch (error) {
    console.error('Failed to save sort statuses', error);
  }
};

// ============================================================
// TASK ROWS DATA
// ============================================================

/**
 * Reads task rows data for a project
 * @param {string} projectId - Project identifier (defaults to DEFAULT_PROJECT_ID)
 * @param {number|null} yearNumber - Year number (null for year-agnostic)
 * @returns {Array} Array of task row objects (empty array if not found)
 */
export const readTaskRows = (projectId = DEFAULT_PROJECT_ID, yearNumber = null) => {
  if (!isBrowserEnvironment()) return [];
  try {
    const key = getProjectKey(TASK_ROWS_KEY_TEMPLATE, projectId, yearNumber);
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error('Failed to read task rows', error);
    return [];
  }
};

/**
 * Saves task rows data for a project
 * @param {Array} taskRows - Array of task row objects
 * @param {string} projectId - Project identifier (defaults to DEFAULT_PROJECT_ID)
 * @param {number|null} yearNumber - Year number (null for year-agnostic)
 */
export const saveTaskRows = (taskRows, projectId = DEFAULT_PROJECT_ID, yearNumber = null) => {
  if (!isBrowserEnvironment()) return;
  try {
    const key = getProjectKey(TASK_ROWS_KEY_TEMPLATE, projectId, yearNumber);
    window.localStorage.setItem(key, JSON.stringify(taskRows));
  } catch (error) {
    console.error('Failed to save task rows', error);
  }
};

// ============================================================
// TOTAL DAYS
// ============================================================

/**
 * Reads total days (timeline length) for a project
 * @param {string} projectId - Project identifier (defaults to DEFAULT_PROJECT_ID)
 * @param {number|null} yearNumber - Year number (null for year-agnostic)
 * @returns {number} Total days (defaults to 84 = 12 weeks)
 */
export const readTotalDays = (projectId = DEFAULT_PROJECT_ID, yearNumber = null) => {
  if (!isBrowserEnvironment()) return 84;
  try {
    const key = getProjectKey(TOTAL_DAYS_KEY_TEMPLATE, projectId, yearNumber);
    const raw = window.localStorage.getItem(key);
    if (!raw) return 84;
    const parsed = parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 84;
  } catch (error) {
    console.error('Failed to read total days', error);
    return 84;
  }
};

/**
 * Saves total days (timeline length) for a project
 * @param {number} totalDays - Total days value
 * @param {string} projectId - Project identifier (defaults to DEFAULT_PROJECT_ID)
 * @param {number|null} yearNumber - Year number (null for year-agnostic)
 */
export const saveTotalDays = (totalDays, projectId = DEFAULT_PROJECT_ID, yearNumber = null) => {
  if (!isBrowserEnvironment()) return;
  try {
    const key = getProjectKey(TOTAL_DAYS_KEY_TEMPLATE, projectId, yearNumber);
    window.localStorage.setItem(key, totalDays.toString());
  } catch (error) {
    console.error('Failed to save total days', error);
  }
};

// ============================================================
// VISIBLE DAY COLUMNS
// ============================================================

/**
 * Reads visible day columns for a project
 * @param {string} projectId - Project identifier (defaults to DEFAULT_PROJECT_ID)
 * @param {number} totalDays - Total days to initialize if no saved state (defaults to 84)
 * @param {number|null} yearNumber - Year number (null for year-agnostic)
 * @returns {Object} Object mapping day column IDs to visibility booleans
 */
export const readVisibleDayColumns = (projectId = DEFAULT_PROJECT_ID, totalDays = 84, yearNumber = null) => {
  if (!isBrowserEnvironment()) {
    // Default: all columns visible
    const visible = {};
    for (let i = 0; i < totalDays; i++) {
      visible[`day-${i}`] = true;
    }
    return visible;
  }
  try {
    const key = getProjectKey(VISIBLE_DAY_COLUMNS_KEY_TEMPLATE, projectId, yearNumber);
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      // Default: all columns visible
      const visible = {};
      for (let i = 0; i < totalDays; i++) {
        visible[`day-${i}`] = true;
      }
      return visible;
    }
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed ? parsed : {};
  } catch (error) {
    console.error('Failed to read visible day columns', error);
    const visible = {};
    for (let i = 0; i < totalDays; i++) {
      visible[`day-${i}`] = true;
    }
    return visible;
  }
};

/**
 * Saves visible day columns for a project
 * @param {Object} visibleDayColumns - Object mapping day column IDs to visibility booleans
 * @param {string} projectId - Project identifier (defaults to DEFAULT_PROJECT_ID)
 * @param {number|null} yearNumber - Year number (null for year-agnostic)
 */
export const saveVisibleDayColumns = (visibleDayColumns, projectId = DEFAULT_PROJECT_ID, yearNumber = null) => {
  if (!isBrowserEnvironment()) return;
  try {
    const key = getProjectKey(VISIBLE_DAY_COLUMNS_KEY_TEMPLATE, projectId, yearNumber);
    window.localStorage.setItem(key, JSON.stringify(visibleDayColumns));
  } catch (error) {
    console.error('Failed to save visible day columns', error);
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
  saveTaskRows as saveLegacyTaskRows,
} from '../plannerStorage';
