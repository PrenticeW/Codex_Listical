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
  const tableRef = useRef(null);

  // Helper to create cell key
  const getCellKey = (rowId, columnId) => `${rowId}|${columnId}`;

  // Helper to check if cell is selected
  const isCellSelected = useCallback((rowId, columnId) => {
    return selectedCells.has(getCellKey(rowId, columnId));
  }, [selectedCells]);

  // Cell interaction handlers
  const handleCellClick = useCallback((e, rowId, columnId, value) => {
    if (columnId === 'rowNum') return; // Don't select row number column

    // Prevent default to avoid text selection when shift/cmd clicking
    if (e.shiftKey || e.metaKey || e.ctrlKey) {
      e.preventDefault();
    }

    const cellKey = getCellKey(rowId, columnId);

    if (e.shiftKey && anchorCell) {
      // Shift-click: range selection (TODO: implement range logic)
      setSelectedCells(new Set([cellKey]));
      setAnchorCell({ rowId, columnId });
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
    } else {
      // Normal click: single selection
      setSelectedCells(new Set([cellKey]));
      setAnchorCell({ rowId, columnId });
    }

    setEditingCell(null);
  }, [anchorCell]);

  const handleCellDoubleClick = useCallback((rowId, columnId, value) => {
    if (columnId === 'rowNum') return;

    setEditingCell({ rowId, columnId });
    setEditValue(value);
  }, []);

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

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Don't interfere if we're editing
      if (editingCell) return;

      // Get the first selected cell
      const firstCellKey = Array.from(selectedCells)[0];
      if (!firstCellKey) return;

      const [currentRowId, currentColumnId] = firstCellKey.split('|');

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
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedCells, editingCell]);

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
                    }}
                    className="border border-gray-300 px-2 py-2 text-center text-xs font-semibold text-gray-700 relative"
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}

                    {/* Column resize handle - wider hitbox for easier grabbing */}
                    {header.column.getCanResize() && (
                      <div
                        onMouseDown={header.getResizeHandler()}
                        onTouchStart={header.getResizeHandler()}
                        className="absolute right-0 top-0 h-full w-4 cursor-col-resize group"
                        style={{ right: '-8px' }} // Wider hitbox centered on border
                        title="Drag to resize column"
                      >
                        <div
                          className="absolute left-1/2 top-0 h-full w-0.5 -translate-x-1/2 group-hover:bg-blue-500 transition-colors"
                          style={{
                            background: header.column.getIsResizing() ? '#3b82f6' : 'transparent'
                          }}
                        />
                      </div>
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
                      }}
                      className="p-0"
                    >
                      <div
                        className={`h-full border-r border-b border-gray-300 px-2 py-1 cursor-cell min-h-[32px] ${
                          isSelected && !isEditing ? 'ring-2 ring-inset ring-blue-500 bg-blue-50' : ''
                        } ${columnId === 'rowNum' ? 'bg-gray-50' : ''}`}
                        onClick={(e) => handleCellClick(e, rowId, columnId, value)}
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
          Try: Click to select • Cmd/Ctrl+Click for multi • Double-click to edit • Delete to clear
        </div>
      </div>
    </div>
  );
}
