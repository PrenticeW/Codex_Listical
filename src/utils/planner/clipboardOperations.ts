/**
 * Clipboard Operations Utilities
 *
 * Handles copy and paste operations for the planner spreadsheet.
 * Supports multiple modes:
 * - Row Copy/Paste: Copy entire rows
 * - Cell Copy/Paste: Copy selected cells
 * - Fill Mode: Paste single value to multiple targets
 * - Range Mode: Paste grid of values
 * - Special formula handling: =timeValue linking
 */

/**
 * Handle copy operation for selected rows or cells
 * @param params Configuration object
 * @returns TSV string copied to clipboard, or null if nothing to copy
 */
export const handleCopyOperation = (params: {
  selectedRows: Set<string>;
  selectedCells: Set<string>;
  data: any[];
  allColumnIds: string[];
  editingCell: string | null;
  lastCopiedColumnsRef: React.MutableRefObject<string[]>;
}): string | null => {
  const { selectedRows, selectedCells, data, allColumnIds, editingCell, lastCopiedColumnsRef } = params;

  if (editingCell) return null; // Don't copy while editing
  if (selectedCells.size === 0 && selectedRows.size === 0) return null;

  // ROW COPY MODE: If rows are selected, copy entire rows
  if (selectedRows.size > 0) {
    // Get selected rows in order (use original data to preserve =timeValue formulas)
    const selectedRowIds = Array.from(selectedRows);
    const rowsInOrder = data.filter(row => selectedRowIds.includes(row.id));

    // Convert each row to TSV
    const tsvData = rowsInOrder.map(row => {
      return allColumnIds.map(colId => row[colId] || '').join('\t');
    }).join('\n');

    // Track that we copied all columns
    lastCopiedColumnsRef.current = allColumnIds;

    return tsvData;
  }

  // CELL COPY MODE: Copy selected cells
  // Get all selected cells and organize by row/column
  const cellsByRow = new Map();
  const copiedColumns = new Set<string>();

  selectedCells.forEach(cellKey => {
    const [rowId, columnId] = cellKey.split('|');
    if (columnId === 'rowNum') return; // Skip row number column

    copiedColumns.add(columnId);

    if (!cellsByRow.has(rowId)) {
      cellsByRow.set(rowId, new Map());
    }

    // Use original data to preserve =timeValue formulas
    const row = data.find(r => r.id === rowId);
    if (row) {
      const cellValue = row[columnId] || '';
      cellsByRow.get(rowId).set(columnId, cellValue);
    }
  });

  // Track which columns were copied (to detect timeValue copy)
  lastCopiedColumnsRef.current = Array.from(copiedColumns);

  // Convert to TSV (Tab-Separated Values) format for clipboard
  const rows = Array.from(cellsByRow.values());
  const tsvData = rows.map(cellMap => {
    return Array.from(cellMap.values()).join('\t');
  }).join('\n');

  return tsvData;
};

/**
 * Create paste command for row fill mode (single row pasted to multiple rows)
 */
const createRowFillCommand = (params: {
  pastedRows: string[][];
  selectedRowIndices: number[];
  data: any[];
  allColumnIds: string[];
  setData: React.Dispatch<React.SetStateAction<any[]>>;
}) => {
  const { pastedRows, selectedRowIndices, data, allColumnIds, setData } = params;
  const pastedRowValues = pastedRows[0];

  // Store old values for undo
  const oldValues = new Map<string, Map<string, any>>();

  selectedRowIndices.forEach(dataRowIndex => {
    const rowId = data[dataRowIndex].id;
    const rowOldValues = new Map();

    pastedRowValues.forEach((value, colIndex) => {
      if (colIndex < allColumnIds.length) {
        const columnId = allColumnIds[colIndex];
        rowOldValues.set(columnId, data[dataRowIndex][columnId] || '');
      }
    });

    if (rowOldValues.size > 0) {
      oldValues.set(rowId, rowOldValues);
    }
  });

  return {
    execute: () => {
      setData(prev => {
        const newData = [...prev];

        selectedRowIndices.forEach(dataRowIndex => {
          const rowUpdates: Record<string, any> = {};
          pastedRowValues.forEach((value, colIndex) => {
            if (colIndex < allColumnIds.length) {
              const columnId = allColumnIds[colIndex];
              rowUpdates[columnId] = value;
            }
          });

          newData[dataRowIndex] = { ...newData[dataRowIndex], ...rowUpdates };
        });

        return newData;
      });
    },
    undo: () => {
      setData(prev => {
        const newData = [...prev];

        oldValues.forEach((rowOldValues, rowId) => {
          const rowIndex = newData.findIndex(r => r.id === rowId);
          if (rowIndex === -1) return;

          const rowUpdates: Record<string, any> = {};
          rowOldValues.forEach((value, columnId) => {
            rowUpdates[columnId] = value;
          });

          newData[rowIndex] = { ...newData[rowIndex], ...rowUpdates };
        });

        return newData;
      });
    },
  };
};

/**
 * Create paste command for row range mode (multiple rows pasted)
 */
const createRowRangeCommand = (params: {
  pastedRows: string[][];
  targetRowIndex: number;
  data: any[];
  allColumnIds: string[];
  setData: React.Dispatch<React.SetStateAction<any[]>>;
}) => {
  const { pastedRows, targetRowIndex, data, allColumnIds, setData } = params;

  const rowsToPaste = Math.min(pastedRows.length, data.length - targetRowIndex);
  const oldValues = new Map<string, Map<string, any>>();

  // Store old values
  for (let i = 0; i < rowsToPaste; i++) {
    const dataRowIndex = targetRowIndex + i;
    const rowId = data[dataRowIndex].id;
    const pastedRowValues = pastedRows[i];

    const rowOldValues = new Map();
    pastedRowValues.forEach((value, colIndex) => {
      if (colIndex < allColumnIds.length) {
        const columnId = allColumnIds[colIndex];
        rowOldValues.set(columnId, data[dataRowIndex][columnId] || '');
      }
    });

    if (rowOldValues.size > 0) {
      oldValues.set(rowId, rowOldValues);
    }
  }

  return {
    execute: () => {
      setData(prev => {
        const newData = [...prev];

        for (let i = 0; i < rowsToPaste; i++) {
          const dataRowIndex = targetRowIndex + i;
          const pastedRowValues = pastedRows[i];

          const rowUpdates: Record<string, any> = {};
          pastedRowValues.forEach((value, colIndex) => {
            if (colIndex < allColumnIds.length) {
              const columnId = allColumnIds[colIndex];
              rowUpdates[columnId] = value;
            }
          });

          newData[dataRowIndex] = { ...newData[dataRowIndex], ...rowUpdates };
        }

        return newData;
      });
    },
    undo: () => {
      setData(prev => {
        const newData = [...prev];

        oldValues.forEach((rowOldValues, rowId) => {
          const rowIndex = newData.findIndex(r => r.id === rowId);
          if (rowIndex === -1) return;

          const rowUpdates: Record<string, any> = {};
          rowOldValues.forEach((value, columnId) => {
            rowUpdates[columnId] = value;
          });

          newData[rowIndex] = { ...newData[rowIndex], ...rowUpdates };
        });

        return newData;
      });
    },
  };
};

/**
 * Create paste command for cell fill mode (single value pasted to multiple cells)
 */
const createCellFillCommand = (params: {
  pastedText: string;
  selectedCells: Set<string>;
  data: any[];
  copiedFromTimeValue: boolean;
  setData: React.Dispatch<React.SetStateAction<any[]>>;
}) => {
  const { pastedText, selectedCells, data, copiedFromTimeValue, setData } = params;

  // Store old values for undo
  const oldValues = new Map<string, Map<string, any>>();

  selectedCells.forEach(cellKey => {
    const [rowId, columnId] = cellKey.split('|');
    if (columnId === 'rowNum') return;

    const row = data.find(r => r.id === rowId);
    if (!row) return;

    if (!oldValues.has(rowId)) {
      oldValues.set(rowId, new Map());
    }
    oldValues.get(rowId)!.set(columnId, row[columnId] || '');
  });

  return {
    execute: () => {
      setData(prev => prev.map(row => {
        const rowUpdates: Record<string, any> = {};
        let hasUpdates = false;

        selectedCells.forEach(cellKey => {
          const [rowId, columnId] = cellKey.split('|');
          if (row.id === rowId && columnId !== 'rowNum') {
            // Always paste the literal value, don't create formula links
            rowUpdates[columnId] = pastedText;
            hasUpdates = true;
          }
        });

        return hasUpdates ? { ...row, ...rowUpdates } : row;
      }));
    },
    undo: () => {
      setData(prev => {
        const newData = [...prev];

        oldValues.forEach((rowOldValues, rowId) => {
          const rowIndex = newData.findIndex(r => r.id === rowId);
          if (rowIndex === -1) return;

          const rowUpdates: Record<string, any> = {};
          rowOldValues.forEach((value, columnId) => {
            rowUpdates[columnId] = value;
          });

          newData[rowIndex] = { ...newData[rowIndex], ...rowUpdates };
        });

        return newData;
      });
    },
  };
};

/**
 * Create paste command for cell range mode (grid of values pasted)
 */
const createCellRangeCommand = (params: {
  rows: string[][];
  anchorRowIndex: number;
  anchorColIndex: number;
  data: any[];
  allColumnIds: string[];
  copiedFromTimeValue: boolean;
  lastCopiedColumns: string[];
  setData: React.Dispatch<React.SetStateAction<any[]>>;
}) => {
  const { rows, anchorRowIndex, anchorColIndex, data, allColumnIds, copiedFromTimeValue, lastCopiedColumns, setData } = params;

  // Store old values for undo
  const oldValues = new Map<string, Map<string, any>>();

  rows.forEach((rowValues, rowOffset) => {
    const targetRowIndex = anchorRowIndex + rowOffset;
    if (targetRowIndex >= data.length) return;

    const rowId = data[targetRowIndex].id;
    const rowOldValues = new Map();

    rowValues.forEach((value, colOffset) => {
      const targetColIndex = anchorColIndex + colOffset;
      if (targetColIndex >= allColumnIds.length) return;

      const columnId = allColumnIds[targetColIndex];
      rowOldValues.set(columnId, data[targetRowIndex][columnId] || '');
    });

    if (rowOldValues.size > 0) {
      oldValues.set(rowId, rowOldValues);
    }
  });

  return {
    execute: () => {
      setData(prev => {
        const newData = [...prev];

        rows.forEach((rowValues, rowOffset) => {
          const targetRowIndex = anchorRowIndex + rowOffset;
          if (targetRowIndex >= newData.length) return;

          const rowUpdates: Record<string, any> = {};
          rowValues.forEach((value, colOffset) => {
            const targetColIndex = anchorColIndex + colOffset;
            if (targetColIndex >= allColumnIds.length) return;

            const columnId = allColumnIds[targetColIndex];
            // Always paste the literal value, don't create formula links
            rowUpdates[columnId] = value;
          });

          newData[targetRowIndex] = { ...newData[targetRowIndex], ...rowUpdates };
        });

        return newData;
      });
    },
    undo: () => {
      setData(prev => {
        const newData = [...prev];

        oldValues.forEach((rowOldValues, rowId) => {
          const rowIndex = newData.findIndex(r => r.id === rowId);
          if (rowIndex === -1) return;

          const rowUpdates: Record<string, any> = {};
          rowOldValues.forEach((value, columnId) => {
            rowUpdates[columnId] = value;
          });

          newData[rowIndex] = { ...newData[rowIndex], ...rowUpdates };
        });

        return newData;
      });
    },
  };
};

/**
 * Handle paste operation for selected rows or cells
 * @param params Configuration object
 * @returns Command object for undo/redo, or null if nothing to paste
 */
export const handlePasteOperation = (params: {
  pastedText: string;
  selectedRows: Set<string>;
  selectedCells: Set<string>;
  data: any[];
  allColumnIds: string[];
  editingCell: string | null;
  lastCopiedColumns: string[];
  setData: React.Dispatch<React.SetStateAction<any[]>>;
}): { execute: () => void; undo: () => void } | null => {
  const { pastedText, selectedRows, selectedCells, data, allColumnIds, editingCell, lastCopiedColumns, setData } = params;

  if (editingCell) return null; // Don't paste while editing
  if (selectedCells.size === 0 && selectedRows.size === 0) return null;
  if (!pastedText) return null;

  // ROW PASTE MODE: If rows are selected, paste into entire rows
  if (selectedRows.size > 0) {
    // Parse TSV data
    const pastedRows = pastedText.split('\n').map(row => row.split('\t'));

    // Get selected rows in order (by their index in data array)
    const selectedRowIds = Array.from(selectedRows);
    const selectedRowIndices = selectedRowIds
      .map(rowId => data.findIndex(r => r.id === rowId))
      .filter(idx => idx !== -1)
      .sort((a, b) => a - b);

    if (selectedRowIndices.length === 0) return null;

    // Check if pasting a single row to multiple selected rows (FILL MODE)
    const isSingleRowPaste = pastedRows.length === 1 && selectedRowIndices.length > 1;

    if (isSingleRowPaste) {
      return createRowFillCommand({ pastedRows, selectedRowIndices, data, allColumnIds, setData });
    } else {
      // RANGE MODE: Paste multiple rows starting from first selected row
      const targetRowIndex = selectedRowIndices[0];
      return createRowRangeCommand({ pastedRows, targetRowIndex, data, allColumnIds, setData });
    }
  }

  // CELL PASTE MODE: Continue with cell paste logic
  // Check if it's a single cell value (no tabs or newlines)
  const isSingleCell = !pastedText.includes('\t') && !pastedText.includes('\n');

  // Get the anchor cell (first selected cell)
  const firstCellKey = Array.from(selectedCells)[0];
  const [anchorRowId, anchorColumnId] = firstCellKey.split('|');

  if (anchorColumnId === 'rowNum') return null; // Don't paste into row number column

  // FILL MODE: Copy one value to all selected cells
  if (isSingleCell && selectedCells.size > 1) {
    // Check if the copied data came from timeValue column
    const copiedFromTimeValue = lastCopiedColumns.length === 1 &&
                                 lastCopiedColumns[0] === 'timeValue';

    return createCellFillCommand({ pastedText, selectedCells, data, copiedFromTimeValue, setData });
  }

  // RANGE MODE: Paste TSV grid starting from anchor cell
  // Parse TSV data
  const rows = pastedText.split('\n').map(row => row.split('\t'));

  // Find the anchor row index and column index
  const anchorRowIndex = data.findIndex(r => r.id === anchorRowId);

  // Get column index from allColumnIds
  const anchorColIndex = allColumnIds.indexOf(anchorColumnId);

  if (anchorRowIndex === -1 || anchorColIndex === -1) return null;

  // Check if we're pasting from timeValue column(s)
  const copiedFromTimeValue = lastCopiedColumns.includes('timeValue');

  return createCellRangeCommand({
    rows,
    anchorRowIndex,
    anchorColIndex,
    data,
    allColumnIds,
    copiedFromTimeValue,
    lastCopiedColumns,
    setData,
  });
};
