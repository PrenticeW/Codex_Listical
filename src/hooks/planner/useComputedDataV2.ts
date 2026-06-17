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
import { writeTaskEvent } from '../../utils/planner/storage';
import { TASK_ROW_DETAIL_RELOAD_HISTORY_EVENT } from '../../contexts/TaskRowPanelContext';

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
          row._rowType === 'archiveHeader' || row._rowType === 'archiveRow' ||
          row._rowType === 'archivedProjectHeader' || row._rowType === 'archivedProjectGeneral' || row._rowType === 'archivedProjectUnscheduled' ||
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
      } else if (estimate === 'Custom') {
        // Custom: user controls timeValue directly — do not overwrite it
        timeValue = row.timeValue ?? '0.00';
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
        // Statuses the user has set deliberately — auto-status logic must not overwrite these.
        // Mirror of PROTECTED_STATUSES in src/constants/plannerConstants.js (legacy/dead),
        // kept inline here while plannerConstants.js stays out of the active import graph.
        const manualStatuses = ['Done', 'Blocked', 'On Hold', 'Abandoned', 'Skipped', 'Accounted', 'Special'];
        if (hasScheduledTime) {
          // Auto-update to Scheduled only if no manual status has been set
          if (status === '-' || status === 'Not Scheduled') {
            status = 'Scheduled';
          }
        } else {
          // No scheduled time - reset to 'Not Scheduled' only if no manual status has been set.
          // 'Scheduled' is system-assigned (never user-set), so it is intentionally NOT in
          // manualStatuses and must revert here when all time values are cleared.
          if (!manualStatuses.includes(status)) {
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
    // Build a map from row id to computed row for safe lookup by identity
    const computedById = new Map<string, PlannerRow>();
    computedData.forEach(row => {
      if (row.id) computedById.set(row.id, row);
    });

    const hasChanges = data.some(row => {
      const computed = row.id ? computedById.get(row.id) : undefined;
      return computed && (
        row.status !== computed.status ||
        row.estimate !== computed.estimate ||
        row.timeValue !== computed.timeValue ||
        row._originalEstimate !== computed._originalEstimate
      );
    });

    if (hasChanges) {
      // Write a task-event for every row whose computed status differs from its stored status.
      // This covers auto-transitions (e.g. '-' → 'Scheduled' when time is scheduled) that
      // never go through handleEditComplete.
      data.forEach(row => {
        const computed = row.id ? computedById.get(row.id) : undefined;
        if (computed && row.id && row.status !== computed.status) {
          writeTaskEvent(row.id, {
            field: 'status',
            oldValue: row.status || null,
            newValue: computed.status,
            isRecurring: row.recurring === 'true' || (row.recurring as any) === true,
          }).then(() => {
            window.dispatchEvent(new CustomEvent(TASK_ROW_DETAIL_RELOAD_HISTORY_EVENT, {
              detail: { taskId: row.id },
            }));
          });
        }
      });

      setData(prevData =>
        prevData.map(row => {
          const computed = row.id ? computedById.get(row.id) : undefined;
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
