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

import { useMemo, useEffect, useRef } from 'react';
import type { UseComputedDataReturn, PlannerRow } from '../../types/planner';
import { calculateTimeValue, calculateMultiTimeValue } from './useTimeValueCalculation';
import { getEstimateWithHabitCheck } from './useHabitPatternDetection';
import { assignParentGroupIds } from './useParentGroupAssignment';
import { writeTaskEvent } from '../../utils/planner/storage';
import { TASK_ROW_DETAIL_RELOAD_HISTORY_EVENT } from '../../contexts/TaskRowPanelContext';
import { MULTI_STATUS_KEY_RE, isScheduledDayValue, deriveMultiRowStatus } from '../../utils/planner/multiStatus';

export default function useComputedDataV2({
  data,
  setData,
  totalDays,
}: {
  data: PlannerRow[];
  setData: React.Dispatch<React.SetStateAction<PlannerRow[]>>;
  totalDays: number;
}): UseComputedDataReturn {
  // Snapshot of which day cells each row had filled on the previous compute.
  // Used to detect "a time was just added to a day" regardless of how it got
  // there (typed, pasted, dragged, side panel…): a newly filled day cell
  // always schedules the task, even one that was Done / Abandoned / Blocked /
  // a custom status. Rows without a snapshot (first load, year switch,
  // newly created rows) are never flipped — only a change flips them.
  const prevFilledDaysRef = useRef<Map<string, string>>(new Map());

  const computedData = useMemo(() => {
    const prevFilledDays = prevFilledDaysRef.current;

    // Step 1: Compute timeValue and handle habit patterns
    const dataWithTimeValues = data.map(row => {
      // Skip special rows
      if (row._isMonthRow || row._isWeekRow || row._isDayRow ||
          row._isDayOfWeekRow || row._isDailyMinRow || row._isDailyMaxRow || row._isDailyTotalRow || row._isFilterRow ||
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

      // Multi-instance hygiene: a multiStatus-<i> key is only valid while
      // day-i still holds a time value. Stale keys (times removed, or removed
      // and later re-added) would otherwise resurrect old per-instance
      // statuses — strip them here and in the sync-back effect below.
      const staleMultiKeys: string[] = [];
      for (const key of Object.keys(row)) {
        const match = key.match(MULTI_STATUS_KEY_RE);
        if (match && !isScheduledDayValue(row[`day-${match[1]}` as `day-${number}`] as string)) {
          staleMultiKeys.push(key);
        }
      }

      // Aggregate status for Multi rows, derived from per-instance statuses
      // (first non-terminal instance, else the last). The multi dropdown owns
      // per-date statuses, so the manual/auto logic below is skipped for
      // these rows. Null when the row has < 2 scheduled instances.
      const multiAggregateStatus = deriveMultiRowStatus(row, totalDays);

      // Auto-update status based on task content and day columns
      let status = row.status;
      const taskContent = row.task || '';

      // A row that just dropped out of Multi (stale instance keys, no
      // aggregate) had a derived status, not a user-set one — reset it so the
      // auto logic below lands on Scheduled / Not Scheduled / '-' afresh
      // instead of the derived value surviving as a protected manual status.
      if (multiAggregateStatus === null && staleMultiKeys.length > 0) {
        status = '-';
      }

      // Check if any day column has a time value (including '0.00')
      let hasScheduledTime = false;
      let newlyFilledDay = false;
      const filledDays: number[] = [];
      for (let i = 0; i < totalDays; i++) {
        const dayColumnId = `day-${i}` as `day-${number}`;
        const dayValue = row[dayColumnId];

        // Check if day has any time value
        // Consider '=timeValue' as scheduled (it will be computed to actual value)
        // Consider any non-empty value (including '0.00') as scheduled
        if (dayValue && dayValue !== '') {
          hasScheduledTime = true;
          filledDays.push(i);
        }
      }
      if (row.id) {
        const prevKey = prevFilledDays.get(row.id);
        const nextKey = filledDays.join(',');
        if (prevKey !== undefined && prevKey !== nextKey) {
          const prevSet = new Set(prevKey === '' ? [] : prevKey.split(',').map(Number));
          newlyFilledDay = filledDays.some(i => !prevSet.has(i));
        }
      }

      // If task is empty or only whitespace, set status to '-'
      // If task has content and day columns have time values, set status to 'Scheduled'
      // If task has content but no time values, set status to 'Not Scheduled' (always)
      if (multiAggregateStatus !== null && taskContent.trim() !== '') {
        // Multi row: status is the derived aggregate, full stop.
        status = multiAggregateStatus;
      } else if (taskContent.trim() === '') {
        if (status !== '-') {
          status = '-';
        }
      } else {
        // Task has content
        // Statuses the user has set deliberately — auto-status logic must not
        // overwrite these. Data-driven definition (docs/STATUS_MANAGER_SPEC.md):
        // everything except the auto-assigned trio ('-', 'Not Scheduled',
        // 'Scheduled') is manual, so custom statuses are protected too.
        const isManualStatus = (st: string) =>
          st !== '-' && st !== 'Not Scheduled' && st !== 'Scheduled';
        if (hasScheduledTime) {
          // Auto-update to Scheduled only if no manual status has been set —
          // unless a day cell was just filled, which always schedules the task
          // (Done, Abandoned, Blocked, custom statuses included).
          if (status === '-' || status === 'Not Scheduled' || newlyFilledDay) {
            status = 'Scheduled';
          }
        } else {
          // No scheduled time - reset to 'Not Scheduled' only if no manual status has been set.
          // 'Scheduled' is system-assigned (never user-set), so it is intentionally NOT in
          // isManualStatus and must revert here when all time values are cleared.
          if (!isManualStatus(status)) {
            status = 'Not Scheduled';
          }
        }
      }

      const computedRow: PlannerRow = {
        ...row,
        estimate,
        timeValue,
        status,
        ...(shouldStoreOriginal && { _originalEstimate: originalEstimate }),
      };
      for (const key of staleMultiKeys) {
        delete (computedRow as any)[key];
      }
      return computedRow;
    });

    // Step 2: Assign parent group IDs
    return assignParentGroupIds(dataWithTimeValues);
  }, [data, totalDays]);

  // Refresh the filled-days snapshot after each committed render. Done in an
  // effect (not inside the memo) so StrictMode's double render can't consume
  // the change before the sync-back below has acted on it.
  useEffect(() => {
    const next = new Map<string, string>();
    data.forEach(row => {
      if (!row.id) return;
      const filled: number[] = [];
      for (let i = 0; i < totalDays; i++) {
        const v = row[`day-${i}` as `day-${number}`];
        if (v && v !== '') filled.push(i);
      }
      next.set(row.id, filled.join(','));
    });
    prevFilledDaysRef.current = next;
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
        row._originalEstimate !== computed._originalEstimate ||
        // Stale multiStatus-<i> keys stripped in the compute step
        Object.keys(row).some(key => MULTI_STATUS_KEY_RE.test(key) && !(key in computed))
      );
    });

    if (hasChanges) {
      // Write a task-event for every row whose computed status differs from its stored status.
      // This covers auto-transitions (e.g. '-' → 'Scheduled' when time is scheduled) that
      // never go through handleEditComplete.
      // Skip the very first transition away from '-' (the placeholder status a blank/new
      // row starts with before it has any task text) -- that's just the row acquiring its
      // initial real status, which the "Created" entry in the history panel already covers.
      // Logging it too would duplicate that as a redundant "- -> Not Scheduled" event.
      data.forEach(row => {
        const computed = row.id ? computedById.get(row.id) : undefined;
        if (computed && row.id && row.status !== computed.status && row.status !== '-') {
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

          // Drop stale multiStatus-<i> keys the compute step stripped, so
          // they don't persist to storage and resurrect old statuses when
          // times are re-added to those day cells.
          for (const key of Object.keys(updatedRow)) {
            if (MULTI_STATUS_KEY_RE.test(key) && !(key in computed)) {
              delete updatedRow[key];
            }
          }

          return updatedRow;
        })
      );
    }
  }, [computedData, data, setData]);

  return { computedData };
}
