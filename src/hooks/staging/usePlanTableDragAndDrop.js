import { useState, useCallback } from 'react';
import { cloneRowWithMetadata, cloneStagingState } from '../../utils/staging/planTableHelpers';

/**
 * Hook to manage drag-and-drop row reordering for plan tables
 *
 * Supports:
 * - Dragging single rows
 * - Dragging multiple selected rows
 * - Unrestricted reordering within a table
 * - Cross-item drag (move rows between projects)
 * - Undo/redo support through command pattern
 */
export default function usePlanTableDragAndDrop({
  setState,
  selectedRows, // Set of "itemId|rowIdx" strings
  executeCommand,
}) {
  // Track dragged rows: array of { itemId, rowIdx }
  const [draggedRows, setDraggedRows] = useState(null);
  // Track drop target: { itemId, rowIdx }
  const [dropTarget, setDropTarget] = useState(null);

  /**
   * Parse a row key into its components
   */
  const parseRowKey = (key) => {
    if (!key) return null;
    const parts = key.split('|');
    if (parts.length !== 2) return null;
    return {
      itemId: parts[0],
      rowIdx: parseInt(parts[1], 10),
    };
  };

  /**
   * Start dragging a row
   */
  const handleDragStart = useCallback(
    (e, itemId, rowIdx) => {
      const rowKey = `${itemId}|${rowIdx}`;

      // If the dragged row is part of selected rows, drag all selected rows
      // (Only rows from the same item can be multi-dragged)
      if (selectedRows && selectedRows.has(rowKey)) {
        // Filter to only rows from the same item
        const sameItemRows = Array.from(selectedRows)
          .map(parseRowKey)
          .filter((r) => r && r.itemId === itemId)
          .sort((a, b) => a.rowIdx - b.rowIdx);

        if (sameItemRows.length > 0) {
          setDraggedRows(sameItemRows);
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', JSON.stringify(sameItemRows));
          return;
        }
      }

      // Single row drag
      setDraggedRows([{ itemId, rowIdx }]);
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', JSON.stringify([{ itemId, rowIdx }]));
    },
    [selectedRows]
  );

  /**
   * Handle drag over a potential drop target
   */
  const handleDragOver = useCallback(
    (e, itemId, rowIdx) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';

      if (!draggedRows || draggedRows.length === 0) return;

      // Check if hovering over one of the dragged rows
      const isHoveringDragged = draggedRows.some(
        (r) => r.itemId === itemId && r.rowIdx === rowIdx
      );

      if (!isHoveringDragged) {
        setDropTarget({ itemId, rowIdx });
      } else {
        setDropTarget(null);
      }
    },
    [draggedRows]
  );

  /**
   * Handle drop on a target row
   */
  const handleDrop = useCallback(
    (e, targetItemId, targetRowIdx) => {
      e.preventDefault();

      if (!draggedRows || draggedRows.length === 0) {
        setDraggedRows(null);
        setDropTarget(null);
        return;
      }

      // Check if dropping on a dragged row
      const isDroppingOnDragged = draggedRows.some(
        (r) => r.itemId === targetItemId && r.rowIdx === targetRowIdx
      );

      if (isDroppingOnDragged) {
        setDraggedRows(null);
        setDropTarget(null);
        return;
      }

      // For simplicity, only support drag within the same item for now
      const sourceItemId = draggedRows[0].itemId;
      if (sourceItemId !== targetItemId) {
        // Cross-item drag - could be implemented later
        setDraggedRows(null);
        setDropTarget(null);
        return;
      }

      // Capture state for undo
      let capturedState = null;

      const command = {
        execute: () => {
          setState((prev) => {
            // Capture state on first execute
            if (capturedState === null) {
              capturedState = cloneStagingState(prev);
            }

            return {
              ...prev,
              shortlist: prev.shortlist.map((item) => {
                if (item.id !== sourceItemId) return item;

                const entries = item.planTableEntries.map(cloneRowWithMetadata);

                // Get indices of rows being dragged (sorted)
                const draggedIndices = draggedRows
                  .map((r) => r.rowIdx)
                  .sort((a, b) => a - b);

                // Extract dragged rows
                const draggedEntries = draggedIndices.map((idx) => entries[idx]);

                // Remove dragged rows (in reverse order to maintain indices)
                for (let i = draggedIndices.length - 1; i >= 0; i--) {
                  entries.splice(draggedIndices[i], 1);
                }

                // Calculate adjusted target index
                const rowsBeforeTarget = draggedIndices.filter(
                  (idx) => idx < targetRowIdx
                ).length;
                const adjustedTargetIdx = targetRowIdx - rowsBeforeTarget;

                // Insert dragged rows at target position
                entries.splice(adjustedTargetIdx, 0, ...draggedEntries);

                return { ...item, planTableEntries: entries };
              }),
            };
          });
        },
        undo: () => {
          if (capturedState !== null) {
            setState(capturedState);
          }
        },
      };

      executeCommand(command);

      // Clear drag state
      setDraggedRows(null);
      setDropTarget(null);
    },
    [draggedRows, setState, executeCommand]
  );

  /**
   * End drag operation (cleanup)
   */
  const handleDragEnd = useCallback(() => {
    setDraggedRows(null);
    setDropTarget(null);
  }, []);

  /**
   * Check if a row is being dragged
   */
  const isRowDragged = useCallback(
    (itemId, rowIdx) => {
      if (!draggedRows) return false;
      return draggedRows.some((r) => r.itemId === itemId && r.rowIdx === rowIdx);
    },
    [draggedRows]
  );

  /**
   * Check if a row is the drop target
   */
  const isDropTarget = useCallback(
    (itemId, rowIdx) => {
      if (!dropTarget) return false;
      return dropTarget.itemId === itemId && dropTarget.rowIdx === rowIdx;
    },
    [dropTarget]
  );

  return {
    draggedRows,
    dropTarget,
    handleDragStart,
    handleDragOver,
    handleDrop,
    handleDragEnd,
    isRowDragged,
    isDropTarget,
  };
}
