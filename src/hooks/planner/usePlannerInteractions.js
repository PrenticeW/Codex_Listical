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
      selectedRowIds,
      shouldPreserveSelection,
      setHighlightedRowId,
      setLastSelectedRowIndex,
      setSelectedRowIds,
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

        // Only proceed if we have an active cell
        if (!activeCell) return;

        event.preventDefault();

        // Find the active cell element
        if (!tableContainerRef.current) return;
        const selector = `[data-row-id="${activeCell.rowId}"][data-column-key="${activeCell.cellId}"]`;
        const cellElement = tableContainerRef.current.querySelector(selector);
        if (!cellElement) return;

        // Find the form element within the cell
        const formElement = cellElement.querySelector('input, textarea, select');
        if (!formElement) return;

        // Clear the value based on element type
        if (formElement.tagName === 'SELECT') {
          // For select elements, set to first option (usually "-" or empty)
          const selectEl = formElement;
          if (selectEl.options.length > 0) {
            selectEl.selectedIndex = 0;
            // Trigger change event to update the underlying data
            const changeEvent = new Event('change', { bubbles: true });
            selectEl.dispatchEvent(changeEvent);
          }
        } else if (formElement.type === 'checkbox') {
          // For checkboxes, uncheck them
          formElement.checked = false;
          const changeEvent = new Event('change', { bubbles: true });
          formElement.dispatchEvent(changeEvent);
        } else {
          // For input/textarea, clear the value
          formElement.value = '';
          formElement.focus();
          // Trigger blur to save the empty value
          const blurEvent = new Event('blur', { bubbles: true });
          formElement.dispatchEvent(blurEvent);
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
        // Priority: activeCell > first selected cell > highlightedRowId
        let cellToCopy = activeCell;

        if (!cellToCopy && selectedCellKeys.size > 0) {
          // Get the first selected cell
          const firstKey = Array.from(selectedCellKeys)[0];
          if (firstKey) {
            const [rowId, cellId] = firstKey.split('|');
            if (rowId && cellId) {
              cellToCopy = { rowId, cellId };
            }
          }
        }

        if (!cellToCopy && highlightedRowId) {
          cellToCopy = { rowId: highlightedRowId, cellId: 'task' };
        }

        if (!cellToCopy) return;

        event.preventDefault();
        copyCellContents(cellToCopy);
        const isDifferentCell =
          copiedCell?.rowId !== cellToCopy.rowId || copiedCell?.cellId !== cellToCopy.cellId;
        if (isDifferentCell) {
          setCopiedCell(cellToCopy);
        }
        setCopiedCellHighlight(cellToCopy);
        if (copiedCellHighlightTimeoutRef.current) {
          clearTimeout(copiedCellHighlightTimeoutRef.current);
        }
        copiedCellHighlightTimeoutRef.current = window.setTimeout(() => {
          setCopiedCellHighlight(null);
          copiedCellHighlightTimeoutRef.current = null;
        }, 300);
        return;
      }

      // Priority: activeCell > first selected cell > highlightedRowId
      let cellToPaste = activeCell;

      if (!cellToPaste && selectedCellKeys.size > 0) {
        // Get the first selected cell
        const firstKey = Array.from(selectedCellKeys)[0];
        if (firstKey) {
          const [rowId, cellId] = firstKey.split('|');
          if (rowId && cellId) {
            cellToPaste = { rowId, cellId };
          }
        }
      }

      if (!cellToPaste && highlightedRowId) {
        cellToPaste = { rowId: highlightedRowId, cellId: copiedCell?.cellId || 'task' };
      }

      if (!copiedCell || !cellToPaste) return;

      event.preventDefault();

      // Don't paste into the same cell
      if (
        cellToPaste.rowId === copiedCell.rowId &&
        cellToPaste.cellId === copiedCell.cellId
      ) {
        return;
      }

      // Get the content from the copied cell
      const copiedText = copyCellContents(copiedCell, { includeClipboard: false });
      if (!copiedText) return;

      // Find the target cell element and paste the content
      if (!tableContainerRef.current) return;
      const selector = `[data-row-id="${cellToPaste.rowId}"][data-column-key="${cellToPaste.cellId}"]`;
      const targetCellElement = tableContainerRef.current.querySelector(selector);
      if (!targetCellElement) return;

      const formElement = targetCellElement.querySelector('input, textarea, select');
      if (formElement) {
        if (formElement.tagName === 'SELECT') {
          // For select elements, find the option that matches the text
          const selectEl = formElement;
          const options = Array.from(selectEl.options);
          const matchingOption = options.find(opt => opt.text === copiedText || opt.value === copiedText);
          if (matchingOption) {
            selectEl.value = matchingOption.value;
            // Trigger change event to update the underlying data
            const changeEvent = new Event('change', { bubbles: true });
            selectEl.dispatchEvent(changeEvent);
          }
        } else {
          // For input/textarea, set the value and trigger events
          formElement.value = copiedText;
          formElement.focus();
          // Trigger blur to save the value
          const blurEvent = new Event('blur', { bubbles: true });
          formElement.dispatchEvent(blurEvent);
        }
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
      const preserveSelection = Boolean(event?.metaKey || event?.ctrlKey || event?.shiftKey);
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
      handleCellActivate(rowId, cellId, { ...options, preserveSelection });
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
