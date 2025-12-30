import { useMemo, useEffect } from 'react';
import type { UseComputedDataReturn, PlannerRow } from '../../types/planner';
import { parseEstimateLabelToMinutes, formatMinutesToHHmm } from '../../constants/planner/rowTypes';

/**
 * Hook to compute derived data from raw planner data
 *
 * This hook handles all data transformations including:
 * - Computing timeValue from estimate column
 * - Auto-updating status based on task content and day column values
 * - Habit tracker: Auto-setting estimate to "Multi" when >1 numeric value exists in any week
 *   and computing timeValue (column H) as the sum of all day column values
 * - Replacing "=timeValue" placeholders with actual timeValue
 * - Assigning parentGroupId to tasks based on their position under project sections
 * - Syncing computed status and estimate changes back to the source data
 *
 * CRITICAL: This hook includes a sync effect that writes computed status and estimate
 * changes back to the source data. This creates a controlled circular dependency where:
 * data → computedData → status/estimate sync effect → data (with new status/estimate)
 *
 * @param data - The source planner data
 * @param setData - Setter for the source data (needed for status/estimate sync)
 * @param totalDays - Number of day columns
 * @returns Object with computedData
 */
export default function useComputedData({
  data,
  setData,
  totalDays,
}: {
  data: PlannerRow[];
  setData: React.Dispatch<React.SetStateAction<PlannerRow[]>>;
  totalDays: number;
}): UseComputedDataReturn {
  const computedData = useMemo(() => {
    let currentProjectGroupId: string | null = null;

    const result = data.map(row => {
      // Track current project group as we iterate
      if (row._rowType === 'projectHeader') {
        currentProjectGroupId = row.groupId || null;
      }

      // When we hit Inbox or Archive, clear the project group
      if (row._isInboxRow || row._rowType === 'archiveHeader') {
        currentProjectGroupId = null;
      }

      // Skip special rows (first 7 rows), project rows, and subproject rows - they don't need computation
      // BUT: preserve their existing parentGroupId if they have one
      if (row._isMonthRow || row._isWeekRow || row._isDayRow ||
          row._isDayOfWeekRow || row._isDailyMinRow || row._isDailyMaxRow || row._isFilterRow ||
          row._isInboxRow || row._isArchiveRow ||
          row._rowType === 'projectHeader' || row._rowType === 'projectGeneral' || row._rowType === 'projectUnscheduled' ||
          row._rowType === 'subprojectHeader' || row._rowType === 'subprojectGeneral' || row._rowType === 'subprojectUnscheduled') {
        return row;
      }

      // For regular task rows, compute timeValue from estimate
      let estimate = row.estimate;
      let timeValue: string | undefined;

      // Store the original estimate BEFORE it was EVER changed to Multi
      // This is used to resolve =timeValue placeholders during Multi summation
      // If the row has _originalEstimate stored, use that; otherwise use current estimate
      const originalEstimate = row._originalEstimate || estimate;

      // Habit tracker: Check if row has > 1 numeric value in any week
      // If true, auto-set estimate to "Multi"
      let hasHabitPattern = false;
      const numWeeks = Math.ceil(totalDays / 7);

      for (let weekIndex = 0; weekIndex < numWeeks; weekIndex++) {
        let numericValuesInWeek = 0;
        const weekStart = weekIndex * 7;
        const weekEnd = Math.min(weekStart + 7, totalDays);
        const weekValues: string[] = [];

        for (let i = weekStart; i < weekEnd; i++) {
          const dayColumnId = `day-${i}` as `day-${number}`;
          const dayValue = row[dayColumnId];

          // Check if the value is numeric (handle both HH:mm format, decimal hours, and =timeValue placeholder)
          if (dayValue && typeof dayValue === 'string' && dayValue.trim() !== '') {
            const trimmedValue = dayValue.trim();
            let isValidNumeric = false;

            // Special case: =timeValue placeholder counts as a valid entry
            if (trimmedValue === '=timeValue') {
              isValidNumeric = true;
            }
            // Check if it's in HH:mm format
            else if (trimmedValue.includes(':')) {
              const [hours, minutes] = trimmedValue.split(':').map(part => parseInt(part, 10));
              if (!isNaN(hours) && !isNaN(minutes) && (hours > 0 || minutes > 0)) {
                isValidNumeric = true;
              }
            }
            // Assume it's decimal hours
            else {
              const numValue = parseFloat(trimmedValue);
              if (!isNaN(numValue) && numValue > 0) {
                isValidNumeric = true;
              }
            }

            if (isValidNumeric) {
              numericValuesInWeek++;
              weekValues.push(`day-${i}:${trimmedValue}`);
            }
          }
        }

        // If this week has more than 1 numeric value, it's a habit pattern
        if (numericValuesInWeek > 1) {
          hasHabitPattern = true;
          break;
        }
      }

      // Auto-set estimate to "Multi" if habit pattern detected
      if (hasHabitPattern && estimate !== 'Multi') {
        estimate = 'Multi';
      }

      // Clear _originalEstimate if no longer in Multi mode
      // This happens when user manually changes estimate or deletes values
      let originalEstimateToStore = row._originalEstimate;
      if (estimate !== 'Multi' && estimate !== 'Custom') {
        // User changed estimate to a regular value, clear the stored original
        originalEstimateToStore = undefined;
      } else if (estimate === 'Multi' && !originalEstimateToStore) {
        // Store _originalEstimate if we just changed to Multi and don't have it yet
        // Use the current row.estimate (before we changed it to Multi in this computation)
        // This preserves the original value before any Multi conversion
        originalEstimateToStore = row.estimate;
      }

      // Compute timeValue from ORIGINAL estimate (before it was potentially changed to Multi)
      // This is needed to resolve =timeValue placeholders
      const originalEstimateMinutes = parseEstimateLabelToMinutes(originalEstimate);
      const originalEstimateTimeValue = formatMinutesToHHmm(originalEstimateMinutes);

      // If estimate is "Multi" or "Custom", calculate timeValue as sum of all day columns
      if (estimate === 'Multi' || estimate === 'Custom') {
        // Sum all numeric values across all day columns
        // For =timeValue placeholders, use the originalEstimateTimeValue
        let totalMinutes = 0;

        for (let i = 0; i < totalDays; i++) {
          const dayColumnId = `day-${i}` as `day-${number}`;
          let dayValue = row[dayColumnId];

          // Parse numeric values (handle HH:mm format, decimal hours, and =timeValue placeholder)
          if (dayValue && typeof dayValue === 'string' && dayValue.trim() !== '') {
            const trimmedValue = dayValue.trim();

            // Special case: =timeValue placeholder - use the originalEstimateTimeValue
            if (trimmedValue === '=timeValue') {
              // Parse originalEstimateTimeValue (in HH.mm format) to minutes
              const parts = originalEstimateTimeValue.split('.');
              if (parts.length === 2) {
                const hours = parseInt(parts[0], 10);
                const mins = parseInt(parts[1], 10);
                if (!isNaN(hours) && !isNaN(mins)) {
                  totalMinutes += hours * 60 + mins;
                }
              }
            }
            // Check if it's in HH:mm format (colon-separated)
            else if (trimmedValue.includes(':')) {
              const [hours, minutes] = trimmedValue.split(':').map(part => parseInt(part, 10));
              if (!isNaN(hours) && !isNaN(minutes)) {
                totalMinutes += hours * 60 + minutes;
              }
            }
            // Check if it's in HH.mm format (period-separated, used by formatMinutesToHHmm)
            else if (trimmedValue.includes('.')) {
              const parts = trimmedValue.split('.');
              if (parts.length === 2) {
                const hours = parseInt(parts[0], 10);
                const mins = parseInt(parts[1], 10);
                if (!isNaN(hours) && !isNaN(mins)) {
                  totalMinutes += hours * 60 + mins;
                }
              }
            }
            // Otherwise, assume it's decimal hours (e.g., "1.5" means 1.5 hours)
            else {
              const numValue = parseFloat(trimmedValue);
              if (!isNaN(numValue)) {
                totalMinutes += numValue * 60;
              }
            }
          }
        }

        // Format total as HH:mm
        timeValue = formatMinutesToHHmm(totalMinutes);
      } else {
        // Otherwise, use the originalEstimateTimeValue
        timeValue = originalEstimateTimeValue;
      }

      // Auto-update status based on task column content and day columns
      const taskContent = row.task || '';
      let status = row.status;

      // Check if any day column has a time value (including '0.00')
      let hasScheduledTime = false;
      for (let i = 0; i < totalDays; i++) {
        const dayColumnId = `day-${i}` as `day-${number}`;
        const dayValue = row[dayColumnId];

        // Check if day has any time value
        // Consider '=timeValue' as scheduled (it will be computed to actual value)
        // Consider any non-empty value (including '0.00') as scheduled
        if (dayValue && dayValue !== '') {
          hasScheduledTime = true;
          break;
        }
      }

      // If task is empty or only whitespace, set status to '-'
      // If task has content and day columns have time values, set status to 'Scheduled'
      // If task has content but no time values, set status to 'Not Scheduled' (always)
      if (taskContent.trim() === '') {
        if (status !== '-') {
          status = '-';
        }
      } else {
        // Task has content
        if (hasScheduledTime) {
          // Auto-update to Scheduled if status is '-', 'Not Scheduled', or 'Abandoned'
          // Don't override 'Done', 'Blocked', or 'On Hold'
          if (status === '-' || status === 'Not Scheduled' || status === 'Abandoned') {
            status = 'Scheduled';
          }
        } else {
          // No scheduled time - set to 'Not Scheduled', unless status is 'Abandoned'
          // Abandoned tasks can exist without scheduled time
          if (status !== 'Abandoned') {
            status = 'Not Scheduled';
          }
        }
      }

      // Now compute day columns that are marked as linked to timeValue
      // A day column is marked as linked by storing "=timeValue" as the value
      const updatedRow: PlannerRow = {
        ...row,
        estimate,
        timeValue,
        status,
      };

      // Handle _originalEstimate: add if present, remove if should be cleared
      if (originalEstimateToStore !== undefined) {
        updatedRow._originalEstimate = originalEstimateToStore;
      } else {
        // Explicitly delete _originalEstimate if it should be cleared
        delete (updatedRow as any)._originalEstimate;
      }

      // Process all day columns
      for (let i = 0; i < totalDays; i++) {
        const dayColumnId = `day-${i}` as `day-${number}`;
        const dayValue = row[dayColumnId];

        // If the day column has "=timeValue", replace it with the computed timeValue
        if (dayValue === '=timeValue') {
          updatedRow[dayColumnId] = timeValue;
        }
      }

      // Assign parentGroupId if we're under a project group
      if (currentProjectGroupId) {
        updatedRow.parentGroupId = currentProjectGroupId;
      }

      return updatedRow;
    });

    return result;
  }, [data, totalDays]);

  // Sync computed status, estimate, and timeValue changes back to actual data
  // This ensures that auto-computed status, estimate, and timeValue changes persist
  // CRITICAL: This effect creates a controlled circular dependency
  useEffect(() => {
    setData(prevData => {
      let hasChanges = false;
      const updatedData = prevData.map((row, index) => {
        const computedRow = computedData[index];

        // Only update if status, estimate, or timeValue has changed and it's not a special row or project row
        if (computedRow && !row._isMonthRow &&
            !row._isWeekRow && !row._isDayRow && !row._isDayOfWeekRow &&
            !row._isDailyMinRow && !row._isDailyMaxRow && !row._isFilterRow &&
            !row._rowType) {

          const statusChanged = row.status !== computedRow.status;
          const estimateChanged = row.estimate !== computedRow.estimate;
          const timeValueChanged = row.timeValue !== computedRow.timeValue;
          const originalEstimateChanged = row._originalEstimate !== computedRow._originalEstimate;

          // Check if any day columns changed (=timeValue was replaced)
          // ONLY sync day columns if the original value was "=timeValue" (to prevent overwriting pasted values)
          let dayColumnsChanged = false;
          const dayColumnUpdates: Record<string, any> = {};

          for (let i = 0; i < totalDays; i++) {
            const dayColumnId = `day-${i}` as `day-${number}`;
            // Only sync if the source value was "=timeValue" and it was replaced with a computed value
            if (row[dayColumnId] === '=timeValue' && row[dayColumnId] !== computedRow[dayColumnId]) {
              dayColumnsChanged = true;
              dayColumnUpdates[dayColumnId] = computedRow[dayColumnId];
            }
          }

          if (statusChanged || estimateChanged || timeValueChanged || dayColumnsChanged || originalEstimateChanged) {
            hasChanges = true;
            const updatedRow: any = {
              ...row,
              status: computedRow.status,
              estimate: computedRow.estimate,
              timeValue: computedRow.timeValue,
              ...dayColumnUpdates,
            };

            // Handle _originalEstimate: add it if present, remove it if undefined
            if (computedRow._originalEstimate !== undefined) {
              updatedRow._originalEstimate = computedRow._originalEstimate;
            } else {
              // Explicitly delete _originalEstimate if it should be cleared
              delete updatedRow._originalEstimate;
            }

            return updatedRow;
          }
        }
        return row;
      });

      // Only return new data if there were actual changes
      return hasChanges ? updatedData : prevData;
    });
  }, [computedData, setData]);

  return {
    computedData,
  };
}
