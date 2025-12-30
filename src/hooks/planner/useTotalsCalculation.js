import { useMemo } from 'react';
import { isSpecialRow } from '../../utils/planner/rowTypeChecks';
import { createDayColumnUpdates, forEachDayColumn } from '../../utils/planner/dayColumnHelpers';
import { coerceToNumber, formatNumber } from '../../utils/planner/valueNormalizers';

/**
 * Custom hook for calculating project totals
 * Sums timeValue for Scheduled and Done tasks per project
 *
 * @param {Array} computedData - The computed data array
 * @returns {Object} Object mapping project header IDs to formatted total strings
 */
export const useProjectTotals = (computedData) => {
  return useMemo(() => {
    const totals = {};
    let currentProjectHeaderId = null;

    computedData.forEach((row) => {
      // Track which project header we're under
      if (row._rowType === 'projectHeader') {
        currentProjectHeaderId = row.id;
        totals[currentProjectHeaderId] = 0;
        return;
      }

      // Reset when we encounter inbox, archive, or subproject headers - these signal end of project section
      if (row._isInboxRow || row._isArchiveRow || row._rowType === 'subprojectHeader') {
        currentProjectHeaderId = null;
        return;
      }

      // Keep context when we're still within the project section
      if (row._rowType === 'projectGeneral' || row._rowType === 'projectUnscheduled') {
        // Still within the project, don't reset
        return;
      }

      // For regular task rows under a project header
      if (currentProjectHeaderId && !isSpecialRow(row)) {
        const status = row.status || '';

        // Only count Scheduled and Done tasks
        if (status === 'Scheduled' || status === 'Done') {
          const timeValue = row.timeValue || '0.00';

          // Parse timeValue (format: "HH.mm" or "H.mm")
          const parsed = parseFloat(timeValue);
          if (!isNaN(parsed)) {
            totals[currentProjectHeaderId] += parsed;
          }
        }
      }
    });

    // Format totals to 2 decimal places
    const formattedTotals = {};
    Object.entries(totals).forEach(([key, total]) => {
      formattedTotals[key] = total.toFixed(2);
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
