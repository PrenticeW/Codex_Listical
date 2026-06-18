import { useState, useCallback } from 'react';
import type { UseEditStateReturn, CellReference, PlannerRow, Command } from '../../types/planner';
import { parseEstimateLabelToMinutes, formatMinutesToHHmm } from '../../constants/planner/rowTypes';
import { forEachDayColumn } from '../../utils/planner/dayColumnHelpers';
import { writeTaskEvent } from '../../utils/planner/storage';
import { TASK_ROW_DETAIL_UPDATE_EVENT, TASK_ROW_DETAIL_RELOAD_HISTORY_EVENT } from '../../contexts/TaskRowPanelContext';

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

  const handleEditComplete = useCallback((rowId: string, columnId: string, newValue: string) => {
    // Get the old value before updating
    const row = data.find(r => r.id === rowId);

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

    // Don't create command if value hasn't changed
    if (oldValue === newValue) {
      setEditingCell(null);
      setEditValue('');
      return;
    }

    // Prevent manually setting status to "Scheduled" — only the system sets this
    if (columnId === 'status' && newValue === 'Scheduled') {
      setEditingCell(null);
      setEditValue('');
      return;
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
      // Custom estimate keeps timeValue as-is; '-'/'Multi' reset to '0.00'; preset estimates compute it
      const newTimeValue = newValue === 'Custom'
        ? oldTimeValue
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
              // For Custom, leave day cells as-is (user controls them)
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

    // Create command for regular edits
    const command: Command = {
      execute: () => {
        setData(prev => prev.map(row => {
          if (row.id === rowId) {
            const updates: any = { [actualColumnId]: newValue };
            if (stampedCreatedAt) updates.taskCreatedAt = stampedCreatedAt;
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
          },
        },
      }));
    }

    setEditingCell(null);
    setEditValue('');
  }, [data, executeCommand, totalDays, setData]);

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
