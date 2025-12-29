/**
 * Value Normalization Utilities
 *
 * Provides helper functions for normalizing and standardizing values
 * throughout the planner application.
 */

/**
 * Normalize a value to handle empty strings and null/undefined
 * @param value - The value to normalize
 * @param defaultValue - The default value to return if value is empty (default: '-')
 * @returns The normalized value
 */
export const normalizeValue = (value: any, defaultValue: string = '-'): string => {
  if (value === null || value === undefined) {
    return defaultValue;
  }
  if (typeof value === 'string' && value.trim() === '') {
    return defaultValue;
  }
  return String(value);
};

/**
 * Get normalized value from a row for a specific column
 * Used for filtering and comparisons
 * @param row - The row object
 * @param columnId - The column ID
 * @param defaultValue - The default value if empty (default: '-')
 * @returns The normalized column value
 */
export const getNormalizedColumnValue = (
  row: any,
  columnId: string,
  defaultValue: string = '-'
): string => {
  return normalizeValue(row[columnId], defaultValue);
};

/**
 * Normalize a project key for case-insensitive matching
 * @param key - The project key (name or nickname)
 * @returns Lowercase, trimmed key
 */
export const normalizeProjectKey = (key: string | null | undefined): string => {
  if (!key) return '';
  return String(key).toLowerCase().trim();
};

/**
 * Coerce a value to a number, handling various input types
 * @param value - The value to coerce
 * @returns The numeric value, or 0 if conversion fails
 */
export const coerceToNumber = (value: any): number => {
  // Handle null/undefined
  if (value === null || value === undefined) {
    return 0;
  }

  // Handle strings
  if (typeof value === 'string') {
    const trimmed = value.trim();
    // Empty strings and dashes become 0
    if (trimmed === '' || trimmed === '-') {
      return 0;
    }
    // Try to parse as float
    const parsed = parseFloat(trimmed);
    return isNaN(parsed) ? 0 : parsed;
  }

  // Handle numbers
  if (typeof value === 'number') {
    return isNaN(value) ? 0 : value;
  }

  // Handle booleans (true = 1, false = 0)
  if (typeof value === 'boolean') {
    return value ? 1 : 0;
  }

  // Default to 0 for any other type
  return 0;
};

/**
 * Format a number to a fixed number of decimal places
 * @param value - The number to format
 * @param decimals - Number of decimal places (default: 2)
 * @returns Formatted string
 */
export const formatNumber = (value: number, decimals: number = 2): string => {
  if (isNaN(value)) return '0.00';
  return value.toFixed(decimals);
};

/**
 * Normalize a status value (handles empty as 'Not Scheduled')
 * @param status - The status value
 * @returns Normalized status
 */
export const normalizeStatus = (status: any): string => {
  const normalized = normalizeValue(status, 'Not Scheduled');
  return normalized === '-' ? 'Not Scheduled' : normalized;
};

/**
 * Check if a value is considered "empty" (null, undefined, empty string, or dash)
 * @param value - The value to check
 * @returns True if the value is empty
 */
export const isEmpty = (value: any): boolean => {
  if (value === null || value === undefined) {
    return true;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed === '' || trimmed === '-';
  }
  return false;
};

/**
 * Check if a value is not empty
 * @param value - The value to check
 * @returns True if the value is not empty
 */
export const isNotEmpty = (value: any): boolean => {
  return !isEmpty(value);
};

/**
 * Normalize a recurring status
 * @param recurring - The recurring value
 * @returns 'Recurring' or 'Not Recurring'
 */
export const normalizeRecurring = (recurring: any): string => {
  const normalized = normalizeValue(recurring, 'Not Recurring');
  return normalized === 'Recurring' ? 'Recurring' : 'Not Recurring';
};

/**
 * Convert a string to a safe filter key (lowercase, trimmed, handles empty)
 * @param value - The value to convert
 * @returns Safe filter key
 */
export const toFilterKey = (value: any): string => {
  return normalizeValue(value, '-').toLowerCase().trim();
};
