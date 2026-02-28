import { useEffect, useCallback } from 'react';

/**
 * Custom hook for handling keyboard events in the staging/goals tables
 * Manages undo/redo, delete operations, copy/paste, and navigation
 *
 * @param {Object} params - Configuration object
 */
export default function useStagingKeyboardHandlers({
  selectedCells,
  undo,
  redo,
  executeCommand,
  setState,
  clearSelection,
  handleCopy,
  handlePaste,
}) {
  // Delete/clear selected cells
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
            // Capture state on first execute
            if (capturedState === null) {
              capturedState = JSON.parse(JSON.stringify(prev));
            }

            return {
              ...prev,
              shortlist: prev.shortlist.map((item) => {
                const cells = cellsByItem.get(item.id);
                if (!cells) return item;

                const nextEntries = item.planTableEntries.map((row) => [...row]);
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

      // Delete/Backspace to clear selected cells
      if (e.key === 'Delete' || e.key === 'Backspace') {
        handleCellsDelete(e);
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
    undo,
    redo,
    handleCellsDelete,
    clearSelection,
    handleCopy,
    handlePaste,
  ]);
}
