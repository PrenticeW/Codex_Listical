import { useState, useCallback } from 'react';
import type { UseDragAndDropRowsReturn, PlannerRow, Command } from '../../types/planner';

const isPinnedHeader = (row: PlannerRow | undefined): boolean => !!row && !!(
  row._isMonthRow || row._isWeekRow || row._isDayRow ||
  row._isDayOfWeekRow || row._isDailyMinRow ||
  row._isDailyMaxRow || row._isDailyTotalRow || row._isFilterRow
);

// Rows that terminate the project region (a project block never spans them).
const isRegionDivider = (row: PlannerRow | undefined): boolean => !!row && !!(
  row._isInboxRow || row._isArchiveRow || row._rowType === 'archiveHeader'
);

/**
 * Contiguous index range [start, end) of the project block that begins at the
 * projectHeader row at `headerIndex`: the header plus every row up to (not
 * including) the next projectHeader or region divider. Grouping on the System
 * page is positional (Tacular's computeRowOrder mirrors this rule), so the
 * block is exactly what moves when a project is reordered.
 */
export function getProjectBlockRange(data: PlannerRow[], headerIndex: number): [number, number] {
  let end = headerIndex + 1;
  while (end < data.length) {
    const r = data[end];
    if (r._rowType === 'projectHeader' || isRegionDivider(r)) break;
    end++;
  }
  return [headerIndex, end];
}

/** Index of the projectHeader whose block contains `rowIndex`, or -1. */
function findBlockHeaderIndex(data: PlannerRow[], rowIndex: number): number {
  for (let i = rowIndex; i >= 0; i--) {
    const r = data[i];
    if (r._rowType === 'projectHeader') return i;
    if (isRegionDivider(r) || isPinnedHeader(r)) return -1;
  }
  return -1;
}

/** Ordered project ids, one per projectHeader row, in current data order. */
export function getProjectOrderFromData(data: PlannerRow[]): string[] {
  return data
    .filter(r => r._rowType === 'projectHeader' && r.projectId)
    .map(r => r.projectId as string);
}

/** Pure move: remove rows at `draggedIndices` and reinsert them at `insertAt`. */
function moveRows(prevData: PlannerRow[], draggedIndices: number[], insertAt: number): PlannerRow[] {
  const newData = [...prevData];
  const draggedRows = draggedIndices.map(idx => newData[idx]);
  for (let i = draggedIndices.length - 1; i >= 0; i--) {
    newData.splice(draggedIndices[i], 1);
  }
  const rowsBeforeTarget = draggedIndices.filter(idx => idx < insertAt).length;
  newData.splice(insertAt - rowsBeforeTarget, 0, ...draggedRows);
  return newData;
}

/**
 * Hook to manage drag-and-drop row reordering
 *
 * This hook manages the drag and drop state for reordering rows in the planner.
 * It supports:
 * - Dragging single rows
 * - Dragging multiple selected rows
 * - Dragging a project header, which moves the whole project block and
 *   snaps to a position between other project blocks (or just above the
 *   Inbox divider, i.e. after the last project)
 * - Drop validation (prevent dropping on special header rows)
 * - Undo/redo support through command pattern
 * - Automatic index adjustment when reordering
 *
 * @param data - The planner data array
 * @param setData - Setter for the planner data
 * @param selectedRows - Set of currently selected row IDs
 * @param executeCommand - Command executor for undo/redo support
 * @param onProjectOrderChange - Called with the ordered project ids after a
 *   project block move (and with the previous order on undo) so the caller
 *   can persist it
 * @returns Object with drag state and handler functions
 */
export default function useDragAndDropRows({
  data,
  setData,
  selectedRows,
  executeCommand,
  onProjectOrderChange,
}: {
  data: PlannerRow[];
  setData: React.Dispatch<React.SetStateAction<PlannerRow[]>>;
  selectedRows: Set<string>;
  executeCommand: (command: Command) => void;
  onProjectOrderChange?: (orderedProjectIds: string[]) => void;
}): UseDragAndDropRowsReturn {
  const [draggedRowId, setDraggedRowId] = useState<string[] | null>(null);
  const [dropTargetRowId, setDropTargetRowId] = useState<string | null>(null);

  const handleDragStart = useCallback((e: React.DragEvent, rowId: string) => {
    const headerIndex = data.findIndex(r => r.id === rowId);
    let ids: string[];
    if (headerIndex !== -1 && data[headerIndex]._rowType === 'projectHeader') {
      // Dragging a project header drags its whole block.
      const [start, end] = getProjectBlockRange(data, headerIndex);
      ids = data.slice(start, end).map(r => r.id);
    } else if (selectedRows.has(rowId)) {
      // Dragging multiple selected rows
      ids = Array.from(selectedRows);
    } else {
      // Dragging a single row
      ids = [rowId];
    }
    setDraggedRowId(ids);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', JSON.stringify(ids));
  }, [selectedRows, data]);

  const isProjectBlockDrag = useCallback((ids: string[] | null): boolean => {
    if (!ids || ids.length === 0) return false;
    const first = data.find(r => r.id === ids[0]);
    return first?._rowType === 'projectHeader';
  }, [data]);

  /**
   * For a project-block drag, resolve the row under the pointer to the
   * projectHeader of the block it belongs to, so the block snaps between
   * blocks. Returns null when the target is not inside any project block.
   */
  const resolveBlockTarget = useCallback((targetRowId: string): string | null => {
    const idx = data.findIndex(r => r.id === targetRowId);
    if (idx === -1) return null;
    // The Inbox divider is a valid target: it means "after the last project".
    if (data[idx]._isInboxRow) return data[idx].id;
    const headerIdx = findBlockHeaderIndex(data, idx);
    return headerIdx === -1 ? null : data[headerIdx].id;
  }, [data]);

  const handleDragOver = useCallback((e: React.DragEvent, rowId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    if (!draggedRowId || !Array.isArray(draggedRowId)) return;

    if (isProjectBlockDrag(draggedRowId)) {
      const headerId = resolveBlockTarget(rowId);
      setDropTargetRowId(headerId && !draggedRowId.includes(headerId) ? headerId : null);
      return;
    }

    if (!draggedRowId.includes(rowId)) {
      // Check if target row is a special header row (but allow project rows for organization)
      const targetRow = data.find(r => r.id === rowId);
      if (isPinnedHeader(targetRow)) {
        // Don't allow dropping on header rows (but project rows are OK)
        setDropTargetRowId(null);
        return;
      }

      setDropTargetRowId(rowId);
    }
  }, [draggedRowId, data, isProjectBlockDrag, resolveBlockTarget]);

  const handleDrop = useCallback((e: React.DragEvent, rawTargetRowId: string) => {
    e.preventDefault();

    const clear = () => {
      setDraggedRowId(null);
      setDropTargetRowId(null);
    };

    if (!draggedRowId || !Array.isArray(draggedRowId)) { clear(); return; }

    const blockDrag = isProjectBlockDrag(draggedRowId);
    const targetRowId = blockDrag ? resolveBlockTarget(rawTargetRowId) : rawTargetRowId;

    if (!targetRowId || draggedRowId.includes(targetRowId)) { clear(); return; }

    const draggedRowIds = draggedRowId;

    // Find target index
    const targetIndex = data.findIndex(r => r.id === targetRowId);
    if (targetIndex === -1) { clear(); return; }

    // Prevent dropping on special header rows (but allow project rows)
    if (!blockDrag && isPinnedHeader(data[targetIndex])) { clear(); return; }

    // Get the indices of all dragged rows in their current positions
    const draggedIndices = draggedRowIds
      .map(id => data.findIndex(r => r.id === id))
      .filter(idx => idx !== -1)
      .sort((a, b) => a - b);

    if (draggedIndices.length === 0) { clear(); return; }

    // Store original positions for undo
    const originalPositions = draggedRowIds.map(id => {
      const index = data.findIndex(r => r.id === id);
      return { id, index };
    });

    // The block (or rows) always land directly ABOVE the target row, which is
    // where the drop indicator line is drawn. For project blocks the target
    // is another block's header, or the Inbox divider for "after the last
    // project".
    const insertAt = targetIndex;

    // Project order before/after, computed from the snapshot so persistence
    // does not depend on when React runs the state updater.
    const previousProjectOrder = blockDrag ? getProjectOrderFromData(data) : null;
    const nextProjectOrder = blockDrag
      ? getProjectOrderFromData(moveRows(data, draggedIndices, insertAt))
      : null;

    // Create reorder command
    const reorderCommand: Command = {
      execute: () => {
        setData(prevData => moveRows(prevData, draggedIndices, insertAt));
        if (nextProjectOrder && onProjectOrderChange) onProjectOrderChange(nextProjectOrder);
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
        if (previousProjectOrder && onProjectOrderChange) onProjectOrderChange(previousProjectOrder);
      }
    };

    executeCommand(reorderCommand);

    // Clear drag state
    clear();
  }, [draggedRowId, data, executeCommand, setData, isProjectBlockDrag, resolveBlockTarget, onProjectOrderChange]);

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
