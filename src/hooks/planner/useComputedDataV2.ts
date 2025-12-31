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

      // Auto-update status based on task content
      let status = row.status;
      const task = row.task || '';

      if (!task.trim() && status === 'Scheduled') {
        status = 'Not Scheduled';
      } else if (task.trim() && status === 'Not Scheduled') {
        status = 'Scheduled';
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

  // Sync computed status and estimate changes back to source data
  useEffect(() => {
    const hasChanges = data.some((row, index) => {
      const computed = computedData[index];
      return computed && (
        row.status !== computed.status ||
        row.estimate !== computed.estimate
      );
    });

    if (hasChanges) {
      setData(prevData =>
        prevData.map((row, index) => {
          const computed = computedData[index];
          if (!computed) return row;

          return {
            ...row,
            status: computed.status,
            estimate: computed.estimate,
            ...(computed._originalEstimate && { _originalEstimate: computed._originalEstimate }),
          };
        })
      );
    }
  }, [computedData, data, setData]);

  return { computedData };
}
