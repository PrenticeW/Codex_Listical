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
  setSelectedCellKeys,
  setSelectionAnchor,
  setSelectionFocus,
  isCellInSelection,
  selectedRowIds,
  setSelectedRowIds,
  setLastSelectedRowIndex,
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
      if (!(event.metaKey || event.ctrlKey)) return;
      if (event.altKey || event.shiftKey) return;
      const key = event.key?.toLowerCase();
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
        if (!activeCell) return;
        event.preventDefault();
        copyCellContents(activeCell);
        const isDifferentCell =
          copiedCell?.rowId !== activeCell.rowId || copiedCell?.cellId !== activeCell.cellId;
        if (isDifferentCell) {
          setCopiedCell(activeCell);
        }
        setCopiedCellHighlight(activeCell);
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
      if (
        activeCell &&
        activeCell.rowId === copiedCell.rowId &&
        activeCell.cellId === copiedCell.cellId
      ) {
        return;
      }
      handleCellActivate(copiedCell.rowId, copiedCell.cellId);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [activeCell, copyCellContents, copiedCell, handleCellActivate]);

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
        if (isShift && anchorExists) {
          setSelectionFocus(descriptor);
          const rangeKeys = getRangeSelectionKeys(
            cellSelectionAnchorRef.current,
            descriptor
          );
          setSelectedCellKeys(rangeKeys);
        } else {
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
