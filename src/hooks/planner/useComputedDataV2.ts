/**
 * Computed Data Hook V2 (Refactored)
 * Simplified version that delegates to focused utility functions
 *
 * This hook computes derived data from raw planner data:
 * - Computing timeValue from estimate column
 * - Auto-updating status based on task content
 * - Habit tracker: Auto-setting estimate to "Multi" for habit patterns
 * - Assigning parentGroupId to tasks
 * - Syncing computed changes back to source data
 */

import { useMemo, useEffect } from 'react';
import type { UseComputedDataReturn, PlannerRow } from '../../types/planner';
import { calculateTimeValue, calculateMultiTimeValue } from './useTimeValueCalculation';
import { getEstimateWithHabitCheck } from './useHabitPatternDetection';
import { assignParentGroupIds } from './useParentGroupAssignment';

export default function useComputedDataV2({
  data,
  setData,
  totalDays,
}: {
  data: PlannerRow[];
  setData: React.Dispatch<React.SetStateAction<PlannerRow[]>>;
  totalDays: number;
}): UseComputedDataReturn {
  const computedData = useMemo(() => {
    // Step 1: Compute timeValue and handle habit patterns
    const dataWithTimeValues = data.map(row => {
      // Skip special rows
      if (row._isMonthRow || row._isWeekRow || row._isDayRow ||
          row._isDayOfWeekRow || row._isDailyMinRow || row._isDailyMaxRow || row._isFilterRow ||
          row._isInboxRow || row._isArchiveRow ||
          row._rowType === 'projectHeader' || row._rowType === 'projectGeneral' || row._rowType === 'projectUnscheduled' ||
          row._rowType === 'subprojectHeader' || row._rowType === 'subprojectGeneral' || row._rowType === 'subprojectUnscheduled') {
        return row;
      }

      // Check for habit pattern and get appropriate estimate
      const { estimate, shouldStoreOriginal } = getEstimateWithHabitCheck(row, totalDays);
      const originalEstimate = row._originalEstimate || row.estimate;

      // Calculate timeValue based on estimate type
      let timeValue: string;
      if (estimate === 'Multi') {
        timeValue = calculateMultiTimeValue(row, totalDays, originalEstimate);
      } else {
        timeValue = calculateTimeValue(estimate);
      }

      // Auto-update status based on task content and day columns
      let status = row.status;
      const taskContent = row.task || '';

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

      return {
        ...row,
        estimate,
        timeValue,
        status,
        ...(shouldStoreOriginal && { _originalEstimate: originalEstimate }),
      };
    });

    // Step 2: Assign parent group IDs
    return assignParentGroupIds(dataWithTimeValues);
  }, [data, totalDays]);

  // Sync computed status, estimate, and timeValue changes back to source data
  useEffect(() => {
    const hasChanges = data.some((row, index) => {
      const computed = computedData[index];
      return computed && (
        row.status !== computed.status ||
        row.estimate !== computed.estimate ||
        row.timeValue !== computed.timeValue ||
        row._originalEstimate !== computed._originalEstimate
      );
    });

    if (hasChanges) {
      setData(prevData =>
        prevData.map((row, index) => {
          const computed = computedData[index];
          if (!computed) return row;

          const updatedRow: any = {
            ...row,
            status: computed.status,
            estimate: computed.estimate,
            timeValue: computed.timeValue,
          };

          // Handle _originalEstimate: add it if present, remove it if undefined
          if (computed._originalEstimate !== undefined) {
            updatedRow._originalEstimate = computed._originalEstimate;
          } else {
            // Explicitly delete _originalEstimate if it should be cleared
            delete updatedRow._originalEstimate;
          }

          return updatedRow;
        })
      );
    }
  }, [computedData, data, setData]);

  return { computedData };
}
