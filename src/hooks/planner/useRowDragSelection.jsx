import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const isBrowserEnvironment = () =>
  typeof window !== 'undefined' && typeof document !== 'undefined';

export default function useRowDragSelection({
  table,
  setRows,
  selectedRowIds,
  setSelectedRowIds,
  lastSelectedRowIndex,
  setLastSelectedRowIndex,
  handleCellClear,
  highlightedRowId,
  setHighlightedRowId,
}) {
  const [activeRowId, setActiveRowId] = useState(null);
  const [dragIndex, setDragIndex] = useState(null);
  const [hoverIndex, setHoverIndex] = useState(null);

  const dragIndexRef = useRef(dragIndex);
  const hoverIndexRef = useRef(hoverIndex);
  const rowRefs = useRef(new Map());
  const pointerModifierRef = useRef({ meta: false, shift: false });
  const pendingRowClickModifierRef = useRef({ meta: false, shift: false });
  const dragSelectionRef = useRef([]);
  const dragListenersRef = useRef({ move: null, up: null });
  const originalUserSelectRef = useRef(null);
  const dragStartPointRef = useRef(null);
  const dragThresholdCrossedRef = useRef(false);
  const blockClickRef = useRef(false);

  const selectedRowIdSet = useMemo(() => new Set(selectedRowIds), [selectedRowIds]);

  const updateDragIndex = useCallback((value) => {
    dragIndexRef.current = value;
    setDragIndex(value);
  }, []);

  const updateHoverIndex = useCallback((value) => {
    if (hoverIndexRef.current === value) return;
    hoverIndexRef.current = value;
    setHoverIndex(value);
  }, []);

  const updatePointerModifierState = useCallback((event) => {
    pointerModifierRef.current = {
      meta: Boolean(event?.metaKey || event?.ctrlKey),
      shift: Boolean(event?.shiftKey),
    };
  }, []);

  const shouldPreserveSelection = useCallback(
    () => pointerModifierRef.current.meta || pointerModifierRef.current.shift,
    []
  );

  const detachDragListeners = useCallback(() => {
    if (!isBrowserEnvironment()) return;
    const { move, up } = dragListenersRef.current;
    if (move) window.removeEventListener('mousemove', move);
    if (up) window.removeEventListener('mouseup', up);
    dragListenersRef.current = { move: null, up: null };
    if (originalUserSelectRef.current !== null) {
      document.body.style.userSelect = originalUserSelectRef.current;
      originalUserSelectRef.current = null;
    }
  }, []);

  const cleanupDragState = useCallback(
    ({ preserveCellSelection = false } = {}) => {
      detachDragListeners();
      updateDragIndex(null);
      updateHoverIndex(null);
      setActiveRowId(null);
      if (!preserveCellSelection) {
        handleCellClear({ clearRowSelection: false });
      }
      dragStartPointRef.current = null;
      dragThresholdCrossedRef.current = false;
      blockClickRef.current = false;
      dragSelectionRef.current = [];
    },
    [detachDragListeners, handleCellClear, updateDragIndex, updateHoverIndex]
  );

  useEffect(
    () => () => {
      detachDragListeners();
    },
    [detachDragListeners]
  );

  const updateHoverFromClientY = useCallback(
    (clientY) => {
      const currentRows = table.getRowModel().rows;
      if (!currentRows.length) {
        updateHoverIndex(0);
        return;
      }

      let targetIndex = currentRows.length;
      for (let i = 0; i < currentRows.length; i += 1) {
        const ref = rowRefs.current.get(currentRows[i].original.id);
        if (!ref) continue;
        const rect = ref.getBoundingClientRect();
        if (clientY < rect.top + rect.height / 2) {
          targetIndex = i;
          break;
        }
      }
      updateHoverIndex(targetIndex);
    },
    [table, updateHoverIndex]
  );

  const finalizeRowReorder = useCallback(
    (targetIndex) => {
      const sourceIndex = dragIndexRef.current;
      if (!dragThresholdCrossedRef.current || sourceIndex === null) {
        cleanupDragState({ preserveCellSelection: true });
        return;
      }
      setRows((prev) => {
        if (targetIndex === null) return prev;
        const rowCount = prev.length;
        const clampedTarget = Math.max(0, Math.min(targetIndex, rowCount));
        const fallbackSelection =
          dragSelectionRef.current && dragSelectionRef.current.length
            ? dragSelectionRef.current
            : selectedRowIds.length
            ? selectedRowIds
            : [];
        let selectionIds = fallbackSelection;
        if (!selectionIds.length && prev[sourceIndex]) {
          selectionIds = [prev[sourceIndex].id];
        }
        if (!selectionIds.length) return prev;
        const selectionSet = new Set(selectionIds);
        const movingRows = [];
        const remainingRows = [];
        prev.forEach((row) => {
          if (selectionSet.has(row.id)) {
            movingRows.push(row);
          } else {
            remainingRows.push(row);
          }
        });
        if (!movingRows.length) return prev;
        let selectedBeforeTarget = 0;
        for (let i = 0; i < clampedTarget; i += 1) {
          if (selectionSet.has(prev[i].id)) selectedBeforeTarget += 1;
        }
        const insertionIndex = Math.max(
          0,
          Math.min(clampedTarget - selectedBeforeTarget, remainingRows.length)
        );
        const nextRows = [
          ...remainingRows.slice(0, insertionIndex),
          ...movingRows,
          ...remainingRows.slice(insertionIndex),
        ];
        const unchanged =
          nextRows.length === prev.length &&
          nextRows.every((row, idx) => row === prev[idx]);
        return unchanged ? prev : nextRows;
      });
      cleanupDragState();
    },
    [cleanupDragState, selectedRowIds, setRows]
  );

  const handleRowMouseDown = useCallback(
    (event, rowIndex, rowId) => {
      if (event.button !== 0) return;
      if (event.target instanceof Element) {
        const interactive = event.target.closest('input, select, textarea, button, a');
        if (interactive) return;
      }
      event.stopPropagation();
      event.preventDefault();
      updatePointerModifierState(event);
      pendingRowClickModifierRef.current = {
        meta: pointerModifierRef.current.meta,
        shift: pointerModifierRef.current.shift,
      };
      const rowIsSelected = selectedRowIdSet.has(rowId);
      let selectionForDrag = rowIsSelected ? [...selectedRowIds] : [rowId];
      if (!selectionForDrag.length) {
        selectionForDrag = [rowId];
      }
      dragSelectionRef.current = [...selectionForDrag];
      // Don't set drag/hover index until threshold is crossed
      setActiveRowId(rowId);
      setHighlightedRowId(null);
      dragStartPointRef.current = { x: event.clientX, y: event.clientY };
      dragThresholdCrossedRef.current = false;
      blockClickRef.current = false;

      if (originalUserSelectRef.current === null) {
        originalUserSelectRef.current = document.body.style.userSelect;
      }
      document.body.style.userSelect = 'none';

      let selectionCommitted = rowIsSelected;
      const handleMouseMove = (moveEvent) => {
        moveEvent.preventDefault();
        if (dragStartPointRef.current) {
          const dx = moveEvent.clientX - dragStartPointRef.current.x;
          const dy = moveEvent.clientY - dragStartPointRef.current.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          if (!dragThresholdCrossedRef.current) {
            if (distance <= 5) return;
            dragThresholdCrossedRef.current = true;
            // Look up the CURRENT index of the dragged row
            // This is critical because after a previous reorder, the rowIndex parameter may be stale
            const currentRows = table.getRowModel().rows;
            const currentRowIndex = currentRows.findIndex((r) => r.original.id === rowId);
            if (currentRowIndex === -1) {
              return;
            }
            // Now that drag started, set the drag and hover indices using CURRENT index
            updateDragIndex(currentRowIndex);
            updateHoverIndex(currentRowIndex + 1);
            handleCellClear({ clearRowSelection: false });
            if (!selectionCommitted) {
              selectionCommitted = true;
              setSelectedRowIds(selectionForDrag);
              setLastSelectedRowIndex(currentRowIndex);
            }
          }
        }
        updateHoverFromClientY(moveEvent.clientY);
      };

      const handleMouseUp = (upEvent) => {
        upEvent.preventDefault();
        blockClickRef.current = dragThresholdCrossedRef.current;

        // Remove event listeners immediately
        detachDragListeners();

        // If drag threshold wasn't crossed, treat as a click to select the row
        if (!dragThresholdCrossedRef.current) {
          handleCellClear({ clearRowSelection: false });
          setSelectedRowIds(selectionForDrag);
          // Look up current index for consistency
          const currentRows = table.getRowModel().rows;
          const currentRowIndex = currentRows.findIndex((r) => r.original.id === rowId);
          setLastSelectedRowIndex(currentRowIndex !== -1 ? currentRowIndex : rowIndex);
        } else {
          // Otherwise, finalize the drag/drop
          const target = hoverIndexRef.current ?? dragIndexRef.current ?? rowIndex + 1;
          finalizeRowReorder(target);
        }

        setTimeout(() => {
          blockClickRef.current = false;
        }, 0);
      };

      dragListenersRef.current = { move: handleMouseMove, up: handleMouseUp };
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    },
    [
      detachDragListeners,
      finalizeRowReorder,
      handleCellClear,
      selectedRowIdSet,
      selectedRowIds,
      setLastSelectedRowIndex,
      setSelectedRowIds,
      table,
      updateDragIndex,
      updateHoverFromClientY,
      updateHoverIndex,
      updatePointerModifierState,
    ]
  );

  const handleRowClick = useCallback(
    (event, rowIndex) => {
      if (blockClickRef.current) return;
      const currentRows = table.getRowModel().rows;
      const targetRow = currentRows[rowIndex];
      if (!targetRow) return;
      const rowId = targetRow.original.id;
      const pointerMeta = pointerModifierRef.current.meta;
      const pointerShift = pointerModifierRef.current.shift;
      const pendingMeta = pendingRowClickModifierRef.current.meta;
      const pendingShift = pendingRowClickModifierRef.current.shift;
      const isMeta =
        event.metaKey || event.ctrlKey || pendingMeta || pointerMeta;
      const isShift = event.shiftKey || pendingShift || pointerShift;

      // Clear cell selection when clicking row number
      handleCellClear({ clearRowSelection: false });

      setSelectedRowIds((prev) => {
        if (isShift) {
          const anchorIndex = lastSelectedRowIndex ?? rowIndex;
          const start = Math.min(anchorIndex, rowIndex);
          const end = Math.max(anchorIndex, rowIndex);
          const rangeIds = currentRows.slice(start, end + 1).map((row) => row.original.id);
          return rangeIds;
        }
        if (isMeta) {
          const nextSet = new Set(prev);
          if (nextSet.has(rowId)) nextSet.delete(rowId);
          else nextSet.add(rowId);
          return Array.from(nextSet);
        }
        if (prev.length === 1 && prev[0] === rowId) {
          return [];
        }
        return [rowId];
      });
      setLastSelectedRowIndex(rowIndex);
      pointerModifierRef.current = { meta: false, shift: false };
      pendingRowClickModifierRef.current = { meta: false, shift: false };
    },
    [setLastSelectedRowIndex, setSelectedRowIds, table, lastSelectedRowIndex, handleCellClear]
  );

  return {
    rowRefs,
    dragIndex,
    hoverIndex,
    activeRowId,
    highlightedRowId,
    blockClickRef,
    handleRowMouseDown,
    handleRowClick,
    updatePointerModifierState,
    shouldPreserveSelection,
    setHighlightedRowId,
    pointerModifierRef,
  };
}
