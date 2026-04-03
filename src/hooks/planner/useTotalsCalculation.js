import { useMemo } from 'react';
import { isSpecialRow } from '../../utils/planner/rowTypeChecks';
import { createDayColumnUpdates, forEachDayColumn } from '../../utils/planner/dayColumnHelpers';
import { coerceToNumber, formatNumber } from '../../utils/planner/valueNormalizers';
import { formatMinutesToHHmm } from '../../constants/planner/rowTypes';

/**
 * Parse HH.mm format (e.g. "2.30" = 2h 30m) to total minutes
 */
function parseHHmmToMinutes(value) {
  if (!value || value === '0.00') return 0;
  const parsed = parseFloat(value);
  if (isNaN(parsed)) return 0;
  const hours = Math.floor(parsed);
  const mins = Math.round((parsed - hours) * 100);
  return hours * 60 + mins;
}

/**
 * Custom hook for calculating project totals
 * Sums timeValue for Scheduled and Done tasks per project
 *
 * @param {Array} computedData - The computed data array
 * @returns {Object} Object mapping project header IDs to formatted total strings
 */
export const useProjectTotals = (computedData) => {
  return useMemo(() => {
    const totalsMinutes = {};
    let currentProjectHeaderId = null;

    computedData.forEach((row) => {
      // Track which project header we're under
      if (row._rowType === 'projectHeader') {
        currentProjectHeaderId = row.id;
        totalsMinutes[currentProjectHeaderId] = 0;
        return;
      }

      // Reset only when we leave the project entirely
      if (row._isInboxRow || row._isArchiveRow) {
        currentProjectHeaderId = null;
        return;
      }

      // Skip all structural rows without resetting project context
      if (
        row._rowType === 'subprojectHeader' ||
        row._rowType === 'subprojectGeneral' ||
        row._rowType === 'subprojectUnscheduled' ||
        row._rowType === 'projectGeneral' ||
        row._rowType === 'projectUnscheduled'
      ) {
        return;
      }

      // For regular task rows under a project header
      if (currentProjectHeaderId && !isSpecialRow(row)) {
        const status = row.status || '';

        // Only count Scheduled and Done tasks
        if (status === 'Scheduled' || status === 'Done') {
          totalsMinutes[currentProjectHeaderId] += parseHHmmToMinutes(row.timeValue);
        }
      }
    });

    // Format totals back to HH.mm
    const formattedTotals = {};
    Object.entries(totalsMinutes).forEach(([key, minutes]) => {
      formattedTotals[key] = formatMinutesToHHmm(minutes);
    });

    return formattedTotals;
  }, [computedData]);
};

/**
 * Custom hook for calculating daily totals
 * Sums values in day columns for all regular task rows
 *
 * @param {Object} params - Configuration object
 * @param {Array} params.computedData - The computed data array
 * @param {number} params.totalDays - Total number of days
 * @returns {Object} Object mapping day column IDs to formatted total strings
 */
export const useDailyTotals = ({ computedData, totalDays }) => {
  return useMemo(() => {
    // Initialize all day columns to 0
    const totals = createDayColumnUpdates(totalDays, () => 0);

    // Sum up values from all regular task rows
    computedData.forEach((row) => {
      // Skip special rows and project rows - only count regular task rows
      if (isSpecialRow(row)) {
        return;
      }

      // For each day column, add the numeric value to the total
      forEachDayColumn(totalDays, (dayColumnId) => {
        const value = row[dayColumnId];
        const numericValue = coerceToNumber(value);

        if (numericValue !== null) {
          totals[dayColumnId] += numericValue;
        }
      });
    });

    // Format totals to 2 decimal places
    return createDayColumnUpdates(totalDays, (i, columnId) =>
      formatNumber(totals[columnId], 2)
    );
  }, [computedData, totalDays]);
};

export default { useProjectTotals, useDailyTotals };
