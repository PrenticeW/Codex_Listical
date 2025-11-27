import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import NavigationBar from './NavigationBar';
import { loadStagingState, STAGING_STORAGE_KEY } from './stagingStorage';

const DAYS_OF_WEEK = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];
const MINUTES_IN_DAY = 24 * 60;
const DAY_COLUMN_COUNT = 8;
const SLEEP_DRAG_TYPE = 'application/x-sleep-day';
const buildInitialSleepBlocks = (days) =>
  days.map((day, index) => ({
    id: `sleep-${index}`,
    columnIndex: index,
    startRowId: 'sleep-start',
    endRowId: 'sleep-start',
    projectId: 'sleep',
  }));
const DEFAULT_SLEEP_CELL_HEIGHT = 44;
let chipSequence = 0;
const createProjectChipId = () => {
  chipSequence += 1;
  return `chip-${chipSequence}`;
};

const formatHour12 = (hour, minutes = '00') => {
  const period = hour >= 12 ? 'PM' : 'AM';
  const normalizedHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${normalizedHour}:${minutes} ${period}`;
};

const parseHour12ToMinutes = (value) => {
  const match = value.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!match) return null;
  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const period = match[3].toUpperCase();
  if (period === 'AM') {
    hours = hours % 12;
  } else {
    hours = (hours % 12) + 12;
  }
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  return hours * 60 + minutes;
};

const getBlockDuration = (block, rowIndexMap, timelineRowIds, incrementMinutes) => {
  if (!block || !rowIndexMap || !timelineRowIds?.length || !incrementMinutes) {
    return 0;
  }
  const startIdx = rowIndexMap.get(block.startRowId);
  const endIdx = rowIndexMap.get(block.endRowId ?? block.startRowId);
  if (startIdx == null || endIdx == null) {
    return 0;
  }
  const minIdx = Math.min(startIdx, endIdx);
  const maxIdx = Math.max(startIdx, endIdx);
  let totalMinutes = 0;
  for (let idx = minIdx; idx <= maxIdx; idx += 1) {
    const rowId = timelineRowIds[idx];
    if (!rowId) {
      continue;
    }
    if (rowId === 'sleep-start' || rowId.startsWith('hour-')) {
      totalMinutes += 60;
      continue;
    }
    if (rowId === 'sleep-end' || rowId.startsWith('trailing-')) {
      totalMinutes += incrementMinutes;
    }
  }
  return totalMinutes;
};

const formatDuration = (minutes) => {
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return '0:00';
  }
  const hours = Math.floor(minutes / 60);
  const remaining = Math.abs(minutes % 60);
  return `${hours}:${remaining.toString().padStart(2, '0')}`;
};

export default function TacticsPage({ currentPath = '/tactics', onNavigate = () => {} }) {
  const [startDay, setStartDay] = useState(DAYS_OF_WEEK[0]);
  const hourOptions = useMemo(
    () => Array.from({ length: 24 }, (_, hour) => formatHour12(hour)),
    []
  );
  const [startHour, setStartHour] = useState('');
  const minuteOptions = useMemo(() => {
    if (!startHour) return [];
    const baseMinutes = parseHour12ToMinutes(startHour);
    if (baseMinutes == null) return [];
    const increments = 96;
    return Array.from({ length: increments }, (_, index) => {
      const totalMinutes = (baseMinutes + index * 15) % MINUTES_IN_DAY;
      const hour24 = Math.floor(totalMinutes / 60);
      const minutes = (totalMinutes % 60).toString().padStart(2, '0');
      return formatHour12(hour24, minutes);
    });
  }, [startHour]);
  const [startMinute, setStartMinute] = useState('');
  const [incrementMinutes, setIncrementMinutes] = useState(30);
  const hourRows = useMemo(() => {
    if (!startHour || !startMinute) return [];
    const startMinutes = parseHour12ToMinutes(startHour);
    const targetMinutes = parseHour12ToMinutes(startMinute);
    if (startMinutes == null || targetMinutes == null) return [];
    const startHourIndex = Math.floor(startMinutes / 60);
    const endHourIndex = Math.floor(targetMinutes / 60);
    const targetMinutesWithinHour = targetMinutes % 60;
    const shouldIncludeEndHour =
      targetMinutesWithinHour !== 0 && targetMinutesWithinHour % 15 === 0;

    const hours = [];
    let current = (startHourIndex + 1) % 24;
    for (let i = 0; i < 24; i += 1) {
      hours.push(current);
      if (current === endHourIndex) {
        if (!shouldIncludeEndHour) {
          hours.pop();
        }
        break;
      }
      current = (current + 1) % 24;
    }
    return hours;
  }, [startHour, startMinute]);
  const trailingMinuteRows = useMemo(() => {
    if (!startHour || !startMinute) return [];
    const startMinutes = parseHour12ToMinutes(startHour);
    const endMinutes = parseHour12ToMinutes(startMinute);
    if (startMinutes == null || endMinutes == null) return [];
    const step = incrementMinutes;
    const startTarget = (startMinutes + MINUTES_IN_DAY - step) % MINUTES_IN_DAY;
    const rows = [];
    let current = (endMinutes + step) % MINUTES_IN_DAY;
    for (let i = 0; i < Math.ceil(MINUTES_IN_DAY / step); i += 1) {
      rows.push(current);
      if (current === startTarget) break;
      current = (current + step) % MINUTES_IN_DAY;
      if (current === ((endMinutes + step) % MINUTES_IN_DAY)) break;
    }
    return rows;
  }, [startHour, startMinute, incrementMinutes]);
  const sequence = useMemo(() => {
    const startIndex = DAYS_OF_WEEK.indexOf(startDay);
    if (startIndex < 0) return [];
    return Array.from({ length: 6 }, (_, offset) => {
      const index = (startIndex + offset + 1) % DAYS_OF_WEEK.length;
      return DAYS_OF_WEEK[index];
    });
  }, [startDay]);
  const displayedWeekDays = useMemo(() => {
    if (!startDay) return DAYS_OF_WEEK.slice(0, 7);
    return [startDay, ...sequence].slice(0, 7);
  }, [startDay, sequence]);
  const visibleColumnCount = displayedWeekDays.length || DAY_COLUMN_COUNT;
  const [projectChips, setProjectChips] = useState(() =>
    buildInitialSleepBlocks(displayedWeekDays)
  );
  const [selectedBlockId, setSelectedBlockId] = useState(null);
  const [resizingBlockId, setResizingBlockId] = useState(null);
  const [rowMetrics, setRowMetrics] = useState({});
  const [dragPreview, setDragPreview] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dayColumnRects, setDayColumnRects] = useState([]);
  const [stagingProjects, setStagingProjects] = useState([]);
  const [selectedSummaryRowId, setSelectedSummaryRowId] = useState(null);
  const [selectedCell, setSelectedCell] = useState(null);
  const [cellMenu, setCellMenu] = useState(null);
  const getProjectChipsByColumnIndex = useCallback(
    (columnIndex) => projectChips.filter((block) => block.columnIndex === columnIndex),
    [projectChips]
  );
  console.log('Blocks in column 0:', getProjectChipsByColumnIndex(0));
  console.log('Blocks in column 1:', getProjectChipsByColumnIndex(1));
  const getProjectChipById = useCallback(
    (blockId) => projectChips.find((block) => block.id === blockId) ?? null,
    [projectChips]
  );
  const getPrimaryBlockForDay = useCallback(
    (dayLabel) => {
      const columnIndex = displayedWeekDays.indexOf(dayLabel);
      if (columnIndex < 0) return null;
      const columnBlocks = getProjectChipsByColumnIndex(columnIndex);
      return columnBlocks[0] ?? null;
    },
    [displayedWeekDays, getProjectChipsByColumnIndex]
  );
  const draggingSleepChipIdRef = useRef(null);
  const dragAnchorOffsetRef = useRef(0);
  const transparentDragImageRef = useRef(null);
  const tableContainerRef = useRef(null);
  const tableElementRef = useRef(null);
  const cellMenuRef = useRef(null);
  const [tableRect, setTableRect] = useState(null);
  useEffect(() => {
    const handleDragEnd = () => {
      draggingSleepChipIdRef.current = null;
      setDragPreview(null);
      setIsDragging(false);
      dragAnchorOffsetRef.current = 0;
    };
    window.addEventListener('dragend', handleDragEnd);
    return () => {
      window.removeEventListener('dragend', handleDragEnd);
    };
  }, []);
  useEffect(() => {
    if (transparentDragImageRef.current) return undefined;
    const img = document.createElement('img');
    img.src =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAuMBg3QZWZQAAAAASUVORK5CYII=';
    Object.assign(img.style, {
      position: 'absolute',
      top: '-10px',
      left: '-10px',
      width: '1px',
      height: '1px',
      opacity: '0',
      pointerEvents: 'none',
    });
    document.body.appendChild(img);
    transparentDragImageRef.current = img;
    return () => {
      if (transparentDragImageRef.current) {
        transparentDragImageRef.current.remove();
        transparentDragImageRef.current = null;
      }
    };
  }, []);
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const readProjects = () => {
      const state = loadStagingState();
      setStagingProjects(Array.isArray(state?.shortlist) ? state.shortlist : []);
    };
    readProjects();
    const handleStorage = (event) => {
      if (event?.key && event.key !== STAGING_STORAGE_KEY) return;
      readProjects();
    };
    const handleVisibility = () => {
      if (document.hidden) return;
      readProjects();
    };
    window.addEventListener('storage', handleStorage);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('storage', handleStorage);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);
  useEffect(() => {
    setProjectChips((prev) => {
      const columnCount = displayedWeekDays.length;
      const nextBlocks = prev.filter((entry) => entry.columnIndex < columnCount);
      const trackedColumns = new Set(nextBlocks.map((entry) => entry.columnIndex));
      for (let columnIndex = 0; columnIndex < columnCount; columnIndex += 1) {
        if (trackedColumns.has(columnIndex)) continue;
        nextBlocks.push({
          id: `sleep-${columnIndex}`,
          columnIndex,
          startRowId: 'sleep-start',
          endRowId: 'sleep-start',
          projectId: 'sleep',
        });
      }
      return nextBlocks;
    });
  }, [displayedWeekDays]);
  useEffect(() => {
    setSelectedBlockId((prev) =>
      prev && projectChips.some((block) => block.id === prev) ? prev : null
    );
  }, [projectChips]);
  useEffect(() => {
    if (!resizingBlockId) return;
    if (!projectChips.some((block) => block.id === resizingBlockId)) {
      setResizingBlockId(null);
    }
  }, [resizingBlockId, projectChips]);
  const timelineRowIds = useMemo(() => {
    const rows = ['sleep-start'];
    hourRows.forEach((hourValue) => rows.push(`hour-${hourValue}`));
    rows.push('sleep-end');
    trailingMinuteRows.forEach((_, idx) => rows.push(`trailing-${idx}`));
    return rows;
  }, [hourRows, trailingMinuteRows]);
  const rowIndexMap = useMemo(
    () => new Map(timelineRowIds.map((rowId, index) => [rowId, index])),
    [timelineRowIds]
  );
  const isRowWithinBlock = useCallback(
    (rowId, block) => {
      if (!block) return false;
      const startIdx = rowIndexMap.get(block.startRowId);
      const endIdx = rowIndexMap.get(block.endRowId);
      const rowIdx = rowIndexMap.get(rowId);
      if (
        startIdx == null ||
        endIdx == null ||
        rowIdx == null ||
        timelineRowIds.length === 0
      ) {
        return false;
      }
      const minIdx = Math.min(startIdx, endIdx);
      const maxIdx = Math.max(startIdx, endIdx);
      return rowIdx >= minIdx && rowIdx <= maxIdx;
    },
    [rowIndexMap, timelineRowIds]
  );
  const findRowIdByPointerY = useCallback(
    (pointerY) => {
      if (!timelineRowIds.length) return null;
      let target = null;
      for (let i = 0; i < timelineRowIds.length; i += 1) {
        const rowId = timelineRowIds[i];
        const metrics = rowMetrics[rowId];
        if (!metrics) continue;
        if (pointerY >= metrics.top && pointerY <= metrics.bottom) {
          target = rowId;
          break;
        }
      }
      if (!target) {
        const firstMetrics = rowMetrics[timelineRowIds[0]];
        const lastMetrics =
          rowMetrics[timelineRowIds[timelineRowIds.length - 1]];
        if (firstMetrics && pointerY < firstMetrics.top) {
          target = timelineRowIds[0];
        } else if (lastMetrics && pointerY > lastMetrics.bottom) {
          target = timelineRowIds[timelineRowIds.length - 1];
        }
      }
      return target;
    },
    [rowMetrics, timelineRowIds]
  );
  useEffect(() => {
    if (!resizingBlockId) return undefined;
    if (!getProjectChipById(resizingBlockId)) {
      setResizingBlockId(null);
      return undefined;
    }
    const handleMouseMove = (event) => {
      const pointerY = event.clientY + (window.scrollY || 0);
      const targetRowId = findRowIdByPointerY(pointerY);
      if (!targetRowId) return;
      setProjectChips((prev) => {
        let updated = false;
        const next = prev.map((entry) => {
          if (entry.id !== resizingBlockId) return entry;
          const startIdx = rowIndexMap.get(entry.startRowId);
          const targetIdx = rowIndexMap.get(targetRowId);
          if (startIdx == null || targetIdx == null) return entry;
          updated = true;
          const clampedIdx = Math.max(targetIdx, startIdx);
          return {
            ...entry,
            endRowId: timelineRowIds[clampedIdx] ?? entry.startRowId,
          };
        });
        if (!updated) {
          setResizingBlockId(null);
          return prev;
        }
        return next;
      });
    };
    const handleMouseUp = () => setResizingBlockId(null);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [findRowIdByPointerY, getProjectChipById, resizingBlockId, rowIndexMap, timelineRowIds]);
  useLayoutEffect(() => {
    if (timelineRowIds.length === 0) return;
    const next = {};
    const scrollY = window.scrollY || 0;
    timelineRowIds.forEach((rowId) => {
      const cell = document.querySelector(`[data-row-id-anchor="${rowId}"]`);
      if (cell) {
        const rect = cell.getBoundingClientRect();
        next[rowId] = {
          height: rect.height,
          top: rect.top + scrollY,
          bottom: rect.bottom + scrollY,
        };
      }
    });
    if (Object.keys(next).length) {
      setRowMetrics(next);
    }
  }, [
    timelineRowIds,
    displayedWeekDays.length,
    startHour,
    startMinute,
    incrementMinutes,
  ]);
  useLayoutEffect(() => {
    const updateTableRect = () => {
      if (!tableContainerRef.current) return;
      const rect = tableContainerRef.current.getBoundingClientRect();
      setTableRect(rect);
    };
    updateTableRect();
    window.addEventListener('resize', updateTableRect);
    return () => {
      window.removeEventListener('resize', updateTableRect);
    };
  }, [rowMetrics]);
  useLayoutEffect(() => {
    if (!tableElementRef.current || typeof window === 'undefined') return undefined;
    let animationFrame = null;
    const measureColumns = () => {
      if (!tableElementRef.current) return;
      const scrollX = window.scrollX || 0;
      const cells = tableElementRef.current.querySelectorAll('[data-day-column]');
      if (!cells.length) return;
      const rectMap = new Map();
      cells.forEach((cell) => {
        const attr = cell.getAttribute('data-day-column');
        const index = attr == null ? NaN : parseInt(attr, 10);
        if (Number.isNaN(index) || rectMap.has(index)) return;
        const rect = cell.getBoundingClientRect();
        rectMap.set(index, {
          left: rect.left + scrollX,
          right: rect.right + scrollX,
          width: rect.width,
        });
      });
      if (!rectMap.size) return;
      const ordered = Array.from({ length: DAY_COLUMN_COUNT }, (_, idx) => rectMap.get(idx) ?? null);
      setDayColumnRects(ordered);
    };
    const scheduleMeasure = () => {
      if (animationFrame != null) return;
      animationFrame = window.requestAnimationFrame(() => {
        animationFrame = null;
        measureColumns();
      });
    };
    scheduleMeasure();
    const tableBody = tableElementRef.current.querySelector('tbody');
    const target = tableBody || tableElementRef.current;
    const ResizeObserverClass = window.ResizeObserver;
    const MutationObserverClass = window.MutationObserver;
    let resizeObserver = null;
    if (ResizeObserverClass && target) {
      resizeObserver = new ResizeObserverClass(() => scheduleMeasure());
      resizeObserver.observe(target);
    } else {
      window.addEventListener('resize', scheduleMeasure);
    }
    let mutationObserver = null;
    const mutationTarget = tableBody || tableElementRef.current;
    if (MutationObserverClass && mutationTarget) {
      mutationObserver = new MutationObserverClass(() => scheduleMeasure());
      mutationObserver.observe(mutationTarget, { childList: true, subtree: true });
    }
    return () => {
      if (animationFrame != null) {
        window.cancelAnimationFrame(animationFrame);
        animationFrame = null;
      }
      if (resizeObserver) {
        resizeObserver.disconnect();
      } else {
        window.removeEventListener('resize', scheduleMeasure);
      }
      if (mutationObserver) {
        mutationObserver.disconnect();
      }
    };
  }, [displayedWeekDays]);
  const updateDragPreview = useCallback(
    (targetColumnIndex, rowId) => {
      if (targetColumnIndex == null || Number.isNaN(targetColumnIndex) || !rowId) return;
      const sourceChipId = draggingSleepChipIdRef.current;
      if (!sourceChipId) return;
      const block = getProjectChipById(sourceChipId);
      if (!block) return;
      const startIdx = rowIndexMap.get(block.startRowId);
      const endIdx = rowIndexMap.get(block.endRowId);
      const targetIdx = rowIndexMap.get(rowId);
      if (startIdx == null || endIdx == null || targetIdx == null) return;
      const span = Math.abs(endIdx - startIdx);
      const nextEndIdx = Math.min(
        targetIdx + span,
        timelineRowIds.length - 1
      );
      setDragPreview({
        sourceChipId,
        targetColumnIndex,
        startRowId: rowId,
        endRowId: timelineRowIds[nextEndIdx] ?? rowId,
      });
    },
    [getProjectChipById, rowIndexMap, timelineRowIds]
  );
  const getBlockHeight = useCallback(
    (startRowId, endRowId) => {
      if (!startRowId) return DEFAULT_SLEEP_CELL_HEIGHT;
      const startIdx = rowIndexMap.get(startRowId);
      const endIdx = rowIndexMap.get(endRowId ?? startRowId);
      if (startIdx == null || endIdx == null) return DEFAULT_SLEEP_CELL_HEIGHT;
      const minIdx = Math.min(startIdx, endIdx);
      const maxIdx = Math.max(startIdx, endIdx);
      return timelineRowIds
        .slice(minIdx, maxIdx + 1)
        .reduce(
          (sum, rowKey) =>
            sum + (rowMetrics[rowKey]?.height ?? DEFAULT_SLEEP_CELL_HEIGHT),
          0
        );
    },
    [rowIndexMap, rowMetrics, timelineRowIds]
  );
  const handleSleepDragStart = useCallback(
    (event, chipId) => {
      if (!chipId) return;
      event.dataTransfer.setData(SLEEP_DRAG_TYPE, chipId);
      event.dataTransfer.effectAllowed = 'move';
      if (event.dataTransfer.setDragImage) {
        const dragImage = transparentDragImageRef.current;
        if (dragImage) {
          event.dataTransfer.setDragImage(dragImage, 0, 0);
        }
      }
      console.log('Dragging chip ID:', chipId);
      draggingSleepChipIdRef.current = chipId;
      const block = getProjectChipById(chipId);
      if (block) {
        const metrics = rowMetrics[block.startRowId];
        const pointerY = event.clientY + (window.scrollY || 0);
        if (metrics) {
          const rowHeight = metrics.height || DEFAULT_SLEEP_CELL_HEIGHT;
          const rawOffset = pointerY - metrics.top;
          const normalizedOffset = ((rawOffset % rowHeight) + rowHeight) % rowHeight;
          dragAnchorOffsetRef.current = normalizedOffset;
        } else {
          dragAnchorOffsetRef.current = 0;
        }
        setDragPreview({
          sourceChipId: chipId,
          targetColumnIndex: block.columnIndex,
          startRowId: block.startRowId,
          endRowId: block.endRowId,
        });
        setSelectedBlockId(chipId);
      }
      setIsDragging(true);
    },
    [getProjectChipById, rowMetrics]
  );
  const handleSleepDragOver = useCallback(
    (event) => {
      if (!isDragging) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      const rowId = event.currentTarget.dataset.rowId;
      const columnIndexValue = event.currentTarget.dataset.dayColumn;
      if (!rowId || columnIndexValue == null) {
        return;
      }
      const columnIndex = parseInt(columnIndexValue, 10);
      if (Number.isNaN(columnIndex)) return;
      updateDragPreview(columnIndex, rowId);
    },
    [isDragging, updateDragPreview]
  );
  const applyDragPreview = useCallback(() => {
    if (!dragPreview) return;
    const { sourceChipId, targetColumnIndex, startRowId, endRowId } = dragPreview;
    if (targetColumnIndex == null || Number.isNaN(targetColumnIndex)) return;
    const sourceBlock = getProjectChipById(sourceChipId);
    if (!sourceBlock) return;
    setProjectChips((prev) => {
      const targetIndex = prev.findIndex((entry) => entry.id === sourceChipId);
      if (targetIndex < 0) {
        return prev;
      }
      const next = [...prev];
      const target = next[targetIndex];
      next[targetIndex] = {
        ...target,
        columnIndex: targetColumnIndex,
        startRowId,
        endRowId,
      };
      return next;
    });
    setSelectedBlockId(sourceChipId);
    setDragPreview(null);
    draggingSleepChipIdRef.current = null;
    setIsDragging(false);
    dragAnchorOffsetRef.current = 0;
  }, [dragPreview, getProjectChipById, setProjectChips]);
  const handleSleepDrop = useCallback(
    (event) => {
      if (!isDragging) return;
      event.preventDefault();
      applyDragPreview();
    },
    [applyDragPreview, isDragging]
  );
  const handleTableDrop = useCallback(
    (event) => {
      if (!isDragging || !dragPreview) return;
      event.preventDefault();
      applyDragPreview();
    },
    [applyDragPreview, dragPreview, isDragging]
  );
  const handleTableDragOver = useCallback(
    (event) => {
      if (!isDragging) return;
      event.preventDefault();
      const pointerY = event.clientY + (window.scrollY || 0);
      const adjustedY = pointerY - (dragAnchorOffsetRef.current || 0);
      const targetRowId = findRowIdByPointerY(adjustedY);
      if (!targetRowId) return;
      const pointerX = event.clientX + (window.scrollX || 0);
      let dayIndex = -1;
      for (let idx = 0; idx < dayColumnRects.length; idx += 1) {
        const rect = dayColumnRects[idx];
        if (!rect) continue;
        if (pointerX >= rect.left && pointerX <= rect.right) {
          dayIndex = idx;
          break;
        }
      }
      if (dayIndex < 0 || dayIndex >= displayedWeekDays.length) return;
      updateDragPreview(dayIndex, targetRowId);
    },
    [dayColumnRects, displayedWeekDays, findRowIdByPointerY, isDragging, updateDragPreview]
  );
  const handleResizeMouseDown = useCallback(
    (event, chipId) => {
      event.stopPropagation();
      event.preventDefault();
      if (!chipId) return;
      const block = getProjectChipById(chipId);
      if (!block) return;
      setSelectedBlockId(chipId);
      setResizingBlockId(chipId);
    },
    [getProjectChipById]
  );
  const highlightedBlockId =
    dragPreview?.sourceChipId ?? resizingBlockId ?? selectedBlockId ?? null;
  const toggleSummaryRowSelection = useCallback((rowId) => {
    setSelectedSummaryRowId((prev) => (prev === rowId ? null : rowId));
  }, []);
  const toggleCellSelection = useCallback((columnIndex, rowId) => {
    if (columnIndex == null || rowId == null) return;
    setSelectedCell((prev) => {
      if (prev && prev.columnIndex === columnIndex && prev.rowId === rowId) {
        return null;
      }
      return { columnIndex, rowId };
    });
  }, []);
  const isCellSelected = useCallback(
    (columnIndex, rowId) =>
      selectedCell != null &&
      selectedCell.columnIndex === columnIndex &&
      selectedCell.rowId === rowId,
    [selectedCell]
  );
  const closeCellMenu = useCallback(() => {
    setCellMenu(null);
  }, []);
  const handleCellClick = useCallback(
    (event, columnIndex, rowId) => {
      if (columnIndex == null || rowId == null) return;
      const hasDay = Boolean(displayedWeekDays[columnIndex]);
      if (!hasDay) return;
      const alreadySelected = isCellSelected(columnIndex, rowId);
      toggleCellSelection(columnIndex, rowId);
      if (alreadySelected) {
        closeCellMenu();
        return;
      }
      const cellRect = event.currentTarget.getBoundingClientRect();
      const scrollY = typeof window === 'undefined' ? 0 : window.scrollY || 0;
      const scrollX = typeof window === 'undefined' ? 0 : window.scrollX || 0;
      const containerRect = tableContainerRef.current?.getBoundingClientRect();
      const containerTop = (containerRect?.top ?? 0) + scrollY;
      const containerLeft = (containerRect?.left ?? 0) + scrollX;
      setCellMenu({
        columnIndex,
        rowId,
        position: {
          top: cellRect.bottom + scrollY - containerTop + 4,
          left: cellRect.left + scrollX - containerLeft,
          width: cellRect.width,
        },
      });
    },
    [closeCellMenu, displayedWeekDays, isCellSelected, toggleCellSelection]
  );
  const handleProjectSelection = useCallback(
    (projectId) => {
      if (!projectId) return;
      const target = selectedCell ?? cellMenu;
      if (!target) return;
      const { columnIndex, rowId } = target;
      if (columnIndex == null || !rowId) return;
      let assignedId = null;
      setProjectChips((prev) => {
        let updated = false;
        const next = prev.map((entry) => {
          if (entry.columnIndex === columnIndex && entry.startRowId === rowId) {
            updated = true;
            assignedId = entry.id;
            return {
              ...entry,
              projectId,
              endRowId: rowId,
            };
          }
          return entry;
        });
        if (updated) {
          return next;
        }
        const chipId = createProjectChipId();
        assignedId = chipId;
        return [
          ...prev,
          {
            id: chipId,
            columnIndex,
            startRowId: rowId,
            endRowId: rowId,
            projectId,
          },
        ];
      });
      if (assignedId) {
        setSelectedBlockId(assignedId);
      }
      closeCellMenu();
    },
    [cellMenu, closeCellMenu, selectedCell, setProjectChips, setSelectedBlockId]
  );
  useEffect(() => {
    if (!cellMenu) return undefined;
    const handlePointerDown = (event) => {
      const menuNode = cellMenuRef.current;
      if (menuNode && menuNode.contains(event.target)) return;
      closeCellMenu();
    };
    window.addEventListener('mousedown', handlePointerDown);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
    };
  }, [cellMenu, closeCellMenu]);
  useEffect(() => {
    if (!cellMenu) return;
    const hasDay = Boolean(displayedWeekDays[cellMenu.columnIndex]);
    if (!hasDay) {
      closeCellMenu();
    }
  }, [cellMenu, closeCellMenu, displayedWeekDays]);
  const highlightedProjects = useMemo(() => {
    if (!stagingProjects.length) return [];
    return stagingProjects
      .filter((project) => {
        const colorValue = typeof project?.color === 'string' ? project.color.trim() : '';
        if (!colorValue) return false;
        return colorValue.toLowerCase() !== '#f3f4f6';
      })
      .map((project) => {
        const nickname = (project.projectNickname || '').trim();
        const label = nickname || project.projectName || project.text || 'Project';
        return {
          id: project.id,
          label,
          color: project.color,
        };
      });
  }, [stagingProjects]);
  const projectMetadata = useMemo(() => {
    const map = new Map();
    map.set('sleep', {
      label: 'Sleep',
      color: '#d9d9d9',
      textColor: '#000000',
    });
    highlightedProjects.forEach((project) => {
      map.set(project.id, {
        label: project.label,
        color: project.color || '#0f172a',
        textColor: '#ffffff',
      });
    });
    return map;
  }, [highlightedProjects]);
  const projectColumnTotals = useMemo(() => {
    const totals = new Map();
    const columnLength = visibleColumnCount || DAY_COLUMN_COUNT;
    projectChips.forEach((block) => {
      const targetProjectId = block.projectId || 'sleep';
      const columnIndex =
        typeof block.columnIndex === 'number' ? block.columnIndex : 0;
      if (columnIndex < 0 || columnIndex >= columnLength) {
        return;
      }
      const duration = getBlockDuration(
        block,
        rowIndexMap,
        timelineRowIds,
        incrementMinutes
      );
      if (duration <= 0) return;
      if (!totals.has(targetProjectId)) {
        totals.set(targetProjectId, Array.from({ length: columnLength }, () => 0));
      }
      const columnTotals = totals.get(targetProjectId);
      if (!Array.isArray(columnTotals)) return;
      columnTotals[columnIndex] += duration;
    });
    return totals;
  }, [
    incrementMinutes,
    projectChips,
    rowIndexMap,
    timelineRowIds,
    visibleColumnCount,
  ]);
  const sleepColumnTotals = useMemo(() => {
    const totals = projectColumnTotals.get('sleep');
    if (Array.isArray(totals) && totals.length === visibleColumnCount) {
      return totals;
    }
    if (Array.isArray(totals)) {
      const padLength = Math.max(visibleColumnCount - totals.length, 0);
      return [...totals, ...Array.from({ length: padLength }, () => 0)].slice(
        0,
        visibleColumnCount
      );
    }
    return Array.from({ length: visibleColumnCount }, () => 0);
  }, [projectColumnTotals, visibleColumnCount]);
  const totalSleepMinutes = useMemo(
    () => sleepColumnTotals.reduce((sum, value) => sum + value, 0),
    [sleepColumnTotals]
  );
  const projectSummaries = useMemo(
    () =>
      highlightedProjects.map((project) => {
        const totals = projectColumnTotals.get(project.id);
        const columnTotals = Array.isArray(totals)
          ? [
              ...totals,
              ...Array.from(
                { length: Math.max(visibleColumnCount - totals.length, 0) },
                () => 0
              ),
            ].slice(0, visibleColumnCount)
          : Array.from({ length: visibleColumnCount }, () => 0);
        const totalMinutes = columnTotals.reduce((sum, value) => sum + value, 0);
        return {
          ...project,
          columnTotals,
          totalMinutes,
        };
      }),
    [highlightedProjects, projectColumnTotals, visibleColumnCount]
  );
  const renderProjectChip = useCallback(
    (chipId, rowId) => {
      if (!chipId) return null;
      const block = getProjectChipById(chipId);
      if (!block || block.startRowId !== rowId) return null;
      const projectId = block.projectId || 'sleep';
      const metadata = projectMetadata.get(projectId);
      const label = metadata?.label ?? 'Project';
      const backgroundColor = metadata?.color ?? '#d9d9d9';
      const textColor = metadata?.textColor ?? '#000';
      const isActive = highlightedBlockId === block.id;
      const blockHeight = getBlockHeight(block.startRowId, block.endRowId);
      return (
        <div
          className="absolute left-0 top-0 flex w-full justify-center"
          style={{
            height: `${blockHeight}px`,
            zIndex: 10,
          }}
        >
          <div
            className={`relative w-full cursor-move select-none rounded border border-transparent px-2 py-1 text-center text-[11px] font-semibold shadow-sm ${
              isActive ? 'outline outline-[2px]' : ''
            }`}
            style={{
              pointerEvents:
                dragPreview && dragPreview.sourceChipId === chipId ? 'none' : 'auto',
              backgroundColor,
              color: textColor,
              ...(isActive ? { outlineColor: '#000', outlineOffset: 0 } : null),
            }}
            draggable={!resizingBlockId}
            onDragStart={(event) => {
              if (resizingBlockId) {
                event.preventDefault();
                return;
              }
              handleSleepDragStart(event, chipId);
            }}
            onClick={(event) => {
              event.stopPropagation();
              setSelectedBlockId((prev) => (prev === chipId ? null : chipId));
            }}
          >
            {label}
            {isActive ? (
              <button
                type="button"
                aria-label="Stretch project block"
                onMouseDown={(event) => handleResizeMouseDown(event, chipId)}
                className="cursor-se-resize"
                style={{
                  position: 'absolute',
                  bottom: '-4px',
                  right: '-4px',
                  height: '8px',
                  width: '8px',
                  borderRadius: '9999px',
                  border: '1px solid #000',
                  backgroundColor: '#000',
                  padding: 0,
                  boxShadow: '0 0 0 1px #000',
                  pointerEvents: 'auto',
                }}
              />
            ) : null}
          </div>
        </div>
      );
    },
    [
      getProjectChipById,
      getBlockHeight,
      handleResizeMouseDown,
      handleSleepDragStart,
      highlightedBlockId,
      projectMetadata,
      resizingBlockId,
    ]
  );
  const renderDragOutline = useCallback(() => {
    if (!dragPreview || !tableRect) return null;
    const outlineHeight = getBlockHeight(
      dragPreview.startRowId,
      dragPreview.endRowId
    );
    const columnIndex = dragPreview.targetColumnIndex ?? -1;
    if (columnIndex < 0) return null;
    const columnRect = dayColumnRects[columnIndex];
    if (!columnRect) return null;
    const baseRowIdx = rowIndexMap.get(dragPreview.startRowId);
    if (baseRowIdx == null) return null;
    const metrics = rowMetrics[dragPreview.startRowId];
    if (!metrics) return null;
    const scrollY = typeof window === 'undefined' ? 0 : window.scrollY || 0;
    const scrollX = typeof window === 'undefined' ? 0 : window.scrollX || 0;
    const containerTop = (tableRect.top ?? 0) + scrollY;
    const containerLeft = (tableRect.left ?? 0) + scrollX;
    const left = columnRect.left - containerLeft;
    const top = metrics.top - containerTop;
    return (
      <div className="pointer-events-none absolute inset-0 z-20">
        <div
          className="absolute"
          style={{
            top,
            left,
            width: columnRect.width || 0,
            height: outlineHeight,
          }}
        >
          <div className="h-full w-full rounded border-2 border-dashed border-[#111827] bg-white/60" />
        </div>
      </div>
    );
  }, [dayColumnRects, displayedWeekDays, dragPreview, getBlockHeight, rowIndexMap, rowMetrics, tableRect]);
  const renderCellProjectMenu = useCallback(() => {
    if (!cellMenu) return null;
    const { position } = cellMenu;
    return (
      <div
        ref={cellMenuRef}
        className="absolute z-30 rounded border border-[#94a3b8] shadow-2xl"
        style={{
          top: position?.top ?? 0,
          left: position?.left ?? 0,
          minWidth: Math.max(position?.width ?? 0, 180),
          backgroundColor: '#f8fafc',
        }}
      >
        <div className="border-b border-[#e5e7eb] px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
          Staged Projects
        </div>
        {highlightedProjects.length ? (
          <ul className="max-h-60 overflow-auto py-1 list-none">
            {highlightedProjects.map((project) => (
              <li key={project.id}>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-[11px] font-semibold text-slate-800 hover:bg-[#f2fdf6]"
                  onClick={() => handleProjectSelection(project.id)}
                >
                  <span
                    className="inline-flex h-3 w-3 flex-shrink-0 rounded-full"
                    style={{ backgroundColor: project.color || '#0f172a' }}
                  ></span>
                  <span>{project.label}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="px-3 py-2 text-[11px] text-slate-500">No staged projects found</div>
        )}
      </div>
    );
  }, [cellMenu, handleProjectSelection, highlightedProjects]);

  return (
    <div className="min-h-screen bg-gray-100 text-slate-800 p-4">
      <NavigationBar
        currentPath={currentPath}
        onNavigate={onNavigate}
        listicalButton={
          <ListicalMenu
            incrementMinutes={incrementMinutes}
            onIncrementChange={setIncrementMinutes}
          />
        }
      />
      <div className="mt-20">
        <div
          ref={tableContainerRef}
          className="relative rounded border border-[#ced3d0] bg-white p-4 shadow-sm"
          onDrop={handleTableDrop}
          onDragOver={handleTableDragOver}
        >
          {renderDragOutline()}
          <table
            ref={tableElementRef}
            className="w-full border-collapse text-[11px] text-slate-800"
          >
            <tbody>
              <tr className="grid grid-cols-9 text-sm">
                {Array.from({ length: 9 }, (_, index) => {
                  if (index === 0 || index === 8) {
                    return (
                      <td
                        key={`blank-${index}`}
                        className="border border-[#e5e7eb] px-3 py-2 text-center font-semibold"
                      ></td>
                    );
                  }
                  if (index === 1) {
                    return (
                      <td key="selector" className="border border-[#e5e7eb] px-3 py-2">
                        <select
                          className="w-full rounded border border-[#ced3d0] bg-white px-2 py-1 text-sm text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                          value={startDay}
                          onChange={(event) => setStartDay(event.target.value)}
                        >
                          {DAYS_OF_WEEK.map((day) => (
                            <option key={day} value={day}>
                              {day}
                            </option>
                          ))}
                        </select>
                      </td>
                    );
                  }
                  const dayIndex = index - 2;
                  return (
                    <td key={`day-${index}`} className="border border-[#e5e7eb] px-3 py-2 text-center font-semibold">
                      {sequence[dayIndex] ?? ''}
                    </td>
                  );
                })}
              </tr>
              <tr className="grid grid-cols-9">
                <td
                  className="border border-[#e5e7eb] px-3 py-2"
                  data-row-id-anchor="sleep-start"
                >
                  <select
                    className="w-full rounded border border-[#ced3d0] bg-white px-2 py-1 text-[11px] text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                    value={startHour}
                    onChange={(event) => setStartHour(event.target.value)}
                  >
                    <option value="">Sleep Start Time</option>
                    {hourOptions.map((hour) => (
                      <option key={hour} value={hour}>
                        {hour}
                      </option>
                    ))}
                  </select>
                </td>
                {Array.from({ length: DAY_COLUMN_COUNT }, (_, index) => {
                  const dayLabel = displayedWeekDays[index] ?? '';
                  const hasDay = Boolean(dayLabel);
                  const columnBlocks = hasDay ? getProjectChipsByColumnIndex(index) : [];
                  const rowId = 'sleep-start';
                  const activeBlock =
                    highlightedBlockId != null
                      ? columnBlocks.find((block) => block.id === highlightedBlockId)
                      : null;
                  const isCovered = activeBlock
                    ? isRowWithinBlock(rowId, activeBlock)
                    : false;
                  const labels = columnBlocks
                    .filter((block) => block.startRowId === rowId)
                    .map((block) => renderProjectChip(block.id, rowId));
                  const cellSelected = isCellSelected(index, rowId);
                  const cellStyle = {};
                  if (isCovered) {
                    cellStyle.backgroundColor = '#d9d9d9';
                  }
                  if (cellSelected) {
                    cellStyle.outlineColor = '#000';
                    cellStyle.outlineOffset = 0;
                  }
                  return (
                    <td
                      key={`time-row-${index}`}
                      className={`relative border border-[#e5e7eb] px-3 py-2 text-center overflow-visible ${
                        cellSelected ? 'outline outline-[2px]' : ''
                      }`}
                      style={Object.keys(cellStyle).length ? cellStyle : undefined}
                      data-row-id={rowId}
                      data-day-column={index}
                      data-day={hasDay ? dayLabel : undefined}
                      onDragOver={hasDay ? handleSleepDragOver : undefined}
                      onDrop={hasDay ? handleSleepDrop : undefined}
                      onClick={hasDay ? (event) => handleCellClick(event, index, rowId) : undefined}
                    >
                      {labels}
                    </td>
                  );
                })}
              </tr>
              {hourRows.map((hourValue) => (
                <tr key={`hour-row-${hourValue}`} className="grid grid-cols-9">
                  <td
                    className="border border-[#e5e7eb] px-3 py-2 font-semibold"
                    data-row-id-anchor={`hour-${hourValue}`}
                  >
                    {formatHour12(hourValue)}
                  </td>
                  {Array.from({ length: DAY_COLUMN_COUNT }, (_, index) => {
                    const dayLabel = displayedWeekDays[index] ?? '';
                    const hasDay = Boolean(dayLabel);
                    const rowId = `hour-${hourValue}`;
                    const columnBlocks = hasDay ? getProjectChipsByColumnIndex(index) : [];
                    const activeBlock =
                      highlightedBlockId != null
                        ? columnBlocks.find((block) => block.id === highlightedBlockId)
                        : null;
                    const isCovered = activeBlock
                      ? isRowWithinBlock(rowId, activeBlock)
                      : false;
                  const labels = columnBlocks
                    .filter((block) => block.startRowId === rowId)
                    .map((block) => renderProjectChip(block.id, rowId));
                  const cellSelected = isCellSelected(index, rowId);
                  const cellStyle = {};
                  if (isCovered) {
                    cellStyle.backgroundColor = '#d9d9d9';
                  }
                  if (cellSelected) {
                    cellStyle.outlineColor = '#000';
                    cellStyle.outlineOffset = 0;
                  }
                  return (
                    <td
                      key={`hour-${hourValue}-${index}`}
                      className={`relative border border-[#e5e7eb] px-3 py-2 text-center overflow-visible ${
                        cellSelected ? 'outline outline-[2px]' : ''
                      }`}
                      style={Object.keys(cellStyle).length ? cellStyle : undefined}
                      data-row-id={rowId}
                      data-day-column={index}
                      data-day={hasDay ? dayLabel : undefined}
                      onDragOver={hasDay ? handleSleepDragOver : undefined}
                      onDrop={hasDay ? handleSleepDrop : undefined}
                      onClick={hasDay ? (event) => handleCellClick(event, index, rowId) : undefined}
                    >
                      {labels}
                    </td>
                  );
                })}
                </tr>
              ))}
              <tr className="grid grid-cols-9">
                <td
                  className="border border-[#e5e7eb] px-3 py-2"
                  data-row-id-anchor="sleep-end"
                >
                  <select
                    className="w-full rounded border border-[#ced3d0] bg-white px-2 py-1 text-[11px] text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                    value={startMinute}
                    onChange={(event) => setStartMinute(event.target.value)}
                    disabled={!startHour}
                  >
                    <option value="">{startHour ? `${startHour}` : 'Sleep End Time'}</option>
                    {minuteOptions.map((time) => (
                      <option key={time} value={time}>
                        {time}
                      </option>
                    ))}
                  </select>
                </td>
                {Array.from({ length: DAY_COLUMN_COUNT }, (_, index) => {
                  const dayLabel = displayedWeekDays[index] ?? '';
                  const hasDay = Boolean(dayLabel);
                  const rowId = 'sleep-end';
                  const columnBlocks = hasDay ? getProjectChipsByColumnIndex(index) : [];
                  const activeBlock =
                    highlightedBlockId != null
                      ? columnBlocks.find((block) => block.id === highlightedBlockId)
                      : null;
                  const isCovered = activeBlock
                    ? isRowWithinBlock(rowId, activeBlock)
                    : false;
                  const labels = columnBlocks
                    .filter((block) => block.startRowId === rowId)
                    .map((block) => renderProjectChip(block.id, rowId));
                  const cellSelected = isCellSelected(index, rowId);
                  const cellStyle = {};
                  if (isCovered) {
                    cellStyle.backgroundColor = '#d9d9d9';
                  }
                  if (cellSelected) {
                    cellStyle.outlineColor = '#000';
                    cellStyle.outlineOffset = 0;
                  }
                  return (
                    <td
                      key={`minute-row-${index}`}
                      className={`relative border border-[#e5e7eb] px-3 py-2 text-center overflow-visible ${
                        cellSelected ? 'outline outline-[2px]' : ''
                      }`}
                      style={Object.keys(cellStyle).length ? cellStyle : undefined}
                      data-row-id={rowId}
                      data-day-column={index}
                      data-day={hasDay ? dayLabel : undefined}
                      onDragOver={hasDay ? handleSleepDragOver : undefined}
                      onDrop={hasDay ? handleSleepDrop : undefined}
                      onClick={hasDay ? (event) => handleCellClick(event, index, rowId) : undefined}
                    >
                      {labels}
                    </td>
                  );
                })}
              </tr>
              {trailingMinuteRows.map((minutesValue, rowIdx) => (
                <tr key={`trailing-row-${rowIdx}`} className="grid grid-cols-9">
                  <td
                    className="border border-[#e5e7eb] px-3 py-2 font-semibold"
                    data-row-id-anchor={`trailing-${rowIdx}`}
                  >
                    {formatHour12(
                      Math.floor(minutesValue / 60),
                      (minutesValue % 60).toString().padStart(2, '0')
                    )}
                  </td>
                  {Array.from({ length: DAY_COLUMN_COUNT }, (_, index) => {
                    const dayLabel = displayedWeekDays[index] ?? '';
                    const hasDay = Boolean(dayLabel);
                    const rowId = `trailing-${rowIdx}`;
                    const columnBlocks = hasDay ? getProjectChipsByColumnIndex(index) : [];
                    const activeBlock =
                      highlightedBlockId != null
                        ? columnBlocks.find((block) => block.id === highlightedBlockId)
                        : null;
                    const isCovered = activeBlock
                      ? isRowWithinBlock(rowId, activeBlock)
                      : false;
                  const labels = columnBlocks
                    .filter((block) => block.startRowId === rowId)
                    .map((block) => renderProjectChip(block.id, rowId));
                  const cellSelected = isCellSelected(index, rowId);
                  const cellStyle = {};
                  if (isCovered) {
                    cellStyle.backgroundColor = '#d9d9d9';
                  }
                  if (cellSelected) {
                    cellStyle.outlineColor = '#000';
                    cellStyle.outlineOffset = 0;
                  }
                  return (
                    <td
                      key={`trailing-${rowIdx}-${index}`}
                      className={`relative border border-[#e5e7eb] px-3 py-2 text-center overflow-visible ${
                        cellSelected ? 'outline outline-[2px]' : ''
                      }`}
                      style={Object.keys(cellStyle).length ? cellStyle : undefined}
                      data-row-id={rowId}
                      data-day-column={index}
                      data-day={hasDay ? dayLabel : undefined}
                      onDragOver={hasDay ? handleSleepDragOver : undefined}
                      onDrop={hasDay ? handleSleepDrop : undefined}
                      onClick={hasDay ? (event) => handleCellClick(event, index, rowId) : undefined}
                    >
                      {labels}
                    </td>
                  );
                })}
                </tr>
              ))}
              <tr>
                <td
                  colSpan={9}
                  className="px-3 py-2 text-[11px]"
                  style={{ height: '14px', backgroundColor: '#000' }}
                ></td>
              </tr>
              <tr className="grid grid-cols-9 text-sm">
                <td className="border border-[#e5e7eb]" style={{ backgroundColor: '#000' }}></td>
                {displayedWeekDays.map((day, idx) => (
                  <td
                    key={`week-summary-${day}-${idx}`}
                    className="border border-[#e5e7eb] px-3 py-2 text-center font-semibold"
                  >
                    {day}
                  </td>
                ))}
                <td
                  className="border border-[#e5e7eb] text-center"
                  style={{ backgroundColor: '#000', color: '#fff', fontWeight: 700 }}
                >
                  Total
                </td>
              </tr>
              <tr
                className={`grid grid-cols-9 text-sm cursor-pointer ${
                  selectedSummaryRowId === 'sleep-summary' ? 'outline outline-[2px]' : ''
                }`}
                style={
                  selectedSummaryRowId === 'sleep-summary'
                    ? { outlineColor: '#000', outlineOffset: 0 }
                    : undefined
                }
                tabIndex={0}
                onClick={() => toggleSummaryRowSelection('sleep-summary')}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    toggleSummaryRowSelection('sleep-summary');
                  }
                }}
              >
                <td
                  className="border border-[#e5e7eb] px-3 py-2 text-center"
                  style={{ backgroundColor: '#d9d9d9', color: '#000', fontWeight: 700 }}
                >
                  Sleep
                </td>
                {displayedWeekDays.map((day, idx) => {
                  const minutes = sleepColumnTotals[idx] ?? 0;
                  return (
                    <td
                      key={`sleep-row-${day}-${idx}`}
                      className="border border-[#e5e7eb] px-3 py-2 text-center"
                      style={{ backgroundColor: '#efefef' }}
                    >
                      {formatDuration(minutes)}
                    </td>
                  );
                })}
                <td
                  className="border border-[#e5e7eb] px-3 py-2 text-center font-semibold"
                  style={{ backgroundColor: '#efefef' }}
                  >
                    {formatDuration(totalSleepMinutes)}
                  </td>
                </tr>
              {projectSummaries.map((summary) => {
                const rowSelected = selectedSummaryRowId === summary.id;
                return (
                  <tr
                    key={`project-summary-${summary.id}`}
                    className={`grid grid-cols-9 text-sm cursor-pointer ${
                      rowSelected ? 'outline outline-[2px]' : ''
                    }`}
                    style={rowSelected ? { outlineColor: '#000', outlineOffset: 0 } : undefined}
                    tabIndex={0}
                    onClick={() => toggleSummaryRowSelection(summary.id)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        toggleSummaryRowSelection(summary.id);
                      }
                    }}
                  >
                    <td
                      className="border border-[#e5e7eb] px-3 py-2 text-center"
                      style={{
                        backgroundColor: summary.color || '#0f172a',
                        color: '#ffffff',
                      fontWeight: 700,
                    }}
                  >
                    {summary.label}
                  </td>
                  {displayedWeekDays.map((day, idx) => (
                    <td
                      key={`project-${summary.id}-${day}-${idx}`}
                      className="border border-[#e5e7eb] px-3 py-2 text-center text-[11px]"
                      style={{ backgroundColor: '#ffffff' }}
                    >
                      {formatDuration(summary.columnTotals[idx] ?? 0)}
                    </td>
                  ))}
                  <td
                    className="border border-[#e5e7eb] px-3 py-2 text-center font-semibold text-[11px]"
                    style={{ backgroundColor: '#ffffff' }}
                  >
                    {formatDuration(summary.totalMinutes)}
                  </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {renderCellProjectMenu()}
        </div>
      </div>
    </div>
  );
}

function ListicalMenu({ incrementMinutes, onIncrementChange }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative inline-block">
      <button
        type="button"
        className="inline-flex items-center gap-2 rounded border border-[#ced3d0] bg-white px-3 py-2 font-semibold text-[#065f46] shadow-sm transition hover:bg-[#f2fdf6] hover:shadow-md"
        onClick={() => setOpen((prev) => !prev)}
      >
        <span>Listical</span>
      </button>
      {open ? (
        <div
          className="absolute right-0 mt-3 w-80 rounded-lg border border-[#94a3b8] p-4 shadow-2xl z-50"
          style={{ backgroundColor: 'rgba(255, 255, 255, 0.97)' }}
        >
          <div className="flex items-center" style={{ gap: '10px' }}>
            <label
              className="text-xs font-semibold text-slate-700 whitespace-nowrap"
              htmlFor="increment-select"
              style={{ backgroundColor: 'rgba(255, 255, 255, 0.97)' }}
            >
              Increment
            </label>
            <select
              id="increment-select"
              className="flex-1 rounded border border-[#ced3d0] bg-white px-2 py-1 text-xs text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
              value={incrementMinutes}
              onChange={(event) => onIncrementChange(parseInt(event.target.value, 10) || 30)}
            >
              <option value={15}>15 minutes</option>
              <option value={30}>30 minutes</option>
            </select>
          </div>
        </div>
      ) : null}
    </div>
  );
}
