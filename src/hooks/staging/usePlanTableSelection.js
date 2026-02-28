import { useCallback, useRef, useState } from 'react';

/**
 * Get a unique key for a cell in the plan table
 * Format: itemId|rowIdx|colIdx
 */
const getCellKey = (itemId, rowIdx, colIdx) => {
  if (itemId == null || rowIdx == null || colIdx == null) return null;
  return `${itemId}|${rowIdx}|${colIdx}`;
};

/**
 * Parse a cell key back into its components
 */
const parseCellKey = (key) => {
  if (!key) return null;
  const parts = key.split('|');
  if (parts.length !== 3) return null;
  return {
    itemId: parts[0],
    rowIdx: parseInt(parts[1], 10),
    colIdx: parseInt(parts[2], 10),
  };
};

/**
 * Hook to manage cell selection state for plan tables
 */
export default function usePlanTableSelection() {
  const [selectedCells, setSelectedCells] = useState(() => new Set());
  const [selectedRows, setSelectedRows] = useState(() => new Set()); // Format: itemId|rowIdx
  const anchorRef = useRef(null); // { itemId, rowIdx, colIdx }
  const focusRef = useRef(null); // { itemId, rowIdx, colIdx }
  const isDraggingRef = useRef(false);

  /**
   * Calculate all cells in a rectangular range between anchor and focus
   * Only works within the same item (project)
   */
  const getRangeSelectionKeys = useCallback((anchor, focus, totalCols = 6) => {
    if (!anchor || !focus) return new Set();

    // Range selection only works within the same item
    if (anchor.itemId !== focus.itemId) {
      return new Set([getCellKey(focus.itemId, focus.rowIdx, focus.colIdx)]);
    }

    const rowStart = Math.min(anchor.rowIdx, focus.rowIdx);
    const rowEnd = Math.max(anchor.rowIdx, focus.rowIdx);
    const colStart = Math.min(anchor.colIdx, focus.colIdx);
    const colEnd = Math.max(anchor.colIdx, focus.colIdx);

    const keys = new Set();
    for (let rowIdx = rowStart; rowIdx <= rowEnd; rowIdx++) {
      for (let colIdx = colStart; colIdx <= colEnd; colIdx++) {
        const key = getCellKey(anchor.itemId, rowIdx, colIdx);
        if (key) keys.add(key);
      }
    }
    return keys;
  }, []);

  /**
   * Check if a cell is currently selected
   */
  const isCellSelected = useCallback(
    (itemId, rowIdx, colIdx) => {
      const key = getCellKey(itemId, rowIdx, colIdx);
      return Boolean(key && selectedCells.has(key));
    },
    [selectedCells]
  );

  /**
   * Check if a row is currently selected
   */
  const isRowSelected = useCallback(
    (itemId, rowIdx) => {
      const key = `${itemId}|${rowIdx}`;
      return selectedRows.has(key);
    },
    [selectedRows]
  );

  /**
   * Handle cell click - start selection
   */
  const handleCellMouseDown = useCallback(
    (e, itemId, rowIdx, colIdx, totalCols = 6) => {
      const descriptor = { itemId, rowIdx, colIdx };

      if (e.shiftKey && anchorRef.current) {
        // Range selection with shift
        const rangeKeys = getRangeSelectionKeys(anchorRef.current, descriptor, totalCols);
        setSelectedCells(rangeKeys);
        focusRef.current = descriptor;
      } else if (e.metaKey || e.ctrlKey) {
        // Toggle selection with cmd/ctrl
        const key = getCellKey(itemId, rowIdx, colIdx);
        setSelectedCells((prev) => {
          const next = new Set(prev);
          if (next.has(key)) {
            next.delete(key);
          } else {
            next.add(key);
          }
          return next;
        });
        anchorRef.current = descriptor;
        focusRef.current = descriptor;
      } else {
        // Single selection
        anchorRef.current = descriptor;
        focusRef.current = descriptor;
        setSelectedCells(new Set([getCellKey(itemId, rowIdx, colIdx)]));
        isDraggingRef.current = true;
      }

      // Clear row selection when selecting cells
      setSelectedRows(new Set());
    },
    [getRangeSelectionKeys]
  );

  /**
   * Handle mouse enter during drag selection
   */
  const handleCellMouseEnter = useCallback(
    (itemId, rowIdx, colIdx, totalCols = 6) => {
      if (!isDraggingRef.current || !anchorRef.current) return;

      const descriptor = { itemId, rowIdx, colIdx };
      focusRef.current = descriptor;
      const rangeKeys = getRangeSelectionKeys(anchorRef.current, descriptor, totalCols);
      setSelectedCells(rangeKeys);
    },
    [getRangeSelectionKeys]
  );

  /**
   * Handle mouse up - end drag selection
   */
  const handleMouseUp = useCallback(() => {
    isDraggingRef.current = false;
  }, []);

  /**
   * Select an entire row
   */
  const selectRow = useCallback(
    (itemId, rowIdx, totalCols = 6, addToSelection = false) => {
      const rowKey = `${itemId}|${rowIdx}`;

      if (addToSelection) {
        setSelectedRows((prev) => {
          const next = new Set(prev);
          if (next.has(rowKey)) {
            next.delete(rowKey);
          } else {
            next.add(rowKey);
          }
          return next;
        });
      } else {
        setSelectedRows(new Set([rowKey]));
      }

      // Also select all cells in the row
      const cellKeys = new Set();
      for (let colIdx = 0; colIdx < totalCols; colIdx++) {
        const key = getCellKey(itemId, rowIdx, colIdx);
        if (key) cellKeys.add(key);
      }

      if (addToSelection) {
        setSelectedCells((prev) => {
          const next = new Set(prev);
          cellKeys.forEach((key) => {
            if (next.has(key)) {
              // If row was already selected, remove its cells
              next.delete(key);
            } else {
              next.add(key);
            }
          });
          return next;
        });
      } else {
        setSelectedCells(cellKeys);
      }

      anchorRef.current = { itemId, rowIdx, colIdx: 0 };
      focusRef.current = { itemId, rowIdx, colIdx: totalCols - 1 };
    },
    []
  );

  /**
   * Clear all selection
   */
  const clearSelection = useCallback(() => {
    anchorRef.current = null;
    focusRef.current = null;
    isDraggingRef.current = false;
    setSelectedCells(new Set());
    setSelectedRows(new Set());
  }, []);

  /**
   * Get all selected cells grouped by item and row
   */
  const getSelectedCellsByItem = useCallback(() => {
    const byItem = new Map();

    selectedCells.forEach((key) => {
      const parsed = parseCellKey(key);
      if (!parsed) return;

      if (!byItem.has(parsed.itemId)) {
        byItem.set(parsed.itemId, new Map());
      }
      const itemMap = byItem.get(parsed.itemId);

      if (!itemMap.has(parsed.rowIdx)) {
        itemMap.set(parsed.rowIdx, []);
      }
      itemMap.get(parsed.rowIdx).push(parsed.colIdx);
    });

    return byItem;
  }, [selectedCells]);

  return {
    selectedCells,
    selectedRows,
    setSelectedCells,
    setSelectedRows,
    getCellKey,
    parseCellKey,
    getRangeSelectionKeys,
    isCellSelected,
    isRowSelected,
    handleCellMouseDown,
    handleCellMouseEnter,
    handleMouseUp,
    selectRow,
    clearSelection,
    getSelectedCellsByItem,
    anchorRef,
    focusRef,
    isDraggingRef,
  };
}
