import { useEffect, useCallback } from 'react';
import {
  cloneRowWithMetadata,
  cloneStagingState,
} from '../../utils/staging/planTableHelpers';

/**
 * Custom hook for handling keyboard events in the staging/goals tables
 * Manages undo/redo, delete operations, copy/paste, and navigation
 *
 * @param {Object} params - Configuration object
 */
export default function useStagingKeyboardHandlers({
  selectedCells,
  selectedRows,
  undo,
  redo,
  executeCommand,
  setState,
  clearSelection,
  handleCopy,
  handlePaste,
}) {
  // Delete/clear selected cells (only clears content, preserves row structure)
  const handleCellsDelete = useCallback(
    (e) => {
      if (!selectedCells || selectedCells.size === 0) return;

      e.preventDefault();

      // Parse selected cells and group by item
      const cellsByItem = new Map();
      selectedCells.forEach((cellKey) => {
        const [itemId, rowIdx, colIdx] = cellKey.split('|');
        if (!cellsByItem.has(itemId)) {
          cellsByItem.set(itemId, []);
        }
        cellsByItem.get(itemId).push({
          rowIdx: parseInt(rowIdx, 10),
          colIdx: parseInt(colIdx, 10),
        });
      });

      // Capture old state for undo
      let capturedState = null;

      const command = {
        execute: () => {
          setState((prev) => {
            // Capture state on first execute - use cloneStagingState to preserve metadata
            if (capturedState === null) {
              capturedState = cloneStagingState(prev);
            }

            return {
              ...prev,
              shortlist: prev.shortlist.map((item) => {
                const cells = cellsByItem.get(item.id);
                if (!cells) return item;

                // Use cloneRowWithMetadata to preserve __rowType and __pairId
                const nextEntries = item.planTableEntries.map(cloneRowWithMetadata);
                cells.forEach(({ rowIdx, colIdx }) => {
                  if (nextEntries[rowIdx] && nextEntries[rowIdx][colIdx] !== undefined) {
                    nextEntries[rowIdx][colIdx] = '';
                  }
                });

                return { ...item, planTableEntries: nextEntries };
              }),
            };
          });
        },
        undo: () => {
          if (capturedState !== null) {
            setState(capturedState);
          }
        },
      };

      executeCommand(command);
    },
    [selectedCells, setState, executeCommand]
  );

  // Delete selected rows entirely
  const handleRowsDelete = useCallback(
    (e) => {
      if (!selectedRows || selectedRows.size === 0) return;

      e.preventDefault();

      // Parse selected rows and group by item
      const rowsByItem = new Map();
      selectedRows.forEach((rowKey) => {
        const [itemId, rowIdxStr] = rowKey.split('|');
        const rowIdx = parseInt(rowIdxStr, 10);
        if (!rowsByItem.has(itemId)) {
          rowsByItem.set(itemId, new Set());
        }
        rowsByItem.get(itemId).add(rowIdx);
      });

      let capturedState = null;

      const command = {
        execute: () => {
          setState((prev) => {
            if (capturedState === null) {
              capturedState = cloneStagingState(prev);
            }

            return {
              ...prev,
              shortlist: prev.shortlist.map((item) => {
                const rowIdxSet = rowsByItem.get(item.id);
                if (!rowIdxSet || rowIdxSet.size === 0) return item;

                const entries = item.planTableEntries.map(cloneRowWithMetadata);
                // Don't delete if it would leave no rows
                if (entries.length <= rowIdxSet.size) return item;

                // Delete rows in reverse order to preserve indices
                const sortedIndices = Array.from(rowIdxSet).sort((a, b) => b - a);
                sortedIndices.forEach((idx) => {
                  if (idx >= 0 && idx < entries.length) {
                    entries.splice(idx, 1);
                  }
                });

                return { ...item, planTableEntries: entries };
              }),
            };
          });
        },
        undo: () => {
          if (capturedState !== null) {
            setState(capturedState);
          }
        },
      };

      executeCommand(command);
      clearSelection();
    },
    [selectedRows, setState, executeCommand, clearSelection]
  );

  // Main keyboard event handler
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Check if we're inside an input or editable element
      const target = e.target;
      const isEditing =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable;

      // Undo: Cmd/Ctrl+Z (not while editing)
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey && !isEditing) {
        e.preventDefault();
        undo();
        return;
      }

      // Redo: Cmd/Ctrl+Shift+Z or Cmd/Ctrl+Y (not while editing)
      if (
        ((e.metaKey || e.ctrlKey) && e.key === 'z' && e.shiftKey && !isEditing) ||
        ((e.metaKey || e.ctrlKey) && e.key === 'y' && !isEditing)
      ) {
        e.preventDefault();
        redo();
        return;
      }

      // Don't handle other shortcuts while editing
      if (isEditing) return;

      // Delete/Backspace - delete rows if rows are selected, otherwise clear cells
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedRows && selectedRows.size > 0) {
          handleRowsDelete(e);
        } else {
          handleCellsDelete(e);
        }
        return;
      }

      // Escape to clear selection
      if (e.key === 'Escape') {
        e.preventDefault();
        clearSelection();
        return;
      }
    };

    // Copy event handler
    const handleCopyEvent = (e) => {
      const target = e.target;
      const isEditing =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable;

      if (!isEditing && handleCopy) {
        handleCopy(e);
      }
    };

    // Paste event handler
    const handlePasteEvent = (e) => {
      const target = e.target;
      const isEditing =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable;

      if (!isEditing && handlePaste) {
        handlePaste(e);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('copy', handleCopyEvent);
    window.addEventListener('paste', handlePasteEvent);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('copy', handleCopyEvent);
      window.removeEventListener('paste', handlePasteEvent);
    };
  }, [
    selectedCells,
    selectedRows,
    undo,
    redo,
    handleCellsDelete,
    handleRowsDelete,
    clearSelection,
    handleCopy,
    handlePaste,
  ]);
}
