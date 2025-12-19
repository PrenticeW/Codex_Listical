import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { GripVertical } from 'lucide-react';

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
const createInitialData = (rowCount = 100, totalDays = 84, startDate) => {
  const rows = [];

  // Calculate dates array
  const start = new Date(startDate);
  const dates = Array.from({ length: totalDays }, (_, i) => {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    return date;
  });

  // Row 1: Month row
  const monthRow = {
    id: 'month-row',
    project: '',
    status: '',
    task: '',
    estimate: '',
    timeValue: '',
    col_f: '',
    col_g: '',
    col_h: '',
  };
  dates.forEach((date, i) => {
    monthRow[`day-${i}`] = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  });
  rows.push(monthRow);

  // Row 2: Week row
  const weekRow = {
    id: 'week-row',
    project: '',
    status: '',
    task: '',
    estimate: '',
    timeValue: '',
    col_f: '',
    col_g: '',
    col_h: '',
  };
  dates.forEach((_, i) => {
    const weekNumber = Math.floor(i / 7) + 1;
    weekRow[`day-${i}`] = `Week ${weekNumber}`;
  });
  rows.push(weekRow);

  // Row 3: Day number row
  const dayRow = {
    id: 'day-row',
    project: '',
    status: '',
    task: '',
    estimate: '',
    timeValue: '',
    col_f: '',
    col_g: '',
    col_h: '',
  };
  dates.forEach((date, i) => {
    dayRow[`day-${i}`] = date.getDate().toString();
  });
  rows.push(dayRow);

  // Row 4: Day of week row
  const dayOfWeekRow = {
    id: 'dayofweek-row',
    project: '',
    status: '',
    task: '',
    estimate: '',
    timeValue: '',
    col_f: '',
    col_g: '',
    col_h: '',
  };
  dates.forEach((date, i) => {
    dayOfWeekRow[`day-${i}`] = date.toLocaleDateString('en-US', { weekday: 'short' });
  });
  rows.push(dayOfWeekRow);

  // Regular data rows (starting from row 5)
  for (let rowIndex = 0; rowIndex < rowCount; rowIndex++) {
    const row = {
      id: `row-${rowIndex}`,
      project: '',
      status: '',
      task: '',
      estimate: '',
      timeValue: '',
      col_f: '',
      col_g: '',
      col_h: '',
    };

    // Add day entry columns (84 days)
    for (let dayIndex = 0; dayIndex < totalDays; dayIndex++) {
      row[`day-${dayIndex}`] = '';
    }

    rows.push(row);
  }

  return rows;
};

// Row Component
function TableRow({
  row,
  virtualRow,
  isRowSelected,
  isCellSelected,
  editingCell,
  editValue,
  setEditValue,
  handleRowNumberClick,
  handleCellMouseDown,
  handleCellMouseEnter,
  handleCellDoubleClick,
  handleEditComplete,
  handleEditKeyDown,
  draggedRowId,
  dropTargetRowId,
  handleDragStart,
  handleDragOver,
  handleDrop,
  handleDragEnd,
  rowHeight,
  cellFontSize,
  headerFontSize,
  gripIconSize,
}) {
  const rowId = row.original.id;
  const isDragging = Array.isArray(draggedRowId) && draggedRowId.includes(rowId);
  const isDropTarget = dropTargetRowId === rowId;

  const style = {
    display: 'flex',
    position: 'absolute',
    top: 0,
    left: 0,
    transform: `translateY(${virtualRow.start}px)`,
    width: '100%',
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <>
      {isDropTarget && draggedRowId && !isDragging && (
        <div
          style={{
            position: 'absolute',
            top: virtualRow.start - 1,
            left: 0,
            width: '100%',
            height: '2px',
            backgroundColor: '#3b82f6',
            zIndex: 1000,
            pointerEvents: 'none',
          }}
        />
      )}
      <tr
        style={style}
        className={isRowSelected || isDragging ? 'selected-row' : ''}
        onDragOver={(e) => handleDragOver(e, rowId)}
        onDrop={(e) => handleDrop(e, rowId)}
      >
      {row.getVisibleCells().map(cell => {
        const columnId = cell.column.id;
        const value = row.original[columnId] || '';
        const isSelected = isCellSelected(rowId, columnId);
        const isEditing = editingCell?.rowId === rowId && editingCell?.columnId === columnId;

        // Special handling for row number column
        if (columnId === 'rowNum') {
          return (
            <td
              key={cell.id}
              style={{
                width: `${cell.column.getSize()}px`,
                flexShrink: 0,
                flexGrow: 0,
                height: `${rowHeight}px`,
                userSelect: 'none',
                WebkitUserSelect: 'none',
                MozUserSelect: 'none',
                msUserSelect: 'none',
                boxSizing: 'border-box',
              }}
              className={`p-0 ${isRowSelected ? 'selected-cell' : ''}`}
            >
              <div
                className={`h-full border-r border-b border-gray-300 px-2 bg-gray-50 flex items-center justify-between text-gray-500 font-mono cursor-pointer`}
                style={{ fontSize: `${headerFontSize}px`, minHeight: `${rowHeight}px` }}
                onClick={(e) => handleRowNumberClick(e, rowId)}
              >
                <div
                  draggable
                  onDragStart={(e) => {
                    e.stopPropagation();
                    handleDragStart(e, rowId);
                  }}
                  onDragEnd={handleDragEnd}
                  className="cursor-grab active:cursor-grabbing flex items-center"
                  title="Drag to reorder"
                >
                  <GripVertical size={gripIconSize} className="text-gray-400 hover:text-gray-600" />
                </div>
                <span>{row.index + 1}</span>
                <div style={{ width: `${gripIconSize}px` }} />
              </div>
            </td>
          );
        }

        return (
          <td
            key={cell.id}
            style={{
              width: `${cell.column.getSize()}px`,
              flexShrink: 0,
              flexGrow: 0,
              height: `${rowHeight}px`,
              userSelect: 'none',
              WebkitUserSelect: 'none',
              MozUserSelect: 'none',
              msUserSelect: 'none',
              boxSizing: 'border-box',
            }}
            className="p-0"
          >
            <div
              className={`h-full border-r border-b border-gray-300 cursor-cell flex items-center ${
                isSelected && !isEditing ? 'ring-2 ring-inset ring-blue-500 bg-blue-50' : ''
              }`}
              style={{ paddingLeft: '3px', paddingRight: '3px', fontSize: `${cellFontSize}px`, minHeight: `${rowHeight}px` }}
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
                  className="w-full border-none outline-none bg-transparent px-0"
                  style={{ height: 'auto', fontSize: `${cellFontSize}px` }}
                />
              ) : (
                <div className="w-full">{value || '\u00A0'}</div>
              )}
            </div>
          </td>
        );
      })}
    </tr>
    </>
  );
}

export default function ProjectTimePlannerV2() {
  // Timeline configuration
  const totalDays = 84; // 12 weeks

  const [startDate, setStartDate] = useState(() => {
    const today = new Date();
    return today.toISOString().split('T')[0]; // YYYY-MM-DD
  });

  const [data, setData] = useState(() => createInitialData(100, totalDays, startDate));
  const [selectedCells, setSelectedCells] = useState(new Set()); // Set of "rowId|columnId"
  const [selectedRows, setSelectedRows] = useState(new Set()); // Set of rowIds for row highlight
  const [anchorRow, setAnchorRow] = useState(null); // For shift-click row range selection
  const [anchorCell, setAnchorCell] = useState(null); // For shift-click range selection
  const [editingCell, setEditingCell] = useState(null); // { rowId, columnId }
  const [editValue, setEditValue] = useState('');
  const [columnSizing, setColumnSizing] = useState(() => {
    // Load column sizes from localStorage
    const saved = localStorage.getItem('planner-column-sizing');
    return saved ? JSON.parse(saved) : {};
  }); // Track column sizes
  const [isDragging, setIsDragging] = useState(false); // Track if user is dragging to select
  const [dragStartCell, setDragStartCell] = useState(null); // { rowId, columnId }
  const [draggedRowId, setDraggedRowId] = useState(null); // Track which row is being dragged
  const [dropTargetRowId, setDropTargetRowId] = useState(null); // Track drop target
  const tableBodyRef = useRef(null);

  // Calculate dates array from startDate
  const dates = useMemo(() => {
    const start = new Date(startDate);
    return Array.from({ length: totalDays }, (_, i) => {
      const date = new Date(start);
      date.setDate(start.getDate() + i);
      return date;
    });
  }, [startDate, totalDays]);

  // Calculate month spans for header
  const monthSpans = useMemo(() => {
    const spans = [];
    let currentMonth = null;
    let currentSpan = 0;

    dates.forEach((date, index) => {
      const monthLabel = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

      if (monthLabel !== currentMonth) {
        if (currentMonth !== null) {
          spans.push({ label: currentMonth, span: currentSpan });
        }
        currentMonth = monthLabel;
        currentSpan = 1;
      } else {
        currentSpan++;
      }

      // Push final span
      if (index === dates.length - 1) {
        spans.push({ label: currentMonth, span: currentSpan });
      }
    });

    return spans;
  }, [dates]);

  // Calculate number of weeks
  const weeksCount = Math.ceil(totalDays / 7);

  // Build timeline header rows - just column letters
  const timelineHeaderRows = useMemo(() => {
    const headerRows = [];

    // Column letters row (A, B, C, etc.)
    const mainHeaderRow = {
      id: 'main-header',
      cells: [
        { id: 'header-rowNum', columnKey: 'rowNum', content: '#' },
        { id: 'header-project', columnKey: 'project', content: 'A' },
        { id: 'header-status', columnKey: 'status', content: 'B' },
        { id: 'header-task', columnKey: 'task', content: 'C' },
        { id: 'header-estimate', columnKey: 'estimate', content: 'D' },
        { id: 'header-timeValue', columnKey: 'timeValue', content: 'E' },
        { id: 'header-col_f', columnKey: 'col_f', content: 'F' },
        { id: 'header-col_g', columnKey: 'col_g', content: 'G' },
        { id: 'header-col_h', columnKey: 'col_h', content: 'H' },
        ...dates.map((_, i) => {
          // Day columns start from I (index 8)
          const letterIndex = i + 8; // Start after H (8 columns before day columns)
          let columnLetter = '';
          let index = letterIndex;

          // Convert number to Excel-style column letters
          while (index >= 0) {
            columnLetter = String.fromCharCode(65 + (index % 26)) + columnLetter;
            index = Math.floor(index / 26) - 1;
          }

          return {
            id: `header-day-${i}`,
            columnKey: `day-${i}`,
            content: columnLetter,
          };
        }),
      ],
    };
    headerRows.push(mainHeaderRow);

    return headerRows;
  }, [dates]);

  // Sizing state - stored in localStorage
  const [sizeScale, setSizeScale] = useState(() => {
    const saved = localStorage.getItem('spreadsheet-size-scale');
    return saved ? parseFloat(saved) : 1.0;
  });

  // Update localStorage when size changes
  useEffect(() => {
    localStorage.setItem('spreadsheet-size-scale', sizeScale.toString());
  }, [sizeScale]);

  // Save column sizes to localStorage when they change
  useEffect(() => {
    if (Object.keys(columnSizing).length > 0) {
      localStorage.setItem('planner-column-sizing', JSON.stringify(columnSizing));
    }
  }, [columnSizing]);

  // Calculate sizes based on scale
  const rowHeight = Math.round(21 * sizeScale);
  const cellFontSize = Math.round(10 * sizeScale);
  const headerFontSize = Math.round(9 * sizeScale);
  const gripIconSize = Math.round(12 * sizeScale);

  // Size adjustment functions
  const increaseSize = () => setSizeScale(prev => Math.min(prev + 0.1, 3.0));
  const decreaseSize = () => setSizeScale(prev => Math.max(prev - 0.1, 0.5));
  const resetSize = () => setSizeScale(1.0);

  // Undo/Redo state
  const [undoStack, setUndoStack] = useState([]); // Array of commands
  const [redoStack, setRedoStack] = useState([]); // Array of commands
  const maxHistorySize = 100; // Limit history to prevent memory issues

  // All column IDs in order (used throughout the component)
  // Fixed columns + extra columns (F, G, H) + day columns (starting from I)
  const allColumnIds = useMemo(() => {
    const fixed = ['project', 'status', 'task', 'estimate', 'timeValue', 'col_f', 'col_g', 'col_h'];
    const days = Array.from({ length: totalDays }, (_, i) => `day-${i}`);
    return [...fixed, ...days];
  }, [totalDays]);

  // Helper to create cell key
  const getCellKey = (rowId, columnId) => `${rowId}|${columnId}`;

  // Command pattern for undo/redo
  const executeCommand = useCallback((command) => {
    // Execute the command
    command.execute();

    // Add to undo stack
    setUndoStack(prev => {
      const newStack = [...prev, command];
      // Limit stack size
      if (newStack.length > maxHistorySize) {
        return newStack.slice(-maxHistorySize);
      }
      return newStack;
    });

    // Clear redo stack when new command is executed
    setRedoStack([]);
  }, [maxHistorySize]);

  // Undo function
  const undo = useCallback(() => {
    if (undoStack.length === 0) return;

    const command = undoStack[undoStack.length - 1];
    command.undo();

    // Move command from undo to redo stack
    setUndoStack(prev => prev.slice(0, -1));
    setRedoStack(prev => [...prev, command]);
  }, [undoStack]);

  // Redo function
  const redo = useCallback(() => {
    if (redoStack.length === 0) return;

    const command = redoStack[redoStack.length - 1];
    command.execute();

    // Move command from redo to undo stack
    setRedoStack(prev => prev.slice(0, -1));
    setUndoStack(prev => {
      const newStack = [...prev, command];
      if (newStack.length > maxHistorySize) {
        return newStack.slice(-maxHistorySize);
      }
      return newStack;
    });
  }, [redoStack, undoStack, maxHistorySize]);

  // Drag and drop handlers
  const handleDragStart = useCallback((e, rowId) => {
    // If the dragged row is part of selected rows, drag all selected rows
    // Otherwise, just drag the single row
    if (selectedRows.has(rowId)) {
      // Dragging multiple selected rows
      setDraggedRowId(Array.from(selectedRows));
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', JSON.stringify(Array.from(selectedRows)));
    } else {
      // Dragging a single row
      setDraggedRowId([rowId]);
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', JSON.stringify([rowId]));
    }
  }, [selectedRows]);

  const handleDragOver = useCallback((e, rowId) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    if (draggedRowId && Array.isArray(draggedRowId) && !draggedRowId.includes(rowId)) {
      setDropTargetRowId(rowId);
    }
  }, [draggedRowId]);

  const handleDrop = useCallback((e, targetRowId) => {
    e.preventDefault();

    if (!draggedRowId || !Array.isArray(draggedRowId) || draggedRowId.includes(targetRowId)) {
      setDraggedRowId(null);
      setDropTargetRowId(null);
      return;
    }

    const draggedRowIds = draggedRowId;

    // Find target index
    const targetIndex = data.findIndex(r => r.id === targetRowId);
    if (targetIndex === -1) {
      setDraggedRowId(null);
      setDropTargetRowId(null);
      return;
    }

    // Get the indices of all dragged rows in their current positions
    const draggedIndices = draggedRowIds
      .map(id => data.findIndex(r => r.id === id))
      .filter(idx => idx !== -1)
      .sort((a, b) => a - b);

    if (draggedIndices.length === 0) {
      setDraggedRowId(null);
      setDropTargetRowId(null);
      return;
    }

    // Store original positions for undo
    const originalPositions = draggedRowIds.map(id => {
      const index = data.findIndex(r => r.id === id);
      return { id, index };
    });

    // Create reorder command
    const reorderCommand = {
      execute: () => {
        setData(prevData => {
          const newData = [...prevData];

          // Extract the dragged rows
          const draggedRows = draggedIndices.map(idx => newData[idx]);

          // Remove dragged rows (in reverse order to maintain indices)
          for (let i = draggedIndices.length - 1; i >= 0; i--) {
            newData.splice(draggedIndices[i], 1);
          }

          // Calculate new insert position
          // Count how many dragged rows were before the target
          const rowsBeforeTarget = draggedIndices.filter(idx => idx < targetIndex).length;
          const adjustedTargetIndex = targetIndex - rowsBeforeTarget;

          // Insert all dragged rows at the target position
          newData.splice(adjustedTargetIndex, 0, ...draggedRows);

          return newData;
        });
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
      }
    };

    executeCommand(reorderCommand);

    // Clear drag state
    setDraggedRowId(null);
    setDropTargetRowId(null);
  }, [draggedRowId, data, executeCommand]);

  const handleDragEnd = useCallback(() => {
    setDraggedRowId(null);
    setDropTargetRowId(null);
  }, []);

  // Helper to check if cell is selected
  const isCellSelected = useCallback((rowId, columnId) => {
    return selectedCells.has(getCellKey(rowId, columnId));
  }, [selectedCells]);

  // Helper to get range of rows between two rowIds
  const getRowRange = useCallback((startRowId, endRowId) => {
    const startIndex = data.findIndex(r => r.id === startRowId);
    const endIndex = data.findIndex(r => r.id === endRowId);

    if (startIndex === -1 || endIndex === -1) return new Set();

    const minIndex = Math.min(startIndex, endIndex);
    const maxIndex = Math.max(startIndex, endIndex);

    const range = new Set();
    for (let i = minIndex; i <= maxIndex; i++) {
      range.add(data[i].id);
    }

    return range;
  }, [data]);

  // Helper to get rectangular range of cells between two cells
  const getCellRange = useCallback((startCell, endCell) => {
    if (!startCell || !endCell) return new Set();

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
  }, [data, allColumnIds]);

  // Edit handlers
  const handleEditComplete = useCallback((rowId, columnId) => {
    // Get the old value before updating
    const oldValue = data.find(r => r.id === rowId)?.[columnId] || '';
    const newValue = editValue;

    // Don't create command if value hasn't changed
    if (oldValue === newValue) {
      setEditingCell(null);
      setEditValue('');
      return;
    }

    // Create command for this edit
    const command = {
      execute: () => {
        setData(prev => prev.map(row => {
          if (row.id === rowId) {
            return { ...row, [columnId]: newValue };
          }
          return row;
        }));
      },
      undo: () => {
        setData(prev => prev.map(row => {
          if (row.id === rowId) {
            return { ...row, [columnId]: oldValue };
          }
          return row;
        }));
      },
    };

    executeCommand(command);

    setEditingCell(null);
    setEditValue('');
  }, [editValue, data, executeCommand]);

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

  // Row number click handler - selects entire row
  const handleRowNumberClick = useCallback((e, rowId) => {
    e.preventDefault();
    e.stopPropagation();

    if (e.shiftKey && anchorRow) {
      // Shift-click: select range of rows from anchor to current
      const range = getRowRange(anchorRow, rowId);
      setSelectedRows(range);
      setSelectedCells(new Set()); // Clear cell selections
      // Don't update anchor - keep it for next shift-click
    } else if (e.metaKey || e.ctrlKey) {
      // Cmd/Ctrl-click: toggle row selection
      setSelectedRows(prev => {
        const next = new Set(prev);
        if (next.has(rowId)) {
          next.delete(rowId);
        } else {
          next.add(rowId);
        }
        return next;
      });
      setSelectedCells(new Set()); // Clear cell selections
      setAnchorRow(rowId); // Update anchor for next shift-click
    } else {
      // Normal click: select single row
      setSelectedRows(new Set([rowId]));
      setSelectedCells(new Set()); // Clear cell selections
      setAnchorRow(rowId); // Set as anchor for shift-click
    }
    setEditingCell(null);
  }, [anchorRow, getRowRange]);

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

    // Clear row selections when selecting cells
    setSelectedRows(new Set());

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
    if (selectedCells.size === 0 && selectedRows.size === 0) return;

    e.preventDefault();

    // ROW COPY MODE: If rows are selected, copy entire rows
    if (selectedRows.size > 0) {
      // Get selected rows in order
      const selectedRowIds = Array.from(selectedRows);
      const rowsInOrder = data.filter(row => selectedRowIds.includes(row.id));

      // Convert each row to TSV
      const tsvData = rowsInOrder.map(row => {
        return allColumnIds.map(colId => row[colId] || '').join('\t');
      }).join('\n');

      // Copy to clipboard
      navigator.clipboard.writeText(tsvData);
      return;
    }

    // CELL COPY MODE: Copy selected cells
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
  }, [selectedCells, selectedRows, data, editingCell, allColumnIds]);

  const handlePaste = useCallback((e) => {
    if (editingCell) return; // Don't paste while editing
    if (selectedCells.size === 0 && selectedRows.size === 0) return;

    e.preventDefault();

    // Get clipboard data
    const pastedText = e.clipboardData.getData('text');
    if (!pastedText) return;

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

      if (selectedRowIndices.length === 0) return;

      // Check if pasting a single row to multiple selected rows (FILL MODE)
      const isSingleRowPaste = pastedRows.length === 1 && selectedRowIndices.length > 1;

      // Store old values for undo
      const oldValues = new Map(); // Map<rowId, Map<columnId, value>>

      if (isSingleRowPaste) {
        // FILL MODE: Paste single row to all selected rows
        const pastedRowValues = pastedRows[0];

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

        // Create command for fill operation
        const command = {
          execute: () => {
            setData(prev => {
              const newData = [...prev];

              selectedRowIndices.forEach(dataRowIndex => {
                const rowUpdates = {};
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

                const rowUpdates = {};
                rowOldValues.forEach((value, columnId) => {
                  rowUpdates[columnId] = value;
                });

                newData[rowIndex] = { ...newData[rowIndex], ...rowUpdates };
              });

              return newData;
            });
          },
        };

        executeCommand(command);
        return;
      }

      // RANGE MODE: Paste multiple rows starting from first selected row
      // Calculate how many rows to paste
      const targetRowIndex = selectedRowIndices[0]; // Start pasting at first selected row
      const rowsToPaste = Math.min(pastedRows.length, data.length - targetRowIndex);

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

      // Create command for row paste operation
      const command = {
        execute: () => {
          setData(prev => {
            const newData = [...prev];

            for (let i = 0; i < rowsToPaste; i++) {
              const dataRowIndex = targetRowIndex + i;
              const pastedRowValues = pastedRows[i];

              const rowUpdates = {};
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

              const rowUpdates = {};
              rowOldValues.forEach((value, columnId) => {
                rowUpdates[columnId] = value;
              });

              newData[rowIndex] = { ...newData[rowIndex], ...rowUpdates };
            });

            return newData;
          });
        },
      };

      executeCommand(command);
      return;
    }

    // CELL PASTE MODE: Continue with existing cell paste logic
    // Check if it's a single cell value (no tabs or newlines)
    const isSingleCell = !pastedText.includes('\t') && !pastedText.includes('\n');

    // Get the anchor cell (first selected cell)
    const firstCellKey = Array.from(selectedCells)[0];
    const [anchorRowId, anchorColumnId] = firstCellKey.split('|');

    if (anchorColumnId === 'rowNum') return; // Don't paste into row number column

    // FILL MODE: Copy one value to all selected cells
    if (isSingleCell && selectedCells.size > 1) {
      // Store old values for undo
      const oldValues = new Map(); // Map<rowId, Map<columnId, value>>

      selectedCells.forEach(cellKey => {
        const [rowId, columnId] = cellKey.split('|');
        if (columnId === 'rowNum') return;

        const row = data.find(r => r.id === rowId);
        if (!row) return;

        if (!oldValues.has(rowId)) {
          oldValues.set(rowId, new Map());
        }
        oldValues.get(rowId).set(columnId, row[columnId] || '');
      });

      // Create command for fill operation
      const command = {
        execute: () => {
          setData(prev => prev.map(row => {
            const rowUpdates = {};
            let hasUpdates = false;

            selectedCells.forEach(cellKey => {
              const [rowId, columnId] = cellKey.split('|');
              if (row.id === rowId && columnId !== 'rowNum') {
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

              const rowUpdates = {};
              rowOldValues.forEach((value, columnId) => {
                rowUpdates[columnId] = value;
              });

              newData[rowIndex] = { ...newData[rowIndex], ...rowUpdates };
            });

            return newData;
          });
        },
      };

      executeCommand(command);
      return;
    }

    // RANGE MODE: Paste TSV grid starting from anchor cell
    // Parse TSV data
    const rows = pastedText.split('\n').map(row => row.split('\t'));

    // Find the anchor row index and column index
    const anchorRowIndex = data.findIndex(r => r.id === anchorRowId);

    // Get column index from allColumnIds
    const anchorColIndex = allColumnIds.indexOf(anchorColumnId);

    if (anchorRowIndex === -1 || anchorColIndex === -1) return;

    // Store old values for undo
    const oldValues = new Map(); // Map<rowId, Map<columnId, value>>

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

    // Create command for paste operation
    const command = {
      execute: () => {
        setData(prev => {
          const newData = [...prev];

          rows.forEach((rowValues, rowOffset) => {
            const targetRowIndex = anchorRowIndex + rowOffset;
            if (targetRowIndex >= newData.length) return;

            const rowUpdates = {};
            rowValues.forEach((value, colOffset) => {
              const targetColIndex = anchorColIndex + colOffset;
              if (targetColIndex >= allColumnIds.length) return;

              const columnId = allColumnIds[targetColIndex];
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

            const rowUpdates = {};
            rowOldValues.forEach((value, columnId) => {
              rowUpdates[columnId] = value;
            });

            newData[rowIndex] = { ...newData[rowIndex], ...rowUpdates };
          });

          return newData;
        });
      },
    };

    executeCommand(command);
  }, [selectedCells, selectedRows, data, editingCell, executeCommand, allColumnIds]);

  // Handle global mouse up to end drag selection
  useEffect(() => {
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseUp]);

  // Delete rows entirely (remove from data array)
  const handleDeleteRows = useCallback(() => {
    if (selectedRows.size === 0) return;

    // Store deleted rows and their positions for undo
    const deletedRows = [];
    const rowIndices = [];

    selectedRows.forEach(rowId => {
      const rowIndex = data.findIndex(r => r.id === rowId);
      if (rowIndex !== -1) {
        deletedRows.push({ ...data[rowIndex] });
        rowIndices.push(rowIndex);
      }
    });

    // Sort by index (descending) for proper restoration
    const sortedDeletions = deletedRows
      .map((row, i) => ({ row, index: rowIndices[i] }))
      .sort((a, b) => a.index - b.index);

    // Create command for row deletion
    const command = {
      execute: () => {
        setData(prev => {
          const newData = [...prev];
          // Remove in reverse order to maintain indices
          [...sortedDeletions].reverse().forEach(({ index }) => {
            newData.splice(index, 1);
          });
          return newData;
        });
        // Clear selection after deletion
        setSelectedRows(new Set());
        setSelectedCells(new Set());
      },
      undo: () => {
        setData(prev => {
          const newData = [...prev];
          // Restore in original order
          sortedDeletions.forEach(({ row, index }) => {
            newData.splice(index, 0, row);
          });
          return newData;
        });
      },
    };

    executeCommand(command);
  }, [selectedRows, data, executeCommand]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Undo: Cmd/Ctrl+Z (not while editing)
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey && !editingCell) {
        e.preventDefault();
        undo();
        return;
      }

      // Redo: Cmd/Ctrl+Shift+Z (not while editing)
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && e.shiftKey && !editingCell) {
        e.preventDefault();
        redo();
        return;
      }

      // Don't interfere if we're editing
      if (editingCell) return;

      // Copy: Cmd/Ctrl+C (handled by copy event listener)
      // Paste: Cmd/Ctrl+V (handled by paste event listener)

      // Cmd/Ctrl+Backspace to delete rows entirely
      if ((e.metaKey || e.ctrlKey) && e.key === 'Backspace') {
        e.preventDefault();
        if (selectedRows.size > 0) {
          handleDeleteRows();
        }
        return;
      }

      // Delete/Backspace to clear cells or rows
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();

        // ROW CLEAR MODE: If rows are selected, clear all cells in those rows
        if (selectedRows.size > 0) {
          // Store old values for undo
          const oldValues = new Map(); // Map<rowId, Map<columnId, value>>

          selectedRows.forEach(rowId => {
            const row = data.find(r => r.id === rowId);
            if (!row) return;

            const rowOldValues = new Map();
            allColumnIds.forEach(columnId => {
              rowOldValues.set(columnId, row[columnId] || '');
            });

            oldValues.set(rowId, rowOldValues);
          });

          // Create command for row clear operation
          const command = {
            execute: () => {
              setData(prev => prev.map(row => {
                if (selectedRows.has(row.id)) {
                  // Clear all columns in this row
                  const rowUpdates = {};
                  allColumnIds.forEach(columnId => {
                    rowUpdates[columnId] = '';
                  });
                  return { ...row, ...rowUpdates };
                }
                return row;
              }));
            },
            undo: () => {
              setData(prev => {
                const newData = [...prev];

                oldValues.forEach((rowOldValues, rowId) => {
                  const rowIndex = newData.findIndex(r => r.id === rowId);
                  if (rowIndex === -1) return;

                  const rowUpdates = {};
                  rowOldValues.forEach((value, columnId) => {
                    rowUpdates[columnId] = value;
                  });

                  newData[rowIndex] = { ...newData[rowIndex], ...rowUpdates };
                });

                return newData;
              });
            },
          };

          executeCommand(command);
          return;
        }

        // CELL DELETE MODE: Clear selected cells
        // Store old values for undo
        const oldValues = new Map(); // Map<rowId, Map<columnId, value>>

        selectedCells.forEach(cellKey => {
          const [rowId, columnId] = cellKey.split('|');
          if (columnId === 'rowNum') return;

          const row = data.find(r => r.id === rowId);
          if (!row) return;

          if (!oldValues.has(rowId)) {
            oldValues.set(rowId, new Map());
          }
          oldValues.get(rowId).set(columnId, row[columnId] || '');
        });

        // Create command for delete operation
        const command = {
          execute: () => {
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
          },
          undo: () => {
            setData(prev => {
              const newData = [...prev];

              oldValues.forEach((rowOldValues, rowId) => {
                const rowIndex = newData.findIndex(r => r.id === rowId);
                if (rowIndex === -1) return;

                const rowUpdates = {};
                rowOldValues.forEach((value, columnId) => {
                  rowUpdates[columnId] = value;
                });

                newData[rowIndex] = { ...newData[rowIndex], ...rowUpdates };
              });

              return newData;
            });
          },
        };

        executeCommand(command);
      }

      // Arrow key navigation and typing to edit only work with cell selection
      if (selectedCells.size > 0) {
        const firstCellKey = Array.from(selectedCells)[0];
        const [currentRowId, currentColumnId] = firstCellKey.split('|');

        // Arrow key navigation (TODO: implement navigation logic)
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
          e.preventDefault();
          console.log('Arrow key pressed:', e.key, 'Current cell:', currentRowId, currentColumnId);
        }

        // Start typing to edit (if alphanumeric)
        if (e.key.length === 1 && !e.metaKey && !e.ctrlKey) {
          e.preventDefault();
          setEditingCell({ rowId: currentRowId, columnId: currentColumnId });
          setEditValue(e.key);
        }
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
  }, [selectedCells, selectedRows, editingCell, handleCopy, handlePaste, undo, redo, data, executeCommand, allColumnIds, handleDeleteRows]);

  // Column definitions
  const columns = useMemo(() => {
    const cols = [
      {
        id: 'rowNum',
        header: '#',
        size: 36,
        enableResizing: false,
      },
      {
        id: 'project',
        header: 'Project',
        accessorKey: 'project',
        size: 120,
        minSize: 30,
        enableResizing: true,
      },
      {
        id: 'status',
        header: 'Status',
        accessorKey: 'status',
        size: 120,
        minSize: 30,
        enableResizing: true,
      },
      {
        id: 'task',
        header: 'Task',
        accessorKey: 'task',
        size: 240,
        minSize: 50,
        enableResizing: true,
      },
      {
        id: 'estimate',
        header: 'Estimate',
        accessorKey: 'estimate',
        size: 100,
        minSize: 30,
        enableResizing: true,
      },
      {
        id: 'timeValue',
        header: 'Time',
        accessorKey: 'timeValue',
        size: 80,
        minSize: 30,
        enableResizing: true,
      },
      {
        id: 'col_f',
        header: 'F',
        accessorKey: 'col_f',
        size: 80,
        minSize: 30,
        enableResizing: true,
      },
      {
        id: 'col_g',
        header: 'G',
        accessorKey: 'col_g',
        size: 80,
        minSize: 30,
        enableResizing: true,
      },
      {
        id: 'col_h',
        header: 'H',
        accessorKey: 'col_h',
        size: 80,
        minSize: 30,
        enableResizing: true,
      },
    ];

    // Add day columns (84 columns for 12 weeks) - starting from column I
    for (let i = 0; i < totalDays; i++) {
      cols.push({
        id: `day-${i}`,
        header: `Day ${i + 1}`,
        accessorKey: `day-${i}`,
        size: 60,
        minSize: 40,
        enableResizing: true,
      });
    }

    return cols;
  }, [totalDays]);

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

  // Helper to get column width
  const getColumnWidth = useCallback((columnId) => {
    const column = table.getColumn(columnId);
    return column ? column.getSize() : 60;
  }, [table]);

  // Set up row virtualizer
  const rowVirtualizer = useVirtualizer({
    count: table.getRowModel().rows.length,
    getScrollElement: () => tableBodyRef.current,
    estimateSize: () => rowHeight, // Estimated row height in pixels
    overscan: 10, // Render 10 extra rows above and below viewport
  });

  return (
    <div className="w-full h-screen flex flex-col bg-gray-50 p-4">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Project Time Planner v2</h1>
          <p className="text-sm text-gray-600">Google Sheets-like spreadsheet with TanStack Table v8</p>
        </div>
        <div className="flex gap-2">
          {/* Size controls */}
          <div className="flex gap-1 items-center border border-gray-300 rounded px-2 py-1 bg-white">
            <span className="text-xs text-gray-600 mr-1">Size:</span>
            <button
              onClick={decreaseSize}
              className="px-2 py-0.5 rounded text-sm font-medium bg-gray-200 hover:bg-gray-300 transition-colors"
              title="Decrease size"
            >
              -
            </button>
            <span className="text-xs text-gray-700 font-mono min-w-[3ch] text-center">{Math.round(sizeScale * 100)}%</span>
            <button
              onClick={increaseSize}
              className="px-2 py-0.5 rounded text-sm font-medium bg-gray-200 hover:bg-gray-300 transition-colors"
              title="Increase size"
            >
              +
            </button>
            <button
              onClick={resetSize}
              className="px-2 py-0.5 rounded text-xs font-medium bg-gray-200 hover:bg-gray-300 transition-colors ml-1"
              title="Reset to default size"
            >
              Reset
            </button>
          </div>

          <button
            onClick={undo}
            disabled={undoStack.length === 0}
            className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
              undoStack.length === 0
                ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                : 'bg-blue-500 text-white hover:bg-blue-600 cursor-pointer'
            }`}
            title={`Undo (${undoStack.length === 0 ? 'No actions' : `${undoStack.length} action${undoStack.length > 1 ? 's' : ''}`})`}
          >
            ↶ Undo
          </button>
          <button
            onClick={redo}
            disabled={redoStack.length === 0}
            className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
              redoStack.length === 0
                ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                : 'bg-blue-500 text-white hover:bg-blue-600 cursor-pointer'
            }`}
            title={`Redo (${redoStack.length === 0 ? 'No actions' : `${redoStack.length} action${redoStack.length > 1 ? 's' : ''}`})`}
          >
            ↷ Redo
          </button>
        </div>
      </div>

      <div
        ref={tableBodyRef}
        className="flex-1 overflow-auto border border-gray-300 bg-white"
        style={{ position: 'relative' }}
      >
        <table className="border-collapse" style={{ display: 'grid' }}>
          <thead className="sticky top-0 bg-gray-100 z-10" style={{ display: 'grid', position: 'sticky', top: 0, zIndex: 1 }}>
            {timelineHeaderRows.map((headerRow) => (
              <tr key={headerRow.id} style={{ display: 'flex', height: `${rowHeight}px` }}>
                {headerRow.cells.map((cell) => {
                  const column = table.getColumn(cell.columnKey);
                  const cellWidth = column ? column.getSize() : 60;

                  return (
                    <th
                      key={cell.id}
                      style={{
                        width: `${cellWidth}px`,
                        minWidth: `${cellWidth}px`,
                        flexShrink: 0,
                        flexGrow: 0,
                        boxSizing: 'border-box',
                        fontSize: `${headerFontSize}px`,
                        position: 'relative',
                      }}
                      className="border border-gray-300 px-2 py-1 text-center font-semibold text-gray-700 bg-gray-100"
                    >
                      {cell.content}

                      {/* Add resize handle for resizable columns */}
                      {column && column.getCanResize && column.getCanResize() && (
                        <div
                          onMouseDown={(e) => {
                            e.preventDefault();
                            e.stopPropagation();

                            const startX = e.clientX;
                            const startWidth = column.getSize();

                            const handleMouseMove = (moveEvent) => {
                              const diff = moveEvent.clientX - startX;
                              const minSize = column.columnDef.minSize || 30;
                              const newWidth = Math.max(minSize, startWidth + diff);

                              table.setColumnSizing(prev => ({
                                ...prev,
                                [column.id]: newWidth
                              }));
                            };

                            const handleMouseUp = () => {
                              document.removeEventListener('mousemove', handleMouseMove);
                              document.removeEventListener('mouseup', handleMouseUp);
                            };

                            document.addEventListener('mousemove', handleMouseMove);
                            document.addEventListener('mouseup', handleMouseUp);
                          }}
                          style={{
                            position: 'absolute',
                            top: 0,
                            right: 0,
                            height: '100%',
                            width: '4px',
                            backgroundColor: 'transparent',
                            cursor: 'col-resize',
                            zIndex: 9999,
                            pointerEvents: 'auto',
                            userSelect: 'none',
                            touchAction: 'none',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = '#93c5fd';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = 'transparent';
                          }}
                          title="Drag to resize column"
                        />
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody
            style={{
              display: 'grid',
              height: `${rowVirtualizer.getTotalSize()}px`,
              position: 'relative',
            }}
          >
            {rowVirtualizer.getVirtualItems().map(virtualRow => {
              const row = table.getRowModel().rows[virtualRow.index];
              const rowId = row.original.id;
              const isRowSelected = selectedRows.has(rowId);

              return (
                <TableRow
                  key={rowId}
                  row={row}
                  virtualRow={virtualRow}
                  isRowSelected={isRowSelected}
                  isCellSelected={isCellSelected}
                  editingCell={editingCell}
                  editValue={editValue}
                  setEditValue={setEditValue}
                  handleRowNumberClick={handleRowNumberClick}
                  handleCellMouseDown={handleCellMouseDown}
                  handleCellMouseEnter={handleCellMouseEnter}
                  handleCellDoubleClick={handleCellDoubleClick}
                  handleEditComplete={handleEditComplete}
                  handleEditKeyDown={handleEditKeyDown}
                  draggedRowId={draggedRowId}
                  dropTargetRowId={dropTargetRowId}
                  handleDragStart={handleDragStart}
                  handleDragOver={handleDragOver}
                  handleDrop={handleDrop}
                  handleDragEnd={handleDragEnd}
                  rowHeight={rowHeight}
                  cellFontSize={cellFontSize}
                  headerFontSize={headerFontSize}
                  gripIconSize={gripIconSize}
                />
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Debug info */}
      <div className="mt-4 p-2 bg-gray-100 rounded text-xs font-mono">
        <div className="flex gap-4">
          <div>
            <span className="text-green-600 font-semibold">Virtualization:</span> Rendering {rowVirtualizer.getVirtualItems().length} of {data.length} rows
          </div>
          <div>Selected cells: {selectedCells.size} {selectedCells.size > 0 && `(${Array.from(selectedCells).slice(0, 5).join(', ')}${selectedCells.size > 5 ? '...' : ''})`}</div>
          <div>Selected rows: {selectedRows.size} {selectedRows.size > 0 && `(${Array.from(selectedRows).join(', ')})`}</div>
        </div>
        <div className="mt-1">
          <span>Editing: {editingCell ? `${editingCell.rowId} / ${editingCell.columnId}` : 'None'}</span>
          {' • '}
          <span className={undoStack.length > 0 ? 'text-blue-600 font-semibold' : 'text-gray-400'}>
            Undo: {undoStack.length}
          </span>
          {' • '}
          <span className={redoStack.length > 0 ? 'text-blue-600 font-semibold' : 'text-gray-400'}>
            Redo: {redoStack.length}
          </span>
        </div>
        <div className="text-gray-500 mt-1">
          Try: Click row # to select row • Click cell to select • Drag to select range • Shift+Click for range • Cmd/Ctrl+Click for multi • Double-click to edit • Delete/Backspace to clear cells/rows • Cmd/Ctrl+Backspace to delete rows entirely • Cmd/Ctrl+C to copy • Cmd/Ctrl+V to paste • Cmd/Ctrl+Z to undo • Cmd/Ctrl+Shift+Z to redo
        </div>
      </div>
    </div>
  );
}
