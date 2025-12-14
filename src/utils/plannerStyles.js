/**
 * Planner Style Helper Functions
 * Functions for generating styles based on state and values
 */

import { STATUS_COLOR_MAP, ROW_LABEL_BASE_STYLE } from '../constants/plannerConstants';

/**
 * Gets the background and text color for a status value
 * @param {string} status - The status value
 * @returns {Object} Style object with backgroundColor and color
 */
export const getStatusColorStyle = (status) => {
  const colors = STATUS_COLOR_MAP[status] || { bg: '#ffffff', text: '#000000' };
  return { backgroundColor: colors.bg, color: colors.text };
};

/**
 * Gets the background and text color for a project select dropdown
 * @param {string} value - The selected project value
 * @returns {Object} Style object with backgroundColor and color
 */
export const getProjectSelectStyle = (value) => {
  const isDash = !value || value === '-';
  return {
    backgroundColor: isDash ? '#ffffff' : '#e5e5e5',
    color: '#000000',
  };
};

/**
 * Applies row label base style to an existing style object
 * @param {Object} style - The existing style object
 * @returns {Object} Merged style object with row label styles
 */
export const applyRowLabelStyle = (style = {}) => ({ ...style, ...ROW_LABEL_BASE_STYLE });

/**
 * Normalizes a project key for comparison (lowercase, trimmed)
 * @param {string} name - The project name
 * @returns {string} Normalized project key
 */
export const normalizeProjectKey = (name) => (name ?? '').trim().toLowerCase();
