import { useState, useCallback, useRef, useEffect } from 'react';
import type { UseEditStateReturn, CellReference, PlannerRow, Command } from '../../types/planner';
import { parseEstimateLabelToMinutes, formatMinutesToHHmm, ESTIMATE_VALUES } from '../../constants/planner/rowTypes';
import { forEachDayColumn, isDayColumn, getDayIndexFromColumnId } from '../../utils/planner/dayColumnHelpers';
import { writeTaskEvent } from '../../utils/planner/storage';
import { MULTI_STATUS_KEY_RE, deriveMultiRowStatus, multiStatusKey } from '../../utils/planner/multiStatus';
import { TASK_ROW_DETAIL_UPDATE_EVENT, TASK_ROW_DETAIL_RELOAD_HISTORY_EVENT } from '../../contexts/TaskRowPanelContext';

/**
 * Adding a time to a day cell (any non-empty value, 0.00 included) always
 * schedules that date. Returns the status fields to merge into the row on
 * execute, plus the fields to restore on undo — or null when nothing moves.
 *
 * - Single rows: the row's own status becomes 'Scheduled', whatever it was
 *   (Abandoned, Blocked, On Hold, custom…) except Done / Accounted. useComputedDataV2 only promotes
 *   '-' / 'Not Scheduled', so manual statuses have to be flipped here, at
 *   the moment of the edit, otherwise a Done task with time would be forced
 *   back to Scheduled on every recompute.
 * - Multi rows: the instance for that date becomes 'Scheduled' (its
 *   multiStatus-<i> key) and the aggregate row status is re-derived.
 */
/**
 * Statuses that survive a time being added to a day cell. Done is often set
 * before the time is filled in (and Accounted is a finished state), so
 * adding the hours afterwards must not reopen the task.
 */
export const KEEP_ON_TIME_ADDED = new Set(['Done', 'Accounted']);

function getScheduleOnTimeUpdates(
  row: PlannerRow | undefined,
  columnId: string,
  newValue: string,
  totalDays: number,
): { execute: Record<string, unknown>; undo: Record<string, unknown> } | null {
  if (!row || !isDayColumn(columnId)) return null;
  if ((newValue ?? '').toString().trim() === '') return null;
  const oldStatus = row.status || '';

  if (row.estimate === 'Multi') {
    const dayIndex = getDayIndexFromColumnId(columnId);
    if (dayIndex === null) return null;
    const key = multiStatusKey(dayIndex);
    if (KEEP_ON_TIME_ADDED.has((row as any)[key])) return null;
    const nextRow = { ...row, [columnId]: newValue, [key]: 'Scheduled' } as PlannerRow;
    const newStatus = deriveMultiRowStatus(nextRow, totalDays) ?? 'Scheduled';
    if ((row as any)[key] === 'Scheduled' && newStatus === oldStatus) return null;
    return {
      execute: { [key]: 'Scheduled', status: newStatus },
      undo: { [key]: (row as any)[key], status: oldStatus },
    };
  }

  if (oldStatus === 'Scheduled' || KEEP_ON_TIME_ADDED.has(oldStatus)) return null;
  return { execute: { status: 'Scheduled' }, undo: { status: oldStatus } };
}

/** Day-of-week patterns for auto-detecting a day tag from subheader text */
const DAY_TAG_PATTERNS: [RegExp, string][] = [
  [/\b(monday|mon)\b/i, 'Mon'],
  [/\b(tuesday|tue|tues)\b/i, 'Tue'],
  [/\b(wednesday|wed)\b/i, 'Wed'],
  [/\b(thursday|thu|thur|thurs)\b/i, 'Thu'],
  [/\b(friday|fri)\b/i, 'Fri'],
  [/\b(saturday|sat)\b/i, 'Sat'],
  [/\b(sunday|sun)\b/i, 'Sun'],
];

/**
 * Returns the short day abbreviation (e.g. 'Mon') found in text, or null if none found.
 * Only used for subheader rows as part of parse-on-write day detection.
 */
function detectDayTag(text: string): string | null {
  for (const [pattern, tag] of DAY_TAG_PATTERNS) {
    if (pattern.test(text)) return tag;
  }
  return null;
}

/** Replace all day columns whose value matches prevTimeValue with nextTimeValue */
function syncDayColumns(row: PlannerRow, nextTimeValue: string, prevTimeValue: string, totalDays: number): Record<string, string> | null {
  const prev = (prevTimeValue ?? '').trim();
  const next = (nextTimeValue ?? '').trim();
  if (!prev || prev === next) return null;
  const updates: Record<string, string> = {};
  let changed = false;
  forEachDayColumn(totalDays, (columnId) => {
    const current = (row[columnId] ?? '').trim();
    if (current === prev) {
      updates[columnId] = next;
      changed = true;
    }
  });
  return changed ? updates : null;
}

/**
 * Hook to manage cell editing state and handlers
 *
 * This hook manages the editing state for cells in the planner, including:
 * - Which cell is currently being edited
 * - The current edit value
 * - Handlers for completing, canceling, and keyboard events during editing
 * - Special logic for status column (Abandoned and Skipped clear day columns)
 * - Special logic for timeValue column (auto-sets estimate to Custom)
 * - Special logic for subprojectLabel aliasing with task column
 *
 * @param data - The planner data array
 * @param setData - Setter for the planner data
 * @param totalDays - Total number of day columns
 * @param executeCommand - Command executor for undo/redo support
 * @param getCellKey - Function to generate cell keys for selection
 * @param setSelectedCells - Setter for selected cells
 * @param setAnchorCell - Setter for anchor cell
 * @returns Object with editing state and handler functions
 */
export default function useEditState({
  data,
  setData,
  totalDays,
  executeCommand,
  getCellKey,
  setSelectedCells,
  setAnchorCell,
}: {
  data: PlannerRow[];
  setData: React.Dispatch<React.SetStateAction<PlannerRow[]>>;
  totalDays: number;
  executeCommand: (command: Command) => void;
  getCellKey: (rowId: string, columnId: string) => string;
  setSelectedCells: React.Dispatch<React.SetStateAction<Set<string>>>;
  setAnchorCell: React.Dispatch<React.SetStateAction<CellReference | null>>;
}): UseEditStateReturn {
  const [editingCell, setEditingCell] = useState<CellReference | null>(null);
  const [editValue, setEditValue] = useState('');

  // Keep the latest data in a ref so handleEditComplete stays referentially
  // stable across data changes. If `data` were in the dep array, every
  // background setData on the page would rebuild the handler, cascade a new
  // onComplete prop into EditableCell, and tear down in-progress edits.
  const dataRef = useRef(data);
  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  const handleEditComplete = useCallback((rowId: string, columnId: string, newValue: string, options?: { timeValueOverride?: string; keepEditing?: boolean }) => {
    // keepEditing: the write comes from a panel that stays open across
    // several commits (the multi-estimate dropdown live-writing day cells),
    // so completing this edit must not tear down the editing cell.
    // Get the old value before updating (via ref — always current, never stale)
    const row = dataRef.current.find(r => r.id === rowId);

    // For subproject header rows, save to subprojectName; for subproject section rows with custom labels, save to subprojectLabel;
    // for general/unscheduled rows, save to sectionLabel
    const generalUnscheduledTypes = ['projectGeneral', 'projectUnscheduled', 'subprojectGeneral', 'subprojectUnscheduled',
      'archivedProjectGeneral', 'archivedProjectUnscheduled'];
    const actualColumnId = columnId === 'task'
      ? row?._rowType === 'subprojectHeader' ? 'subprojectName'
      : row?.subprojectLabel ? 'subprojectLabel'
      : generalUnscheduledTypes.includes(row?._rowType ?? '') ? 'sectionLabel'
      : columnId
      : columnId;
    const oldValue = row?.[actualColumnId] || '';

    // Don't create command if value hasn't changed. Re-confirming a new
    // Hours+Minutes combo on a cell that's already "Custom" still needs to
    // go through — the estimate label is unchanged but timeValueOverride
    // carries a different total, so treat that as a real change too.
    const timeValueOverrideChanged = columnId === 'estimate'
      && options?.timeValueOverride !== undefined
      && options.timeValueOverride !== (row?.timeValue || '0.00');
    if (oldValue === newValue && !timeValueOverrideChanged) {
      if (!options?.keepEditing) {
        setEditingCell(null);
        setEditValue('');
      }
      return;
    }

    // 'Scheduled' is normally system-assigned (auto-status in useComputedDataV2),
    // but it is deliberately still user-selectable — e.g. to move a task or a
    // multi instance back to Scheduled after wrongly marking it Done/Blocked.

    // Per-instance status for Multi rows (multiStatus-<dayIndex> keys).
    // Sets the instance's status and re-derives the row's aggregate `status`
    // (first non-terminal instance, else last) so filters/sorting/the trigger
    // pill stay coherent. See utils/planner/multiStatus.js.
    if (MULTI_STATUS_KEY_RE.test(columnId)) {
      const oldStatus = row?.status || '';
      const nextRow = { ...(row ?? { id: rowId }), [columnId]: newValue } as PlannerRow;
      const newStatus = deriveMultiRowStatus(nextRow, totalDays) ?? oldStatus;

      const command: Command = {
        execute: () => {
          setData(prev => prev.map(r => r.id === rowId
            ? { ...r, [columnId]: newValue, status: newStatus }
            : r));
        },
        undo: () => {
          setData(prev => prev.map(r => r.id === rowId
            ? { ...r, [columnId]: oldValue, status: oldStatus }
            : r));
        },
      };
      executeCommand(command);

      // Only log a status event when the aggregate row status actually moved
      if (row?.id && newStatus !== oldStatus) {
        writeTaskEvent(rowId, {
          field: 'status',
          oldValue: oldStatus || null,
          newValue: newStatus,
          isRecurring: row?.recurring === 'true' || (row?.recurring as any) === true,
        }).then(() => {
          window.dispatchEvent(new CustomEvent(TASK_ROW_DETAIL_RELOAD_HISTORY_EVENT, {
            detail: { taskId: rowId },
          }));
        });
      }

      // Push fresh task data to the detail panel
      if (row?.id) {
        window.dispatchEvent(new CustomEvent(TASK_ROW_DETAIL_UPDATE_EVENT, {
          detail: { task: { ...row, [columnId]: newValue, status: newStatus } },
        }));
      }

      // Deliberately do NOT clear editingCell here: instance edits come from
      // the multi-status panel, which stays open so several dates can be set
      // in one visit.
      return;
    }

    // Special handling for day columns — typing a time into a day cell also
    // updates the time cells (Estimate + Value). Input follows the HH.mm
    // convention: "2" = 2 hours, ".2" = 2 minutes, "1.30" = 1 hour 30 minutes.
    // A total that matches a preset estimate selects it; anything not on the
    // list becomes Custom. Multi rows are excluded (per-instance times are
    // user-controlled and don't map to a single estimate), and non-numeric or
    // cleared input falls through to the generic edit path untouched.
    if (isDayColumn(columnId) && row?.estimate !== 'Multi') {
      const trimmed = (newValue ?? '').trim();
      const timeMatch = trimmed.match(/^(\d*)(?:\.(\d{1,2}))?$/);
      if (timeMatch && trimmed !== '' && trimmed !== '.') {
        const hours = parseInt(timeMatch[1] || '0', 10);
        const minutes = parseInt(timeMatch[2] || '0', 10);
        const totalMinutes = hours * 60 + minutes;
        const formatted = formatMinutesToHHmm(totalMinutes);
        const matchedEstimate = ESTIMATE_VALUES.find(
          label => parseEstimateLabelToMinutes(label) === totalMinutes
        ) ?? 'Custom';

        const oldDayValue = (row?.[columnId as `day-${number}`] ?? '').toString();
        const oldEstimate = row?.estimate || '';
        const oldTimeValue = row?.timeValue || '0.00';
        const scheduleUpdates = getScheduleOnTimeUpdates(row, columnId, formatted, totalDays);

        const command: Command = {
          execute: () => {
            setData(prev => prev.map(r => r.id === rowId
              ? { ...r, [columnId]: formatted, estimate: matchedEstimate, timeValue: formatted, ...(scheduleUpdates?.execute ?? {}) }
              : r));
          },
          undo: () => {
            setData(prev => prev.map(r => r.id === rowId
              ? { ...r, [columnId]: oldDayValue, estimate: oldEstimate, timeValue: oldTimeValue, ...(scheduleUpdates?.undo ?? {}) }
              : r));
          },
        };

        executeCommand(command);

        if (row?.id && scheduleUpdates && scheduleUpdates.execute.status !== (row.status || '')) {
          writeTaskEvent(rowId, {
            field: 'status',
            oldValue: row.status || null,
            newValue: 'Scheduled',
            isRecurring: row?.recurring === 'true' || (row?.recurring as any) === true,
          }).then(() => {
            window.dispatchEvent(new CustomEvent(TASK_ROW_DETAIL_RELOAD_HISTORY_EVENT, {
              detail: { taskId: rowId },
            }));
          });
        }

        // Push fresh task data to the detail panel
        if (row?.id) {
          window.dispatchEvent(new CustomEvent(TASK_ROW_DETAIL_UPDATE_EVENT, {
            detail: { task: { ...row, [columnId]: formatted, estimate: matchedEstimate, timeValue: formatted, ...(scheduleUpdates?.execute ?? {}) } },
          }));
        }

        if (!options?.keepEditing) {
          setEditingCell(null);
          setEditValue('');
        }
        return;
      }
    }

    // Special handling for status column when set to a status that should clear day columns.
    // 'Abandoned' and 'Skipped' both remove the task's time values from the calendar columns.
    if (columnId === 'status' && (newValue === 'Abandoned' || newValue === 'Skipped')) {
      // Store old day column values for undo
      const oldDayValues: Record<string, string> = {};
      for (let i = 0; i < totalDays; i++) {
        const dayColumnId = `day-${i}`;
        oldDayValues[dayColumnId] = row?.[dayColumnId as `day-${number}`] || '';
      }

      // Create command that updates status and clears day columns with values
      const command: Command = {
        execute: () => {
          setData(prev => prev.map(row => {
            if (row.id === rowId) {
              const updates: any = { status: newValue };
              // Clear day columns that have time values
              for (let i = 0; i < totalDays; i++) {
                const dayColumnId = `day-${i}` as `day-${number}`;
                const currentValue = row[dayColumnId];
                // Only clear if there's a value present
                if (currentValue && currentValue !== '') {
                  updates[dayColumnId] = '';
                }
              }
              return { ...row, ...updates };
            }
            return row;
          }));
        },
        undo: () => {
          setData(prev => prev.map(row => {
            if (row.id === rowId) {
              const updates: any = { status: oldValue };
              // Restore all day columns
              for (let i = 0; i < totalDays; i++) {
                const dayColumnId = `day-${i}`;
                updates[dayColumnId] = oldDayValues[dayColumnId];
              }
              return { ...row, ...updates };
            }
            return row;
          }));
        },
      };

      executeCommand(command);

      // Write status event for Abandoned / Skipped
      if (row?.id && row?.id === rowId) {
        writeTaskEvent(rowId, {
          field: 'status',
          oldValue: oldValue || null,
          newValue,
          isRecurring: row?.recurring === 'true' || row?.recurring === true,
        }).then(() => {
          window.dispatchEvent(new CustomEvent(TASK_ROW_DETAIL_RELOAD_HISTORY_EVENT, {
            detail: { taskId: rowId },
          }));
        });
      }

      // Push fresh task data to the detail panel immediately
      if (row?.id) {
        window.dispatchEvent(new CustomEvent(TASK_ROW_DETAIL_UPDATE_EVENT, {
          detail: { task: { ...row, status: newValue } },
        }));
      }

      setEditingCell(null);
      setEditValue('');
      return;
    }

    // Special handling for timeValue column
    if (columnId === 'timeValue') {
      const currentEstimate = row?.estimate || '';
      const oldEstimate = currentEstimate;

      // Calculate what the timeValue should be based on current estimate
      const minutes = parseEstimateLabelToMinutes(currentEstimate);
      const computedTimeValue = formatMinutesToHHmm(minutes);

      // If the new value doesn't match the computed value, set estimate to "Custom"
      const shouldSetToCustom = newValue !== computedTimeValue && currentEstimate !== 'Custom';

      // Create command that updates both timeValue and potentially estimate
      const command: Command = {
        execute: () => {
          setData(prev => prev.map(row => {
            if (row.id === rowId) {
              const updates: Partial<PlannerRow> = { timeValue: newValue };
              if (shouldSetToCustom) updates.estimate = 'Custom';
              const dayUpdates = syncDayColumns(row, newValue, oldValue, totalDays);
              return { ...row, ...updates, ...(dayUpdates ?? {}) };
            }
            return row;
          }));
        },
        undo: () => {
          setData(prev => prev.map(row => {
            if (row.id === rowId) {
              const updates: Partial<PlannerRow> = { timeValue: oldValue };
              if (shouldSetToCustom) updates.estimate = oldEstimate;
              const dayUpdates = syncDayColumns(row, oldValue, newValue, totalDays);
              return { ...row, ...updates, ...(dayUpdates ?? {}) };
            }
            return row;
          }));
        },
      };

      executeCommand(command);
      setEditingCell(null);
      setEditValue('');
      return;
    }

    // Special handling for estimate column — sync timeValue and day entries
    if (columnId === 'estimate') {
      const oldTimeValue = row?.timeValue || '0.00';
      const newMinutes = parseEstimateLabelToMinutes(newValue);
      // Custom estimate normally keeps timeValue as-is; the Estimate dropdown's
      // Hours+Minutes combo (Confirm button) passes an explicit override so the
      // combined total lands in the Value column. '-'/'Multi' reset to '0.00';
      // preset estimates compute it from the label.
      const newTimeValue = newValue === 'Custom'
        ? (options?.timeValueOverride ?? oldTimeValue)
        : newMinutes === null
          ? '0.00'
          : formatMinutesToHHmm(newMinutes);

      // Capture old day column values for undo
      const oldDayValues: Record<string, string> = {};
      forEachDayColumn(totalDays, (colId) => {
        oldDayValues[colId] = (row?.[colId] ?? '').toString();
      });

      const command: Command = {
        execute: () => {
          setData(prev => prev.map(row => {
            if (row.id === rowId) {
              const updates: Partial<PlannerRow> = { estimate: newValue, timeValue: newTimeValue };
              // For preset estimates, replace all filled day cells with the new timeValue
              // For Custom from the dropdown's Hours+Minutes combo (explicit
              // timeValueOverride), replace all filled day cells with the new
              // total — same rule as picking a preset estimate.
              // For any other Custom, leave day cells as-is (user controls them)
              if (newValue !== 'Custom') {
                const dayUpdates: Record<string, string> = {};
                forEachDayColumn(totalDays, (colId) => {
                  const current = (row[colId] ?? '').toString().trim();
                  if (current !== '') {
                    dayUpdates[colId] = newTimeValue;
                  }
                });
                return { ...row, ...updates, ...dayUpdates };
              }
              if (options?.timeValueOverride !== undefined) {
                const dayUpdates: Record<string, string> = {};
                forEachDayColumn(totalDays, (colId) => {
                  const current = (row[colId] ?? '').toString().trim();
                  if (current !== '') {
                    dayUpdates[colId] = newTimeValue;
                  }
                });
                return { ...row, ...updates, ...dayUpdates };
              }
              return { ...row, ...updates };
            }
            return row;
          }));
        },
        undo: () => {
          setData(prev => prev.map(row => {
            if (row.id === rowId) {
              const updates: Partial<PlannerRow> = { estimate: oldValue, timeValue: oldTimeValue };
              return { ...row, ...updates, ...oldDayValues };
            }
            return row;
          }));
        },
      };

      executeCommand(command);
      setEditingCell(null);
      setEditValue('');
      return;
    }

    // Stamp taskCreatedAt the first time a task name is entered (local state mirror;
    // the DB write is handled inside writeTaskEvent when field === 'task_name').
    const shouldStampCreatedAt =
      columnId === 'task' &&
      actualColumnId === 'task' &&
      !row?.taskCreatedAt &&
      (!oldValue || oldValue === '') &&
      !!newValue;
    const stampedCreatedAt = shouldStampCreatedAt ? new Date().toISOString() : null;

    // Adding a time to a day cell schedules that date (see getScheduleOnTimeUpdates).
    // Reaches here for Multi rows and for non-numeric day input such as =timeValue.
    const scheduleUpdates = getScheduleOnTimeUpdates(row, columnId, newValue, totalDays);

    // Parse-on-write day detection for subheader rows.
    // Only runs when the subheader text itself is being edited and the user hasn't
    // manually locked the day tag in the side panel.
    const isSubheaderTextEdit = row?._rowType === 'subprojectHeader' && actualColumnId === 'subprojectName';
    const oldDayTag = row?.dayTag ?? null;
    const newDayTag = (isSubheaderTextEdit && !row?.dayTagLocked)
      ? detectDayTag(newValue)
      : undefined; // undefined = don't touch dayTag

    // Create command for regular edits
    const command: Command = {
      execute: () => {
        setData(prev => prev.map(row => {
          if (row.id === rowId) {
            const updates: any = { [actualColumnId]: newValue };
            if (stampedCreatedAt) updates.taskCreatedAt = stampedCreatedAt;
            if (newDayTag !== undefined) updates.dayTag = newDayTag;
            if (scheduleUpdates) Object.assign(updates, scheduleUpdates.execute);
            // Clear import review flag when subproject or project is updated
            if ((columnId === 'subproject' || columnId === 'project') && row._importNeedsSubprojectReview) {
              updates._importNeedsSubprojectReview = undefined;
            }
            return { ...row, ...updates };
          }
          return row;
        }));
      },
      undo: () => {
        setData(prev => prev.map(row => {
          if (row.id === rowId) {
            const undoUpdates: any = { [actualColumnId]: oldValue };
            if (stampedCreatedAt) undoUpdates.taskCreatedAt = null;
            if (newDayTag !== undefined) undoUpdates.dayTag = oldDayTag;
            if (scheduleUpdates) Object.assign(undoUpdates, scheduleUpdates.undo);
            return { ...row, ...undoUpdates };
          }
          return row;
        }));
      },
    };

    executeCommand(command);

    // Write task events for status and task name changes
    const isRecurring = row?.recurring === 'true' || (row?.recurring as any) === true;
    if (columnId === 'status' && row?.id) {
      writeTaskEvent(rowId, {
        field: 'status',
        oldValue: oldValue || null,
        newValue,
        isRecurring,
      }).then(() => {
        window.dispatchEvent(new CustomEvent(TASK_ROW_DETAIL_RELOAD_HISTORY_EVENT, {
          detail: { taskId: rowId },
        }));
      });
    } else if (scheduleUpdates && row?.id && scheduleUpdates.execute.status !== (row.status || '')) {
      writeTaskEvent(rowId, {
        field: 'status',
        oldValue: row.status || null,
        newValue: scheduleUpdates.execute.status as string,
        isRecurring,
      }).then(() => {
        window.dispatchEvent(new CustomEvent(TASK_ROW_DETAIL_RELOAD_HISTORY_EVENT, {
          detail: { taskId: rowId },
        }));
      });
    } else if (columnId === 'task' && row?.id && actualColumnId === 'task') {
      // Only write event for actual task name cells (not section labels / header renames)
      writeTaskEvent(rowId, {
        field: 'task_name',
        oldValue: oldValue || null,
        newValue,
      });
    }

    // When a recurring task is marked Done, optimistically update completionCount and
    // lastCompletedAt in local data so the panel reflects the new count immediately
    // (the DB write is handled async inside writeTaskEvent).
    const recurringCompletion: Record<string, unknown> = {};
    if (columnId === 'status' && newValue === 'Done' && isRecurring && row?.id) {
      const newCount = ((row?.completionCount as number) || 0) + 1;
      const nowIso = new Date().toISOString();
      recurringCompletion.completionCount = newCount;
      recurringCompletion.lastCompletedAt = nowIso;
      setData(prev => prev.map(r =>
        r.id === rowId ? { ...r, completionCount: newCount, lastCompletedAt: nowIso } : r
      ));
    }

    // Push fresh task data to the detail panel immediately (synchronous, before next render)
    if (row?.id) {
      window.dispatchEvent(new CustomEvent(TASK_ROW_DETAIL_UPDATE_EVENT, {
        detail: {
          task: {
            ...row,
            [actualColumnId]: newValue,
            ...recurringCompletion,
            ...(stampedCreatedAt ? { taskCreatedAt: stampedCreatedAt } : {}),
            // Propagate auto-detected dayTag so the side panel reflects the new value
            ...(newDayTag !== undefined ? { dayTag: newDayTag } : {}),
            ...(scheduleUpdates?.execute ?? {}),
          },
        },
      }));
    }

    if (!options?.keepEditing) {
      setEditingCell(null);
      setEditValue('');
    }
  }, [executeCommand, totalDays, setData]);

  const handleEditCancel = useCallback((rowId: string, columnId: string) => {
    // Exit edit mode and keep cell selected
    setEditingCell(null);
    setEditValue('');
    // Ensure the cell remains selected
    const cellKey = getCellKey(rowId, columnId);
    setSelectedCells(new Set([cellKey]));
    setAnchorCell({ rowId, columnId });
  }, [getCellKey, setSelectedCells, setAnchorCell]);

  const handleEditKeyDown = useCallback((e: React.KeyboardEvent, rowId: string, columnId: string, currentValue: string) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleEditComplete(rowId, columnId, currentValue);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setEditingCell(null);
      setEditValue('');
    }
  }, [handleEditComplete]);

  return {
    editingCell,
    editValue,
    setEditingCell,
    setEditValue,
    handleEditComplete,
    handleEditCancel,
    handleEditKeyDown,
  };
}
