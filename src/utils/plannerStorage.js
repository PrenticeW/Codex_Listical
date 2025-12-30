/**
 * Planner Storage Utilities
 * Functions for reading and writing planner data to storage
 */

import storage from '../lib/storageService';
import { SETTINGS_STORAGE_KEY, TASK_ROWS_STORAGE_KEY, TASK_ROW_TYPES } from '../constants/plannerConstants';

/**
 * Reads stored planner settings from storage
 * @returns {Object|null} Settings object or null if not found/invalid
 */
export const readStoredSettings = () => {
  try {
    const parsed = storage.getJSON(SETTINGS_STORAGE_KEY, null);
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      columnWidths: typeof parsed.columnWidths === 'object' && parsed.columnWidths ? parsed.columnWidths : {},
      startDate: typeof parsed.startDate === 'string' ? parsed.startDate : '',
      showRecurring: typeof parsed.showRecurring === 'boolean' ? parsed.showRecurring : true,
      showSubprojects: typeof parsed.showSubprojects === 'boolean' ? parsed.showSubprojects : true,
    };
  } catch (error) {
    console.error('Failed to read Listical settings', error);
    return null;
  }
};

/**
 * Reads stored task rows from storage
 * @returns {Object} Task rows data object (empty object if not found)
 */
export const readStoredTaskRows = () => {
  try {
    const parsed = storage.getJSON(TASK_ROWS_STORAGE_KEY, {});
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed;
  } catch (error) {
    console.error('Failed to read task rows', error);
    return {};
  }
};

/**
 * Saves planner settings to storage
 * @param {Object} settings - Settings object with columnWidths, startDate, showRecurring, showSubprojects
 */
export const saveSettings = (settings) => {
  try {
    storage.setJSON(SETTINGS_STORAGE_KEY, settings);
  } catch (error) {
    console.error('Failed to save Listical settings', error);
  }
};

/**
 * Saves task rows to storage (only rows with user interaction)
 * @param {Array} rows - Array of row objects to save
 */
export const saveTaskRows = (rows) => {
  try {
    // Only save task rows with user interaction
    const taskRowsData = {};
    rows.forEach((row) => {
      if (TASK_ROW_TYPES.has(row.type) && row.hasUserInteraction) {
        taskRowsData[row.id] = {
          taskName: row.taskName,
          projectSelection: row.projectSelection,
          subprojectSelection: row.subprojectSelection,
          status: row.status,
          estimate: row.estimate,
          timeValue: row.timeValue,
          recurring: row.recurring,
          dayEntries: row.dayEntries,
        };
      }
    });
    storage.setJSON(TASK_ROWS_STORAGE_KEY, taskRowsData);
  } catch (error) {
    console.error('Failed to save task rows', error);
  }
};
