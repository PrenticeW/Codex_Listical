import { useEffect, useCallback } from 'react';

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
}) => {
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
        handleCellsDelete(e);
        return;
      }

      // Arrow key navigation and typing to edit only work with cell selection
      if (selectedCells.size > 0) {
        const firstCellKey = Array.from(selectedCells)[0];
        const [currentRowId, currentColumnId] = firstCellKey.split('|');

        // Arrow key navigation (TODO: implement navigation logic)
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
          e.preventDefault();
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
