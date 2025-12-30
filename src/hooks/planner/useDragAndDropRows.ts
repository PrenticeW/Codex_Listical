import { useState, useCallback } from 'react';
import type { UseDragAndDropRowsReturn, PlannerRow, Command } from '../../types/planner';

/**
 * Hook to manage drag-and-drop row reordering
 *
 * This hook manages the drag and drop state for reordering rows in the planner.
 * It supports:
 * - Dragging single rows
 * - Dragging multiple selected rows
 * - Drop validation (prevent dropping on special header rows)
 * - Undo/redo support through command pattern
 * - Automatic index adjustment when reordering
 *
 * @param data - The planner data array
 * @param setData - Setter for the planner data
 * @param selectedRows - Set of currently selected row IDs
 * @param executeCommand - Command executor for undo/redo support
 * @returns Object with drag state and handler functions
 */
export default function useDragAndDropRows({
  data,
  setData,
  selectedRows,
  executeCommand,
}: {
  data: PlannerRow[];
  setData: React.Dispatch<React.SetStateAction<PlannerRow[]>>;
  selectedRows: Set<string>;
  executeCommand: (command: Command) => void;
}): UseDragAndDropRowsReturn {
  const [draggedRowId, setDraggedRowId] = useState<string[] | null>(null);
  const [dropTargetRowId, setDropTargetRowId] = useState<string | null>(null);

  const handleDragStart = useCallback((e: React.DragEvent, rowId: string) => {
    // If the dragged row is part of selected rows, drag all selected rows
    // Otherwise, just drag the single row
    if (selectedRows.has(rowId)) {
      // Dragging multiple selected rows
      setDraggedRowId(Array.from(selectedRows));
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', JSON.stringify(Array.from(selectedRows)));
    } else {
      // Dragging a single row
      setDraggedRowId([rowId]);
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', JSON.stringify([rowId]));
    }
  }, [selectedRows]);

  const handleDragOver = useCallback((e: React.DragEvent, rowId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    if (draggedRowId && Array.isArray(draggedRowId) && !draggedRowId.includes(rowId)) {
      // Check if target row is a special header row (but allow project rows for organization)
      const targetRow = data.find(r => r.id === rowId);
      if (targetRow && (
        targetRow._isMonthRow || targetRow._isWeekRow || targetRow._isDayRow ||
        targetRow._isDayOfWeekRow || targetRow._isDailyMinRow ||
        targetRow._isDailyMaxRow || targetRow._isFilterRow
      )) {
        // Don't allow dropping on header rows (but project rows are OK)
        setDropTargetRowId(null);
        return;
      }

      setDropTargetRowId(rowId);
    }
  }, [draggedRowId, data]);

  const handleDrop = useCallback((e: React.DragEvent, targetRowId: string) => {
    e.preventDefault();

    if (!draggedRowId || !Array.isArray(draggedRowId) || draggedRowId.includes(targetRowId)) {
      setDraggedRowId(null);
      setDropTargetRowId(null);
      return;
    }

    const draggedRowIds = draggedRowId;

    // Find target index
    const targetIndex = data.findIndex(r => r.id === targetRowId);
    if (targetIndex === -1) {
      setDraggedRowId(null);
      setDropTargetRowId(null);
      return;
    }

    // Prevent dropping on special header rows (but allow project rows)
    const targetRow = data[targetIndex];
    if (targetRow && (
      targetRow._isMonthRow || targetRow._isWeekRow || targetRow._isDayRow ||
      targetRow._isDayOfWeekRow || targetRow._isDailyMinRow ||
      targetRow._isDailyMaxRow || targetRow._isFilterRow
    )) {
      setDraggedRowId(null);
      setDropTargetRowId(null);
      return;
    }

    // Get the indices of all dragged rows in their current positions
    const draggedIndices = draggedRowIds
      .map(id => data.findIndex(r => r.id === id))
      .filter(idx => idx !== -1)
      .sort((a, b) => a - b);

    if (draggedIndices.length === 0) {
      setDraggedRowId(null);
      setDropTargetRowId(null);
      return;
    }

    // Store original positions for undo
    const originalPositions = draggedRowIds.map(id => {
      const index = data.findIndex(r => r.id === id);
      return { id, index };
    });

    // Create reorder command
    const reorderCommand: Command = {
      execute: () => {
        setData(prevData => {
          const newData = [...prevData];

          // Extract the dragged rows
          const draggedRows = draggedIndices.map(idx => newData[idx]);

          // Remove dragged rows (in reverse order to maintain indices)
          for (let i = draggedIndices.length - 1; i >= 0; i--) {
            newData.splice(draggedIndices[i], 1);
          }

          // Calculate new insert position
          // Count how many dragged rows were before the target
          const rowsBeforeTarget = draggedIndices.filter(idx => idx < targetIndex).length;
          const adjustedTargetIndex = targetIndex - rowsBeforeTarget;

          // Insert all dragged rows at the target position
          newData.splice(adjustedTargetIndex, 0, ...draggedRows);

          return newData;
        });
      },
      undo: () => {
        setData(prevData => {
          const newData = [...prevData];

          // Remove the moved rows from their current positions
          draggedRowIds.forEach(id => {
            const idx = newData.findIndex(r => r.id === id);
            if (idx !== -1) {
              newData.splice(idx, 1);
            }
          });

          // Restore rows to their original positions (in order)
          originalPositions
            .sort((a, b) => a.index - b.index)
            .forEach(({ id, index }) => {
              const row = prevData.find(r => r.id === id);
              if (row) {
                newData.splice(index, 0, row);
              }
            });

          return newData;
        });
      }
    };

    executeCommand(reorderCommand);

    // Clear drag state
    setDraggedRowId(null);
    setDropTargetRowId(null);
  }, [draggedRowId, data, executeCommand, setData]);

  const handleDragEnd = useCallback(() => {
    setDraggedRowId(null);
    setDropTargetRowId(null);
  }, []);

  return {
    draggedRowId,
    dropTargetRowId,
    setDraggedRowId,
    setDropTargetRowId,
    handleDragStart,
    handleDragOver,
    handleDrop,
    handleDragEnd,
  };
}
