/**
 * Task Row Data Generator Utility
 *
 * Provides utilities for creating empty task rows for the planner.
 * Used by the "Add Tasks" functionality in the Listical menu.
 */

/**
 * Creates a single empty task row
 * @param {string} id - Unique identifier for the row
 * @param {number} totalDays - Total number of day columns to create
 * @returns {Object} Empty task row object with all required fields
 */
export function createEmptyTaskRow(id, totalDays) {
  return {
    id,
    checkbox: false,
    project: '',
    subproject: '',
    status: '-',
    task: '',
    recurring: '',
    estimate: '',
    timeValue: '',
    // Create empty day columns
    ...Object.fromEntries(
      Array.from({ length: totalDays }, (_, dayIdx) => [`day-${dayIdx}`, ''])
    ),
  };
}

/**
 * Creates multiple empty task rows
 * @param {number} count - Number of rows to create
 * @param {number} totalDays - Total number of day columns to create
 * @returns {Array} Array of empty task row objects
 */
export function createEmptyTaskRows(count, totalDays) {
  return Array.from({ length: count }, (_, i) =>
    createEmptyTaskRow(`row-${Date.now()}-${i}`, totalDays)
  );
}

/**
 * Creates a template task row with pre-filled values
 * Useful for duplicating tasks or creating task templates
 * @param {string} id - Unique identifier for the row
 * @param {Object} template - Template object with fields to pre-fill
 * @param {number} totalDays - Total number of day columns to create
 * @returns {Object} Task row object with template values
 */
export function createTaskRowFromTemplate(id, template, totalDays) {
  const emptyRow = createEmptyTaskRow(id, totalDays);

  // Merge template values with empty row (template values take precedence)
  return {
    ...emptyRow,
    ...template,
    id, // Always use the provided ID
  };
}
