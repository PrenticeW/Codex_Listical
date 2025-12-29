/**
 * Day Column Helper Utilities
 *
 * Provides helper functions for working with day columns in the planner.
 * Day columns follow the naming pattern: day-0, day-1, day-2, ..., day-N
 */

/**
 * Generate the column ID for a given day index
 * @param index - The day index (0-based)
 * @returns The column ID string (e.g., "day-0", "day-1")
 */
export const getDayColumnId = (index: number): string => {
  return `day-${index}`;
};

/**
 * Extract the day index from a day column ID
 * @param columnId - The column ID (e.g., "day-5")
 * @returns The day index or null if not a day column
 */
export const getDayIndexFromColumnId = (columnId: string): number | null => {
  const match = columnId.match(/^day-(\d+)$/);
  return match ? parseInt(match[1], 10) : null;
};

/**
 * Check if a column ID is a day column
 * @param columnId - The column ID to check
 * @returns True if the column is a day column
 */
export const isDayColumn = (columnId: string): boolean => {
  return /^day-\d+$/.test(columnId);
};

/**
 * Iterate over all day columns and execute a callback
 * @param totalDays - Total number of days
 * @param callback - Function to call for each day (receives columnId and index)
 */
export const forEachDayColumn = (
  totalDays: number,
  callback: (columnId: string, index: number) => void
): void => {
  for (let i = 0; i < totalDays; i++) {
    callback(getDayColumnId(i), i);
  }
};

/**
 * Create an object with day column updates
 * @param totalDays - Total number of days
 * @param valueFn - Function that returns the value for each day (receives index and columnId)
 * @returns Object mapping day column IDs to values
 */
export const createDayColumnUpdates = (
  totalDays: number,
  valueFn: (index: number, columnId: string) => any
): Record<string, any> => {
  const updates: Record<string, any> = {};
  forEachDayColumn(totalDays, (columnId, index) => {
    updates[columnId] = valueFn(index, columnId);
  });
  return updates;
};

/**
 * Initialize empty day columns for a row
 * @param totalDays - Total number of days
 * @param defaultValue - Default value for each day column (default: '')
 * @returns Object with empty day columns
 */
export const createEmptyDayColumns = (
  totalDays: number,
  defaultValue: any = ''
): Record<string, any> => {
  return createDayColumnUpdates(totalDays, () => defaultValue);
};

/**
 * Sum all numeric values in day columns for a row
 * @param row - The row to sum
 * @param totalDays - Total number of days
 * @param coerceNumber - Optional function to coerce values to numbers
 * @returns The sum of all day column values
 */
export const sumDayColumns = (
  row: any,
  totalDays: number,
  coerceNumber?: (value: any) => number
): number => {
  let sum = 0;
  forEachDayColumn(totalDays, (columnId) => {
    const value = row[columnId];
    const numValue = coerceNumber ? coerceNumber(value) : parseFloat(value) || 0;
    sum += numValue;
  });
  return sum;
};

/**
 * Get all day column IDs as an array
 * @param totalDays - Total number of days
 * @returns Array of day column IDs
 */
export const getAllDayColumnIds = (totalDays: number): string[] => {
  const columnIds: string[] = [];
  forEachDayColumn(totalDays, (columnId) => {
    columnIds.push(columnId);
  });
  return columnIds;
};

/**
 * Map over day columns and return an array of results
 * @param totalDays - Total number of days
 * @param mapFn - Function to map each day column (receives columnId and index)
 * @returns Array of mapped values
 */
export const mapDayColumns = <T>(
  totalDays: number,
  mapFn: (columnId: string, index: number) => T
): T[] => {
  const results: T[] = [];
  forEachDayColumn(totalDays, (columnId, index) => {
    results.push(mapFn(columnId, index));
  });
  return results;
};

/**
 * Check if a row has any values in day columns
 * @param row - The row to check
 * @param totalDays - Total number of days
 * @returns True if any day column has a truthy value
 */
export const hasAnyDayColumnValue = (row: any, totalDays: number): boolean => {
  for (let i = 0; i < totalDays; i++) {
    const columnId = getDayColumnId(i);
    if (row[columnId]) {
      return true;
    }
  }
  return false;
};

/**
 * Clear all day column values in a row
 * @param row - The row to clear
 * @param totalDays - Total number of days
 * @param clearValue - Value to set (default: '')
 * @returns New row object with cleared day columns
 */
export const clearDayColumns = (
  row: any,
  totalDays: number,
  clearValue: any = ''
): any => {
  return {
    ...row,
    ...createEmptyDayColumns(totalDays, clearValue),
  };
};
