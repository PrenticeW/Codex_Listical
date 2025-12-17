import { useCallback, useEffect, useRef, useState } from 'react';
import isBrowserEnvironment from '../../utils/isBrowserEnvironment';

export default function usePlannerInteractions({
  columnWidths,
  setColumnWidths,
  minColumnWidth,
  rowIndexById,
  columnIndexByKey,
  getCellDescriptorKey,
  getRangeSelectionKeys,
  cellSelectionAnchorRef,
  selectedCellKeys,
  setSelectedCellKeys,
  setSelectionAnchor,
  setSelectionFocus,
  isCellInSelection,
  selectedRowIds,
  setSelectedRowIds,
  setLastSelectedRowIndex,
  highlightedRowId,
  setHighlightedRowId,
  shouldPreserveSelection,
  blockClickRef,
  pointerModifierRef,
  updatePointerModifierState,
  table,
  clearCellValue,
}) {
  const tableContainerRef = useRef(null);
  const columnResizeRef = useRef(null);
  const columnResizeListenersRef = useRef({ move: null, up: null });
  const [activeCell, setActiveCell] = useState(null);
  const [copiedCell, setCopiedCell] = useState(null);
  const [copiedCellHighlight, setCopiedCellHighlight] = useState(null);
  const copiedCellHighlightTimeoutRef = useRef(null);

  const isCellActive = useCallback(
    (rowId, cellId) => activeCell && activeCell.rowId === rowId && activeCell.cellId === cellId,
    [activeCell]
  );

  const handleCellActivate = useCallback(
    (rowId, cellId, { highlightRow = false, preserveSelection = false } = {}) => {
      // Check if this cell is already active - if so, skip to avoid re-render
      if (activeCell && activeCell.rowId === rowId && activeCell.cellId === cellId) {
        return;
      }

      const preserveRowSelection = preserveSelection || shouldPreserveSelection();
      setActiveCell({ rowId, cellId });

      // Clear multi-cell selection when activating a new cell (unless preserving selection)
      if (!preserveRowSelection && selectedCellKeys.size > 0) {
        setSelectedCellKeys(new Set());
      }

      if (highlightRow) {
        setHighlightedRowId(rowId);
      } else {
        setHighlightedRowId(null);
        if (!preserveRowSelection && selectedRowIds.length) {
          setSelectedRowIds([]);
          setLastSelectedRowIndex(null);
        }
      }
    },
    [
      activeCell,
      selectedCellKeys,
      selectedRowIds,
      shouldPreserveSelection,
      setHighlightedRowId,
      setLastSelectedRowIndex,
      setSelectedRowIds,
      setSelectedCellKeys,
    ]
  );

  const clearActiveCell = useCallback(() => {
    setActiveCell(null);
    setHighlightedRowId(null);
  }, [setHighlightedRowId]);

  const fallbackCopyToClipboard = (text) => {
    if (!isBrowserEnvironment()) return;
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    try {
      document.execCommand('copy');
    } catch {
      // ignore copy errors
    } finally {
      document.body.removeChild(textarea);
    }
  };

  const copyTextToClipboard = useCallback((text) => {
    if (!text) return;
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).catch(() => fallbackCopyToClipboard(text));
    } else {
      fallbackCopyToClipboard(text);
    }
  }, []);

  const copyCellContents = useCallback(
    (cell, { includeClipboard = true } = {}) => {
      if (!cell || !tableContainerRef.current) return '';
      const selector = `[data-row-id="${cell.rowId}"][data-column-key="${cell.cellId}"]`;
      const cellElement = tableContainerRef.current.querySelector(selector);
      if (!cellElement) return '';
      let text = '';
      const formElement = cellElement.querySelector('input, textarea, select');
      if (formElement) {
        if (formElement.tagName === 'SELECT') {
          const selectEl = formElement;
          text = selectEl.options[selectEl.selectedIndex]?.text ?? selectEl.value ?? '';
        } else {
          text = formElement.value ?? formElement.textContent ?? '';
        }
      } else {
        text = cellElement.textContent?.trim() ?? '';
      }
      if (text && includeClipboard) {
        copyTextToClipboard(text);
      }
      return text;
    },
    [copyTextToClipboard]
  );

  const handleOverwritePaste = useCallback((event, applyValue) => {
    if (typeof applyValue !== 'function') return;
    const clipboardData = event.clipboardData;
    if (!clipboardData) return;
    const text = clipboardData.getData('text/plain');
    if (text == null) return;
    event.preventDefault();
    applyValue(text);
  }, []);

  useEffect(() => {
    if (!isBrowserEnvironment()) return undefined;
    const handleKeyDown = (event) => {
      const key = event.key?.toLowerCase();

      // Handle Delete/Backspace for cell clearing
      if (key === 'delete' || key === 'backspace') {
        // Don't interfere if user is actively editing an input/textarea/select
        const activeElement = document.activeElement;
        const isEditableElement =
          activeElement &&
          (activeElement.tagName === 'INPUT' ||
            activeElement.tagName === 'TEXTAREA' ||
            activeElement.tagName === 'SELECT' ||
            activeElement.isContentEditable);

        // If we're in an editable element, allow normal delete behavior
        if (isEditableElement) return;

        // Only proceed if we have selected cells or an active cell
        if (!activeCell && selectedCellKeys.size === 0) return;

        event.preventDefault();

        if (!tableContainerRef.current) return;

        // Helper function to clear a cell by directly updating the row data
        const clearCell = (cellRowId, cellColumnKey) => {
          if (clearCellValue) {
            clearCellValue(cellRowId, cellColumnKey);
          }
        };

        // If multiple cells are selected, clear all of them
        if (selectedCellKeys.size > 0) {
          selectedCellKeys.forEach((key) => {
            const [rowId, cellId] = key.split('|');
            if (rowId && cellId) {
              clearCell(rowId, cellId);
            }
          });
        } else if (activeCell) {
          // Otherwise, clear just the active cell
          clearCell(activeCell.rowId, activeCell.cellId);
        }
        return;
      }

      // Handle Copy/Paste (Cmd/Ctrl + C/V)
      if (!(event.metaKey || event.ctrlKey)) return;
      if (event.altKey || event.shiftKey) return;
      if (key !== 'c' && key !== 'v') return;
      const selection = window.getSelection ? window.getSelection() : null;
      const hasDocumentSelection = Boolean(selection && !selection.isCollapsed);
      const activeElement = document.activeElement;
      const isEditableElement =
        activeElement &&
        (activeElement.tagName === 'INPUT' ||
          activeElement.tagName === 'TEXTAREA' ||
          activeElement.isContentEditable);
      const hasEditableSelection =
        isEditableElement &&
        typeof activeElement.selectionStart === 'number' &&
        typeof activeElement.selectionEnd === 'number' &&
        activeElement.selectionStart !== activeElement.selectionEnd;
      const shouldDeferToNativeCopy =
        key === 'c' && (hasDocumentSelection || hasEditableSelection);
      const shouldDeferToNativePaste = key === 'v' && isEditableElement;
      if (shouldDeferToNativeCopy || shouldDeferToNativePaste) return;

      if (key === 'c') {
        event.preventDefault();

        // If multiple cells are selected, copy all of them as tab-separated values
        if (selectedCellKeys.size > 0) {
          const cellValues = Array.from(selectedCellKeys).map((key) => {
            const [rowId, cellId] = key.split('|');
            if (rowId && cellId) {
              return copyCellContents({ rowId, cellId }, { includeClipboard: false });
            }
            return '';
          });
          const combinedText = cellValues.join('\t');
          copyTextToClipboard(combinedText);
          // Store the first selected cell as the copied cell for paste reference
          const firstKey = Array.from(selectedCellKeys)[0];
          if (firstKey) {
            const [rowId, cellId] = firstKey.split('|');
            if (rowId && cellId) {
              setCopiedCell({ rowId, cellId });
              setCopiedCellHighlight({ rowId, cellId });
            }
          }
        } else {
          // Single cell copy: Priority: activeCell > highlightedRowId
          let cellToCopy = activeCell;

          if (!cellToCopy && highlightedRowId) {
            cellToCopy = { rowId: highlightedRowId, cellId: 'task' };
          }

          if (!cellToCopy) return;

          copyCellContents(cellToCopy);
          setCopiedCell(cellToCopy);
          setCopiedCellHighlight(cellToCopy);
        }

        if (copiedCellHighlightTimeoutRef.current) {
          clearTimeout(copiedCellHighlightTimeoutRef.current);
        }
        copiedCellHighlightTimeoutRef.current = window.setTimeout(() => {
          setCopiedCellHighlight(null);
          copiedCellHighlightTimeoutRef.current = null;
        }, 300);
        return;
      }

      if (!copiedCell) return;

      event.preventDefault();

      if (!tableContainerRef.current) return;

      // Get the content from the copied cell
      const copiedText = copyCellContents(copiedCell, { includeClipboard: false });
      if (!copiedText) return;

      // Helper function to paste into a cell
      const pasteIntoCell = (targetRowId, targetCellId) => {
        // Don't paste into the same cell we copied from
        if (targetRowId === copiedCell.rowId && targetCellId === copiedCell.cellId) {
          return;
        }

        const selector = `[data-row-id="${targetRowId}"][data-column-key="${targetCellId}"]`;
        const targetCellElement = tableContainerRef.current.querySelector(selector);
        if (!targetCellElement) return;

        const formElement = targetCellElement.querySelector('input, textarea, select');
        if (!formElement) return;

        if (formElement.tagName === 'SELECT') {
          // For select elements, find the option that matches the text
          const selectEl = formElement;
          const options = Array.from(selectEl.options);
          const matchingOption = options.find(opt => opt.text === copiedText || opt.value === copiedText);
          if (matchingOption) {
            selectEl.value = matchingOption.value;
            const changeEvent = new Event('change', { bubbles: true });
            selectEl.dispatchEvent(changeEvent);
          }
        } else {
          // For input/textarea, set the value and trigger blur
          formElement.value = copiedText;
          // Need to focus first, then blur to properly trigger the onBlur handler
          const wasFocused = document.activeElement === formElement;
          if (!wasFocused) {
            formElement.focus();
          }
          const blurEvent = new Event('blur', { bubbles: true });
          formElement.dispatchEvent(blurEvent);
          // If it wasn't originally focused, blur it
          if (!wasFocused) {
            formElement.blur();
          }
        }
      };

      // If multiple cells are selected, paste into all of them
      if (selectedCellKeys.size > 0) {
        selectedCellKeys.forEach((key) => {
          const [rowId, cellId] = key.split('|');
          if (rowId && cellId) {
            pasteIntoCell(rowId, cellId);
          }
        });
      } else {
        // Single cell paste: Priority: activeCell > highlightedRowId
        let cellToPaste = activeCell;

        if (!cellToPaste && highlightedRowId) {
          cellToPaste = { rowId: highlightedRowId, cellId: copiedCell?.cellId || 'task' };
        }

        if (!cellToPaste) return;

        pasteIntoCell(cellToPaste.rowId, cellToPaste.cellId);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [activeCell, copyCellContents, copiedCell, handleCellActivate, highlightedRowId, selectedCellKeys]);

  useEffect(
    () => () => {
      if (copiedCellHighlightTimeoutRef.current) {
        clearTimeout(copiedCellHighlightTimeoutRef.current);
        copiedCellHighlightTimeoutRef.current = null;
      }
    },
    []
  );

  const handleColumnResizeMouseMove = useCallback(
    (event) => {
      if (!isBrowserEnvironment()) return;
      const info = columnResizeRef.current;
      if (!info) return;
      const delta = event.clientX - info.startX;
      const newWidth = Math.max(minColumnWidth, info.startWidth + delta);
      setColumnWidths((prev) => {
        if (prev[info.key] === newWidth) return prev;
        return { ...prev, [info.key]: newWidth };
      });
    },
    [setColumnWidths]
  );

  const detachColumnResizeListeners = useCallback(() => {
    if (!isBrowserEnvironment()) return;
    const { move, up } = columnResizeListenersRef.current;
    if (move) window.removeEventListener('mousemove', move);
    if (up) window.removeEventListener('mouseup', up);
    columnResizeListenersRef.current = { move: null, up: null };
  }, []);

  const handleColumnResizeMouseUp = useCallback(() => {
    if (!isBrowserEnvironment()) return;
    columnResizeRef.current = null;
    detachColumnResizeListeners();
  }, [detachColumnResizeListeners]);

  const handleColumnResizeMouseDown = useCallback(
    (event, columnKey) => {
      if (!isBrowserEnvironment()) return;
      event.preventDefault();
      event.stopPropagation();
      columnResizeRef.current = {
        key: columnKey,
        startX: event.clientX,
        startWidth: columnWidths[columnKey] ?? minColumnWidth,
      };

      const move = (moveEvent) => handleColumnResizeMouseMove(moveEvent);
      const up = () => handleColumnResizeMouseUp();
      columnResizeListenersRef.current = { move, up };
      window.addEventListener('mousemove', move);
      window.addEventListener('mouseup', up);
    },
    [columnWidths, handleColumnResizeMouseMove, handleColumnResizeMouseUp]
  );

  const handleCellMouseDown = useCallback(
    (event, rowId, cellId, options = {}) => {
      const isInteractive =
        event.target instanceof Element &&
        Boolean(event.target.closest('input, select, textarea, button, a'));
      // Only preventDefault for non-interactive elements to prevent unwanted scrolling
      if (!isInteractive) {
        event.preventDefault();
      }
      updatePointerModifierState(event);
      const descriptor = {
        rowIndex: rowIndexById.get(rowId) ?? null,
        columnIndex: columnIndexByKey[cellId] ?? null,
        rowId,
        cellId,
      };
      const anchorExists = Boolean(cellSelectionAnchorRef.current);
      const isShift = pointerModifierRef.current.shift;
      const isMeta = pointerModifierRef.current.meta;
      const descriptorKey = getCellDescriptorKey(rowId, cellId);
      if (descriptor.columnIndex != null || descriptor.rowIndex != null) {
        if (isShift) {
          // Shift-click: create range selection
          // If no anchor exists, use the current descriptor as both anchor and focus
          const anchor = anchorExists ? cellSelectionAnchorRef.current : descriptor;
          if (!anchorExists) {
            setSelectionAnchor(descriptor);
          }
          setSelectionFocus(descriptor);
          const rangeKeys = getRangeSelectionKeys(anchor, descriptor);
          setSelectedCellKeys(rangeKeys);
        } else {
          // Normal click or Cmd/Ctrl-click
          setSelectionAnchor(descriptor);
          setSelectionFocus(descriptor);
          if (isMeta) {
            setSelectedCellKeys((prev) => {
              const next = new Set(prev);
              if (descriptorKey) {
                if (next.has(descriptorKey)) next.delete(descriptorKey);
                else next.add(descriptorKey);
              }
              return next;
            });
          } else {
            setSelectedCellKeys(descriptorKey ? new Set([descriptorKey]) : new Set());
          }
        }
      }
      // Always preserve selection when called from mouse down, since we just set it
      handleCellActivate(rowId, cellId, { ...options, preserveSelection: true });
    },
    [
      columnIndexByKey,
      cellSelectionAnchorRef,
      getCellDescriptorKey,
      getRangeSelectionKeys,
      handleCellActivate,
      rowIndexById,
      pointerModifierRef,
      setSelectedCellKeys,
      setSelectionAnchor,
      setSelectionFocus,
      updatePointerModifierState,
    ]
  );

  const handleCellClick = useCallback(
    (rowIndex, columnId) => {
      if (blockClickRef.current) return;
      const currentRows = table.getRowModel().rows;
      const targetRow = currentRows[rowIndex];
      if (!targetRow) return;
      const rowId = targetRow.original.id;
      handleCellActivate(rowId, columnId, {
        preserveSelection: shouldPreserveSelection(),
      });
    },
    [blockClickRef, handleCellActivate, shouldPreserveSelection, table]
  );

  // Optimized: Return empty object to prevent re-renders
  // Cell highlighting is handled via CSS classes in withCellSelectionClass
  const getCellHighlightStyle = useCallback(() => {
    return {};
  }, []);

  return {
    tableContainerRef,
    activeCell,
    copiedCell,
    copiedCellHighlight,
    handleCellActivate,
    handleCellMouseDown,
    handleCellClick,
    getCellHighlightStyle,
    copyCellContents,
    handleOverwritePaste,
    handleColumnResizeMouseDown,
    detachColumnResizeListeners,
    clearActiveCell,
    isCellActive,
  };
}
