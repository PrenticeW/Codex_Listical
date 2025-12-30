import { useMemo, useEffect } from 'react';
import type { UseComputedDataReturn, PlannerRow } from '../../types/planner';
import { parseEstimateLabelToMinutes, formatMinutesToHHmm } from '../../constants/planner/rowTypes';

/**
 * Hook to compute derived data from raw planner data
 *
 * This hook handles all data transformations including:
 * - Computing timeValue from estimate column
 * - Auto-updating status based on task content and day column values
 * - Replacing "=timeValue" placeholders with actual timeValue
 * - Assigning parentGroupId to tasks based on their position under project sections
 * - Syncing computed status changes back to the source data
 *
 * CRITICAL: This hook includes a sync effect (lines 73-91) that writes computed status
 * changes back to the source data. This creates a controlled circular dependency where:
 * data → computedData → status sync effect → data (with new status)
 *
 * @param data - The source planner data
 * @param setData - Setter for the source data (needed for status sync)
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
      const estimate = row.estimate;
      let timeValue: string | undefined;

      // If estimate is "Custom", preserve the manually entered timeValue
      if (estimate === 'Custom') {
        timeValue = row.timeValue;
      } else {
        // Otherwise, compute timeValue from estimate
        const minutes = parseEstimateLabelToMinutes(estimate);
        timeValue = formatMinutesToHHmm(minutes);
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
      const updatedRow: PlannerRow = { ...row, timeValue, status };

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

  // Sync computed status changes back to actual data
  // This ensures that auto-computed status changes persist
  // CRITICAL: This effect creates a controlled circular dependency
  useEffect(() => {
    setData(prevData => {
      let hasChanges = false;
      const updatedData = prevData.map((row, index) => {
        const computedRow = computedData[index];

        // Only update if status has changed and it's not a special row or project row
        if (computedRow && row.status !== computedRow.status && !row._isMonthRow &&
            !row._isWeekRow && !row._isDayRow && !row._isDayOfWeekRow &&
            !row._isDailyMinRow && !row._isDailyMaxRow && !row._isFilterRow &&
            !row._rowType) {
          hasChanges = true;
          return { ...row, status: computedRow.status };
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
