import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useReactTable, getCoreRowModel } from '@tanstack/react-table';
import { ListFilter } from 'lucide-react';

const PROTECTED_STATUSES = new Set(['Done', 'Abandoned', 'Blocked', 'On Hold', 'Skipped', 'Special']);
const TASK_ROW_TYPES = new Set(['projectTask', 'inboxItem']);
const FILTERABLE_ROW_TYPES = new Set([
  'projectTask',
  'inboxItem',
  'projectHeader',
  'projectGeneral',
  'projectUnscheduled',
]);
const STATUS_VALUES = ['Not Scheduled', 'Scheduled', 'Done', 'Blocked', 'On Hold', 'Abandoned'];
const RECURRING_VALUES = ['Recurring', 'Not Recurring'];
const ESTIMATE_VALUES = [
  '-',
  'Custom',
  '1 Minute',
  ...Array.from({ length: 11 }, (_, i) => `${(i + 1) * 5} Minutes`),
  ...[1, 2, 3, 4, 5, 6, 7, 8].map((h) => `${h} Hour${h > 1 ? 's' : ''}`),
];

const isProtectedStatus = (status) => {
  if (!status || status === '-') return false;
  return PROTECTED_STATUSES.has(status);
};

const hasScheduledTimeEntries = (row) => {
  if (!Array.isArray(row.dayEntries)) return false;
  return row.dayEntries.some((value) => (value ?? '').trim() !== '');
};

const MIN_COLUMN_WIDTH = 40;
const COLUMN_RESIZE_HANDLE_WIDTH = 10;
const createEmptyDayEntries = (count) => Array.from({ length: count }, () => '');
const isTaskColumnEmpty = (row) => !(row.taskName ?? '').trim();
const ROW_LABEL_BASE_STYLE = { backgroundColor: '#d9f6e0', color: '#065f46' };
const applyRowLabelStyle = (style = {}) => ({ ...style, ...ROW_LABEL_BASE_STYLE });
const FILTER_BLOCKED_LETTERS = new Set(['A', 'D', 'G']);
const coerceNumber = (value) => {
  if (value == null) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const normalized = value.trim().replace(',', '.');
    if (!normalized) return null;
    const parsed = parseFloat(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};
const formatTotalValue = (value) => {
  if (value == null) return '0.00';
  return value.toFixed(2);
};

const normalizeTimeEntryValue = (value) => (typeof value === 'string' ? value.trim() : '');
const syncDayEntriesWithTimeValue = (dayEntries, nextTimeValue, prevTimeValue) => {
  if (!Array.isArray(dayEntries)) return dayEntries;
  const prev = normalizeTimeEntryValue(prevTimeValue);
  if (!prev) return dayEntries;
  const nextRaw = nextTimeValue ?? '';
  const next = normalizeTimeEntryValue(nextRaw);
  if (next === prev) return dayEntries;

  let changed = false;
  const updatedEntries = dayEntries.map((entry) => {
    if (normalizeTimeEntryValue(entry) === prev) {
      changed = true;
      return nextRaw;
    }
    return entry;
  });

  return changed ? updatedEntries : dayEntries;
};

const parseEstimateLabelToMinutes = (label) => {
  if (!label || label === '-' || label === 'Custom') return null;
  const minuteMatch = label.match(/^(\d+)\s+Minute/);
  if (minuteMatch) {
    return parseInt(minuteMatch[1], 10);
  }
  const hourMatch = label.match(/^(\d+)\s+Hour/);
  if (hourMatch) {
    return parseInt(hourMatch[1], 10) * 60;
  }
  return null;
};

const formatMinutesToHHmm = (minutes) => {
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hrs}.${mins.toString().padStart(2, '0')}`;
};

const getDefaultTimeValueForEstimate = (estimate) => {
  const minutes = parseEstimateLabelToMinutes(estimate);
  if (minutes != null) return formatMinutesToHHmm(minutes);
  return '0.00';
};
const isBrowserEnvironment = () =>
  typeof window !== 'undefined' && typeof document !== 'undefined';

export default function ProjectTimePlannerWireframe() {
  const [showRecurring, setShowRecurring] = useState(true);
  const [startDate, setStartDate] = useState("");
  const [showMaxMinRows, setShowMaxMinRows] = useState(true);
  const [isListicalMenuOpen, setIsListicalMenuOpen] = useState(false);
  const [addTasksCount, setAddTasksCount] = useState('');
  const totalDays = 84;

  const createTaskRow = (base) => ({
    ...base,
    dayEntries: createEmptyDayEntries(totalDays),
    taskName: '',
    estimate: '-',
    timeValue: '0.00',
    recurring: 'Not Recurring',
    hasUserInteraction: false,
  });

  const buildInitialRows = () => {
    const projects = ['Project A', 'Project B', 'Project C'];
    const rowsConfig = [];

    projects.forEach((project) => {
      const slug = project.replace(/\s+/g, '-').toLowerCase();
      rowsConfig.push({ id: `${slug}-header`, type: 'projectHeader', projectName: project });
      rowsConfig.push({ id: `${slug}-general`, type: 'projectGeneral', projectName: project });
      rowsConfig.push(
        createTaskRow({ id: `${slug}-task`, type: 'projectTask', projectName: project })
      );
      rowsConfig.push({ id: `${slug}-unscheduled`, type: 'projectUnscheduled', projectName: project });
    });

    rowsConfig.push({ id: 'inbox-header', type: 'inboxHeader' });
    Array.from({ length: 20 }).forEach((_, index) => {
      rowsConfig.push(createTaskRow({ id: `inbox-item-${index}`, type: 'inboxItem', index }));
    });

    return rowsConfig;
  };

  // Rows are stateful so their order can be updated (e.g., by drag-and-drop).
  // A simulated mouse drag updates this array directly so TanStack Table sees the new ordering.
  const [rows, setRows] = useState(buildInitialRows);
  const [highlightedRowId, setHighlightedRowId] = useState(null);
  const [activeCell, setActiveCell] = useState(null);
  const [selectedRowIds, setSelectedRowIds] = useState([]);
  const [lastSelectedRowIndex, setLastSelectedRowIndex] = useState(null);
  const selectedRowIdSet = useMemo(() => new Set(selectedRowIds), [selectedRowIds]);

  const handleCellActivate = (rowId, cellId, { highlightRow = false, preserveSelection = false } = {}) => {
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
  };

  const handleCellMouseDown = (event, rowId, cellId, options = {}) => {
    updatePointerModifierState(event);
    const preserveSelection = Boolean(event?.metaKey || event?.ctrlKey || event?.shiftKey);
    handleCellActivate(rowId, cellId, { ...options, preserveSelection });
  };

  const handleCellClear = useCallback(
    ({ clearRowSelection = true } = {}) => {
      setActiveCell(null);
      setHighlightedRowId(null);
      if (clearRowSelection) {
        setSelectedRowIds([]);
        setLastSelectedRowIndex(null);
      }
    },
    [setActiveCell, setHighlightedRowId, setSelectedRowIds, setLastSelectedRowIndex]
  );

  const [copiedCell, setCopiedCell] = useState(null);
  const [copiedCellHighlight, setCopiedCellHighlight] = useState(null);
  const copiedCellHighlightTimeoutRef = useRef(null);
  const listicalButtonRef = useRef(null);
  const listicalMenuRef = useRef(null);
  const [activeFilterColumns, setActiveFilterColumns] = useState(() => new Set());
  const [selectedProjectFilters, setSelectedProjectFilters] = useState(() => new Set());
  const [projectFilterMenu, setProjectFilterMenu] = useState(() => ({
    open: false,
    left: 0,
    top: 0,
  }));
  const projectFilterButtonRef = useRef(null);
  const projectFilterMenuRef = useRef(null);
  const [selectedStatusFilters, setSelectedStatusFilters] = useState(() => new Set());
  const [statusFilterMenu, setStatusFilterMenu] = useState(() => ({
    open: false,
    left: 0,
    top: 0,
  }));
  const statusFilterButtonRef = useRef(null);
  const statusFilterMenuRef = useRef(null);
  const [selectedRecurringFilters, setSelectedRecurringFilters] = useState(() => new Set());
  const [recurringFilterMenu, setRecurringFilterMenu] = useState(() => ({
    open: false,
    left: 0,
    top: 0,
  }));
  const recurringFilterButtonRef = useRef(null);
  const recurringFilterMenuRef = useRef(null);
  const [selectedEstimateFilters, setSelectedEstimateFilters] = useState(() => new Set());
  const [estimateFilterMenu, setEstimateFilterMenu] = useState(() => ({
    open: false,
    left: 0,
    top: 0,
  }));
  const estimateFilterButtonRef = useRef(null);
  const estimateFilterMenuRef = useRef(null);

  const isCellActive = (rowId, cellId) =>
    activeCell && activeCell.rowId === rowId && activeCell.cellId === cellId;

  const getCellHighlightStyle = (rowId, cellId) => {
    const style = {};
    if (isCellActive(rowId, cellId)) {
      style.filter = 'brightness(0.96)';
      style.position = 'relative';
      style.zIndex = 2;
    }
    if (copiedCellHighlight && copiedCellHighlight.rowId === rowId && copiedCellHighlight.cellId === cellId) {
      style.boxShadow = '0 0 0 2px rgba(59,130,246,0.9)';
    }
    return style;
  };
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
  const tableContainerRef = useRef(null);
  const [columnWidths, setColumnWidths] = useState({});
  const columnResizeRef = useRef(null);
  const columnResizeListenersRef = useRef({ move: null, up: null });
  const updatePointerModifierState = (event) => {
    pointerModifierRef.current = {
      meta: Boolean(event?.metaKey || event?.ctrlKey),
      shift: Boolean(event?.shiftKey),
    };
  };
  const shouldPreserveSelection = () =>
    pointerModifierRef.current.meta || pointerModifierRef.current.shift;

  const updateDragIndex = (value) => {
    dragIndexRef.current = value;
    setDragIndex(value);
  };

  const updateHoverIndex = (value) => {
    if (hoverIndexRef.current === value) return;
    hoverIndexRef.current = value;
    setHoverIndex(value);
  };

  const updateRowValues = useCallback(
    (rowIndex, updater, options = {}) => {
      const { markInteraction = false } = options ?? {};
      setRows((prev) =>
        prev.map((row, idx) => {
          if (idx !== rowIndex) return row;
          const updates = typeof updater === 'function' ? updater(row) : updater;
          if (updates == null) return row;
          const nextRow = { ...row, ...(updates || {}) };

          if (TASK_ROW_TYPES.has(nextRow.type)) {
            if (markInteraction) {
              if (!isProtectedStatus(nextRow.status) && !hasScheduledTimeEntries(nextRow)) {
                nextRow.status = 'Not Scheduled';
              }
              if (!nextRow.hasUserInteraction) nextRow.hasUserInteraction = true;
            }

            if (isTaskColumnEmpty(nextRow)) {
              nextRow.status = '-';
            }
          }

          return nextRow;
        })
      );
    },
    [setRows]
  );
  const columns = useMemo(
    () => [
      {
        id: 'rowData',
        accessorFn: (originalRow) => originalRow,
      },
    ],
    []
  );

  const filteredRows = useMemo(() => {
    const activeDayFilters = Array.from(activeFilterColumns).filter((key) => key.startsWith('day-'));
    const matchesProjectFilter = (row) => {
      if (!selectedProjectFilters.size) return true;
      if (TASK_ROW_TYPES.has(row.type)) {
        return selectedProjectFilters.has(row.projectSelection ?? '');
      }
      return false; // Hide non-task rows when filtering by project since they lack a project dropdown.
    };

    const matchesStatusFilter = (row) => {
      if (!selectedStatusFilters.size) return true;
      if (TASK_ROW_TYPES.has(row.type)) {
        return selectedStatusFilters.has(row.status ?? '');
      }
      return false; // Hide non-task rows when filtering by status since they lack a status dropdown.
    };

    const matchesRecurringFilter = (row) => {
      if (!selectedRecurringFilters.size) return true;
      if (TASK_ROW_TYPES.has(row.type)) {
        const value = row.recurring === 'Recurring' ? 'Recurring' : 'Not Recurring';
        return selectedRecurringFilters.has(value);
      }
      return false; // Hide non-task rows when filtering by recurring since they lack that control.
    };

    const matchesEstimateFilter = (row) => {
      if (!selectedEstimateFilters.size) return true;
      if (TASK_ROW_TYPES.has(row.type)) {
        return selectedEstimateFilters.has(row.estimate ?? '-');
      }
      return false; // Hide non-task rows when filtering by estimate since they lack that control.
    };

    if (
      !activeDayFilters.length &&
      !selectedProjectFilters.size &&
      !selectedStatusFilters.size &&
      !selectedRecurringFilters.size &&
      !selectedEstimateFilters.size
    ) {
      return rows;
    }
    return rows.filter((row) => {
      if (!matchesProjectFilter(row)) return false;
      if (!matchesStatusFilter(row)) return false;
      if (!matchesRecurringFilter(row)) return false;
      if (!matchesEstimateFilter(row)) return false;
      if (!FILTERABLE_ROW_TYPES.has(row.type)) return true;
      const dayEntries = Array.isArray(row.dayEntries) ? row.dayEntries : [];
      return activeDayFilters.every((key) => {
        const idx = Number(key.slice(4));
        if (!Number.isInteger(idx) || idx < 0) return true;
        const value = dayEntries[idx];
        return coerceNumber(value) !== null;
      });
    });
  }, [rows, activeFilterColumns, selectedProjectFilters, selectedStatusFilters, selectedRecurringFilters, selectedEstimateFilters]);

  const table = useReactTable({
    data: filteredRows,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });
  const tableRows = table.getRowModel().rows;

  const detachDragListeners = () => {
    if (!isBrowserEnvironment()) return;
    const { move, up } = dragListenersRef.current;
    if (move) window.removeEventListener('mousemove', move);
    if (up) window.removeEventListener('mouseup', up);
    dragListenersRef.current = { move: null, up: null };
    if (originalUserSelectRef.current !== null) {
      document.body.style.userSelect = originalUserSelectRef.current;
      originalUserSelectRef.current = null;
    }
  };

  const detachColumnResizeListeners = useCallback(() => {
    if (!isBrowserEnvironment()) return;
    const { move, up } = columnResizeListenersRef.current;
    if (move) window.removeEventListener('mousemove', move);
    if (up) window.removeEventListener('mouseup', up);
    columnResizeListenersRef.current = { move: null, up: null };
  }, []);

  const cleanupDragState = ({ preserveCellSelection = false } = {}) => {
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
  };

  useEffect(
    () => () => {
      detachDragListeners();
    },
    []
  );

  useEffect(
    () => () => {
      detachColumnResizeListeners();
    },
    [detachColumnResizeListeners]
  );

  useEffect(() => {
    if (!isBrowserEnvironment()) return undefined;
    const handlePointerDownOutside = (event) => {
      if (!tableContainerRef.current) return;
      if (!(event.target instanceof Node)) return;
      if (tableContainerRef.current.contains(event.target)) return;
      handleCellClear();
    };

    document.addEventListener('pointerdown', handlePointerDownOutside);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDownOutside);
    };
  }, [handleCellClear]);

  const updateHoverFromClientY = (clientY) => {
    const currentRows = table.getRowModel().rows;
    if (!currentRows.length) {
      updateHoverIndex(0);
      return;
    }

    let targetIndex = currentRows.length;
    for (let i = 0; i < currentRows.length; i++) {
      const ref = rowRefs.current.get(currentRows[i].original.id);
      if (!ref) continue;
      const rect = ref.getBoundingClientRect();
      if (clientY < rect.top + rect.height / 2) {
        targetIndex = i;
        break;
      }
    }
    updateHoverIndex(targetIndex);
  };

  const handleRowMouseDown = (event, rowIndex, rowId) => {
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
    updateDragIndex(rowIndex);
    updateHoverIndex(rowIndex + 1);
    updateHoverFromClientY(event.clientY);
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
          handleCellClear({ clearRowSelection: false });
          if (!selectionCommitted) {
            selectionCommitted = true;
            setSelectedRowIds(selectionForDrag);
            setLastSelectedRowIndex(rowIndex);
          }
        }
      }
      updateHoverFromClientY(moveEvent.clientY);
    };

    const handleMouseUp = (upEvent) => {
      upEvent.preventDefault();
      blockClickRef.current = dragThresholdCrossedRef.current;
      const target = hoverIndexRef.current ?? dragIndexRef.current ?? rowIndex + 1;
      finalizeRowReorder(target);
      setTimeout(() => {
        blockClickRef.current = false;
      }, 0);
    };

    dragListenersRef.current = { move: handleMouseMove, up: handleMouseUp };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const finalizeRowReorder = (targetIndex) => {
    const sourceIndex = dragIndexRef.current;
    if (!dragThresholdCrossedRef.current) {
      cleanupDragState({ preserveCellSelection: true });
      return;
    }
    if (sourceIndex === null || targetIndex === null) {
      cleanupDragState();
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
        if (selectionSet.has(row.id)) movingRows.push(row);
        else remainingRows.push(row);
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
  };

  const handleRowClick = (event, rowIndex) => {
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
  };

  const handleCellClick = (rowIndex, columnId) => {
    if (blockClickRef.current) return;
    const currentRows = table.getRowModel().rows;
    const targetRow = currentRows[rowIndex];
    if (!targetRow) return;
    handleCellActivate(targetRow.original.id, columnId, {
      preserveSelection: shouldPreserveSelection(),
    });
  };

  const COL_W = {
    rowLabel: 36,
    check: 24,
    project: 120,
    status: 120,
    task: 240,
    recurring: 80,
    estimate: 100,
    timeValue: 80,
    day: 60,
  };

  const ROW_H = 26;
  const blackDividerStyle = { borderRight: '4px solid #000000' };
  const sharedInputStyle = 'w-full h-full text-[12px] px-2 border-none focus:outline-none focus:ring-0 bg-transparent';
  const checkboxInputClass = 'accent-black h-4 w-4 cursor-pointer focus:outline-none focus:ring-0';

  const fixedColumnConfig = useMemo(() => {
    const config = [
      { key: 'check', label: '✓', width: COL_W.check, className: 'text-center' },
      { key: 'project', label: 'Project', width: COL_W.project },
      { key: 'status', label: 'Status', width: COL_W.status },
      { key: 'task', label: 'Task', width: COL_W.task },
    ];

    if (showRecurring) {
      config.push({ key: 'recurring', label: 'Recurring', width: COL_W.recurring, className: 'text-center' });
    }

    config.push({ key: 'estimate', label: 'Estimate', width: COL_W.estimate });
    config.push({ key: 'timeValue', label: 'Time Value', width: COL_W.timeValue });

    return config;
  }, [showRecurring]);

  const fixedColumnWidthMap = useMemo(() => {
    const widthMap = { rowLabel: COL_W.rowLabel };
    fixedColumnConfig.forEach(({ key, width }) => {
      widthMap[key] = width;
    });
    return widthMap;
  }, [fixedColumnConfig]);

  const getColumnWidth = useCallback(
    (key) => {
      if (columnWidths[key]) return columnWidths[key];
      if (fixedColumnWidthMap[key]) return fixedColumnWidthMap[key];
      if (key.startsWith('day-')) return COL_W.day;
      return COL_W.day;
    },
    [columnWidths, fixedColumnWidthMap]
  );

  const getWidthStyle = useCallback(
    (key, extraStyles = {}) => {
      const width = getColumnWidth(key);
      return {
        width,
        minWidth: width,
        maxWidth: width,
        ...extraStyles,
      };
    },
    [getColumnWidth]
  );

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
  }, [activeCell, copiedCell, handleCellActivate, copyCellContents]);

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
      const newWidth = Math.max(MIN_COLUMN_WIDTH, info.startWidth + delta);
      setColumnWidths((prev) => {
        if (prev[info.key] === newWidth) return prev;
        return { ...prev, [info.key]: newWidth };
      });
    },
    [setColumnWidths]
  );

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
        startWidth: getColumnWidth(columnKey),
      };

      const move = (moveEvent) => handleColumnResizeMouseMove(moveEvent);
      const up = () => handleColumnResizeMouseUp();
      columnResizeListenersRef.current = { move, up };
      window.addEventListener('mousemove', move);
      window.addEventListener('mouseup', up);
    },
    [getColumnWidth, handleColumnResizeMouseMove, handleColumnResizeMouseUp]
  );

  const renderResizeHandle = useCallback(
    (columnKey) => (
      <div
        className="column-resize-handle"
        style={{
          position: 'absolute',
          top: 0,
          right: -COLUMN_RESIZE_HANDLE_WIDTH / 2,
          width: COLUMN_RESIZE_HANDLE_WIDTH,
          height: '100%',
          cursor: 'col-resize',
          zIndex: 20,
        }}
        onMouseDown={(event) => handleColumnResizeMouseDown(event, columnKey)}
        role="separator"
        aria-orientation="vertical"
      />
    ),
    [handleColumnResizeMouseDown]
  );

  const fixedCols = fixedColumnConfig.length + 1;
  const weeksCount = totalDays / 7;
  const hasStartDate = Boolean(startDate);

  const dates = useMemo(() => {
    const base = startDate ? new Date(startDate) : null;
    return Array.from({ length: totalDays }, (_, i) => {
      if (!base) return null;
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      return d;
    });
  }, [startDate, totalDays]);

  const monthSpans = useMemo(() => {
    if (!hasStartDate) return [{ label: 'Month', span: totalDays }];
    const firstDate = dates[0];
    if (!firstDate) return [{ label: 'Month', span: totalDays }];
    const spans = [];
    let currentMonth = firstDate.getMonth();
    let currentYear = firstDate.getFullYear();
    let count = 0;
    dates.forEach((d, i) => {
      if (!d) return;
      const m = d.getMonth();
      const y = d.getFullYear();
      if (m === currentMonth && y === currentYear) count++;
      else {
        spans.push({ label: new Date(currentYear, currentMonth, 1).toLocaleString('en-GB', { month: 'short' }), span: count });
        currentMonth = m;
        currentYear = y;
        count = 1;
      }
      if (i === dates.length - 1)
        spans.push({ label: new Date(currentYear, currentMonth, 1).toLocaleString('en-GB', { month: 'short' }), span: count });
    });
    return spans;
  }, [dates, hasStartDate, totalDays]);

  const isWeekBoundary = (index) => (index + 1) % 7 === 0;
  const isWeekStart = (index) => index % 7 === 0;

  const applyWeekBorderStyles = (index, baseStyle = {}) => {
    const style = { ...baseStyle };
    if (style.borderRight === undefined || style.borderRight === 'none') {
      style.borderRight = isWeekBoundary(index)
        ? '2px solid #000000'
        : '1px solid #ced3d0';
    }
    if (style.borderLeft === undefined || style.borderLeft === 'none') {
      style.borderLeft =
        isWeekStart(index) && index !== 0 ? '2px solid #000000' : '1px solid #ced3d0';
    }
    return style;
  };

  const getWeekBorderClass = (_index, baseClass = '') => baseClass;

  const createStyle = (backgroundColor, color) => ({ backgroundColor, color });

  const columnTotals = useMemo(() => {
    const totals = {};
    rows.forEach((row) => {
      if (!TASK_ROW_TYPES.has(row.type)) return;
      if (Array.isArray(row.dayEntries)) {
        row.dayEntries.forEach((entry, index) => {
          const numericValue = coerceNumber(entry);
          if (numericValue == null) return;
          const key = `day-${index}`;
          totals[key] = (totals[key] ?? 0) + numericValue;
        });
      }
      const numericTimeValue = coerceNumber(row.timeValue);
      if (numericTimeValue != null) {
        totals.timeValue = (totals.timeValue ?? 0) + numericTimeValue;
      }
    });
    return totals;
  }, [rows]);

  const timelineRowConfig = useMemo(() => {
    const fixedTimelineStyle = createStyle('#000000', '#ffffff');
    const timelineHeaderStyle = createStyle('#ffffff', '#000000');
    const weekdayCellStyle = createStyle('#efefef', '#000000');
    const weekendCellStyle = createStyle('#d9d9d9', '#000000');

    const weekBoundaryClass = (index, baseClass = 'border border-[#ced3d0]') =>
      getWeekBorderClass(index, baseClass);

    const isMonthTransitionAfter = (index) => {
      const current = dates[index];
      const next = dates[index + 1];
      if (!current || !next) return false;
      return (
        current.getMonth() !== next.getMonth() || current.getFullYear() !== next.getFullYear()
      );
    };

    const isMonthTransitionBefore = (index) => (index === 0 ? false : isMonthTransitionAfter(index - 1));

    const fixedHeaderCellStyle = createStyle('#000000', '#ffffff');

    let rowCounter = 1;

    const monthsRow = {
      id: 'months',
      rowLabelStyle: fixedTimelineStyle,
      rowLabelClassName: 'text-center font-semibold border border-[#ced3d0] text-white',
      fixedCellStyle: { ...fixedTimelineStyle, ...blackDividerStyle },
      fixedCellClassName: 'border-0 text-white',
      rowLabelContent: String(rowCounter++),
      cells: monthSpans.map((m, idx) => ({
        key: `month-${idx}`,
        colSpan: m.span,
        content: m.label,
        style: timelineHeaderStyle,
        className: `text-center font-semibold border border-black ${
          idx < monthSpans.length - 1 ? 'border-r-2 border-black' : ''
        }`,
      })),
    };

    const weeksRow = {
      id: 'weeks',
      rowLabelStyle: fixedTimelineStyle,
      rowLabelClassName: 'text-center font-semibold border border-[#ced3d0] text-white',
      fixedCellStyle: { ...fixedTimelineStyle, ...blackDividerStyle },
      fixedCellClassName: 'border-0 text-white',
      rowLabelContent: String(rowCounter++),
      cells: Array.from({ length: weeksCount }).map((_, w) => ({
        key: `week-${w}`,
        colSpan: 7,
        content: `Week ${w + 1}`,
        style: timelineHeaderStyle,
        className: `text-center font-semibold border border-black ${
          w < weeksCount - 1 ? 'border-r-2 border-black' : ''
        }`,
      })),
    };

    const datesRow = {
      id: 'dates',
      rowLabelStyle: fixedTimelineStyle,
      rowLabelClassName: 'text-center font-semibold border border-[#ced3d0] text-white',
      fixedCellStyle: null,
      fixedCellClassName: 'border-0 text-white',
      rowLabelContent: String(rowCounter++),
      fixedCells: fixedColumnConfig.map(({ key, label, width, className }) => ({
        key: `dates-fixed-${key}`,
        columnKey: key,
        content: label,
        className: `border border-[#ced3d0] ${className ?? ''}`,
        style: {
          width,
          ...fixedHeaderCellStyle,
          ...(key === 'timeValue' ? blackDividerStyle : {}),
        },
      })),
      cells: dates.map((d, i) => ({
        key: `date-${i}`,
        columnKey: `day-${i}`,
        content: d ? d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '--',
        style: applyWeekBorderStyles(i, { ...timelineHeaderStyle }),
        className: `${weekBoundaryClass(i)} text-center text-black`,
      })),
    };

    const weekdaysRow = {
      id: 'weekdays',
      rowLabelStyle: fixedTimelineStyle,
      rowLabelClassName: 'text-center font-semibold border border-[#ced3d0] text-white',
      fixedCellStyle: { ...fixedTimelineStyle, ...blackDividerStyle },
      fixedCellClassName: 'border-0 text-white',
      rowLabelContent: String(rowCounter++),
      cells: dates.map((d, i) => ({
        key: `weekday-${i}`,
        columnKey: `day-${i}`,
        content: d ? d.toLocaleDateString('en-GB', { weekday: 'short' }).charAt(0) : '',
        style: (() => {
          const baseStyle = !d
            ? timelineHeaderStyle
            : [0, 6].includes(d.getDay())
            ? weekendCellStyle
            : weekdayCellStyle;
          const leftBorderIsBlack = isMonthTransitionBefore(i) || (isWeekStart(i) && i !== 0);
          const style = {
            ...baseStyle,
            borderTop: '1px solid #000000',
            borderBottom: '1px solid #000000',
            borderLeft: leftBorderIsBlack ? '2px solid #000000' : '1px solid #ced3d0',
            borderRight: '1px solid #ced3d0',
          };
          if (isWeekBoundary(i) || isMonthTransitionAfter(i)) {
            style.borderRight = '2px solid #000000';
          }
          return style;
        })(),
        className: 'text-center text-black font-semibold',
      })),
    };

    const createBufferRow = (suffix, fillColor, options = {}) => {
      const bufferRow = {
        id: `buffer-${suffix}`,
        rowLabelStyle: options.rowLabelStyle ?? fixedTimelineStyle,
        rowLabelClassName: options.rowLabelClassName ?? 'text-center font-semibold border-0 text-white',
        fixedCellStyle: options.fixedCellStyle ?? { ...fixedTimelineStyle, ...blackDividerStyle },
        fixedCellClassName: options.fixedCellClassName ?? 'border-0 text-white',
        rowLabelContent: String(rowCounter++),
        cells: dates.map((_, i) => {
          const style = applyWeekBorderStyles(i, {
            backgroundColor: fillColor,
            color: '#000000',
          });

          if (style.borderLeft === '1px solid #ced3d0') {
            style.borderLeft = '1px solid transparent';
          }
          if (style.borderRight === '1px solid #ced3d0') {
            style.borderRight = '1px solid transparent';
          }
          style.borderTop = '1px solid transparent';
          style.borderBottom = '1px solid transparent';

          return {
            key: `buffer-${suffix}-${i}`,
            columnKey: `day-${i}`,
            content: '',
            style,
            className: '',
          };
        }),
      };

      return bufferRow;
    };

    const rows = [monthsRow, weeksRow, datesRow, weekdaysRow];
    if (showMaxMinRows) {
      rows.push(createBufferRow(1, '#ead1dc'));
      rows.push(createBufferRow(2, '#f2e5eb'));
    }

    const totalsRow = {
      id: 'totals',
      rowLabelStyle: { backgroundColor: '#ead1dc', color: '#000000' },
      rowLabelClassName: 'text-center font-semibold border border-[#ced3d0]',
      fixedCellStyle: { backgroundColor: '#ead1dc', color: '#000000' },
      fixedCellClassName: 'border border-[#ced3d0] font-semibold px-2 text-right',
      rowLabelContent: String(rowCounter++),
      fixedCells: fixedColumnConfig.map(({ key, width, className }) => ({
        key: `total-fixed-${key}`,
        columnKey: key,
        content: '',
        className: `border border-[#ced3d0] font-semibold px-2 text-right ${className ?? ''}`,
        style: {
          width,
          backgroundColor: '#ead1dc',
          color: '#000000',
          ...(key === 'timeValue' ? blackDividerStyle : {}),
        },
      })),
      cells: dates.map((_, i) => ({
        key: `total-day-${i}`,
        columnKey: `day-${i}`,
        content: formatTotalValue(columnTotals[`day-${i}`]),
        style: applyWeekBorderStyles(i, {
          backgroundColor: '#ead1dc',
          color: '#000000',
          fontWeight: 600,
        }),
        className: getWeekBorderClass(i, 'border border-[#ced3d0] text-center font-semibold'),
      })),
    };

    rows.push(totalsRow);

    return rows;
  }, [dates, monthSpans, weeksCount, showMaxMinRows, columnTotals, fixedColumnConfig]);

  const timelineRows = timelineRowConfig;
  const timelineRowCount = timelineRows.length;

  const [monthsRow, weeksRow, datesRow, weekdaysRow, ...bufferRows] = timelineRows;

  const getColumnLabel = (index) => {
    let label = '';
    let i = index;
    while (i >= 0) {
      label = String.fromCharCode(65 + (i % 26)) + label;
      i = Math.floor(i / 26) - 1;
    }
    return label;
  };

  const columnStructure = useMemo(() => {
    const structure = [
      { key: 'rowLabel', width: COL_W.rowLabel, isDay: false },
      ...fixedColumnConfig.map(({ key, width }) => ({
        key,
        width,
        isDay: false,
      })),
    ];
    for (let i = 0; i < totalDays; i++) {
      structure.push({
        key: `day-${i}`,
        width: COL_W.day,
        isDay: true,
      });
    }
    return structure;
  }, [fixedColumnConfig, totalDays]);

  const columnLetters = useMemo(
    () =>
      columnStructure.map((_, idx) => (idx === 0 ? '' : getColumnLabel(idx - 1))),
    [columnStructure]
  );

  const columnLetterByKey = useMemo(() => {
    const map = {};
    columnStructure.forEach((col, idx) => {
      map[col.key] = columnLetters[idx];
    });
    return map;
  }, [columnStructure, columnLetters]);

  const columnFKey = useMemo(
    () => Object.entries(columnLetterByKey).find(([, letter]) => letter === 'F')?.[0] ?? null,
    [columnLetterByKey]
  );
  const columnGKey = useMemo(
    () => Object.entries(columnLetterByKey).find(([, letter]) => letter === 'G')?.[0] ?? null,
    [columnLetterByKey]
  );

  const projectHeaderTotals = useMemo(() => {
    const totals = {};
    let activeHeaderId = null;

    rows.forEach((row) => {
      if (row.type === 'projectHeader') {
        activeHeaderId = row.id;
        totals[activeHeaderId] = 0;
        return;
      }
      if (row.type === 'inboxHeader') {
        activeHeaderId = null;
        return;
      }
      if (!activeHeaderId) return;
      if (!TASK_ROW_TYPES.has(row.type)) return;
      const status = row.status ?? '';
      if (status !== 'Scheduled' && status !== 'Done') return;
      const value = coerceNumber(row.timeValue);
      if (value == null) return;
      totals[activeHeaderId] += value;
    });

    const formattedTotals = {};
    Object.entries(totals).forEach(([key, total]) => {
      formattedTotals[key] = formatTotalValue(total ?? 0);
    });
    return formattedTotals;
  }, [rows]);

  const toggleFilterColumn = useCallback(
    (columnKey) => {
      if (!columnKey) return;
      setActiveFilterColumns((prev) => {
        const next = new Set(prev);
        if (next.has(columnKey)) {
          next.delete(columnKey);
        } else {
          next.add(columnKey);
        }
        return next;
      });
    },
    [setActiveFilterColumns]
  );

  const closeProjectFilterMenu = useCallback(() => {
    setProjectFilterMenu({ open: false, left: 0, top: 0 });
  }, []);

  const handleProjectFilterSelect = useCallback(
    (projectName) => {
      setSelectedProjectFilters((prev) => {
        const next = new Set(prev);
        if (next.has(projectName)) {
          next.delete(projectName);
        } else {
          next.add(projectName);
        }
        if (next.size === 0) {
          closeProjectFilterMenu();
        }
        return next;
      });
    },
    [closeProjectFilterMenu]
  );

  const handleProjectFilterButtonClick = useCallback(
    (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (!isBrowserEnvironment()) return;
      const buttonRect = event.currentTarget.getBoundingClientRect();
      const left = buttonRect.left + window.scrollX;
      const top = buttonRect.bottom + window.scrollY;
      const isAlreadyOpen = projectFilterMenu.open;

      projectFilterButtonRef.current = event.currentTarget;
      setProjectFilterMenu({
        open: !isAlreadyOpen || projectFilterMenu.left !== left || projectFilterMenu.top !== top,
        left,
        top,
      });
    },
    [projectFilterMenu.left, projectFilterMenu.open, projectFilterMenu.top]
  );

  const closeStatusFilterMenu = useCallback(() => {
    setStatusFilterMenu({ open: false, left: 0, top: 0 });
  }, []);

  const handleStatusFilterSelect = useCallback(
    (statusName) => {
      setSelectedStatusFilters((prev) => {
        const next = new Set(prev);
        if (next.has(statusName)) {
          next.delete(statusName);
        } else {
          next.add(statusName);
        }
        if (next.size === 0) {
          closeStatusFilterMenu();
        }
        return next;
      });
    },
    [closeStatusFilterMenu]
  );

  const handleStatusFilterButtonClick = useCallback(
    (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (!isBrowserEnvironment()) return;
      const buttonRect = event.currentTarget.getBoundingClientRect();
      const left = buttonRect.left + window.scrollX;
      const top = buttonRect.bottom + window.scrollY;
      const isAlreadyOpen = statusFilterMenu.open;

      statusFilterButtonRef.current = event.currentTarget;
      setStatusFilterMenu({
        open: !isAlreadyOpen || statusFilterMenu.left !== left || statusFilterMenu.top !== top,
        left,
        top,
      });
    },
    [statusFilterMenu.left, statusFilterMenu.open, statusFilterMenu.top]
  );

  const closeRecurringFilterMenu = useCallback(() => {
    setRecurringFilterMenu({ open: false, left: 0, top: 0 });
  }, []);

  const handleRecurringFilterSelect = useCallback(
    (recurringValue) => {
      setSelectedRecurringFilters((prev) => {
        const next = new Set(prev);
        if (next.has(recurringValue)) {
          next.delete(recurringValue);
        } else {
          next.add(recurringValue);
        }
        if (next.size === 0) {
          closeRecurringFilterMenu();
        }
        return next;
      });
    },
    [closeRecurringFilterMenu]
  );

  const handleRecurringFilterButtonClick = useCallback(
    (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (!isBrowserEnvironment()) return;
      const buttonRect = event.currentTarget.getBoundingClientRect();
      const left = buttonRect.left + window.scrollX;
      const top = buttonRect.bottom + window.scrollY;
      const isAlreadyOpen = recurringFilterMenu.open;

      recurringFilterButtonRef.current = event.currentTarget;
      setRecurringFilterMenu({
        open: !isAlreadyOpen || recurringFilterMenu.left !== left || recurringFilterMenu.top !== top,
        left,
        top,
      });
    },
    [recurringFilterMenu.left, recurringFilterMenu.open, recurringFilterMenu.top]
  );

  const closeEstimateFilterMenu = useCallback(() => {
    setEstimateFilterMenu({ open: false, left: 0, top: 0 });
  }, []);

  const handleEstimateFilterSelect = useCallback(
    (estimateValue) => {
      setSelectedEstimateFilters((prev) => {
        const next = new Set(prev);
        if (next.has(estimateValue)) {
          next.delete(estimateValue);
        } else {
          next.add(estimateValue);
        }
        if (next.size === 0) {
          closeEstimateFilterMenu();
        }
        return next;
      });
    },
    [closeEstimateFilterMenu]
  );

  const handleEstimateFilterButtonClick = useCallback(
    (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (!isBrowserEnvironment()) return;
      const buttonRect = event.currentTarget.getBoundingClientRect();
      const left = buttonRect.left + window.scrollX;
      const top = buttonRect.bottom + window.scrollY;
      const isAlreadyOpen = estimateFilterMenu.open;

      estimateFilterButtonRef.current = event.currentTarget;
      setEstimateFilterMenu({
        open: !isAlreadyOpen || estimateFilterMenu.left !== left || estimateFilterMenu.top !== top,
        left,
        top,
      });
    },
    [estimateFilterMenu.left, estimateFilterMenu.open, estimateFilterMenu.top]
  );

  const projectNames = useMemo(() => {
    const names = new Set();
    rows.forEach((row) => {
      if (row.projectName) names.add(row.projectName);
      if (row.projectSelection && row.projectSelection !== '-') {
        names.add(row.projectSelection);
      }
    });
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [rows]);

  useEffect(() => {
    if (!projectFilterMenu.open || !isBrowserEnvironment()) return undefined;
    const handleClickOutside = (event) => {
      const menuNode = projectFilterMenuRef.current;
      const buttonNode = projectFilterButtonRef.current;
      if (menuNode && menuNode.contains(event.target)) return;
      if (buttonNode && buttonNode.contains(event.target)) return;
      closeProjectFilterMenu();
    };

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        closeProjectFilterMenu();
      }
    };

    window.addEventListener('mousedown', handleClickOutside, true);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handleClickOutside, true);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [closeProjectFilterMenu, projectFilterMenu.open]);

  const statusNames = useMemo(() => STATUS_VALUES, []);
  const recurringNames = useMemo(() => RECURRING_VALUES, []);
  const estimateNames = useMemo(() => ESTIMATE_VALUES, []);

  const handleAddTasks = useCallback(() => {
    setIsListicalMenuOpen(false);
    const count = parseInt(addTasksCount, 10);
    if (!Number.isFinite(count) || count <= 0) return;
    const targetRowId =
      highlightedRowId ??
      (selectedRowIds.length ? selectedRowIds[0] : null) ??
      activeRowId ??
      null;
    if (!targetRowId) return;

    setRows((prev) => {
      const targetIndex = prev.findIndex((row) => row.id === targetRowId);
      if (targetIndex === -1) return prev;
      const targetRow = prev[targetIndex];

      const baseType =
        targetRow.type === 'inboxItem' || targetRow.type === 'inboxHeader'
          ? 'inboxItem'
          : 'projectTask';
      const baseProjectName = targetRow.projectName ?? null;
      const baseProjectSelection = targetRow.projectSelection ?? null;

      const newRows = [];
      const timestamp = Date.now();
      for (let i = 0; i < count; i += 1) {
        const base = {
          id: `${baseType}-${timestamp}-${i}-${Math.random().toString(36).slice(2, 6)}`,
          type: baseType,
        };
        if (baseProjectName) base.projectName = baseProjectName;
        if (baseProjectSelection) base.projectSelection = baseProjectSelection;
        newRows.push(createTaskRow(base));
      }

      const nextRows = [...prev];
      nextRows.splice(targetIndex + 1, 0, ...newRows);
      return nextRows;
    });

    setAddTasksCount('');
  }, [addTasksCount, activeRowId, highlightedRowId, selectedRowIds, setRows]);

  useEffect(() => {
    if (!isListicalMenuOpen || !isBrowserEnvironment()) return undefined;
    const handleClickOutside = (event) => {
      const menuNode = listicalMenuRef.current;
      const buttonNode = listicalButtonRef.current;
      if (menuNode && menuNode.contains(event.target)) return;
      if (buttonNode && buttonNode.contains(event.target)) return;
      setIsListicalMenuOpen(false);
    };

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsListicalMenuOpen(false);
      }
    };

    window.addEventListener('mousedown', handleClickOutside, true);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handleClickOutside, true);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isListicalMenuOpen]);

  useEffect(() => {
    if (!statusFilterMenu.open || !isBrowserEnvironment()) return undefined;
    const handleClickOutside = (event) => {
      const menuNode = statusFilterMenuRef.current;
      const buttonNode = statusFilterButtonRef.current;
      if (menuNode && menuNode.contains(event.target)) return;
      if (buttonNode && buttonNode.contains(event.target)) return;
      closeStatusFilterMenu();
    };

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        closeStatusFilterMenu();
      }
    };

    window.addEventListener('mousedown', handleClickOutside, true);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handleClickOutside, true);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [closeStatusFilterMenu, statusFilterMenu.open]);

  useEffect(() => {
    if (!recurringFilterMenu.open || !isBrowserEnvironment()) return undefined;
    const handleClickOutside = (event) => {
      const menuNode = recurringFilterMenuRef.current;
      const buttonNode = recurringFilterButtonRef.current;
      if (menuNode && menuNode.contains(event.target)) return;
      if (buttonNode && buttonNode.contains(event.target)) return;
      closeRecurringFilterMenu();
    };

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        closeRecurringFilterMenu();
      }
    };

    window.addEventListener('mousedown', handleClickOutside, true);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handleClickOutside, true);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [closeRecurringFilterMenu, recurringFilterMenu.open]);

  useEffect(() => {
    if (!estimateFilterMenu.open || !isBrowserEnvironment()) return undefined;
    const handleClickOutside = (event) => {
      const menuNode = estimateFilterMenuRef.current;
      const buttonNode = estimateFilterButtonRef.current;
      if (menuNode && menuNode.contains(event.target)) return;
      if (buttonNode && buttonNode.contains(event.target)) return;
      closeEstimateFilterMenu();
    };

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        closeEstimateFilterMenu();
      }
    };

    window.addEventListener('mousedown', handleClickOutside, true);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handleClickOutside, true);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [closeEstimateFilterMenu, estimateFilterMenu.open]);

  const renderTimelineRow = (config) => {
    if (!config) return null;
    const {
      id,
      rowClassName,
      rowLabelStyle,
      rowLabelClassName = 'text-center font-semibold border border-[#ced3d0]',
      fixedCellStyle,
      fixedCellClassName = 'border border-[#ced3d0]',
      fixedCells = [],
      cells = [],
      rowLabelContent = '',
    } = config;
    const isFilterRow = id === 'totals';

    const renderContentWithFilterButton = (content, columnKey = null) => {
      if (!isFilterRow || !columnKey || columnKey === 'rowLabel') return content;
      const columnLetter = columnLetterByKey[columnKey];
      if (columnLetter && FILTER_BLOCKED_LETTERS.has(columnLetter)) return content;
      const isProjectFilterButton = columnKey === 'project';
      const isStatusFilterButton = columnKey === 'status';
      const isRecurringFilterButton = columnKey === 'recurring';
      const isEstimateFilterButton = columnKey === 'estimate';
      const isActive = isProjectFilterButton
        ? projectFilterMenu.open || selectedProjectFilters.size > 0
        : isStatusFilterButton
          ? statusFilterMenu.open || selectedStatusFilters.size > 0
          : isRecurringFilterButton
            ? recurringFilterMenu.open || selectedRecurringFilters.size > 0
            : isEstimateFilterButton
              ? estimateFilterMenu.open || selectedEstimateFilters.size > 0
              : activeFilterColumns.has(columnKey);
      return (
        <div className="flex w-full items-center justify-end gap-1">
          <span className="leading-tight">{content}</span>
          <button
            type="button"
            aria-label={`Toggle filter for ${columnKey}`}
            aria-pressed={isActive}
            title={isActive ? 'Filter active' : 'Add filter'}
            ref={
              isProjectFilterButton
                ? projectFilterButtonRef
                : isStatusFilterButton
                  ? statusFilterButtonRef
                  : isRecurringFilterButton
                    ? recurringFilterButtonRef
                    : isEstimateFilterButton
                      ? estimateFilterButtonRef
                      : null
            }
            onClick={(event) => {
              if (isProjectFilterButton) {
                handleProjectFilterButtonClick(event);
              } else if (isStatusFilterButton) {
                handleStatusFilterButtonClick(event);
              } else if (isRecurringFilterButton) {
                handleRecurringFilterButtonClick(event);
              } else if (isEstimateFilterButton) {
                handleEstimateFilterButtonClick(event);
              } else {
                event.preventDefault();
                event.stopPropagation();
                toggleFilterColumn(columnKey);
              }
            }}
            className={`inline-flex h-[22px] w-[22px] items-center justify-center bg-transparent p-0 transition-colors ${
              isActive ? 'text-green-600' : 'text-green-400 hover:text-green-600'
            }`}
            style={{ border: 'none' }}
          >
            <ListFilter className="h-full w-full" strokeWidth={isActive ? 2.2 : 2} />
          </button>
        </div>
      );
    };

    return (
      <tr key={`row-${id}`} className={`h-[${ROW_H}px] ${rowClassName ?? ''}`}>
        <td
          className={rowLabelClassName}
          style={getWidthStyle('rowLabel', applyRowLabelStyle(rowLabelStyle || {}))}
        >
          {renderContentWithFilterButton(rowLabelContent, 'rowLabel')}
        </td>
        {fixedCells.length > 0
          ? fixedCells.map((cell) => (
              <td
                key={cell.key}
                colSpan={cell.colSpan ?? 1}
                className={cell.className ?? fixedCellClassName}
                style={{
                  ...(fixedCellStyle || {}),
                  ...(cell.columnKey
                    ? getWidthStyle(cell.columnKey, cell.style || {})
                    : cell.style || {}),
                }}
              >
                {renderContentWithFilterButton(cell.content, cell.columnKey ?? cell.key)}
              </td>
            ))
          : (
            <td
              colSpan={fixedCols - 1}
              className={fixedCellClassName}
              style={fixedCellStyle}
            ></td>
          )}
        {cells.map((cell) => (
          <td
            key={cell.key}
            colSpan={cell.colSpan ?? 1}
            className={cell.className}
            style={
              cell.columnKey
                ? getWidthStyle(cell.columnKey, cell.style || {})
                : cell.style
            }
          >
            {renderContentWithFilterButton(cell.content, cell.columnKey)}
          </td>
        ))}
      </tr>
    );
  };

  const renderColumnHeaderRow = () => {
    const headerBackground = '#d9f6e0';
    const headerText = '#065f46';
    return (
      <tr
        key="row-column-headers"
        className={`h-[${ROW_H}px] font-bold`}
      >
        <td
          className="border border-[#ced3d0] text-center"
          style={{
            ...getWidthStyle('rowLabel'),
            backgroundColor: headerBackground,
            color: headerText,
          }}
        >
          {' '}
        </td>
        {fixedColumnConfig.map(({ key, label, width, className }) => (
          <td
            key={`hdr-${key}`}
            className={`border border-[#ced3d0] ${className ?? ''}`}
            style={{
              width,
              backgroundColor: headerBackground,
              color: headerText,
            }}
          >
            {label}
          </td>
        ))}
        {Array.from({ length: totalDays }).map((_, i) => (
          <td
            key={`hdr-day-${i}`}
            style={{
              ...applyWeekBorderStyles(i, { width: COL_W.day }),
              backgroundColor: headerBackground,
              color: headerText,
            }}
            className={getWeekBorderClass(i, 'border border-[#ced3d0]')}
          ></td>
        ))}
      </tr>
    );
  };

  const EstimateOptions = () => (
    <>
      <option>-</option>
      <option key="custom">Custom</option>
      <option key="m-1" className="estimate-highlight">1 Minute</option>
      {Array.from({ length: 11 }, (_, i) => (i + 1) * 5).map((m) => (
        <option
          key={`m-${m}`}
          className={m === 5 ? 'estimate-highlight' : undefined}
        >
          {m} Minutes
        </option>
      ))}
      {[1, 2, 3, 4, 5, 6, 7, 8].map((h) => (
        <option key={`h-${h}`}>{h} Hour{h > 1 ? 's' : ''}</option>
      ))}
    </>
  );

  const StatusOptions = () => (
    <>
      <option>-</option>
      {STATUS_VALUES.map((status) => (
        <option key={status}>{status}</option>
      ))}
    </>
  );

  const renderDataRow = (
    tableRow,
    { previousRowOriginal, rowProps = {}, isActive = false } = {}
  ) => {
    const row = tableRow.original;
    const previousRow = previousRowOriginal;
    const rowNumber = timelineRowCount + tableRow.index + 1; // Continue numbering after timeline header rows.
    const isDraggingRow = dragIndex === tableRow.index;
    const rowId = row.id;
    const isRowSelected = selectedRowIdSet.has(rowId);
    const commitRowUpdate = (updater, { markInteraction = false } = {}) => {
      updateRowValues(
        tableRow.index,
        updater,
        markInteraction ? { markInteraction: true } : undefined
      );
    };
    const ensureInteractionMarked = () => {
      if (!TASK_ROW_TYPES.has(row.type) || row.hasUserInteraction) return;
      updateRowValues(tableRow.index, {}, { markInteraction: true });
    };
    const cellMetadataProps = (cellId) => ({
      'data-row-id': row.id,
      'data-column-key': cellId,
    });
    const withCellSelectionClass = (className = '', cellKey) => {
      const classes = [];
      if (className) classes.push(className);
      if (cellKey && isCellActive(row.id, cellKey)) classes.push('active-cell');
      return classes.join(' ');
    };
    const cellClickProps = (columnId) => ({
      ...cellMetadataProps(columnId),
      onClick: () => handleCellClick(tableRow.index, columnId),
      onFocus: () => handleCellClick(tableRow.index, columnId),
    });
    const rowPropsLocal = {
      ...rowProps,
      style: {
        ...(rowProps.style || {}),
      },
    };
    rowPropsLocal.ref = (node) => {
      if (node) rowRefs.current.set(row.id, node);
      else rowRefs.current.delete(row.id);
      if (typeof rowProps.ref === 'function') {
        rowProps.ref(node);
      }
    };
    rowPropsLocal.style.cursor = isDraggingRow ? 'grabbing' : 'grab';
    const highlight = isDraggingRow || isActive;
    rowPropsLocal.style.transition = 'filter 0.15s ease, box-shadow 0.15s ease';
    rowPropsLocal.style.filter = highlight ? 'brightness(0.94)' : 'none';
    const indicatorShadows = [];
    if (hoverIndex === tableRow.index) indicatorShadows.push('inset 0 2px 0 0 #2563eb');
    if (hoverIndex === tableRow.index + 1) indicatorShadows.push('inset 0 -2px 0 0 #2563eb');
    if (highlight) indicatorShadows.push('0 0 0 2px rgba(37,99,235,0.35)');
    if (isRowSelected) indicatorShadows.push('0 0 0 2px rgba(59,130,246,0.5)');
    if (indicatorShadows.length > 0) {
      rowPropsLocal.style.boxShadow = indicatorShadows.join(', ');
    } else {
      rowPropsLocal.style.boxShadow = 'none';
    }

    switch (row.type) {
      case 'projectHeader':
        const projectRollupValue = projectHeaderTotals[rowId] ?? '0.00';
        return (
          <tr {...rowPropsLocal} className={`h-[${ROW_H}px]${isRowSelected ? ' selected-row' : ''}`}>
            <td
              {...cellMetadataProps('rowLabel')}
              className={withCellSelectionClass(
                `text-center font-semibold border border-[#ced3d0]${isRowSelected ? ' selected-cell' : ''}`,
                'rowLabel'
              )}
              style={getWidthStyle('rowLabel', applyRowLabelStyle(getCellHighlightStyle(row.id, 'rowLabel')))}
              tabIndex={0}
              onMouseDown={(event) => handleCellMouseDown(event, row.id, 'rowLabel', { highlightRow: true })}
              onFocus={() =>
                handleCellActivate(row.id, 'rowLabel', {
                  highlightRow: true,
                  preserveSelection: true,
                })
              }
              onClick={(event) => handleRowClick(event, tableRow.index)}
            >
              {rowNumber}
            </td>
            <td
              className={withCellSelectionClass('bg-[#d5a6bd] font-extrabold px-2 text-[12px]', 'check')}
              style={getWidthStyle('check', {
                ...getCellHighlightStyle(row.id, 'check'),
                overflow: 'visible',
                whiteSpace: 'nowrap',
                fontWeight: 800,
                paddingLeft: 8,
              })}
              onMouseDown={(event) => handleCellMouseDown(event, row.id, 'check')}
              {...cellClickProps('check')}
            >
              {row.projectName}
            </td>
            <td
              className={withCellSelectionClass('bg-[#d5a6bd]', 'project')}
              style={getWidthStyle('project', getCellHighlightStyle(row.id, 'project'))}
              onMouseDown={(event) => handleCellMouseDown(event, row.id, 'project')}
              {...cellClickProps('project')}
            ></td>
            <td
              className={withCellSelectionClass('bg-[#d5a6bd]', 'status')}
              style={getWidthStyle('status', getCellHighlightStyle(row.id, 'status'))}
              onMouseDown={(event) => handleCellMouseDown(event, row.id, 'status')}
              {...cellClickProps('status')}
            ></td>
            <td
              className={withCellSelectionClass('bg-[#d5a6bd]', 'task')}
              style={getWidthStyle('task', getCellHighlightStyle(row.id, 'task'))}
              onMouseDown={(event) => handleCellMouseDown(event, row.id, 'task')}
              {...cellClickProps('task')}
            ></td>
            {showRecurring && (
              <td
                className={withCellSelectionClass('bg-[#d5a6bd]', 'recurring')}
                style={getWidthStyle('recurring', getCellHighlightStyle(row.id, 'recurring'))}
                onMouseDown={(event) => handleCellMouseDown(event, row.id, 'recurring')}
                {...cellClickProps('recurring')}
              ></td>
            )}
            <td
              className={withCellSelectionClass(
                `bg-[#d5a6bd]${columnFKey === 'estimate' ? ' text-right pr-2' : ''}`,
                'estimate'
              )}
              style={getWidthStyle('estimate', {
                ...getCellHighlightStyle(row.id, 'estimate'),
                ...(columnFKey === 'estimate' ? { textAlign: 'right', paddingRight: 8 } : {}),
              })}
              onMouseDown={(event) => handleCellMouseDown(event, row.id, 'estimate')}
              {...cellClickProps('estimate')}
            >
              {columnFKey === 'estimate' ? projectRollupValue : ''}
              {columnGKey === 'estimate' ? 'of 0.00' : ''}
            </td>
            <td
              className={withCellSelectionClass('bg-[#d5a6bd] border border-[#ced3d0]', 'timeValue')}
              style={getWidthStyle('timeValue', {
                ...blackDividerStyle,
                ...getCellHighlightStyle(row.id, 'timeValue'),
                textAlign: columnGKey === 'timeValue' ? 'left' : 'right',
                paddingRight: columnGKey === 'timeValue' ? undefined : 8,
              })}
              onMouseDown={(event) => handleCellMouseDown(event, row.id, 'timeValue')}
              {...cellClickProps('timeValue')}
            >
              {columnFKey === 'timeValue' ? projectRollupValue : ''}
              {columnGKey === 'timeValue' ? 'of 0.00' : ''}
            </td>
            {Array.from({ length: totalDays }).map((_, i) => (
              <td
                key={`${row.id}-hdr-${i}`}
                style={{
                  ...applyWeekBorderStyles(i, getWidthStyle(`day-${i}`)),
                  ...getCellHighlightStyle(row.id, `day-${i}`),
                }}
                onMouseDown={(event) => handleCellMouseDown(event, row.id, `day-${i}`)}
                className={withCellSelectionClass(
                  `${getWeekBorderClass(i, 'bg-white border border-[#ced3d0]')} p-0`,
                  `day-${i}`
                )}
                {...cellClickProps(`day-${i}`)}
              >
                <input
                  type="text"
                  className={sharedInputStyle}
                  defaultValue={columnGKey === `day-${i}` ? 'of 0.00' : ''}
                  onMouseDown={(event) => handleCellMouseDown(event, row.id, `day-${i}`)}
                  onFocus={() => handleCellActivate(row.id, `day-${i}`)}
                  onPaste={(event) =>
                    handleOverwritePaste(event, (text) => {
                      event.currentTarget.value = text;
                    })
                  }
                />
              </td>
            ))}
          </tr>
        );
      case 'projectGeneral':
        return (
          <tr {...rowPropsLocal} className={`h-[${ROW_H}px]${isRowSelected ? ' selected-row' : ''}`}>
            <td
              {...cellMetadataProps('rowLabel')}
              className={withCellSelectionClass(
                `text-center border border-[#ced3d0]${isRowSelected ? ' selected-cell' : ''}`,
                'rowLabel'
              )}
              style={getWidthStyle('rowLabel', applyRowLabelStyle(getCellHighlightStyle(row.id, 'rowLabel')))}
              tabIndex={0}
              onMouseDown={(event) => handleCellMouseDown(event, row.id, 'rowLabel', { highlightRow: true })}
              onFocus={() =>
                handleCellActivate(row.id, 'rowLabel', {
                  highlightRow: true,
                  preserveSelection: true,
                })
              }
              onClick={(event) => handleRowClick(event, tableRow.index)}
            >
              {rowNumber}
            </td>
            <td
              className={withCellSelectionClass('bg-[#f2e5eb]', 'check')}
              style={getWidthStyle('check', getCellHighlightStyle(row.id, 'check'))}
              onMouseDown={(event) => handleCellMouseDown(event, row.id, 'check')}
              {...cellClickProps('check')}
            ></td>
            <td
              className={withCellSelectionClass('bg-[#f2e5eb]', 'project')}
              style={getWidthStyle('project', getCellHighlightStyle(row.id, 'project'))}
              onMouseDown={(event) => handleCellMouseDown(event, row.id, 'project')}
              {...cellClickProps('project')}
            ></td>
            <td
              className={withCellSelectionClass('bg-[#f2e5eb]', 'status')}
              style={getWidthStyle('status', getCellHighlightStyle(row.id, 'status'))}
              onMouseDown={(event) => handleCellMouseDown(event, row.id, 'status')}
              {...cellClickProps('status')}
            ></td>
            <td
              className={withCellSelectionClass('bg-[#f2e5eb] px-2 font-extrabold text-[12px]', 'task')}
              style={getWidthStyle('task', { fontWeight: 800, paddingLeft: 8, ...getCellHighlightStyle(row.id, 'task') })}
              onMouseDown={(event) => handleCellMouseDown(event, row.id, 'task')}
              {...cellClickProps('task')}
            >
              General
            </td>
            {showRecurring && (
              <td
                className={withCellSelectionClass('bg-[#f2e5eb]', 'recurring')}
                style={getWidthStyle('recurring', getCellHighlightStyle(row.id, 'recurring'))}
                onMouseDown={(event) => handleCellMouseDown(event, row.id, 'recurring')}
                {...cellClickProps('recurring')}
              ></td>
            )}
            <td
              className={withCellSelectionClass('bg-[#f2e5eb]', 'estimate')}
              style={getWidthStyle('estimate', getCellHighlightStyle(row.id, 'estimate'))}
              onMouseDown={(event) => handleCellMouseDown(event, row.id, 'estimate')}
              {...cellClickProps('estimate')}
            ></td>
            <td
              className={withCellSelectionClass('bg-[#f2e5eb] border border-[#ced3d0]', 'timeValue')}
              style={getWidthStyle('timeValue', {
                ...blackDividerStyle,
                ...getCellHighlightStyle(row.id, 'timeValue'),
                textAlign: 'right',
                paddingRight: 8,
              })}
              onMouseDown={(event) => handleCellMouseDown(event, row.id, 'timeValue')}
              {...cellClickProps('timeValue')}
            ></td>
            {Array.from({ length: totalDays }).map((_, i) => (
              <td
                key={`${row.id}-gen-${i}`}
                style={{
                  ...applyWeekBorderStyles(i, getWidthStyle(`day-${i}`)),
                  ...getCellHighlightStyle(row.id, `day-${i}`),
                }}
                onMouseDown={(event) => handleCellMouseDown(event, row.id, `day-${i}`)}
                className={withCellSelectionClass(
                  `${getWeekBorderClass(i, 'bg-white border border-[#ced3d0]')} p-0`,
                  `day-${i}`
                )}
                {...cellClickProps(`day-${i}`)}
              >
                <input
                  type="text"
                  className={sharedInputStyle}
                  defaultValue=""
                  onMouseDown={(event) => handleCellMouseDown(event, row.id, `day-${i}`)}
                  onFocus={() => handleCellActivate(row.id, `day-${i}`)}
                  onPaste={(event) =>
                    handleOverwritePaste(event, (text) => {
                      event.currentTarget.value = text;
                    })
                  }
                />
              </td>
            ))}
          </tr>
        );
      case 'projectTask': {
        const dayEntries = Array.isArray(row.dayEntries) ? row.dayEntries : [];
        const isCustomEstimate = row.estimate === 'Custom';
        const updateTaskName = (value) => {
          commitRowUpdate({ taskName: value }, { markInteraction: true });
        };
        const updateDayEntry = (dayIndex, value) => {
          commitRowUpdate(
            (currentRow) => {
              const existingEntries = Array.isArray(currentRow.dayEntries)
                ? [...currentRow.dayEntries]
                : createEmptyDayEntries(totalDays);
              existingEntries[dayIndex] = value;
              const updates = { dayEntries: existingEntries };
              if ((value ?? '').trim() && currentRow.status === 'Not Scheduled') {
                updates.status = 'Scheduled';
              }
              return updates;
            },
            { markInteraction: true }
          );
        };
        const updateTimeValue = (value) => {
          if (!isCustomEstimate) return;
          commitRowUpdate(
            (currentRow) => {
              const updates = { timeValue: value };
              const syncedEntries = syncDayEntriesWithTimeValue(
                currentRow.dayEntries,
                value,
                currentRow.timeValue
              );
              if (syncedEntries !== currentRow.dayEntries) {
                updates.dayEntries = syncedEntries;
              }
              return updates;
            },
            { markInteraction: true }
          );
        };
        return (
          <tr {...rowPropsLocal} className={`h-[${ROW_H}px]${isRowSelected ? ' selected-row' : ''}`}>
            <td
              {...cellMetadataProps('rowLabel')}
              className={withCellSelectionClass(
                `text-center align-middle border border-[#ced3d0]${isRowSelected ? ' selected-cell' : ''}`,
                'rowLabel'
              )}
              style={getWidthStyle('rowLabel', applyRowLabelStyle(getCellHighlightStyle(row.id, 'rowLabel')))}
              tabIndex={0}
              onMouseDown={(event) => handleCellMouseDown(event, row.id, 'rowLabel', { highlightRow: true })}
              onFocus={() =>
                handleCellActivate(row.id, 'rowLabel', {
                  highlightRow: true,
                  preserveSelection: true,
                })
              }
              onClick={(event) => handleRowClick(event, tableRow.index)}
            >
              {rowNumber}
            </td>
            <td
              className={withCellSelectionClass('border border-[#ced3d0] p-0', 'check')}
              style={getWidthStyle('check', getCellHighlightStyle(row.id, 'check'))}
              {...cellClickProps('check')}
            >
              <div className="flex h-full w-full items-center justify-center">
                <input
                  type="checkbox"
                  className={checkboxInputClass}
                  onMouseDown={(event) => handleCellMouseDown(event, row.id, 'check')}
                  onFocus={() => handleCellActivate(row.id, 'check')}
                  onChange={ensureInteractionMarked}
                />
              </div>
            </td>
            <td
              style={getWidthStyle('project', getCellHighlightStyle(row.id, 'project'))}
              className={withCellSelectionClass('border border-[#ced3d0] p-0', 'project')}
              {...cellClickProps('project')}
            >
              <select
                className={sharedInputStyle}
                value={row.projectSelection ?? '-'}
                onChange={(event) => {
                  const nextValue = event.target.value;
                  commitRowUpdate({ projectSelection: nextValue }, { markInteraction: true });
                }}
                onMouseDown={(event) => handleCellMouseDown(event, row.id, 'project')}
                onFocus={() => handleCellActivate(row.id, 'project')}
              >
                <option>-</option>
                <option>Project A</option>
                <option>Project B</option>
                <option>Project C</option>
              </select>
            </td>
            <td
              style={getWidthStyle('status', getCellHighlightStyle(row.id, 'status'))}
              className={withCellSelectionClass('border border-[#ced3d0] p-0', 'status')}
              {...cellClickProps('status')}
            >
              <select
                className={sharedInputStyle}
                value={row.status ?? '-'}
                onChange={(event) => {
                  const nextValue = event.target.value;
                  commitRowUpdate({ status: nextValue }, { markInteraction: true });
                }}
                onMouseDown={(event) => handleCellMouseDown(event, row.id, 'status')}
                onFocus={() => handleCellActivate(row.id, 'status')}
              >
                <StatusOptions />
              </select>
            </td>
            <td
              style={getWidthStyle('task', getCellHighlightStyle(row.id, 'task'))}
              className={withCellSelectionClass('border border-[#ced3d0] p-0', 'task')}
              {...cellClickProps('task')}
            >
              <input
                type="text"
                className={sharedInputStyle}
                value={row.taskName ?? ''}
                onMouseDown={(event) => handleCellMouseDown(event, row.id, 'task')}
                onFocus={() => handleCellActivate(row.id, 'task')}
                onChange={(event) => updateTaskName(event.target.value)}
                onPaste={(event) =>
                  handleOverwritePaste(event, (text) => updateTaskName(text))
                }
              />
            </td>
            {showRecurring && (
              <td
                className={withCellSelectionClass('border border-[#ced3d0] p-0', 'recurring')}
                style={getWidthStyle('recurring', getCellHighlightStyle(row.id, 'recurring'))}
                {...cellClickProps('recurring')}
              >
                <div className="flex h-full w-full items-center justify-center">
                  <input
                    type="checkbox"
                    className={checkboxInputClass}
                    checked={row.recurring === 'Recurring'}
                    onMouseDown={(event) => handleCellMouseDown(event, row.id, 'recurring')}
                    onFocus={() => handleCellActivate(row.id, 'recurring')}
                    onChange={(event) => {
                      const nextValue = event.target.checked ? 'Recurring' : 'Not Recurring';
                      commitRowUpdate({ recurring: nextValue }, { markInteraction: true });
                    }}
                  />
                </div>
              </td>
            )}
            <td
              style={getWidthStyle('estimate', getCellHighlightStyle(row.id, 'estimate'))}
              className={withCellSelectionClass('border border-[#ced3d0] p-0', 'estimate')}
              {...cellClickProps('estimate')}
            >
              <select
                className={sharedInputStyle}
                value={row.estimate ?? '-'}
                onChange={(event) => {
                  const nextValue = event.target.value;
                  commitRowUpdate(
                    (currentRow) => {
                      const updates = { estimate: nextValue };
                      const minutes = parseEstimateLabelToMinutes(nextValue);
                      let nextTimeValue;
                      if (minutes != null) {
                        nextTimeValue = formatMinutesToHHmm(minutes);
                      } else if (nextValue === 'Custom') {
                        nextTimeValue = '0.00';
                      } else {
                        nextTimeValue = '0.00';
                      }
                      updates.timeValue = nextTimeValue;
                      const syncedEntries = syncDayEntriesWithTimeValue(
                        currentRow.dayEntries,
                        nextTimeValue,
                        currentRow.timeValue
                      );
                      if (syncedEntries !== currentRow.dayEntries) {
                        updates.dayEntries = syncedEntries;
                      }
                      return updates;
                    },
                    { markInteraction: true }
                  );
                }}
                onMouseDown={(event) => handleCellMouseDown(event, row.id, 'estimate')}
                onFocus={() => handleCellActivate(row.id, 'estimate')}
              >
                <EstimateOptions />
              </select>
            </td>
            <td
              className={withCellSelectionClass('border border-[#ced3d0] p-0', 'timeValue')}
              style={getWidthStyle('timeValue', {
                ...blackDividerStyle,
                ...getCellHighlightStyle(row.id, 'timeValue'),
                textAlign: 'right',
                paddingRight: 8,
              })}
              {...cellClickProps('timeValue')}
            >
              <input
                type="text"
                className={`${sharedInputStyle} text-right pr-2`}
                value={row.timeValue ?? '0.00'}
                onMouseDown={(event) => handleCellMouseDown(event, row.id, 'timeValue')}
                onFocus={() => handleCellActivate(row.id, 'timeValue')}
                onChange={(event) => {
                  if (!isCustomEstimate) return;
                  updateTimeValue(event.target.value);
                }}
                onPaste={(event) => {
                  if (!isCustomEstimate) return;
                  handleOverwritePaste(event, (text) => updateTimeValue(text));
                }}
                readOnly={!isCustomEstimate}
              />
            </td>
            {Array.from({ length: totalDays }).map((_, i) => (
              <td
                key={`${row.id}-task-${i}`}
                style={{
                  ...applyWeekBorderStyles(i, getWidthStyle(`day-${i}`)),
                  ...getCellHighlightStyle(row.id, `day-${i}`),
                }}
                onMouseDown={(event) => handleCellMouseDown(event, row.id, `day-${i}`)}
                className={withCellSelectionClass(
                  `${getWeekBorderClass(i, 'border border-[#ced3d0]')} p-0`,
                  `day-${i}`
                )}
                {...cellClickProps(`day-${i}`)}
              >
                <input
                  type="text"
                  className={sharedInputStyle}
                  value={dayEntries[i] ?? ''}
                  onMouseDown={(event) => handleCellMouseDown(event, row.id, `day-${i}`)}
                  onFocus={() => handleCellActivate(row.id, `day-${i}`)}
                  onChange={(event) => updateDayEntry(i, event.target.value)}
                  onPaste={(event) =>
                    handleOverwritePaste(event, (text) => updateDayEntry(i, text))
                  }
                  data-time-entry="true"
                />
              </td>
            ))}
          </tr>
        );
      }
      case 'projectUnscheduled':
        return (
          <tr {...rowPropsLocal} className={`h-[${ROW_H}px]${isRowSelected ? ' selected-row' : ''}`}>
            <td
              {...cellMetadataProps('rowLabel')}
              className={withCellSelectionClass(
                `text-center border border-[#ced3d0]${isRowSelected ? ' selected-cell' : ''}`,
                'rowLabel'
              )}
              style={getWidthStyle('rowLabel', applyRowLabelStyle(getCellHighlightStyle(row.id, 'rowLabel')))}
              tabIndex={0}
              onMouseDown={(event) => handleCellMouseDown(event, row.id, 'rowLabel', { highlightRow: true })}
              onFocus={() =>
                handleCellActivate(row.id, 'rowLabel', {
                  highlightRow: true,
                  preserveSelection: true,
                })
              }
              onClick={(event) => handleRowClick(event, tableRow.index)}
            >
              {rowNumber}
            </td>
            <td
              className={withCellSelectionClass('bg-[#f2e5eb]', 'check')}
              style={getWidthStyle('check', getCellHighlightStyle(row.id, 'check'))}
              onMouseDown={(event) => handleCellMouseDown(event, row.id, 'check')}
              {...cellClickProps('check')}
            ></td>
            <td
              className={withCellSelectionClass('bg-[#f2e5eb]', 'project')}
              style={getWidthStyle('project', getCellHighlightStyle(row.id, 'project'))}
              onMouseDown={(event) => handleCellMouseDown(event, row.id, 'project')}
              {...cellClickProps('project')}
            ></td>
            <td
              className={withCellSelectionClass('bg-[#f2e5eb]', 'status')}
              style={getWidthStyle('status', getCellHighlightStyle(row.id, 'status'))}
              onMouseDown={(event) => handleCellMouseDown(event, row.id, 'status')}
              {...cellClickProps('status')}
            ></td>
            <td
              className={withCellSelectionClass('bg-[#f2e5eb] px-2 font-extrabold text-[12px]', 'task')}
              style={getWidthStyle('task', { fontWeight: 800, paddingLeft: 8, ...getCellHighlightStyle(row.id, 'task') })}
              onMouseDown={(event) => handleCellMouseDown(event, row.id, 'task')}
              {...cellClickProps('task')}
            >
              Unscheduled
            </td>
            {showRecurring && (
              <td
                className={withCellSelectionClass('bg-[#f2e5eb]', 'recurring')}
                style={getWidthStyle('recurring', getCellHighlightStyle(row.id, 'recurring'))}
                onMouseDown={(event) => handleCellMouseDown(event, row.id, 'recurring')}
                {...cellClickProps('recurring')}
              ></td>
            )}
            <td
              className={withCellSelectionClass('bg-[#f2e5eb]', 'estimate')}
              style={getWidthStyle('estimate', getCellHighlightStyle(row.id, 'estimate'))}
              onMouseDown={(event) => handleCellMouseDown(event, row.id, 'estimate')}
              {...cellClickProps('estimate')}
            ></td>
            <td
              className={withCellSelectionClass('bg-[#f2e5eb] border border-[#ced3d0]', 'timeValue')}
              style={getWidthStyle('timeValue', {
                ...blackDividerStyle,
                ...getCellHighlightStyle(row.id, 'timeValue'),
                textAlign: 'right',
                paddingRight: 8,
              })}
              onMouseDown={(event) => handleCellMouseDown(event, row.id, 'timeValue')}
              {...cellClickProps('timeValue')}
            ></td>
            {Array.from({ length: totalDays }).map((_, i) => (
              <td
                key={`${row.id}-uns-${i}`}
                style={{
                  ...applyWeekBorderStyles(i, getWidthStyle(`day-${i}`)),
                  ...getCellHighlightStyle(row.id, `day-${i}`),
                }}
                onMouseDown={(event) => handleCellMouseDown(event, row.id, `day-${i}`)}
                className={withCellSelectionClass(
                  `${getWeekBorderClass(i, 'bg-white border border-[#ced3d0]')} p-0`,
                  `day-${i}`
                )}
                {...cellClickProps(`day-${i}`)}
              >
                <input
                  type="text"
                  className={sharedInputStyle}
                  defaultValue=""
                  onMouseDown={(event) => handleCellMouseDown(event, row.id, `day-${i}`)}
                  onFocus={() => handleCellActivate(row.id, `day-${i}`)}
                  onPaste={(event) =>
                    handleOverwritePaste(event, (text) => {
                      event.currentTarget.value = text;
                    })
                  }
                />
              </td>
            ))}
          </tr>
        );
      case 'inboxHeader': {
        const inboxHeaderStyle = { backgroundColor: '#000000', color: '#ffffff' };
        return (
          <tr {...rowPropsLocal} className={`h-[${ROW_H}px]${isRowSelected ? ' selected-row' : ''}`}>
            <td
              {...cellMetadataProps('rowLabel')}
              className={withCellSelectionClass(
                `font-bold text-center border-0${isRowSelected ? ' selected-cell' : ''}`,
                'rowLabel'
              )}
              style={getWidthStyle('rowLabel', applyRowLabelStyle({
                ...inboxHeaderStyle,
                ...getCellHighlightStyle(row.id, 'rowLabel'),
              }))}
              tabIndex={0}
              onMouseDown={(event) => handleCellMouseDown(event, row.id, 'rowLabel', { highlightRow: true })}
              onFocus={() =>
                handleCellActivate(row.id, 'rowLabel', {
                  highlightRow: true,
                  preserveSelection: true,
                })
              }
              onClick={(event) => handleRowClick(event, tableRow.index)}
            >
              {rowNumber}
            </td>
            <td
              className={withCellSelectionClass('font-bold px-2 border-0', 'header-fixed')}
              colSpan={fixedCols - 1}
              style={{
                ...blackDividerStyle,
                ...inboxHeaderStyle,
                ...getCellHighlightStyle(row.id, 'header-fixed'),
                paddingLeft: 8,
                fontWeight: 800,
              }}
              onMouseDown={(event) => handleCellMouseDown(event, row.id, 'header-fixed')}
              {...cellClickProps('header-fixed')}
            >
              Inbox
            </td>
            <td
              className={withCellSelectionClass('border-0', 'header-span')}
              colSpan={totalDays}
              style={{ ...inboxHeaderStyle, ...getCellHighlightStyle(row.id, 'header-span') }}
              onMouseDown={(event) => handleCellMouseDown(event, row.id, 'header-span')}
              {...cellClickProps('header-span')}
            ></td>
          </tr>
        );
      }
      case 'inboxItem': {
        const topBorderClass = previousRow && previousRow.type === 'inboxHeader' ? ' border-t-0' : '';
        const dayEntries = Array.isArray(row.dayEntries) ? row.dayEntries : [];
        const isCustomEstimate = row.estimate === 'Custom';
        const updateTaskName = (value) => {
          commitRowUpdate({ taskName: value }, { markInteraction: true });
        };
        const updateDayEntry = (dayIndex, value) => {
          commitRowUpdate(
            (currentRow) => {
              const existingEntries = Array.isArray(currentRow.dayEntries)
                ? [...currentRow.dayEntries]
                : createEmptyDayEntries(totalDays);
              existingEntries[dayIndex] = value;
              const updates = { dayEntries: existingEntries };
              if ((value ?? '').trim() && currentRow.status === 'Not Scheduled') {
                updates.status = 'Scheduled';
              }
              return updates;
            },
            { markInteraction: true }
          );
        };
        const updateTimeValue = (value) => {
          if (!isCustomEstimate) return;
          commitRowUpdate(
            (currentRow) => {
              const updates = { timeValue: value };
              const syncedEntries = syncDayEntriesWithTimeValue(
                currentRow.dayEntries,
                value,
                currentRow.timeValue
              );
              if (syncedEntries !== currentRow.dayEntries) {
                updates.dayEntries = syncedEntries;
              }
              return updates;
            },
            { markInteraction: true }
          );
        };
        return (
          <tr {...rowPropsLocal} className={`h-[${ROW_H}px]${isRowSelected ? ' selected-row' : ''}`}>
            <td
              {...cellMetadataProps('rowLabel')}
              className={withCellSelectionClass(
                `text-center align-middle border border-[#ced3d0]${topBorderClass} bg-white${isRowSelected ? ' selected-cell' : ''}`,
                'rowLabel'
              )}
              style={getWidthStyle('rowLabel', applyRowLabelStyle(getCellHighlightStyle(row.id, 'rowLabel')))}
              tabIndex={0}
              onMouseDown={(event) => handleCellMouseDown(event, row.id, 'rowLabel', { highlightRow: true })}
              onFocus={() =>
                handleCellActivate(row.id, 'rowLabel', {
                  highlightRow: true,
                  preserveSelection: true,
                })
              }
              onClick={(event) => handleRowClick(event, tableRow.index)}
            >
              {rowNumber}
            </td>
            <td
              className={withCellSelectionClass(`border border-[#ced3d0]${topBorderClass} p-0`, 'check')}
              style={getWidthStyle('check', getCellHighlightStyle(row.id, 'check'))}
              {...cellClickProps('check')}
            >
              <div className="flex h-full w-full items-center justify-center">
                <input
                  type="checkbox"
                  className={checkboxInputClass}
                  onMouseDown={(event) => handleCellMouseDown(event, row.id, 'check')}
                  onFocus={() => handleCellActivate(row.id, 'check')}
                  onChange={ensureInteractionMarked}
                />
              </div>
            </td>
            <td
              style={getWidthStyle('project', getCellHighlightStyle(row.id, 'project'))}
              className={withCellSelectionClass(`border border-[#ced3d0]${topBorderClass} p-0`, 'project')}
              {...cellClickProps('project')}
            >
              <select
                className={sharedInputStyle}
                value={row.projectSelection ?? '-'}
                onChange={(event) => {
                  const nextValue = event.target.value;
                  commitRowUpdate({ projectSelection: nextValue }, { markInteraction: true });
                }}
                onMouseDown={(event) => handleCellMouseDown(event, row.id, 'project')}
                onFocus={() => handleCellActivate(row.id, 'project')}
              >
                <option>-</option>
                <option>Project A</option>
                <option>Project B</option>
                <option>Project C</option>
              </select>
            </td>
            <td
              style={getWidthStyle('status', getCellHighlightStyle(row.id, 'status'))}
              className={withCellSelectionClass(`border border-[#ced3d0]${topBorderClass} p-0`, 'status')}
              {...cellClickProps('status')}
            >
              <select
                className={sharedInputStyle}
                value={row.status ?? '-'}
                onChange={(event) => {
                  const nextValue = event.target.value;
                  commitRowUpdate({ status: nextValue }, { markInteraction: true });
                }}
                onMouseDown={(event) => handleCellMouseDown(event, row.id, 'status')}
                onFocus={() => handleCellActivate(row.id, 'status')}
              >
                <StatusOptions />
              </select>
            </td>
            <td
              style={getWidthStyle('task', getCellHighlightStyle(row.id, 'task'))}
              className={withCellSelectionClass(`border border-[#ced3d0]${topBorderClass} p-0`, 'task')}
              {...cellClickProps('task')}
            >
              <input
                type="text"
                className={sharedInputStyle}
                value={row.taskName ?? ''}
                onMouseDown={(event) => handleCellMouseDown(event, row.id, 'task')}
                onFocus={() => handleCellActivate(row.id, 'task')}
                onChange={(event) => updateTaskName(event.target.value)}
                onPaste={(event) =>
                  handleOverwritePaste(event, (text) => updateTaskName(text))
                }
              />
            </td>
            {showRecurring && (
              <td
                className={withCellSelectionClass(`border border-[#ced3d0]${topBorderClass} p-0`, 'recurring')}
                style={getWidthStyle('recurring', getCellHighlightStyle(row.id, 'recurring'))}
                {...cellClickProps('recurring')}
              >
                <div className="flex h-full w-full items-center justify-center">
                  <input
                    type="checkbox"
                    className={checkboxInputClass}
                    checked={row.recurring === 'Recurring'}
                    onMouseDown={(event) => handleCellMouseDown(event, row.id, 'recurring')}
                    onFocus={() => handleCellActivate(row.id, 'recurring')}
                    onChange={(event) => {
                      const nextValue = event.target.checked ? 'Recurring' : 'Not Recurring';
                      commitRowUpdate({ recurring: nextValue }, { markInteraction: true });
                    }}
                  />
                </div>
              </td>
            )}
            <td
              style={getWidthStyle('estimate', getCellHighlightStyle(row.id, 'estimate'))}
              className={withCellSelectionClass(`border border-[#ced3d0]${topBorderClass} p-0`, 'estimate')}
              {...cellClickProps('estimate')}
            >
              <select
                className={sharedInputStyle}
                value={row.estimate ?? '-'}
                onChange={(event) => {
                  const nextValue = event.target.value;
                  commitRowUpdate(
                    (currentRow) => {
                      const updates = { estimate: nextValue };
                      const minutes = parseEstimateLabelToMinutes(nextValue);
                      let nextTimeValue;
                      if (minutes != null) {
                        nextTimeValue = formatMinutesToHHmm(minutes);
                      } else if (nextValue === 'Custom') {
                        nextTimeValue = '0.00';
                      } else {
                        nextTimeValue = '0.00';
                      }
                      updates.timeValue = nextTimeValue;
                      const syncedEntries = syncDayEntriesWithTimeValue(
                        currentRow.dayEntries,
                        nextTimeValue,
                        currentRow.timeValue
                      );
                      if (syncedEntries !== currentRow.dayEntries) {
                        updates.dayEntries = syncedEntries;
                      }
                      return updates;
                    },
                    { markInteraction: true }
                  );
                }}
                onMouseDown={(event) => handleCellMouseDown(event, row.id, 'estimate')}
                onFocus={() => handleCellActivate(row.id, 'estimate')}
              >
                <EstimateOptions />
              </select>
            </td>
            <td
              className={withCellSelectionClass(`border border-[#ced3d0]${topBorderClass} p-0`, 'timeValue')}
              style={getWidthStyle('timeValue', {
                ...blackDividerStyle,
                ...getCellHighlightStyle(row.id, 'timeValue'),
                textAlign: 'right',
                paddingRight: 8,
              })}
              {...cellClickProps('timeValue')}
            >
              <input
                type="text"
                className={`${sharedInputStyle} text-right pr-2`}
                value={row.timeValue ?? '0.00'}
                onMouseDown={(event) => handleCellMouseDown(event, row.id, 'timeValue')}
                onFocus={() => handleCellActivate(row.id, 'timeValue')}
                onChange={(event) => {
                  if (!isCustomEstimate) return;
                  updateTimeValue(event.target.value);
                }}
                onPaste={(event) => {
                  if (!isCustomEstimate) return;
                  handleOverwritePaste(event, (text) => updateTimeValue(text));
                }}
                readOnly={!isCustomEstimate}
              />
            </td>
            {Array.from({ length: totalDays }).map((_, i) => (
              <td
                key={`${row.id}-${i}`}
                style={{
                  ...applyWeekBorderStyles(i, getWidthStyle(`day-${i}`)),
                  ...getCellHighlightStyle(row.id, `day-${i}`),
                }}
                onMouseDown={(event) => handleCellMouseDown(event, row.id, `day-${i}`)}
                className={withCellSelectionClass(
                  `${getWeekBorderClass(i, 'border border-[#ced3d0]' + topBorderClass)} p-0`,
                  `day-${i}`
                )}
                {...cellClickProps(`day-${i}`)}
              >
                <input
                  type="text"
                  className={sharedInputStyle}
                  value={dayEntries[i] ?? ''}
                  onMouseDown={(event) => handleCellMouseDown(event, row.id, `day-${i}`)}
                  onFocus={() => handleCellActivate(row.id, `day-${i}`)}
                  onChange={(event) => updateDayEntry(i, event.target.value)}
                  onPaste={(event) =>
                    handleOverwritePaste(event, (text) => updateDayEntry(i, text))
                  }
                  data-time-entry="true"
                />
              </td>
            ))}
          </tr>
        );
      }
      default:
        return null;
    }
  };

  return (
    <div ref={tableContainerRef} className="relative overflow-x-auto p-4 text-[12px] bg-gray-100">
      <div className="mb-4 flex flex-wrap items-center gap-4">
        <div className="relative">
          <button
            type="button"
            ref={listicalButtonRef}
            onClick={() => setIsListicalMenuOpen((prev) => !prev)}
            aria-expanded={isListicalMenuOpen}
            className="inline-flex items-center gap-2 rounded border border-[#ced3d0] bg-white px-3 py-2 font-semibold text-[#065f46] shadow-sm transition hover:bg-[#f2fdf6] hover:shadow-md"
          >
            <span>Listical</span>
          </button>
          {isListicalMenuOpen && (
            <div
              ref={listicalMenuRef}
              className="absolute z-20 mt-2 w-[36rem] rounded border border-[#ced3d0] bg-[#f2fdf6] p-4 shadow-lg"
            >
              <div className="flex flex-col gap-3 text-[12px] text-slate-800">
                <label className="flex items-center gap-2 font-semibold">
                  <input
                    type="checkbox"
                    className={checkboxInputClass}
                    checked={showRecurring}
                    onChange={() => setShowRecurring(!showRecurring)}
                  />
                  Show Recurring
                </label>
                <label className="flex items-center gap-2 font-semibold">
                  <input
                    type="checkbox"
                    className={checkboxInputClass}
                    checked={showMaxMinRows}
                    onChange={() => setShowMaxMinRows(!showMaxMinRows)}
                  />
                  Toggle Max/Min Hours
                </label>
                <div className="flex items-center gap-3 font-semibold text-slate-800">
                  <span className="text-[11px] uppercase tracking-wide text-slate-600">Add Tasks</span>
                  <input
                    type="number"
                    min="0"
                    value={addTasksCount}
                    onChange={(e) => setAddTasksCount(e.target.value)}
                    className="w-24 rounded border border-[#ced3d0] px-2 py-1 text-[12px] font-normal uppercase tracking-normal text-slate-800"
                    placeholder="0"
                  />
                  <button
                    type="button"
                    className="rounded border border-[#ced3d0] bg-white px-4 py-1 text-[12px] font-semibold text-[#065f46] transition hover:bg-[#e6f7ed]"
                    onClick={handleAddTasks}
                  >
                    Ok
                  </button>
                </div>
                <label className="flex items-center gap-3 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                  <span>Start Date</span>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="flex-1 rounded border border-[#ced3d0] px-2 py-1 text-[12px] font-normal uppercase tracking-normal text-slate-800"
                  />
                </label>
              </div>
            </div>
          )}
        </div>
      </div>

      <table className="table-fixed border-collapse w-full text-[12px] border border-[#ced3d0] shadow-sm bg-white">
        <thead>
          <tr className={`h-[${ROW_H}px] text-xs`}>
          {columnStructure.map((col, idx) => {
            const headerBackground = '#d9f6e0';
            const headerText = '#065f46';
            return (
              <th
                key={`col-letter-${col.key}`}
                style={getWidthStyle(col.key, {
                  backgroundColor: headerBackground,
                  color: headerText,
                  position: 'relative',
                })}
                className="border border-[#ced3d0]"
              >
                {columnLetters[idx]}
                {renderResizeHandle(col.key)}
              </th>
            );
          })}
          </tr>
          {timelineRowConfig.length > 0 && (
            <>
              {renderTimelineRow(monthsRow)}
              {renderTimelineRow(weeksRow)}
              {renderTimelineRow(datesRow)}
              {renderTimelineRow(weekdaysRow)}
              {bufferRows.map((bufferRow) => renderTimelineRow(bufferRow))}
            </>
          )}
        </thead>

        <tbody>
          {tableRows.map((tableRow, index) => {
            const originalRow = tableRow.original;
            const previousRow = index > 0 ? tableRows[index - 1].original : null;
            const rowProps = {
              onMouseDown: (event) => handleRowMouseDown(event, index, originalRow.id),
            };
            const renderedRow = renderDataRow(tableRow, {
              previousRowOriginal: previousRow,
              rowProps,
              isActive:
                activeRowId === originalRow.id || highlightedRowId === originalRow.id,
            });
            if (!renderedRow) return null;
            return React.cloneElement(renderedRow, { key: originalRow.id });
          })}
        </tbody>
      </table>
      {projectFilterMenu.open && (
        <div
          ref={projectFilterMenuRef}
          className="fixed z-50 mt-1 min-w-[200px] overflow-hidden rounded border border-[#ced3d0] bg-white text-[12px] shadow-lg"
          style={{ top: projectFilterMenu.top, left: projectFilterMenu.left }}
        >
          <div className="max-h-64 overflow-y-auto">
            {projectNames.length === 0 ? (
              <div className="px-3 py-2 text-slate-600">No projects available</div>
            ) : (
              projectNames.map((name) => (
                <button
                  key={name}
                  type="button"
                  className={`flex w-full items-center justify-between px-3 py-2 text-left hover:bg-slate-100 ${
                    selectedProjectFilters.has(name) ? 'font-semibold text-slate-900' : 'text-slate-800'
                  }`}
                  onClick={() => handleProjectFilterSelect(name)}
                >
                  <span>{name}</span>
                  {selectedProjectFilters.has(name) ? <span>✓</span> : null}
                </button>
              ))
            )}
          </div>
        </div>
      )}
      {statusFilterMenu.open && (
        <div
          ref={statusFilterMenuRef}
          className="fixed z-50 mt-1 min-w-[200px] overflow-hidden rounded border border-[#ced3d0] bg-white text-[12px] shadow-lg"
          style={{ top: statusFilterMenu.top, left: statusFilterMenu.left }}
        >
          <div className="max-h-64 overflow-y-auto">
            {statusNames.length === 0 ? (
              <div className="px-3 py-2 text-slate-600">No statuses available</div>
            ) : (
              statusNames.map((name) => (
                <button
                  key={name}
                  type="button"
                  className={`flex w-full items-center justify-between px-3 py-2 text-left hover:bg-slate-100 ${
                    selectedStatusFilters.has(name) ? 'font-semibold text-slate-900' : 'text-slate-800'
                  }`}
                  onClick={() => handleStatusFilterSelect(name)}
                >
                  <span>{name}</span>
                  {selectedStatusFilters.has(name) ? <span>✓</span> : null}
                </button>
              ))
            )}
          </div>
        </div>
      )}
      {recurringFilterMenu.open && (
        <div
          ref={recurringFilterMenuRef}
          className="fixed z-50 mt-1 min-w-[200px] overflow-hidden rounded border border-[#ced3d0] bg-white text-[12px] shadow-lg"
          style={{ top: recurringFilterMenu.top, left: recurringFilterMenu.left }}
        >
          <div className="max-h-64 overflow-y-auto">
            {recurringNames.map((name) => (
              <button
                key={name}
                type="button"
                className={`flex w-full items-center justify-between px-3 py-2 text-left hover:bg-slate-100 ${
                  selectedRecurringFilters.has(name) ? 'font-semibold text-slate-900' : 'text-slate-800'
                }`}
                onClick={() => handleRecurringFilterSelect(name)}
              >
                <span>{name}</span>
                {selectedRecurringFilters.has(name) ? <span>✓</span> : null}
              </button>
            ))}
          </div>
        </div>
      )}
      {estimateFilterMenu.open && (
        <div
          ref={estimateFilterMenuRef}
          className="fixed z-50 mt-1 min-w-[200px] overflow-hidden rounded border border-[#ced3d0] bg-white text-[12px] shadow-lg"
          style={{ top: estimateFilterMenu.top, left: estimateFilterMenu.left }}
        >
          <div className="max-h-64 overflow-y-auto">
            {estimateNames.map((name) => (
              <button
                key={name}
                type="button"
                className={`flex w-full items-center justify-between px-3 py-2 text-left hover:bg-slate-100 ${
                  selectedEstimateFilters.has(name) ? 'font-semibold text-slate-900' : 'text-slate-800'
                }`}
                onClick={() => handleEstimateFilterSelect(name)}
              >
                <span>{name}</span>
                {selectedEstimateFilters.has(name) ? <span>✓</span> : null}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
