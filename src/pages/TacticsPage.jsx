import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import NavigationBar from '../components/planner/NavigationBar';
import { loadStagingState, STAGING_STORAGE_EVENT, STAGING_STORAGE_KEY } from '../lib/stagingStorage';

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
  const [incrementMinutes, setIncrementMinutes] = useState(60);
  const hourOptions = useMemo(() => {
    const step = Math.max(1, incrementMinutes);
    const totalSteps = Math.ceil(MINUTES_IN_DAY / step);
    return Array.from({ length: totalSteps }, (_, index) => {
      const totalMinutes = (index * step) % MINUTES_IN_DAY;
      const hour24 = Math.floor(totalMinutes / 60);
      const minutes = (totalMinutes % 60).toString().padStart(2, '0');
      return formatHour12(hour24, minutes);
    });
  }, [incrementMinutes]);
  const [startHour, setStartHour] = useState('');
  const minuteOptions = useMemo(() => {
    if (!startHour) return [];
    const baseMinutes = parseHour12ToMinutes(startHour);
    if (baseMinutes == null) return [];
    const step = Math.max(1, incrementMinutes);
    const increments = Math.ceil(MINUTES_IN_DAY / step);
    return Array.from({ length: increments }, (_, index) => {
      const totalMinutes = (baseMinutes + index * step) % MINUTES_IN_DAY;
      const hour24 = Math.floor(totalMinutes / 60);
      const minutes = (totalMinutes % 60).toString().padStart(2, '0');
      return formatHour12(hour24, minutes);
    });
  }, [startHour, incrementMinutes]);
  const [startMinute, setStartMinute] = useState('');
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
  const [clipboardProject, setClipboardProject] = useState(null);
  const [editingChipId, setEditingChipId] = useState(null);
  const [editingChipLabel, setEditingChipLabel] = useState('');
  const [editingChipIsCustom, setEditingChipIsCustom] = useState(false);
  const [editingCustomProjectId, setEditingCustomProjectId] = useState(null);
  const editingInputRef = useRef(null);
  const [colorEditorProjectId, setColorEditorProjectId] = useState(null);
  const [colorEditorColor, setColorEditorColor] = useState('#c9daf8');
  const colorInputRef = useRef(null);
  const [customProjects, setCustomProjects] = useState([]);
  const customSequenceRef = useRef(0);
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
  const draggingSleepChipIdRef = useRef(null);
  const dragAnchorOffsetRef = useRef(0);
  const transparentDragImageRef = useRef(null);
  const tableContainerRef = useRef(null);
  const tableElementRef = useRef(null);
  const cellMenuRef = useRef(null);
  const [tableRect, setTableRect] = useState(null);
  useEffect(() => {
    if (editingChipId && editingInputRef.current) {
      editingInputRef.current.focus();
      editingInputRef.current.select();
    }
  }, [editingChipId]);
  useEffect(() => {
    if (colorEditorProjectId && colorInputRef.current) {
      colorInputRef.current.focus();
    }
  }, [colorEditorProjectId]);
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
  }, [setSelectedBlockId]);
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
  }, [setSelectedBlockId]);
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
    window.addEventListener(STAGING_STORAGE_EVENT, handleStorage);
    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener(STAGING_STORAGE_EVENT, handleStorage);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [setSelectedBlockId]);
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
        setSelectedCell(null);
        setSelectedBlockId(chipId);
      }
      setIsDragging(true);
    },
    [getProjectChipById, rowMetrics, setSelectedCell]
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
    setSelectedCell(null);
    setSelectedBlockId(sourceChipId);
    setDragPreview(null);
    draggingSleepChipIdRef.current = null;
    setIsDragging(false);
    dragAnchorOffsetRef.current = 0;
  }, [dragPreview, getProjectChipById, setProjectChips, setSelectedCell]);
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
    setSelectedBlockId(null);
    setSelectedCell((prev) => {
      if (prev && prev.columnIndex === columnIndex && prev.rowId === rowId) {
        return null;
      }
      return { columnIndex, rowId };
    });
  }, [setSelectedBlockId]);
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
  const handleCellContextMenu = useCallback(
    (event, columnIndex, rowId) => {
      event.preventDefault();
      event.stopPropagation();
      if (columnIndex == null || rowId == null) return;
      const hasDay = Boolean(displayedWeekDays[columnIndex]);
      if (!hasDay) return;
      setSelectedCell({ columnIndex, rowId });
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
    [displayedWeekDays]
  );

  const cellMenuBlockId = useMemo(() => {
    const target = cellMenu ?? selectedCell;
    if (!target) return null;
    const { columnIndex, rowId } = target;
    if (columnIndex == null || !rowId) return null;
    const columnBlocks = getProjectChipsByColumnIndex(columnIndex);
    const block = columnBlocks.find((entry) => entry.startRowId === rowId);
    return block?.id ?? null;
  }, [cellMenu, selectedCell, getProjectChipsByColumnIndex]);

  const removableBlockId = cellMenuBlockId ?? selectedBlockId;
  const handleProjectSelection = useCallback(
    (projectId, options = {}) => {
      if (!projectId) return;
      const target = selectedCell ?? cellMenu;
      if (!target) return;
      const { columnIndex, rowId } = target;
      if (columnIndex == null || !rowId) return;
      const { startRowIdOverride, endRowIdOverride, displayLabelOverride } = options;
      const targetStartRowId = startRowIdOverride ?? rowId;
      const targetEndRowId = endRowIdOverride ?? targetStartRowId;
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
              endRowId: targetEndRowId,
              startRowId: targetStartRowId,
              displayLabel:
                displayLabelOverride != null ? displayLabelOverride : entry.displayLabel,
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
            startRowId: targetStartRowId,
            endRowId: targetEndRowId,
            projectId,
            ...(displayLabelOverride != null
              ? { displayLabel: displayLabelOverride }
              : {}),
          },
        ];
      });
      if (assignedId) {
        setSelectedBlockId(assignedId);
      }
      closeCellMenu();
      setSelectedCell(null);
    },
    [cellMenu, closeCellMenu, selectedCell, setProjectChips, setSelectedBlockId, setSelectedCell]
  );
  const handleCopySelectedBlock = useCallback(() => {
    if (!selectedBlockId) return;
    const block = getProjectChipById(selectedBlockId);
    if (!block) return;
    setClipboardProject({
      projectId: block.projectId ?? 'sleep',
      displayLabel: block.displayLabel ?? null,
      startRowId: block.startRowId,
      endRowId: block.endRowId,
    });
  }, [getProjectChipById, selectedBlockId]);
  const handlePasteIntoCell = useCallback(() => {
    if (!clipboardProject || !selectedCell) return;
    const baseRowId = selectedCell.rowId;
    if (!baseRowId) return;
    const rowIdx = rowIndexMap.get(baseRowId);
    if (rowIdx == null) return;
    const sourceStartIdx = rowIndexMap.get(
      clipboardProject.startRowId ?? clipboardProject.endRowId ?? baseRowId
    );
    const sourceEndIdx = rowIndexMap.get(
      clipboardProject.endRowId ?? clipboardProject.startRowId ?? baseRowId
    );
    if (sourceStartIdx == null || sourceEndIdx == null) return;
    const span = sourceEndIdx - sourceStartIdx;
    const targetEndIdx = Math.min(
      Math.max(rowIdx + span, 0),
      timelineRowIds.length - 1
    );
    const endRowId = timelineRowIds[targetEndIdx] ?? baseRowId;
    handleProjectSelection(clipboardProject.projectId, {
      startRowIdOverride: baseRowId,
      endRowIdOverride: endRowId,
      displayLabelOverride: clipboardProject.displayLabel ?? undefined,
    });
  }, [
    clipboardProject,
    selectedCell,
    handleProjectSelection,
    rowIndexMap,
    timelineRowIds,
  ]);
  const handleRemoveSelectedChip = useCallback(() => {
    if (!removableBlockId) return;
    setProjectChips((prev) => prev.filter((block) => block.id !== removableBlockId));
    setSelectedBlockId((prev) => (prev === removableBlockId ? null : prev));
    closeCellMenu();
  }, [closeCellMenu, removableBlockId, setProjectChips]);
  const handleCreateCustomProject = useCallback(() => {
    customSequenceRef.current += 1;
    const customId = `custom-${Date.now()}-${customSequenceRef.current}`;
    const label = `Custom ${customSequenceRef.current}`;
    const customProject = { id: customId, label: label.toUpperCase(), color: '#c9daf8' };
    setCustomProjects((prev) => [...prev, customProject]);
    handleProjectSelection(customId);
  }, [handleProjectSelection]);
  const handleDeleteCustomProject = useCallback(
    (projectId) => {
      if (!projectId) return;
      setCustomProjects((prev) => prev.filter((project) => project.id !== projectId));
      setProjectChips((prev) => prev.filter((block) => block.projectId !== projectId));
      if (colorEditorProjectId === projectId) {
        setColorEditorProjectId(null);
      }
      closeCellMenu();
    },
    [colorEditorProjectId, closeCellMenu]
  );
  const finishColorEdit = useCallback(() => {
    setColorEditorProjectId(null);
  }, []);
  const startColorEdit = useCallback((projectId, currentColor = '#c9daf8') => {
    setColorEditorProjectId(projectId);
    setColorEditorColor(currentColor || '#c9daf8');
  }, []);
  const handleColorChange = useCallback(
    (value) => {
      if (!colorEditorProjectId) return;
      setCustomProjects((prev) =>
        prev.map((project) =>
          project.id === colorEditorProjectId ? { ...project, color: value } : project
        )
      );
      setColorEditorColor(value);
      finishColorEdit();
    },
    [colorEditorProjectId, finishColorEdit]
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
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.defaultPrevented) return;
      if (!(event.metaKey || event.ctrlKey)) return;
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement
      ) {
        return;
      }
      if (target instanceof HTMLElement && target.isContentEditable) {
        return;
      }
      const key = event.key?.toLowerCase();
      if (key === 'c') {
        handleCopySelectedBlock();
        event.preventDefault();
      } else if (key === 'v') {
        handlePasteIntoCell();
        event.preventDefault();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleCopySelectedBlock, handlePasteIntoCell]);
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
  const dropdownProjects = useMemo(
    () => [...customProjects, ...highlightedProjects],
    [customProjects, highlightedProjects]
  );
  const projectMetadata = useMemo(() => {
    const map = new Map();
    map.set('sleep', {
      label: 'Sleep',
      color: '#d9d9d9',
      textColor: '#000000',
    });
    map.set('rest', {
      label: 'REST',
      color: '#666666',
      textColor: '#ffffff',
      fontWeight: 700,
    });
    map.set('buffer', {
      label: 'BUFFER',
      color: '#fe8afe',
      textColor: '#ffffff',
      fontWeight: 700,
    });
    dropdownProjects.forEach((project) => {
      map.set(project.id, {
        label: project.label,
        color: project.color || '#0f172a',
        textColor: '#ffffff',
      });
    });
    return map;
  }, [dropdownProjects]);
  const handleStartLabelEdit = useCallback(
    (chipId) => {
      const block = getProjectChipById(chipId);
      if (!block) return;
      const metadata = projectMetadata.get(block.projectId);
      const fallbackLabel = metadata?.label ?? block.projectId ?? 'Project';
      const isCustom = typeof block.projectId === 'string' && block.projectId.startsWith('custom-');
      const labelValue = block.displayLabel ?? fallbackLabel;
      setEditingChipIsCustom(isCustom);
      setEditingChipLabel(isCustom ? labelValue.toUpperCase() : labelValue);
      setEditingCustomProjectId(isCustom ? block.projectId : null);
      setEditingChipId(chipId);
    },
    [getProjectChipById, projectMetadata]
  );
  const handleConfirmLabelEdit = useCallback(() => {
    if (!editingChipId) return;
    const normalizedLabel = editingChipIsCustom
      ? editingChipLabel.toUpperCase()
      : editingChipLabel;
    setProjectChips((prev) =>
      prev.map((block) =>
        block.id === editingChipId ? { ...block, displayLabel: normalizedLabel } : block
      )
    );
    if (editingChipIsCustom && editingCustomProjectId) {
      setCustomProjects((prev) =>
        prev.map((project) =>
          project.id === editingCustomProjectId
            ? { ...project, label: normalizedLabel }
            : project
        )
      );
    }
    setEditingChipId(null);
    setEditingChipLabel('');
    setEditingChipIsCustom(false);
    setEditingCustomProjectId(null);
  }, [
    editingChipId,
    editingChipIsCustom,
    editingChipLabel,
    editingCustomProjectId,
    setProjectChips,
  ]);
  const handleCancelLabelEdit = useCallback(() => {
    setEditingChipId(null);
    setEditingChipLabel('');
    setEditingChipIsCustom(false);
    setEditingCustomProjectId(null);
  }, []);
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
  const restColumnTotals = useMemo(() => {
    const totals = projectColumnTotals.get('rest');
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
  const totalRestMinutes = useMemo(
    () => restColumnTotals.reduce((sum, value) => sum + value, 0),
    [restColumnTotals]
  );
  const workingColumnTotals = useMemo(() => {
    const totals = Array.from({ length: visibleColumnCount }, () => 0);
    projectColumnTotals.forEach((values, projectId) => {
      if (projectId === 'sleep' || projectId === 'rest' || projectId === 'buffer') return;
      if (!Array.isArray(values)) return;
      for (let idx = 0; idx < visibleColumnCount; idx += 1) {
        totals[idx] += values[idx] ?? 0;
      }
    });
    return totals;
  }, [projectColumnTotals, visibleColumnCount]);
  const totalWorkingMinutes = useMemo(
    () => workingColumnTotals.reduce((sum, value) => sum + value, 0),
    [workingColumnTotals]
  );
  const bufferColumnTotals = useMemo(() => {
    const totals = projectColumnTotals.get('buffer');
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
  const totalBufferMinutes = useMemo(
    () => bufferColumnTotals.reduce((sum, value) => sum + value, 0),
    [bufferColumnTotals]
  );
  const availableColumnTotals = useMemo(
    () =>
      Array.from({ length: visibleColumnCount }, (_, idx) => {
        const working = workingColumnTotals[idx] ?? 0;
        const buffer = bufferColumnTotals[idx] ?? 0;
        return working + buffer;
      }),
    [workingColumnTotals, bufferColumnTotals, visibleColumnCount]
  );
  const totalAvailableMinutes = useMemo(
    () => availableColumnTotals.reduce((sum, value) => sum + value, 0),
    [availableColumnTotals]
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
      const displayLabel = block.displayLabel ?? metadata?.label ?? 'Project';
      const backgroundColor = metadata?.color ?? '#d9d9d9';
      const textColor = metadata?.textColor ?? '#000';
      const fontWeight = metadata?.fontWeight ?? 600;
      const isActive = highlightedBlockId === block.id;
      const blockHeight = getBlockHeight(block.startRowId, block.endRowId);
      const isCustomProject =
        typeof block.projectId === 'string' && block.projectId.startsWith('custom-');
      const normalizedLabel = isCustomProject ? displayLabel.toUpperCase() : displayLabel;
      const isEditing = editingChipId === block.id;
      return (
        <div
          className="absolute left-0 top-0 flex w-full justify-center"
          style={{
            height: `${blockHeight}px`,
            zIndex: 10,
          }}
        >
          <div
            className={`relative flex h-full w-full cursor-move select-none items-center justify-center rounded border border-transparent px-2 py-1 text-center text-[11px] font-semibold shadow-sm ${
              isActive ? 'outline outline-[2px]' : ''
            }`}
            style={{
              pointerEvents:
                dragPreview && dragPreview.sourceChipId === chipId ? 'none' : 'auto',
              backgroundColor,
              color: textColor,
              fontWeight,
              ...(isActive ? { outlineColor: '#000', outlineOffset: 0 } : null),
            }}
            draggable={!resizingBlockId && !isEditing}
            onDragStart={(event) => {
              if (resizingBlockId) {
                event.preventDefault();
                return;
              }
              handleSleepDragStart(event, chipId);
            }}
            onClick={(event) => {
              event.stopPropagation();
              setSelectedCell(null);
              setSelectedBlockId((prev) => (prev === chipId ? null : chipId));
            }}
            onDoubleClick={(event) => {
              event.stopPropagation();
              handleStartLabelEdit(chipId);
            }}
          >
            {isEditing ? (
              <input
                ref={editingInputRef}
                className="w-full bg-white px-1 text-[11px] font-semibold text-slate-800 outline-none"
                value={editingChipLabel}
                onChange={(event) =>
                  setEditingChipLabel(
                    editingChipIsCustom ? event.target.value.toUpperCase() : event.target.value
                  )
                }
                onBlur={handleConfirmLabelEdit}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    handleConfirmLabelEdit();
                  } else if (event.key === 'Escape') {
                    event.preventDefault();
                    handleCancelLabelEdit();
                  }
                }}
              />
            ) : (
              normalizedLabel
            )}
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
      editingChipId,
      editingChipLabel,
      handleStartLabelEdit,
      handleConfirmLabelEdit,
      handleCancelLabelEdit,
      editingChipIsCustom,
      setSelectedCell,
      dragPreview,
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
  }, [dayColumnRects, dragPreview, getBlockHeight, rowIndexMap, rowMetrics, tableRect]);
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
        <div className="border-t border-[#e5e7eb] px-3 py-2">
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-[11px] font-semibold text-slate-800 hover:bg-[#f2fdf6]"
            onClick={handleCreateCustomProject}
          >
            <span
              className="inline-flex h-3 w-3 flex-shrink-0 rounded-full"
              style={{ backgroundColor: '#c9daf8' }}
            ></span>
            <span>CUSTOM</span>
          </button>
        </div>
        {dropdownProjects.length ? (
          <ul className="max-h-60 overflow-auto py-1 list-none">
                {dropdownProjects.map((project) => {
                  const isCustom = project.id.startsWith('custom-');
                  return (
                    <li key={project.id}>
                      <div className="flex items-center justify-between px-3 py-2">
                        <button
                          type="button"
                          className="flex items-center gap-2 text-left text-[11px] font-semibold text-slate-800 hover:bg-[#f2fdf6]"
                          onClick={() => handleProjectSelection(project.id)}
                        >
                          <span
                            className="inline-flex h-3 w-3 flex-shrink-0 rounded-full"
                            style={{ backgroundColor: project.color || '#0f172a' }}
                          ></span>
                          <span>
                            {isCustom ? project.label.toUpperCase() : project.label}
                          </span>
                        </button>
                        {isCustom ? (
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              className="flex items-center gap-1 rounded border border-[#cbd5f5] px-2 py-1 text-[9px] font-semibold text-slate-700 hover:bg-[#eef2ff]"
                              onClick={(event) => {
                                event.stopPropagation();
                                startColorEdit(project.id, project.color);
                              }}
                            >
                              <span
                                className="inline-flex h-3 w-3 flex-shrink-0 rounded-full border border-[#94a3b8]"
                                style={{ backgroundColor: project.color || '#c9daf8' }}
                              ></span>
                              <span>Edit</span>
                            </button>
                            <button
                              type="button"
                              className="flex items-center gap-1 rounded border border-[#fecaca] px-2 py-1 text-[9px] font-semibold text-[#b91c1c] hover:bg-[#fee2e2]"
                              onClick={(event) => {
                                event.stopPropagation();
                                handleDeleteCustomProject(project.id);
                              }}
                            >
                              <span
                                className="inline-flex h-3 w-3 flex-shrink-0 rounded-full border border-[#b91c1c]"
                                style={{ backgroundColor: '#fee2e2' }}
                              ></span>
                              <span>Delete</span>
                            </button>
                          </div>
                        ) : null}
                  </div>
                  {colorEditorProjectId === project.id ? (
                    <div className="px-3 py-1">
                      <input
                        ref={(node) => {
                          colorInputRef.current = node;
                        }}
                        type="color"
                        className="h-8 w-full cursor-pointer rounded border border-[#94a3b8] p-0"
                        value={colorEditorColor}
                        onClick={(event) => event.stopPropagation()}
                        onChange={(event) => handleColorChange(event.target.value)}
                        onBlur={finishColorEdit}
                      />
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="px-3 py-2 text-[11px] text-slate-500">No staged projects found</div>
        )}
        <div className="border-t border-[#e5e7eb] px-3 py-2">
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-[11px] font-semibold text-slate-800 hover:bg-[#f2fdf6]"
            onClick={() => handleProjectSelection('sleep')}
          >
            <span
              className="inline-flex h-3 w-3 flex-shrink-0 rounded-full"
              style={{ backgroundColor: '#d9d9d9' }}
            ></span>
            <span>Sleep</span>
          </button>
        </div>
        <div className="border-t border-[#e5e7eb] px-3 py-2">
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-[11px] font-semibold text-slate-800 hover:bg-[#f2fdf6]"
            onClick={() => handleProjectSelection('rest')}
          >
            <span
              className="inline-flex h-3 w-3 flex-shrink-0 rounded-full"
              style={{ backgroundColor: '#666666' }}
            ></span>
            <span>REST</span>
          </button>
        </div>
        <div className="border-t border-[#e5e7eb] px-3 py-2">
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-[11px] font-semibold text-slate-800 hover:bg-[#f2fdf6]"
            onClick={() => handleProjectSelection('buffer')}
          >
            <span
              className="inline-flex h-3 w-3 flex-shrink-0 rounded-full"
              style={{ backgroundColor: '#fe8afe' }}
            ></span>
            <span>BUFFER</span>
          </button>
        </div>
        <div className="border-t border-[#e5e7eb] px-3 py-2">
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-[11px] font-semibold text-slate-800 hover:bg-[#f2fdf6] disabled:text-slate-400 disabled:hover:bg-transparent"
            onClick={handleRemoveSelectedChip}
            disabled={!removableBlockId}
          >
            <span
              className="inline-flex h-3 w-3 flex-shrink-0 rounded-full"
              style={{ backgroundColor: removableBlockId ? '#ef4444' : '#d1d5db' }}
            ></span>
            <span>Remove chip</span>
          </button>
        </div>
      </div>
    );
  }, [
    cellMenu,
    handleProjectSelection,
    dropdownProjects,
    handleCreateCustomProject,
    handleDeleteCustomProject,
    handleRemoveSelectedChip,
    removableBlockId,
    startColorEdit,
    colorEditorProjectId,
    colorEditorColor,
    handleColorChange,
    finishColorEdit,
  ]);

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
                      onClick={hasDay ? () => toggleCellSelection(index, rowId) : undefined}
                      onContextMenu={
                        hasDay ? (event) => handleCellContextMenu(event, index, rowId) : undefined
                      }
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
                      onClick={hasDay ? () => toggleCellSelection(index, rowId) : undefined}
                      onContextMenu={
                        hasDay ? (event) => handleCellContextMenu(event, index, rowId) : undefined
                      }
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
                      onClick={hasDay ? () => toggleCellSelection(index, rowId) : undefined}
                      onContextMenu={
                        hasDay ? (event) => handleCellContextMenu(event, index, rowId) : undefined
                      }
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
                      onClick={hasDay ? () => toggleCellSelection(index, rowId) : undefined}
                      onContextMenu={
                        hasDay ? (event) => handleCellContextMenu(event, index, rowId) : undefined
                      }
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
              <tr
                className={`grid grid-cols-9 text-sm cursor-pointer ${
                  selectedSummaryRowId === 'rest-summary' ? 'outline outline-[2px]' : ''
                }`}
                style={{
                  backgroundColor: '#666666',
                  color: '#ffffff',
                  fontWeight: 700,
                  ...(selectedSummaryRowId === 'rest-summary'
                    ? { outlineColor: '#000', outlineOffset: 0 }
                    : null),
                }}
                tabIndex={0}
                onClick={() => toggleSummaryRowSelection('rest-summary')}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    toggleSummaryRowSelection('rest-summary');
                  }
                }}
              >
                <td
                  className="border border-[#e5e7eb] px-3 py-2 text-center"
                  style={{ backgroundColor: '#666666', color: '#ffffff', fontWeight: 700 }}
                >
                  REST
                </td>
                {displayedWeekDays.map((day, idx) => (
                  <td
                    key={`rest-row-${day}-${idx}`}
                    className="border border-[#e5e7eb] px-3 py-2 text-center"
                    style={{ backgroundColor: '#666666', color: '#ffffff', fontWeight: 700 }}
                  >
                    {formatDuration(restColumnTotals[idx] ?? 0)}
                  </td>
                ))}
                <td
                  className="border border-[#e5e7eb] px-3 py-2 text-center font-semibold"
                  style={{ backgroundColor: '#666666', color: '#ffffff', fontWeight: 700 }}
                >
                  {formatDuration(totalRestMinutes)}
                </td>
              </tr>
              <tr
                className="grid grid-cols-9"
                style={{ backgroundColor: '#ffffff', height: '14px' }}
              >
                {Array.from({ length: 9 }, (_, cellIndex) => (
                  <td
                    key={`spacer-${cellIndex}`}
                    className="px-1"
                    style={{ border: 0, backgroundColor: '#ffffff' }}
                  />
                ))}
              </tr>
              <tr
                className={`grid grid-cols-9 text-sm cursor-pointer ${
                  selectedSummaryRowId === 'working-summary' ? 'outline outline-[2px]' : ''
                }`}
                style={
                  selectedSummaryRowId === 'working-summary'
                    ? { outlineColor: '#000', outlineOffset: 0 }
                    : undefined
                }
                tabIndex={0}
                onClick={() => toggleSummaryRowSelection('working-summary')}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    toggleSummaryRowSelection('working-summary');
                  }
                }}
              >
                <td
                  className="border border-[#e5e7eb] px-3 py-2 text-center"
                  style={{
                    backgroundColor: '#b6d7a8',
                    color: '#0f172a',
                    fontWeight: 700,
                  }}
                >
                  Working Hours
                </td>
                {displayedWeekDays.map((day, idx) => (
                  <td
                    key={`working-row-${day}-${idx}`}
                    className="border border-[#e5e7eb] px-3 py-2 text-center text-[11px]"
                    style={{ backgroundColor: '#d9ead3' }}
                  >
                    {formatDuration(workingColumnTotals[idx] ?? 0)}
                  </td>
                ))}
                <td
                  className="border border-[#e5e7eb] px-3 py-2 text-center font-semibold text-[11px]"
                  style={{ backgroundColor: '#d9ead3' }}
                >
                  {formatDuration(totalWorkingMinutes)}
                </td>
              </tr>
              <tr
                className={`grid grid-cols-9 text-sm cursor-pointer ${
                  selectedSummaryRowId === 'buffer-summary' ? 'outline outline-[2px]' : ''
                }`}
                style={
                  selectedSummaryRowId === 'buffer-summary'
                    ? { outlineColor: '#000', outlineOffset: 0 }
                    : undefined
                }
                tabIndex={0}
                onClick={() => toggleSummaryRowSelection('buffer-summary')}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    toggleSummaryRowSelection('buffer-summary');
                  }
                }}
              >
                  <td
                    className="border border-[#e5e7eb] px-3 py-2 text-center text-[#000000]"
                    style={{
                      backgroundColor: '#ffffff',
                      fontWeight: 700,
                    }}
                  >
                    Buffer
                  </td>
                {displayedWeekDays.map((day, idx) => (
                  <td
                    key={`buffer-row-${day}-${idx}`}
                    className="border border-[#e5e7eb] px-3 py-2 text-center text-[11px]"
                    style={{ backgroundColor: '#ffffff' }}
                  >
                    {formatDuration(bufferColumnTotals[idx] ?? 0)}
                  </td>
                ))}
                <td
                  className="border border-[#e5e7eb] px-3 py-2 text-center font-semibold text-[11px]"
                  style={{ backgroundColor: '#ffffff' }}
                >
                  {formatDuration(totalBufferMinutes)}
                </td>
              </tr>
              <tr
                className={`grid grid-cols-9 text-sm cursor-pointer ${
                  selectedSummaryRowId === 'available-summary' ? 'outline outline-[2px]' : ''
                }`}
                style={
                  selectedSummaryRowId === 'available-summary'
                    ? { outlineColor: '#000', outlineOffset: 0 }
                    : undefined
                }
                tabIndex={0}
                onClick={() => toggleSummaryRowSelection('available-summary')}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    toggleSummaryRowSelection('available-summary');
                  }
                }}
              >
                <td
                  className="border border-[#e5e7eb] px-3 py-2 text-center"
                  style={{ backgroundColor: '#ffffff', color: '#000000', fontWeight: 700 }}
                >
                  Available Hours
                </td>
                {displayedWeekDays.map((day, idx) => (
                  <td
                    key={`available-row-${day}-${idx}`}
                    className="border border-[#e5e7eb] px-3 py-2 text-center text-[11px]"
                    style={{ backgroundColor: '#ffffff' }}
                  >
                    {formatDuration(availableColumnTotals[idx] ?? 0)}
                  </td>
                ))}
                <td
                  className="border border-[#e5e7eb] px-3 py-2 text-center font-semibold text-[11px]"
                  style={{ backgroundColor: '#ffffff' }}
                >
                  {formatDuration(totalAvailableMinutes)}
                </td>
              </tr>
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
              onChange={(event) => onIncrementChange(parseInt(event.target.value, 10) || 60)}
            >
              <option value={15}>15 minutes</option>
              <option value={30}>30 minutes</option>
              <option value={60}>1 hour</option>
            </select>
          </div>
        </div>
      ) : null}
    </div>
  );
}
