import { useState, useCallback } from 'react';
import { isSpecialRow } from '../../utils/planner/rowTypeChecks';

/**
 * Hook to manage cell-level drag-and-drop (move cell value to another cell).
 *
 * Behaviour:
 * - Dragging a cell moves its value to the drop target and clears the source.
 * - Dragging a cell that is part of a multi-cell selection moves the WHOLE
 *   selection as a block: every selected cell shifts by the same row/column
 *   offset as the dragged cell (27 Aug 2026 — previously only the grabbed
 *   cell moved). Cells whose destination would fall outside the grid, or on
 *   a row that is not a task row, stay where they are.
 * - Works across any column and any task row.
 * - Supports undo/redo via the command pattern.
 * - Provides visual state so TaskRow can highlight the dragged source and valid drop target.
 */
export default function useDragAndDropCells({
  data, setData, executeCommand, setSelectedCells, setAnchorCell,
  selectedCells, allColumnIds,
}) {
  // { rowId, columnId } | null
  const [draggedCell, setDraggedCell] = useState(null);
  // { rowId, columnId } | null
  const [dropTargetCell, setDropTargetCell] = useState(null);

  // Lazily created transparent drag image element — created once on first drag, never removed
  let _transparentDragImage = null;
  const getTransparentDragImage = () => {
    if (!_transparentDragImage) {
      const img = document.createElement('img');
      img.src = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAuMBg3QZWZQAAAAASUVORK5CYII=';
      Object.assign(img.style, {
        position: 'absolute',
        top: '-10px',
        left: '-10px',
        width: '1px',
        height: '1px',
        opacity: '0',
        pointerEvents: 'none',
      });
      document.body.appendChild(img);
      _transparentDragImage = img;
    }
    return _transparentDragImage;
  };

  const handleCellDragStart = useCallback((e, rowId, columnId) => {
    e.stopPropagation(); // don't trigger row-drag on the rowNum grip
    const row = data.find(r => r.id === rowId);
    if (!row) return;

    // Suppress ghost image using a transparent PNG in the DOM (same technique as TacticsPage)
    e.dataTransfer.setDragImage(getTransparentDragImage(), 0, 0);

    const value = row[columnId] ?? '';
    // Block drag: the grabbed cell is one of several selected cells.
    const key = `${rowId}|${columnId}`;
    const block = selectedCells && selectedCells.size > 1 && selectedCells.has(key)
      ? [...selectedCells].map(k => { const [r, c] = k.split('|'); return { rowId: r, columnId: c }; })
      : null;
    setDraggedCell({ rowId, columnId, block });
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', JSON.stringify({ rowId, columnId, value }));
  }, [data, selectedCells]);

  const handleCellDragOver = useCallback((e, rowId, columnId) => {
    if (!draggedCell) return;
    // Don't accept drop onto the exact same cell
    if (draggedCell.rowId === rowId && draggedCell.columnId === columnId) return;

    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    setDropTargetCell({ rowId, columnId });
  }, [draggedCell]);

  const handleCellDragLeave = useCallback((e) => {
    // Only clear when leaving to a non-child element
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setDropTargetCell(null);
    }
  }, []);

  const handleCellDrop = useCallback((e, targetRowId, targetColumnId) => {
    e.preventDefault();
    e.stopPropagation();

    if (!draggedCell) {
      setDropTargetCell(null);
      return;
    }

    const { rowId: sourceRowId, columnId: sourceColumnId } = draggedCell;

    // No-op if dropped on itself
    if (sourceRowId === targetRowId && sourceColumnId === targetColumnId) {
      setDraggedCell(null);
      setDropTargetCell(null);
      return;
    }

    const sourceRow = data.find(r => r.id === sourceRowId);
    const targetRow = data.find(r => r.id === targetRowId);
    if (!sourceRow || !targetRow) {
      setDraggedCell(null);
      setDropTargetCell(null);
      return;
    }

    // ---- Block move: shift every selected cell by the grabbed cell's offset.
    if (draggedCell.block && Array.isArray(allColumnIds)) {
      const rowIndex = new Map(data.map((r, i) => [r.id, i]));
      const colIndex = new Map(allColumnIds.map((c, i) => [c, i]));
      const rowDelta = rowIndex.get(targetRowId) - rowIndex.get(sourceRowId);
      const colDelta = colIndex.get(targetColumnId) - colIndex.get(sourceColumnId);
      const isTaskRow = (r) => !isSpecialRow(r);
      // moves: [{ from: {rowId, columnId, value}, to: {rowId, columnId, value} }]
      const moves = [];
      for (const cell of draggedCell.block) {
        const ri = rowIndex.get(cell.rowId);
        const ci = colIndex.get(cell.columnId);
        if (ri == null || ci == null) continue;
        const destRow = data[ri + rowDelta];
        const destCol = allColumnIds[ci + colDelta];
        if (!destRow || !destCol || !isTaskRow(destRow)) continue;
        const fromRow = data[ri];
        moves.push({
          from: { rowId: cell.rowId, columnId: cell.columnId, value: fromRow[cell.columnId] ?? '' },
          to: { rowId: destRow.id, columnId: destCol, value: destRow[destCol] ?? '' },
        });
      }
      if (moves.length === 0) {
        setDraggedCell(null);
        setDropTargetCell(null);
        return;
      }
      const applyCells = (prevData, writes) => {
        // writes: Map<rowId, Map<columnId, value>>
        return prevData.map(row => {
          const w = writes.get(row.id);
          if (!w) return row;
          const next = { ...row };
          for (const [col, val] of w) next[col] = val;
          return next;
        });
      };
      const plan = (pairs) => {
        const writes = new Map();
        const put = (rowId, col, val) => {
          if (!writes.has(rowId)) writes.set(rowId, new Map());
          writes.get(rowId).set(col, val);
        };
        // Clear sources first, then write destinations, so overlapping
        // source/destination cells end up with the moved value.
        for (const [src] of pairs) put(src.rowId, src.columnId, '');
        for (const [, dst, val] of pairs) put(dst.rowId, dst.columnId, val);
        return writes;
      };
      const forward = plan(moves.map(m => [m.from, m.to, m.from.value]));
      // Undo: restore every touched cell to its pre-move value (destinations
      // first, then sources, so a source that was also a destination gets
      // its original source value back).
      const undoWrites = new Map();
      const putUndo = (rowId, col, val) => {
        if (!undoWrites.has(rowId)) undoWrites.set(rowId, new Map());
        undoWrites.get(rowId).set(col, val);
      };
      for (const m of moves) putUndo(m.to.rowId, m.to.columnId, m.to.value);
      for (const m of moves) putUndo(m.from.rowId, m.from.columnId, m.from.value);

      executeCommand({
        execute: () => setData(prev => applyCells(prev, forward)),
        undo: () => setData(prev => applyCells(prev, undoWrites)),
      });
      setDraggedCell(null);
      setDropTargetCell(null);
      setSelectedCells?.(new Set(moves.map(m => `${m.to.rowId}|${m.to.columnId}`)));
      setAnchorCell?.({ rowId: targetRowId, columnId: targetColumnId });
      return;
    }

    const sourceValue = sourceRow[sourceColumnId] ?? '';
    const targetValue = targetRow[targetColumnId] ?? '';

    const command = {
      execute: () => {
        setData(prevData =>
          prevData.map(row => {
            if (row.id === sourceRowId && row.id === targetRowId) {
              // Same row — swap both columns in one pass
              return { ...row, [sourceColumnId]: '', [targetColumnId]: sourceValue };
            }
            if (row.id === sourceRowId) {
              return { ...row, [sourceColumnId]: '' };
            }
            if (row.id === targetRowId) {
              return { ...row, [targetColumnId]: sourceValue };
            }
            return row;
          })
        );
      },
      undo: () => {
        setData(prevData =>
          prevData.map(row => {
            if (row.id === sourceRowId && row.id === targetRowId) {
              return { ...row, [sourceColumnId]: sourceValue, [targetColumnId]: targetValue };
            }
            if (row.id === sourceRowId) {
              return { ...row, [sourceColumnId]: sourceValue };
            }
            if (row.id === targetRowId) {
              return { ...row, [targetColumnId]: targetValue };
            }
            return row;
          })
        );
      },
    };

    executeCommand(command);
    setDraggedCell(null);
    setDropTargetCell(null);
    // Select the destination cell after drop
    setSelectedCells?.(new Set([`${targetRowId}|${targetColumnId}`]));
    setAnchorCell?.({ rowId: targetRowId, columnId: targetColumnId });
  }, [draggedCell, data, setData, executeCommand, setSelectedCells, setAnchorCell, allColumnIds]);

  const handleCellDragEnd = useCallback(() => {
    setDraggedCell(null);
    setDropTargetCell(null);
  }, []);

  const isCellBeingDragged = useCallback((rowId, columnId) => {
    return draggedCell?.rowId === rowId && draggedCell?.columnId === columnId;
  }, [draggedCell]);

  const isCellDropTarget = useCallback((rowId, columnId) => {
    return dropTargetCell?.rowId === rowId && dropTargetCell?.columnId === columnId;
  }, [dropTargetCell]);

  return {
    draggedCell,
    dropTargetCell,
    handleCellDragStart,
    handleCellDragOver,
    handleCellDragLeave,
    handleCellDrop,
    handleCellDragEnd,
    isCellBeingDragged,
    isCellDropTarget,
  };
}
