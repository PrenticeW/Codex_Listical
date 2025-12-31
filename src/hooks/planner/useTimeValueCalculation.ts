/**
 * Time Value Calculation Hook
 * Handles computing timeValue from estimate column
 */

import { parseEstimateLabelToMinutes, formatMinutesToHHmm } from '../../constants/planner/rowTypes';
import type { PlannerRow } from '../../types/planner';

/**
 * Calculate timeValue from estimate
 * @param estimate - The estimate value (e.g., "2h", "30m", "1.5h")
 * @returns Formatted time value in HH.mm format
 */
export function calculateTimeValue(estimate: string | undefined): string {
  if (!estimate || estimate === '-' || estimate === 'Multi') {
    return '0.00';
  }

  const minutes = parseEstimateLabelToMinutes(estimate);
  if (minutes === null) {
    return '0.00';
  }

  return formatMinutesToHHmm(minutes);
}

/**
 * Calculate timeValue for Multi estimate by summing day columns
 * Resolves =timeValue placeholders using original estimate
 */
export function calculateMultiTimeValue(
  row: PlannerRow,
  totalDays: number,
  originalEstimate: string | undefined
): string {
  let totalMinutes = 0;

  for (let i = 0; i < totalDays; i++) {
    const dayColumnId = `day-${i}` as `day-${number}`;
    let dayValue = row[dayColumnId];

    // Handle =timeValue placeholder
    if (dayValue === '=timeValue' && originalEstimate) {
      const resolvedMinutes = parseEstimateLabelToMinutes(originalEstimate);
      if (resolvedMinutes !== null) {
        totalMinutes += resolvedMinutes;
      }
      continue;
    }

    if (dayValue && typeof dayValue === 'string') {
      const trimmedValue = dayValue.trim();

      // Parse HH:mm format
      if (trimmedValue.includes(':')) {
        const [hours, minutes] = trimmedValue.split(':').map(part => parseInt(part, 10));
        if (!isNaN(hours) && !isNaN(minutes)) {
          totalMinutes += hours * 60 + minutes;
        }
      }
      // Parse decimal hours (e.g., "2.5" = 2h 30m)
      else {
        const decimalHours = parseFloat(trimmedValue);
        if (!isNaN(decimalHours)) {
          totalMinutes += Math.round(decimalHours * 60);
        }
      }
    }
  }

  return formatMinutesToHHmm(totalMinutes);
}
