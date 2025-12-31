/**
 * Habit Pattern Detection Hook
 * Detects when a task has habit-like patterns (multiple entries per week)
 * and auto-sets estimate to "Multi"
 */

import type { PlannerRow } from '../../types/planner';

/**
 * Check if a day column value is valid numeric
 */
function isValidNumericValue(value: string | undefined): boolean {
  if (!value || typeof value !== 'string') return false;

  const trimmedValue = value.trim();
  if (trimmedValue === '') return false;

  // Special case: =timeValue placeholder counts as valid
  if (trimmedValue === '=timeValue') {
    return true;
  }

  // Check HH:mm format
  if (trimmedValue.includes(':')) {
    const [hours, minutes] = trimmedValue.split(':').map(part => parseInt(part, 10));
    return !isNaN(hours) && !isNaN(minutes) && (hours > 0 || minutes > 0);
  }

  // Check decimal hours
  const num = parseFloat(trimmedValue);
  return !isNaN(num) && num > 0;
}

/**
 * Detect if row has habit pattern (>1 numeric value in any week)
 * @param row - The planner row to check
 * @param totalDays - Total number of day columns
 * @returns true if habit pattern detected
 */
export function detectHabitPattern(row: PlannerRow, totalDays: number): boolean {
  const numWeeks = Math.ceil(totalDays / 7);

  for (let weekIndex = 0; weekIndex < numWeeks; weekIndex++) {
    let numericValuesInWeek = 0;
    const weekStart = weekIndex * 7;
    const weekEnd = Math.min(weekStart + 7, totalDays);

    for (let i = weekStart; i < weekEnd; i++) {
      const dayColumnId = `day-${i}` as `day-${number}`;
      const dayValue = row[dayColumnId];

      if (isValidNumericValue(dayValue as string)) {
        numericValuesInWeek++;
      }
    }

    // If more than 1 numeric value in this week, it's a habit pattern
    if (numericValuesInWeek > 1) {
      return true;
    }
  }

  return false;
}

/**
 * Determine if estimate should be "Multi" based on habit pattern
 * Preserves original estimate for later use in timeValue calculation
 */
export function getEstimateWithHabitCheck(
  row: PlannerRow,
  totalDays: number
): { estimate: string | undefined; shouldStoreOriginal: boolean } {
  const currentEstimate = row.estimate;
  const hasHabitPattern = detectHabitPattern(row, totalDays);

  if (hasHabitPattern && currentEstimate !== 'Multi') {
    return {
      estimate: 'Multi',
      shouldStoreOriginal: true,
    };
  }

  return {
    estimate: currentEstimate,
    shouldStoreOriginal: false,
  };
}
