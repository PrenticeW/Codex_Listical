import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
} from '@tanstack/react-table';

/**
 * Google Sheets-like Spreadsheet using TanStack Table v8
 *
 * Phase 1: Core spreadsheet features
 * - Cell selection (single, multi, range)
 * - Keyboard navigation
 * - Copy/paste
 * - Inline editing
 * - Column resizing
 * - Row virtualization
 */

// Sample data structure - will be replaced with real data later
const createInitialData = (rowCount = 50) => {
  return Array.from({ length: rowCount }, (_, rowIndex) => {
    const row = {
      id: `row-${rowIndex}`,
      rowNum: rowIndex + 1,
    };

    // Add 12 editable columns (A-L)
    for (let colIndex = 0; colIndex < 12; colIndex++) {
      const colLetter = String.fromCharCode(65 + colIndex); // A, B, C, ...
      row[`col${colLetter}`] = '';
    }

    return row;
  });
};

export default function ProjectTimePlannerV2() {
  const [data, setData] = useState(() => createInitialData(50));
  const [selectedCells, setSelectedCells] = useState(new Set()); // Set of "rowId|columnId"
  const [anchorCell, setAnchorCell] = useState(null); // For shift-click range selection
  const [editingCell, setEditingCell] = useState(null); // { rowId, columnId }
  const [editValue, setEditValue] = useState('');
  const [columnSizing, setColumnSizing] = useState({}); // Track column sizes
  const [isDragging, setIsDragging] = useState(false); // Track if user is dragging to select
  const [dragStartCell, setDragStartCell] = useState(null); // { rowId, columnId }
  const tableRef = useRef(null);

  // Helper to create cell key
  const getCellKey = (rowId, columnId) => `${rowId}|${columnId}`;

  // Helper to check if cell is selected
  const isCellSelected = useCallback((rowId, columnId) => {
    return selectedCells.has(getCellKey(rowId, columnId));
  }, [selectedCells]);

  // Helper to get rectangular range of cells between two cells
  const getCellRange = useCallback((startCell, endCell) => {
    if (!startCell || !endCell) return new Set();

    const allColumnIds = ['colA', 'colB', 'colC', 'colD', 'colE', 'colF', 'colG', 'colH', 'colI', 'colJ', 'colK', 'colL'];

    // Get row indices
    const startRowIndex = data.findIndex(r => r.id === startCell.rowId);
    const endRowIndex = data.findIndex(r => r.id === endCell.rowId);

    // Get column indices
    const startColIndex = allColumnIds.indexOf(startCell.columnId);
    const endColIndex = allColumnIds.indexOf(endCell.columnId);

    if (startRowIndex === -1 || endRowIndex === -1 || startColIndex === -1 || endColIndex === -1) {
      return new Set();
    }

    // Calculate min/max for the range
    const minRow = Math.min(startRowIndex, endRowIndex);
    const maxRow = Math.max(startRowIndex, endRowIndex);
    const minCol = Math.min(startColIndex, endColIndex);
    const maxCol = Math.max(startColIndex, endColIndex);

    // Generate all cells in the range
    const range = new Set();
    for (let r = minRow; r <= maxRow; r++) {
      for (let c = minCol; c <= maxCol; c++) {
        const rowId = data[r].id;
        const columnId = allColumnIds[c];
        range.add(getCellKey(rowId, columnId));
      }
    }

    return range;
  }, [data]);

  // Edit handlers
  const handleEditComplete = useCallback((rowId, columnId) => {
    // Update data
    setData(prev => prev.map(row => {
      if (row.id === rowId) {
        return { ...row, [columnId]: editValue };
      }
      return row;
    }));

    setEditingCell(null);
    setEditValue('');
  }, [editValue]);

  const handleEditKeyDown = useCallback((e, rowId, columnId) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleEditComplete(rowId, columnId);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setEditingCell(null);
      setEditValue('');
    }
  }, [handleEditComplete]);

  // Cell interaction handlers
  const handleCellMouseDown = useCallback((e, rowId, columnId) => {
    if (columnId === 'rowNum') return; // Don't select row number column

    // Prevent default to avoid text selection
    e.preventDefault();

    // If we're editing a different cell, save it first
    if (editingCell && (editingCell.rowId !== rowId || editingCell.columnId !== columnId)) {
      handleEditComplete(editingCell.rowId, editingCell.columnId);
    }

    const cellKey = getCellKey(rowId, columnId);

    if (e.shiftKey && anchorCell) {
      // Shift-click: range selection from anchor
      const range = getCellRange(anchorCell, { rowId, columnId });
      setSelectedCells(range);
      setEditingCell(null);
    } else if (e.metaKey || e.ctrlKey) {
      // Cmd/Ctrl-click: toggle selection
      setSelectedCells(prev => {
        const next = new Set(prev);
        if (next.has(cellKey)) {
          next.delete(cellKey);
        } else {
          next.add(cellKey);
        }
        return next;
      });
      setAnchorCell({ rowId, columnId });
      setEditingCell(null);
    } else {
      // Normal mouse down: start drag selection
      setSelectedCells(new Set([cellKey]));
      setAnchorCell({ rowId, columnId });
      setDragStartCell({ rowId, columnId });
      setIsDragging(true);
      setEditingCell(null);
    }
  }, [anchorCell, getCellRange, editingCell, handleEditComplete]);

  const handleCellMouseEnter = useCallback((e, rowId, columnId) => {
    if (!isDragging || !dragStartCell || columnId === 'rowNum') return;

    // Update selection to include range from drag start to current cell
    const range = getCellRange(dragStartCell, { rowId, columnId });
    setSelectedCells(range);
  }, [isDragging, dragStartCell, getCellRange]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    setDragStartCell(null);
  }, []);

  const handleCellDoubleClick = useCallback((rowId, columnId, value) => {
    if (columnId === 'rowNum') return;

    setEditingCell({ rowId, columnId });
    setEditValue(value);
  }, []);

  // Copy/Paste functionality
  const handleCopy = useCallback((e) => {
    if (editingCell) return; // Don't copy while editing
    if (selectedCells.size === 0) return;

    e.preventDefault();

    // Get all selected cells and organize by row/column
    const cellsByRow = new Map();

    selectedCells.forEach(cellKey => {
      const [rowId, columnId] = cellKey.split('|');
      if (columnId === 'rowNum') return; // Skip row number column

      if (!cellsByRow.has(rowId)) {
        cellsByRow.set(rowId, new Map());
      }

      const row = data.find(r => r.id === rowId);
      if (row) {
        cellsByRow.get(rowId).set(columnId, row[columnId] || '');
      }
    });

    // Convert to TSV (Tab-Separated Values) format for clipboard
    const rows = Array.from(cellsByRow.values());
    const tsvData = rows.map(cellMap => {
      return Array.from(cellMap.values()).join('\t');
    }).join('\n');

    // Copy to clipboard
    navigator.clipboard.writeText(tsvData);
  }, [selectedCells, data, editingCell]);

  const handlePaste = useCallback((e) => {
    if (editingCell) return; // Don't paste while editing
    if (selectedCells.size === 0) return;

    e.preventDefault();

    // Get clipboard data
    const pastedText = e.clipboardData.getData('text');
    if (!pastedText) return;

    // Parse TSV data
    const rows = pastedText.split('\n').map(row => row.split('\t'));

    // Get the anchor cell (first selected cell)
    const firstCellKey = Array.from(selectedCells)[0];
    const [anchorRowId, anchorColumnId] = firstCellKey.split('|');

    if (anchorColumnId === 'rowNum') return; // Don't paste into row number column

    // Find the anchor row index and column index
    const anchorRowIndex = data.findIndex(r => r.id === anchorRowId);

    // Get all column IDs (excluding rowNum) in order
    const allColumnIds = ['colA', 'colB', 'colC', 'colD', 'colE', 'colF', 'colG', 'colH', 'colI', 'colJ', 'colK', 'colL'];
    const anchorColIndex = allColumnIds.indexOf(anchorColumnId);

    if (anchorRowIndex === -1 || anchorColIndex === -1) return;

    // Update data with pasted values
    setData(prev => {
      const newData = [...prev];

      rows.forEach((rowValues, rowOffset) => {
        const targetRowIndex = anchorRowIndex + rowOffset;
        if (targetRowIndex >= newData.length) return; // Skip if out of bounds

        const rowUpdates = {};
        rowValues.forEach((value, colOffset) => {
          const targetColIndex = anchorColIndex + colOffset;
          if (targetColIndex >= allColumnIds.length) return; // Skip if out of bounds

          const columnId = allColumnIds[targetColIndex];
          rowUpdates[columnId] = value;
        });

        newData[targetRowIndex] = { ...newData[targetRowIndex], ...rowUpdates };
      });

      return newData;
    });
  }, [selectedCells, data, editingCell]);

  // Handle global mouse up to end drag selection
  useEffect(() => {
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseUp]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Don't interfere if we're editing
      if (editingCell) return;

      // Get the first selected cell
      const firstCellKey = Array.from(selectedCells)[0];
      if (!firstCellKey) return;

      const [currentRowId, currentColumnId] = firstCellKey.split('|');

      // Copy: Cmd/Ctrl+C (handled by copy event listener)
      // Paste: Cmd/Ctrl+V (handled by paste event listener)

      // Arrow key navigation (TODO: implement navigation logic)
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();
        console.log('Arrow key pressed:', e.key, 'Current cell:', currentRowId, currentColumnId);
      }

      // Delete/Backspace to clear
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        // Clear all selected cells
        setData(prev => prev.map(row => {
          const rowUpdates = {};
          let hasUpdates = false;

          selectedCells.forEach(cellKey => {
            const [rowId, columnId] = cellKey.split('|');
            if (row.id === rowId && columnId !== 'rowNum') {
              rowUpdates[columnId] = '';
              hasUpdates = true;
            }
          });

          return hasUpdates ? { ...row, ...rowUpdates } : row;
        }));
      }

      // Start typing to edit (if alphanumeric)
      if (e.key.length === 1 && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setEditingCell({ rowId: currentRowId, columnId: currentColumnId });
        setEditValue(e.key);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('copy', handleCopy);
    window.addEventListener('paste', handlePaste);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('copy', handleCopy);
      window.removeEventListener('paste', handlePaste);
    };
  }, [selectedCells, editingCell, handleCopy, handlePaste]);

  // Column definitions
  const columns = useMemo(() => {
    const cols = [
      {
        id: 'rowNum',
        header: '#',
        accessorKey: 'rowNum',
        size: 50,
        enableResizing: false,
        cell: ({ getValue }) => (
          <div className="h-full flex items-center justify-center text-gray-500 font-mono text-xs bg-gray-50">
            {getValue()}
          </div>
        ),
      },
    ];

    // Add 12 editable columns (A-L)
    for (let i = 0; i < 12; i++) {
      const colLetter = String.fromCharCode(65 + i);
      cols.push({
        id: `col${colLetter}`,
        header: colLetter,
        accessorKey: `col${colLetter}`,
        size: 120,
        minSize: 50,
        maxSize: 500,
        enableResizing: true,
      });
    }

    return cols;
  }, []);

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    enableColumnResizing: true,
    columnResizeMode: 'onChange',
    state: {
      columnSizing,
    },
    onColumnSizingChange: setColumnSizing,
  });

  return (
    <div className="w-full h-screen flex flex-col bg-gray-50 p-4">
      <div className="mb-4">
        <h1 className="text-2xl font-bold">Project Time Planner v2</h1>
        <p className="text-sm text-gray-600">Google Sheets-like spreadsheet with TanStack Table v8</p>
      </div>

      <div ref={tableRef} className="flex-1 overflow-auto border border-gray-300 bg-white">
        <table className="border-collapse w-full">
          <thead className="sticky top-0 bg-gray-100 z-10">
            {table.getHeaderGroups().map(headerGroup => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map(header => (
                  <th
                    key={header.id}
                    style={{
                      width: header.getSize(),
                      minWidth: header.getSize(),
                      maxWidth: header.getSize(),
                      position: 'relative',
                    }}
                    className="border border-gray-300 px-2 py-2 text-center text-xs font-semibold text-gray-700"
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}

                    {/* Column resize handle - subtle but functional */}
                    {header.column.getCanResize() && (
                      <div
                        onMouseDown={header.getResizeHandler()}
                        style={{
                          position: 'absolute',
                          top: 0,
                          right: 0,
                          height: '100%',
                          width: '4px',
                          backgroundColor: header.column.getIsResizing() ? '#3b82f6' : 'transparent',
                          cursor: 'col-resize',
                          zIndex: 9999,
                          pointerEvents: 'auto'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#93c5fd'}
                        onMouseLeave={(e) => {
                          if (!header.column.getIsResizing()) {
                            e.currentTarget.style.backgroundColor = 'transparent';
                          }
                        }}
                        title="Drag to resize column"
                      />
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map(row => (
              <tr key={row.id}>
                {row.getVisibleCells().map(cell => {
                  const rowId = row.original.id;
                  const columnId = cell.column.id;
                  const value = row.original[columnId] || '';

                  const isSelected = isCellSelected(rowId, columnId);
                  const isEditing = editingCell?.rowId === rowId && editingCell?.columnId === columnId;

                  return (
                    <td
                      key={cell.id}
                      style={{
                        width: cell.column.getSize(),
                        minWidth: cell.column.getSize(),
                        maxWidth: cell.column.getSize(),
                        height: '32px',
                        userSelect: 'none', // Disable text selection
                        WebkitUserSelect: 'none', // Safari
                        MozUserSelect: 'none', // Firefox
                        msUserSelect: 'none', // IE/Edge
                      }}
                      className="p-0"
                    >
                      <div
                        className={`h-full border-r border-b border-gray-300 px-2 py-1 cursor-cell min-h-[32px] ${
                          isSelected && !isEditing ? 'ring-2 ring-inset ring-blue-500 bg-blue-50' : ''
                        } ${columnId === 'rowNum' ? 'bg-gray-50' : ''}`}
                        onMouseDown={(e) => handleCellMouseDown(e, rowId, columnId)}
                        onMouseEnter={() => handleCellMouseEnter({}, rowId, columnId)}
                        onDoubleClick={() => handleCellDoubleClick(rowId, columnId, value)}
                      >
                        {isEditing ? (
                          <input
                            type="text"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={() => handleEditComplete(rowId, columnId)}
                            onKeyDown={(e) => handleEditKeyDown(e, rowId, columnId)}
                            autoFocus
                            className="w-full h-full border-none outline-none bg-transparent text-sm"
                          />
                        ) : (
                          <div className="text-sm min-h-[20px]">{value || '\u00A0'}</div>
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Debug info */}
      <div className="mt-4 p-2 bg-gray-100 rounded text-xs font-mono">
        <div>Selected cells: {selectedCells.size} {selectedCells.size > 0 && `(${Array.from(selectedCells).join(', ')})`}</div>
        <div>Editing: {editingCell ? `${editingCell.rowId} / ${editingCell.columnId}` : 'None'}</div>
        <div className="text-gray-500 mt-1">
          Try: Click to select • Drag to select range • Shift+Click for range • Cmd/Ctrl+Click for multi • Double-click to edit • Delete to clear • Cmd/Ctrl+C to copy • Cmd/Ctrl+V to paste
        </div>
      </div>
    </div>
  );
}
