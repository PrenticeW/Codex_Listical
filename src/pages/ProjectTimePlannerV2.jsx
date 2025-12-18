import React, { useState, useMemo } from 'react';
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
  const [selectedCell, setSelectedCell] = useState(null); // { rowId, columnId }
  const [editingCell, setEditingCell] = useState(null); // { rowId, columnId }
  const [editValue, setEditValue] = useState('');

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
          <div className="h-full flex items-center justify-center text-gray-500 font-mono text-xs">
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
        cell: ({ row, column }) => {
          const rowId = row.original.id;
          const columnId = column.id;
          const value = row.original[columnId] || '';

          const isSelected = selectedCell?.rowId === rowId && selectedCell?.columnId === columnId;
          const isEditing = editingCell?.rowId === rowId && editingCell?.columnId === columnId;

          return (
            <div
              className={`h-full border-r border-b border-gray-300 px-2 py-1 ${
                isSelected ? 'ring-2 ring-blue-500 bg-blue-50' : ''
              }`}
              onClick={() => handleCellClick(rowId, columnId, value)}
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
                  className="w-full h-full border-none outline-none bg-transparent"
                />
              ) : (
                <div className="text-sm">{value}</div>
              )}
            </div>
          );
        },
      });
    }

    return cols;
  }, [selectedCell, editingCell, editValue]);

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    enableColumnResizing: true,
    columnResizeMode: 'onChange',
  });

  // Cell interaction handlers
  const handleCellClick = (rowId, columnId, value) => {
    if (columnId === 'rowNum') return; // Don't select row number column

    setSelectedCell({ rowId, columnId });
    setEditingCell(null);
  };

  const handleCellDoubleClick = (rowId, columnId, value) => {
    if (columnId === 'rowNum') return;

    setEditingCell({ rowId, columnId });
    setEditValue(value);
  };

  const handleEditComplete = (rowId, columnId) => {
    // Update data
    setData(prev => prev.map(row => {
      if (row.id === rowId) {
        return { ...row, [columnId]: editValue };
      }
      return row;
    }));

    setEditingCell(null);
    setEditValue('');
  };

  const handleEditKeyDown = (e, rowId, columnId) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleEditComplete(rowId, columnId);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setEditingCell(null);
      setEditValue('');
    }
  };

  return (
    <div className="w-full h-screen flex flex-col bg-gray-50 p-4">
      <div className="mb-4">
        <h1 className="text-2xl font-bold">Project Time Planner v2</h1>
        <p className="text-sm text-gray-600">Google Sheets-like spreadsheet with TanStack Table v8</p>
      </div>

      <div className="flex-1 overflow-auto border border-gray-300 bg-white">
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
                    className="border border-gray-300 px-2 py-1 text-center text-xs font-semibold text-gray-700 relative"
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}

                    {/* Column resize handle */}
                    {header.column.getCanResize() && (
                      <div
                        onMouseDown={header.getResizeHandler()}
                        onTouchStart={header.getResizeHandler()}
                        className="absolute right-0 top-0 h-full w-1 cursor-col-resize bg-blue-500 opacity-0 hover:opacity-100"
                      />
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map(row => (
              <tr key={row.id} className="hover:bg-gray-50">
                {row.getVisibleCells().map(cell => (
                  <td
                    key={cell.id}
                    style={{
                      width: cell.column.getSize(),
                      minWidth: cell.column.getSize(),
                      maxWidth: cell.column.getSize(),
                    }}
                    className="p-0"
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Debug info */}
      <div className="mt-4 p-2 bg-gray-100 rounded text-xs">
        <div>Selected: {selectedCell ? `${selectedCell.rowId} / ${selectedCell.columnId}` : 'None'}</div>
        <div>Editing: {editingCell ? `${editingCell.rowId} / ${editingCell.columnId}` : 'None'}</div>
      </div>
    </div>
  );
}
