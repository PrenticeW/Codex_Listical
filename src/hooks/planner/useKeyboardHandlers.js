import { useEffect, useCallback, useRef } from 'react';
import { isTimelineRow, isMetricsRow } from '../../utils/planner/rowTypeChecks';

// Rows the arrow keys can land on: regular task rows, project/subproject
// headers and their General/Unscheduled section rows. Timeline chrome,
// metrics rows, the filter row, dividers and the archive area are skipped.
const HEADER_ROW_TYPES = new Set([
  'projectHeader', 'subprojectHeader',
  'projectGeneral', 'projectUnscheduled',
  'subprojectGeneral', 'subprojectUnscheduled',
]);

const isNavigableRow = (row) => {
  if (isTimelineRow(row) || isMetricsRow(row)) return false;
  if (row._isDailyTotalRow || row._isFilterRow || row._isInboxRow || row._isArchiveRow) return false;
  if (row._rowType && row._rowType !== 'projectTask' && !HEADER_ROW_TYPES.has(row._rowType)) return false;
  return true;
};

// The focusable cells on header/section rows, left to right (see
// ProjectRow.jsx). Project headers are one merged A–E cell ('projectName').
// Subproject headers and General/Unscheduled section rows are two cells:
// the merged A–D band on the left (with the chevron; selection key
// 'subprojectName' / 'projectName' respectively) and the label cell in the
// task column ('task').
const headerNavColumns = (row) => {
  if (row._rowType === 'projectHeader') return ['projectName'];
  if (row._rowType === 'subprojectHeader') return ['subprojectName', 'task'];
  if (HEADER_ROW_TYPES.has(row._rowType)) return ['projectName', 'task'];
  return null;
};

// Data columns covered by the merged left band on header/section rows —
// used to land on the band (not the label cell) when travelling vertically
// through one of these columns.
const LEFT_BAND_COLUMNS = new Set(['checkbox', 'project', 'subproject', 'status']);

/**
 * Custom hook for handling keyboard events in the planner spreadsheet
 * Manages undo/redo, delete operations, and edit mode triggering
 *
 * @param {Object} params - Configuration object
 * @returns {void}
 */
export const useKeyboardHandlers = ({
  selectedCells,
  selectedRows,
  editingCell,
  data,
  allColumnIds,
  totalDays,
  undo,
  redo,
  executeCommand,
  setData,
  setEditingCell,
  setEditValue,
  handleDeleteRows,
  handleCopy,
  handlePaste,
  // Arrow-key navigation (all optional so older call sites keep working)
  visibleRows = null,
  navColumnIds = null,
  setSelectedCells = null,
  setAnchorCell = null,
  setSelectedRows = null,
  scrollToRow = null,
}) => {
  // Remembers the last real data column focus was in, so moving vertically
  // through a header row (which only has its single name cell) returns to
  // the same column on the far side.
  const lastDataColumnIdRef = useRef(null);
  // Delete/clear cells handler
  const handleCellsDelete = useCallback((e) => {
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
  }, [selectedCells, selectedRows, data, allColumnIds, executeCommand, setData]);

  // Start edit mode with typed character
  const handleStartEdit = useCallback((e, currentRowId, currentColumnId) => {
    e.preventDefault();
    const row = data.find(r => r.id === currentRowId);
    const currentValue = row ? row[currentColumnId] || '' : '';

    // For dropdown columns (project, subproject, status, estimate), start editing with current value
    if (currentColumnId === 'project' || currentColumnId === 'subproject' || currentColumnId === 'status' || currentColumnId === 'estimate') {
      setEditingCell({ rowId: currentRowId, columnId: currentColumnId });
      setEditValue(currentValue);
    } else {
      // For regular columns, start editing with the typed character
      setEditingCell({ rowId: currentRowId, columnId: currentColumnId });
      setEditValue(e.key);
    }
  }, [data, setEditingCell, setEditValue]);

  // Main keyboard event handler
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

      // Don't interfere if focus is inside an input/textarea outside the table (e.g. a modal)
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

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

      // Delete/Backspace: delete selected rows entirely, or clear selected cells
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        if (selectedRows.size > 0) {
          handleDeleteRows();
        } else {
          handleCellsDelete(e);
        }
        return;
      }

      // Arrow key navigation and typing to edit only work with cell selection
      if (selectedCells.size > 0) {
        const firstCellKey = Array.from(selectedCells)[0];
        const [currentRowId, currentColumnId] = firstCellKey.split('|');

        // Arrow key navigation: move the (single-cell) focus one cell in the
        // pressed direction. Up/Down land on task rows AND project/subproject
        // header and section rows (their single name cell), skipping only
        // structural chrome (timeline, filter, metrics, dividers, archive).
        // Left/Right walk the VISIBLE columns only — hidden columns
        // (recurring, subproject, hidden day/week columns) are skipped.
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
          e.preventDefault();
          if (!visibleRows || !setSelectedCells) return;

          const rows = visibleRows;
          const columns = navColumnIds || allColumnIds;
          const rowIdx = rows.findIndex(r => r.id === currentRowId);
          if (rowIdx === -1) return;

          // Track the last real data column so header hops don't lose it.
          if (columns.includes(currentColumnId)) {
            lastDataColumnIdRef.current = currentColumnId;
          }

          let nextRowId = currentRowId;
          let nextColumnId = currentColumnId;
          let nextRowIdx = rowIdx;

          if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            // Header/section rows: their own cells (left band, label) followed
            // by the ordinary visible columns to the right of the task column
            // (recurring/estimate/timeValue/day cells exist on these rows too).
            const headerCols = headerNavColumns(rows[rowIdx]);
            let seq = columns;
            if (headerCols) {
              const taskIdx = columns.indexOf('task');
              seq = [...headerCols, ...(taskIdx === -1 ? [] : columns.slice(taskIdx + 1))];
            }
            const colIdx = seq.indexOf(currentColumnId);
            if (colIdx === -1) return; // no known column — nowhere to go sideways
            const nextColIdx = e.key === 'ArrowLeft'
              ? Math.max(0, colIdx - 1)
              : Math.min(seq.length - 1, colIdx + 1);
            nextColumnId = seq[nextColIdx];
            if (columns.includes(nextColumnId)) {
              lastDataColumnIdRef.current = nextColumnId;
            }
          } else {
            const step = e.key === 'ArrowUp' ? -1 : 1;
            let i = rowIdx + step;
            while (i >= 0 && i < rows.length && !isNavigableRow(rows[i])) i += step;
            if (i < 0 || i >= rows.length) return;
            nextRowIdx = i;
            const nextRow = rows[i];
            const headerCols = headerNavColumns(nextRow);
            if (headerCols) {
              const taskIdx = columns.indexOf('task');
              const rightOfTask = taskIdx !== -1 && columns.indexOf(currentColumnId) > taskIdx;
              if (rightOfTask) {
                // Travelling through a column right of the task column
                // (recurring/estimate/timeValue/day): those cells exist on
                // header rows too — stay in the same column.
                nextColumnId = currentColumnId;
              } else if (headerCols.length === 1) {
                nextColumnId = headerCols[0];
              } else {
                // Two-cell header/section row: land on the left band when
                // travelling through one of the columns it covers (or when
                // coming from another row's band), otherwise on the label.
                const currentHeaderCols = headerNavColumns(rows[rowIdx]);
                const onBand = currentHeaderCols
                  ? currentHeaderCols.length > 1 && currentColumnId === currentHeaderCols[0]
                  : LEFT_BAND_COLUMNS.has(currentColumnId);
                nextColumnId = onBand ? headerCols[0] : headerCols[1];
              }
            } else {
              // Regular task row: return to the remembered data column.
              nextColumnId = columns.includes(currentColumnId)
                ? currentColumnId
                : (lastDataColumnIdRef.current && columns.includes(lastDataColumnIdRef.current)
                  ? lastDataColumnIdRef.current
                  : columns[0]);
            }
            nextRowId = nextRow.id;
          }

          if (nextRowId === currentRowId && nextColumnId === currentColumnId) return;

          setSelectedCells(new Set([`${nextRowId}|${nextColumnId}`]));
          setAnchorCell?.({ rowId: nextRowId, columnId: nextColumnId });
          setSelectedRows?.(new Set());
          scrollToRow?.(nextRowIdx);
          return;
        }

        // Start typing to edit (if alphanumeric) - only if not already editing
        if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !editingCell) {
          handleStartEdit(e, currentRowId, currentColumnId);
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
  }, [
    selectedCells,
    selectedRows,
    editingCell,
    visibleRows,
    navColumnIds,
    setSelectedCells,
    setAnchorCell,
    setSelectedRows,
    scrollToRow,
    handleCopy,
    handlePaste,
    undo,
    redo,
    data,
    executeCommand,
    allColumnIds,
    handleDeleteRows,
    handleCellsDelete,
    handleStartEdit,
  ]);
};

export default useKeyboardHandlers;
