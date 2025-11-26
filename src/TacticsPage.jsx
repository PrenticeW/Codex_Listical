import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import NavigationBar from './NavigationBar';

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
const SLEEP_DRAG_TYPE = 'application/x-sleep-day';
const buildInitialSleepBlocks = (days) =>
  days.map((day) => ({
    day,
    startRowId: 'sleep-start',
    endRowId: 'sleep-start',
  }));
const DEFAULT_SLEEP_CELL_HEIGHT = 44;

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
  const [incrementMinutes, setIncrementMinutes] = useState(15);
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
  const [sleepBlocks, setSleepBlocks] = useState(() =>
    buildInitialSleepBlocks(displayedWeekDays)
  );
  const [activeSleepDay, setActiveSleepDay] = useState(null);
  const [resizingSleepDay, setResizingSleepDay] = useState(null);
  const [rowMetrics, setRowMetrics] = useState({});
  const [dragPreview, setDragPreview] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const draggingSleepDayRef = useRef(null);
  const dragAnchorOffsetRef = useRef(0);
  const transparentDragImageRef = useRef(null);
  const tableRef = useRef(null);
  const [tableRect, setTableRect] = useState(null);
  useEffect(() => {
    const handleDragEnd = () => {
      draggingSleepDayRef.current = null;
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
    setSleepBlocks((prev) => {
      const existing = new Map(prev.map((entry) => [entry.day, entry]));
      return displayedWeekDays.map(
        (day) =>
          existing.get(day) ?? {
            day,
            startRowId: 'sleep-start',
            endRowId: 'sleep-start',
          }
      );
    });
    setActiveSleepDay((prev) =>
      prev && displayedWeekDays.includes(prev) ? prev : null
    );
    setResizingSleepDay((prev) =>
      prev && displayedWeekDays.includes(prev) ? prev : null
    );
  }, [displayedWeekDays]);
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
  const sleepBlockByDay = useMemo(
    () => new Map(sleepBlocks.map((entry) => [entry.day, entry])),
    [sleepBlocks]
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
    if (!resizingSleepDay) return undefined;
    const handleMouseMove = (event) => {
      const pointerY = event.clientY + (window.scrollY || 0);
      const targetRowId = findRowIdByPointerY(pointerY);
      if (!targetRowId) return;
      setSleepBlocks((prev) =>
        prev.map((entry) => {
          if (entry.day !== resizingSleepDay) return entry;
          const startIdx = rowIndexMap.get(entry.startRowId);
          const targetIdx = rowIndexMap.get(targetRowId);
          if (startIdx == null || targetIdx == null) return entry;
          const clampedIdx = Math.max(targetIdx, startIdx);
          return {
            ...entry,
            endRowId: timelineRowIds[clampedIdx] ?? entry.startRowId,
          };
        })
      );
    };
    const handleMouseUp = () => setResizingSleepDay(null);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [findRowIdByPointerY, resizingSleepDay, rowIndexMap, timelineRowIds]);
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
      if (!tableRef.current) return;
      const rect = tableRef.current.getBoundingClientRect();
      setTableRect(rect);
    };
    updateTableRect();
    window.addEventListener('resize', updateTableRect);
    return () => {
      window.removeEventListener('resize', updateTableRect);
    };
  }, [rowMetrics]);
  const updateDragPreview = useCallback(
    (dayLabel, rowId) => {
      if (!dayLabel || !rowId) return;
      const block = sleepBlockByDay.get(dayLabel);
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
        day: dayLabel,
        startRowId: rowId,
        endRowId: timelineRowIds[nextEndIdx] ?? rowId,
      });
    },
    [rowIndexMap, sleepBlockByDay, timelineRowIds]
  );
  useEffect(() => {
    if (!isDragging) return undefined;
    const handleDragOver = (event) => {
      const pointerY = event.clientY + (window.scrollY || 0);
      const adjustedY = pointerY - (dragAnchorOffsetRef.current || 0);
      const targetRowId = findRowIdByPointerY(adjustedY);
      if (targetRowId) {
        updateDragPreview(draggingSleepDayRef.current, targetRowId);
      }
    };
    window.addEventListener('dragover', handleDragOver);
    return () => {
      window.removeEventListener('dragover', handleDragOver);
    };
  }, [findRowIdByPointerY, isDragging, updateDragPreview]);
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
    (event, dayLabel) => {
      if (!dayLabel) return;
      event.dataTransfer.setData(SLEEP_DRAG_TYPE, dayLabel);
      event.dataTransfer.effectAllowed = 'move';
      if (event.dataTransfer.setDragImage) {
        const dragImage = transparentDragImageRef.current;
        if (dragImage) {
          event.dataTransfer.setDragImage(dragImage, 0, 0);
        }
      }
      draggingSleepDayRef.current = dayLabel;
      const block = sleepBlockByDay.get(dayLabel);
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
          day: dayLabel,
          startRowId: block.startRowId,
          endRowId: block.endRowId,
        });
      }
      setActiveSleepDay(dayLabel);
    },
    [rowMetrics, setActiveSleepDay, sleepBlockByDay]
  );
  const handleSleepDragOver = useCallback(
    (event) => {
      if (!event.dataTransfer?.types?.includes(SLEEP_DRAG_TYPE)) {
        return;
      }
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      const targetDay = event.currentTarget.dataset.day;
      const rowId = event.currentTarget.dataset.rowId;
      if (
        !targetDay ||
        !rowId ||
        draggingSleepDayRef.current !== targetDay
      ) {
        return;
      }
      updateDragPreview(targetDay, rowId);
    },
    [updateDragPreview]
  );
  const applyDragPreview = useCallback(
    (dayLabel) => {
      if (!dragPreview || dragPreview.day !== dayLabel) return;
      setSleepBlocks((prev) =>
        prev.map((entry) =>
          entry.day === dayLabel
            ? {
                ...entry,
                startRowId: dragPreview.startRowId,
                endRowId: dragPreview.endRowId,
              }
            : entry
        )
      );
      setDragPreview(null);
      draggingSleepDayRef.current = null;
      setIsDragging(false);
      dragAnchorOffsetRef.current = 0;
    },
    [dragPreview, setSleepBlocks]
  );
  const handleSleepDrop = useCallback(
    (event) => {
      const transferDay =
        event.dataTransfer?.getData(SLEEP_DRAG_TYPE) ?? draggingSleepDayRef.current;
      if (!transferDay) return;
      event.preventDefault();
      applyDragPreview(transferDay);
    },
    [applyDragPreview]
  );
  const handleTableDrop = useCallback(
    (event) => {
      if (!isDragging || !dragPreview) return;
      event.preventDefault();
      const transferDay =
        event.dataTransfer?.getData(SLEEP_DRAG_TYPE) ?? draggingSleepDayRef.current;
      if (!transferDay) return;
      applyDragPreview(transferDay);
    },
    [applyDragPreview, dragPreview, isDragging]
  );
  const handleTableDragOver = useCallback(
    (event) => {
      if (isDragging) {
        event.preventDefault();
      }
    },
    [isDragging]
  );
  const handleResizeMouseDown = useCallback(
    (event, dayLabel) => {
      event.stopPropagation();
      event.preventDefault();
      if (!dayLabel) return;
      setActiveSleepDay(dayLabel);
      setResizingSleepDay(dayLabel);
    },
    [setActiveSleepDay, setResizingSleepDay]
  );
  const renderSleepLabel = useCallback(
    (dayLabel, rowId) => {
      if (!dayLabel) return null;
      const block = sleepBlockByDay.get(dayLabel);
      if (!block || block.startRowId !== rowId) return null;
      const isActive = activeSleepDay === dayLabel;
      const blockHeight = getBlockHeight(block.startRowId, block.endRowId);
      return (
        <div
          className="absolute left-0 top-0 flex w-full justify-center"
          style={{
            height: `${blockHeight}px`,
            zIndex: 10,
            pointerEvents: 'none',
          }}
        >
          <div
            className={`relative w-full cursor-move select-none rounded border border-transparent px-2 py-1 text-center text-[11px] font-semibold text-black shadow-sm bg-[#d9d9d9] ${
              isActive ? 'outline outline-[2px]' : ''
            }`}
            style={{
              pointerEvents:
                dragPreview && dragPreview.day === dayLabel ? 'none' : 'auto',
              ...(isActive ? { outlineColor: '#000', outlineOffset: 0 } : null),
            }}
            draggable={!resizingSleepDay}
            onDragStart={(event) => {
              if (resizingSleepDay) {
                event.preventDefault();
                return;
              }
              handleSleepDragStart(event, dayLabel);
            }}
            onClick={(event) => {
              event.stopPropagation();
              setActiveSleepDay((prev) => (prev === dayLabel ? null : dayLabel));
            }}
          >
            Sleep
            {isActive ? (
              <button
                type="button"
                aria-label="Stretch sleep block"
                onMouseDown={(event) => handleResizeMouseDown(event, dayLabel)}
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
      activeSleepDay,
      handleResizeMouseDown,
      handleSleepDragStart,
      getBlockHeight,
      resizingSleepDay,
      rowIndexMap,
      sleepBlockByDay,
    ]
  );
  const placeholderSleepValues = useMemo(() => Array(7).fill(0), []);
  const placeholderSleepTotal = useMemo(
    () => placeholderSleepValues.reduce((sum, value) => sum + value, 0),
    [placeholderSleepValues]
  );
  const renderDragOutline = useCallback(() => {
    if (!dragPreview || !tableRect) return null;
    const outlineHeight = getBlockHeight(
      dragPreview.startRowId,
      dragPreview.endRowId
    );
    const columnIndex = displayedWeekDays.indexOf(dragPreview.day);
    if (columnIndex < 0) return null;
    const baseRowIdx = rowIndexMap.get(dragPreview.startRowId);
    if (baseRowIdx == null) return null;
    const metrics = rowMetrics[dragPreview.startRowId];
    if (!metrics) return null;
    const columnWidth = (tableRect.width ?? 0) / 9;
    const left = (columnIndex + 1) * columnWidth;
    const top = metrics.top - tableRect.top;
    return (
      <div className="pointer-events-none absolute inset-0 z-20">
        <div
          className="absolute"
          style={{
            top,
            left,
            width: columnWidth,
            height: outlineHeight,
          }}
        >
          <div className="h-full w-full rounded border-2 border-dashed border-[#111827] bg-white/60" />
        </div>
      </div>
    );
  }, [displayedWeekDays, dragPreview, getBlockHeight, rowIndexMap, rowMetrics, tableRect]);

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
          ref={tableRef}
          className="relative rounded border border-[#ced3d0] bg-white p-4 shadow-sm"
          onDrop={handleTableDrop}
          onDragOver={handleTableDragOver}
        >
          {renderDragOutline()}
          <table className="w-full border-collapse text-[11px] text-slate-800">
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
                {Array.from({ length: 8 }, (_, index) => {
                  const dayLabel = displayedWeekDays[index] ?? '';
                  const hasDay = Boolean(dayLabel);
                  const block = hasDay ? sleepBlockByDay.get(dayLabel) : null;
                  const rowId = 'sleep-start';
                  const isCovered = block ? isRowWithinBlock(rowId, block) : false;
                  const showLabel = block && block.startRowId === rowId;
                  return (
                    <td
                      key={`time-row-${index}`}
                      className="relative border border-[#e5e7eb] px-3 py-2 text-center overflow-visible"
                      style={isCovered ? { backgroundColor: '#d9d9d9' } : undefined}
                      data-row-id={rowId}
                      data-day={hasDay ? dayLabel : undefined}
                      onDragOver={hasDay ? handleSleepDragOver : undefined}
                      onDrop={hasDay ? handleSleepDrop : undefined}
                    >
                      {showLabel ? renderSleepLabel(dayLabel, rowId) : null}
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
                  {Array.from({ length: 8 }, (_, index) => {
                    const dayLabel = displayedWeekDays[index] ?? '';
                    const hasDay = Boolean(dayLabel);
                    const rowId = `hour-${hourValue}`;
                    const block = hasDay ? sleepBlockByDay.get(dayLabel) : null;
                    const isCovered = block ? isRowWithinBlock(rowId, block) : false;
                    const showLabel = block && block.startRowId === rowId;
                    return (
                      <td
                        key={`hour-${hourValue}-${index}`}
                        className="relative border border-[#e5e7eb] px-3 py-2 text-center overflow-visible"
                        style={isCovered ? { backgroundColor: '#d9d9d9' } : undefined}
                        data-row-id={rowId}
                        data-day={hasDay ? dayLabel : undefined}
                        onDragOver={hasDay ? handleSleepDragOver : undefined}
                        onDrop={hasDay ? handleSleepDrop : undefined}
                      >
                        {showLabel ? renderSleepLabel(dayLabel, rowId) : null}
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
                {Array.from({ length: 8 }, (_, index) => {
                  const dayLabel = displayedWeekDays[index] ?? '';
                  const hasDay = Boolean(dayLabel);
                  const rowId = 'sleep-end';
                  const block = hasDay ? sleepBlockByDay.get(dayLabel) : null;
                  const isCovered = block ? isRowWithinBlock(rowId, block) : false;
                  const showLabel = block && block.startRowId === rowId;
                  return (
                    <td
                      key={`minute-row-${index}`}
                      className="relative border border-[#e5e7eb] px-3 py-2 text-center overflow-visible"
                      style={isCovered ? { backgroundColor: '#d9d9d9' } : undefined}
                      data-row-id={rowId}
                      data-day={hasDay ? dayLabel : undefined}
                      onDragOver={hasDay ? handleSleepDragOver : undefined}
                      onDrop={hasDay ? handleSleepDrop : undefined}
                    >
                      {showLabel ? renderSleepLabel(dayLabel, rowId) : null}
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
                  {Array.from({ length: 8 }, (_, index) => {
                    const dayLabel = displayedWeekDays[index] ?? '';
                    const hasDay = Boolean(dayLabel);
                    const rowId = `trailing-${rowIdx}`;
                    const block = hasDay ? sleepBlockByDay.get(dayLabel) : null;
                    const isCovered = block ? isRowWithinBlock(rowId, block) : false;
                    const showLabel = block && block.startRowId === rowId;
                    return (
                      <td
                        key={`trailing-${rowIdx}-${index}`}
                        className="relative border border-[#e5e7eb] px-3 py-2 text-center overflow-visible"
                        style={isCovered ? { backgroundColor: '#d9d9d9' } : undefined}
                        data-row-id={rowId}
                        data-day={hasDay ? dayLabel : undefined}
                        onDragOver={hasDay ? handleSleepDragOver : undefined}
                        onDrop={hasDay ? handleSleepDrop : undefined}
                      >
                        {showLabel ? renderSleepLabel(dayLabel, rowId) : null}
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
              <tr className="grid grid-cols-9 text-sm">
                <td
                  className="border border-[#e5e7eb] px-3 py-2 text-center"
                  style={{ backgroundColor: '#d9d9d9', color: '#000', fontWeight: 700 }}
                >
                  Sleep
                </td>
                {placeholderSleepValues.map((value, idx) => (
                  <td
                    key={`sleep-row-${idx}`}
                    className="border border-[#e5e7eb] px-3 py-2 text-center"
                    style={{ backgroundColor: '#efefef' }}
                  >
                    {value.toFixed(2)}
                  </td>
                ))}
                <td
                  className="border border-[#e5e7eb] px-3 py-2 text-center font-semibold"
                  style={{ backgroundColor: '#efefef' }}
                >
                  {placeholderSleepTotal.toFixed(2)}
                </td>
              </tr>
            </tbody>
          </table>
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
              onChange={(event) => onIncrementChange(parseInt(event.target.value, 10) || 15)}
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
