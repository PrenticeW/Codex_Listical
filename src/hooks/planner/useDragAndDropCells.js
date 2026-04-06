import { useState, useCallback } from 'react';

/**
 * Hook to manage cell-level drag-and-drop (move cell value to another cell).
 *
 * Behaviour:
 * - Dragging a cell moves its value to the drop target and clears the source.
 * - Works across any column and any task row.
 * - Supports undo/redo via the command pattern.
 * - Provides visual state so TaskRow can highlight the dragged source and valid drop target.
 */
export default function useDragAndDropCells({ data, setData, executeCommand, setSelectedCells, setAnchorCell }) {
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
    setDraggedCell({ rowId, columnId });
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', JSON.stringify({ rowId, columnId, value }));
  }, [data]);

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
  }, [draggedCell, data, setData, executeCommand, setSelectedCells, setAnchorCell]);

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
