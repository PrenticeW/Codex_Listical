import { useCallback, useMemo, useRef, useState } from 'react';

const getCellDescriptorKey = (rowId, cellId) => {
  if (!rowId || !cellId) return null;
  return `${rowId}|${cellId}`;
};

export default function useCellSelection({ columnStructure, tableRows }) {
  const [selectedCellKeys, setSelectedCellKeys] = useState(() => new Set());
  const anchorRef = useRef(null);
  const focusRef = useRef(null);

  const columnIndexByKey = useMemo(() => {
    const map = {};
    columnStructure.forEach((column, index) => {
      map[column.key] = index;
    });
    return map;
  }, [columnStructure]);

  const rowIndexById = useMemo(() => {
    const map = new Map();
    tableRows.forEach((row) => {
      map.set(row.original.id, row.index);
    });
    return map;
  }, [tableRows]);

  const getRangeSelectionKeys = useCallback(
    (anchorDescriptor, focusDescriptor) => {
      if (
        !anchorDescriptor ||
        !focusDescriptor ||
        anchorDescriptor.rowIndex == null ||
        focusDescriptor.rowIndex == null ||
        anchorDescriptor.columnIndex == null ||
        focusDescriptor.columnIndex == null
      ) {
        return new Set();
      }
      const rowStart = Math.min(anchorDescriptor.rowIndex, focusDescriptor.rowIndex);
      const rowEnd = Math.max(anchorDescriptor.rowIndex, focusDescriptor.rowIndex);
      const colStart = Math.min(anchorDescriptor.columnIndex, focusDescriptor.columnIndex);
      const colEnd = Math.max(anchorDescriptor.columnIndex, focusDescriptor.columnIndex);
      const keys = new Set();
      for (let rowIndex = rowStart; rowIndex <= rowEnd; rowIndex += 1) {
        const row = tableRows[rowIndex];
        if (!row) continue;
        const rowId = row.original.id;
        for (let colIndex = colStart; colIndex <= colEnd; colIndex += 1) {
          const column = columnStructure[colIndex];
          if (!column) continue;
          const descriptorKey = getCellDescriptorKey(rowId, column.key);
          if (descriptorKey) {
            keys.add(descriptorKey);
          }
        }
      }
      return keys;
    },
    [columnStructure, tableRows]
  );

  const setSelectionAnchor = useCallback((descriptor) => {
    anchorRef.current = descriptor;
  }, []);

  const setSelectionFocus = useCallback((descriptor) => {
    focusRef.current = descriptor;
  }, []);

  const clearSelection = useCallback(() => {
    anchorRef.current = null;
    focusRef.current = null;
    setSelectedCellKeys(new Set());
  }, []);

  const isCellInSelection = useCallback(
    (rowId, cellId) => {
      const key = getCellDescriptorKey(rowId, cellId);
      return Boolean(key && selectedCellKeys.has(key));
    },
    [selectedCellKeys]
  );

  return {
    selectedCellKeys,
    setSelectedCellKeys,
    columnIndexByKey,
    rowIndexById,
    getCellDescriptorKey,
    getRangeSelectionKeys,
    isCellInSelection,
    setSelectionAnchor,
    setSelectionFocus,
    clearSelection,
    cellSelectionAnchorRef: anchorRef,
    cellSelectionFocusRef: focusRef,
  };
}
