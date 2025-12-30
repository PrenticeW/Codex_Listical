import { useState, useCallback } from 'react';
import type { UseEditStateReturn, CellReference, PlannerRow, Command } from '../../types/planner';
import { parseEstimateLabelToMinutes, formatMinutesToHHmm } from '../../constants/planner/rowTypes';

/**
 * Hook to manage cell editing state and handlers
 *
 * This hook manages the editing state for cells in the planner, including:
 * - Which cell is currently being edited
 * - The current edit value
 * - Handlers for completing, canceling, and keyboard events during editing
 * - Special logic for status column (Abandoned clears day columns)
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

    // For subproject section rows with custom labels, save to subprojectLabel field
    const actualColumnId = (columnId === 'task' && row?.subprojectLabel) ? 'subprojectLabel' : columnId;
    const oldValue = row?.[actualColumnId] || '';

    // Don't create command if value hasn't changed
    if (oldValue === newValue) {
      setEditingCell(null);
      setEditValue('');
      return;
    }

    // Special handling for status column when set to "Abandoned"
    if (columnId === 'status' && newValue === 'Abandoned') {
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
              if (shouldSetToCustom) {
                return { ...row, timeValue: newValue, estimate: 'Custom' };
              } else {
                return { ...row, timeValue: newValue };
              }
            }
            return row;
          }));
        },
        undo: () => {
          setData(prev => prev.map(row => {
            if (row.id === rowId) {
              if (shouldSetToCustom) {
                return { ...row, timeValue: oldValue, estimate: oldEstimate };
              } else {
                return { ...row, timeValue: oldValue };
              }
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

    // Create command for regular edits
    const command: Command = {
      execute: () => {
        setData(prev => prev.map(row => {
          if (row.id === rowId) {
            return { ...row, [actualColumnId]: newValue };
          }
          return row;
        }));
      },
      undo: () => {
        setData(prev => prev.map(row => {
          if (row.id === rowId) {
            return { ...row, [actualColumnId]: oldValue };
          }
          return row;
        }));
      },
    };

    executeCommand(command);

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
