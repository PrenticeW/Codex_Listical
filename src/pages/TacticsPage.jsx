import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import useCommandPattern from '../hooks/planner/useCommandPattern';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { useYear } from '../contexts/YearContext';
import NavigationBar from '../components/planner/NavigationBar';
import { loadStagingState, STAGING_STORAGE_EVENT, STAGING_STORAGE_KEY } from '../lib/stagingStorage';
import { SECTION_CONFIG } from '../utils/staging/sectionConfig';
import { parseEstimateLabelToMinutes, formatMinutesToHHmm } from '../utils/staging/planTableHelpers';
import { pickCustomChipColour } from '../utils/staging/projectColour';
import { saveTacticsMetrics } from '../lib/tacticsMetricsStorage';
import { getYearInfo } from '../lib/yearMetadataStorage';
import { saveStartDate } from '../utils/planner/storage';
import {
  loadTacticsSettings,
  saveTacticsSettings,
  loadTacticsChipsState,
  saveTacticsChipsState,
  loadTacticsColumnWidths,
  saveTacticsColumnWidths,
  TACTICS_SEND_TO_SYSTEM_EVENT,
  TACTICS_SEND_TO_SYSTEM_TS_KEY,
} from '../lib/tacticsStorage';
import { buildScheduleLayout } from '../ScheduleChips';
import usePageSize from '../hooks/usePageSize';
import ColourPicker from '../components/ColourPicker';
import ScheduleItemPanel from '../components/ScheduleItemPanel';
import { Pencil } from 'lucide-react';

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
    dayName: day,
    startRowId: 'sleep-start',
    endRowId: 'sleep-start',
    projectId: 'sleep',
  }));
const DEFAULT_SLEEP_CELL_HEIGHT = 16;
let chipSequence = 0;
const createProjectChipId = () => {
  chipSequence += 1;
  return `chip-${chipSequence}`;
};
const updateChipSequenceFromList = (chips = []) => {
  chips.forEach((chip) => {
    const match = typeof chip?.id === 'string' ? chip.id.match(/chip-(\d+)$/) : null;
    if (!match) return;
    const value = parseInt(match[1], 10);
    if (Number.isFinite(value) && value > chipSequence) {
      chipSequence = value;
    }
  });
};
const logDragDebug = () => {}; // Debug logging disabled


const formatHour12 = (hour, minutes = '00') => {
  const period = hour >= 12 ? 'PM' : 'AM';
  const normalizedHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${normalizedHour}:${minutes} ${period}`;
};

const formatTime = (hour, minutes = '00', { use24Hour = false, showAmPm = true } = {}) => {
  if (use24Hour) {
    return `${hour.toString().padStart(2, '0')}:${minutes}`;
  }
  const period = hour >= 12 ? 'PM' : 'AM';
  const normalizedHour = hour % 12 === 0 ? 12 : hour % 12;
  return showAmPm
    ? `${normalizedHour}:${minutes} ${period}`
    : `${normalizedHour}:${minutes}`;
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

// Returns the clock time in minutes (0–1439) for a given row ID.
// trailingMinuteRows is the array of total-minutes values for trailing-N rows.
const rowIdToClockMinutes = (rowId, trailingMinuteRows) => {
  if (!rowId) return null;
  if (rowId === 'sleep-start') return null;
  if (rowId === 'sleep-end') return null;
  if (rowId.startsWith('hour-')) {
    const h = parseInt(rowId.slice(5), 10);
    return Number.isFinite(h) ? h * 60 : null;
  }
  if (rowId.startsWith('trailing-')) {
    const idx = parseInt(rowId.slice(9), 10);
    return Number.isFinite(idx) ? (trailingMinuteRows[idx] ?? null) : null;
  }
  return null;
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

const minutesToHourMinuteDecimal = (minutes) => {
  if (!Number.isFinite(minutes) || minutes <= 0) return 0;
  const normalized = Math.max(0, Math.round(minutes));
  const hours = Math.floor(normalized / 60);
  const remainingMinutes = normalized % 60;
  return hours + remainingMinutes / 100;
};

// Parses a "hours.minutes" style value (e.g. "1.30" meaning 1h 30m) into minutes.
const parseTimeValueToMinutes = (value) => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.round(value));
  }
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    const [hoursPart, minutesPart = '0'] = trimmed.split('.');
    const hours = parseInt(hoursPart, 10);
    const minutes = parseInt(minutesPart.padEnd(2, '0').slice(0, 2), 10);
    if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
    return Math.max(0, hours * 60 + minutes);
  }
  return null;
};

const dedupeChipsById = (chips = []) => {
  const seen = new Set();
  const result = [];
  chips.forEach((chip) => {
    const id = chip?.id;
    if (!id || seen.has(id)) return;
    seen.add(id);
    result.push(chip);
  });
  return result;
};


function ChipLabel({ normalizedLabel, baseFontSize, wrap, largeTimeStr, isEditing, textSizeScale, chipHeight, clockStr, bottomOffset = '2px' }) {
  const [hideNumber, setHideNumber] = useState(false);

  const handleTextHeight = useCallback((h) => {
    const rows = (largeTimeStr ? 1 : 0) + (clockStr ? 1 : 0) || 1;
    const numberZone = (14 * textSizeScale + 2) * rows + 4;
    setHideNumber(h + numberZone > chipHeight);
  }, [textSizeScale, chipHeight, largeTimeStr, clockStr]);

  return (
    <>
      <FitText text={normalizedLabel} maxFontSize={baseFontSize} wrap={wrap} onTextHeight={handleTextHeight} />
      {(largeTimeStr || clockStr) && !isEditing && !hideNumber ? (
        <span
          style={{
            position: 'absolute',
            bottom: bottomOffset,
            left: 0,
            right: 0,
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '4px',
            lineHeight: 1,
            pointerEvents: 'none',
          }}
        >
          {largeTimeStr ? (
            <span style={{ fontSize: `${14 * textSizeScale}px`, opacity: 0.9, color: 'inherit' }}>
              {largeTimeStr}
            </span>
          ) : null}
          {clockStr ? (
            <span style={{ fontSize: `${11 * textSizeScale}px`, opacity: 0.9, color: 'inherit' }}>
              {clockStr}
            </span>
          ) : null}
        </span>
      ) : null}
    </>
  );
}

function FitText({ text, maxFontSize, minFontSize = maxFontSize * 0.5, style, wrap = false, onTextHeight }) {
  const spanRef = useRef(null);
  const [fontSize, setFontSize] = useState(maxFontSize);

  useLayoutEffect(() => {
    const el = spanRef.current;
    if (!el) return;
    let size = maxFontSize;
    el.style.fontSize = `${size}px`;
    // When wrapping is allowed, check scrollHeight vs offsetHeight instead
    if (wrap) {
      while (el.scrollHeight > el.offsetHeight && size > minFontSize) {
        size = Math.max(minFontSize, size - 0.5);
        el.style.fontSize = `${size}px`;
      }
    } else {
      while (el.scrollWidth > el.offsetWidth && size > minFontSize) {
        size = Math.max(minFontSize, size - 0.5);
        el.style.fontSize = `${size}px`;
      }
    }
    setFontSize(size);
    if (onTextHeight) {
      if (wrap) {
        // Temporarily shrink to auto height to measure natural text block height
        const prev = el.style.height;
        el.style.height = 'auto';
        onTextHeight(el.scrollHeight);
        el.style.height = prev;
      } else {
        onTextHeight(el.scrollHeight);
      }
    }
  });

  return (
    <span
      ref={spanRef}
      style={{
        display: wrap ? 'flex' : 'block',
        flexDirection: wrap ? 'column' : undefined,
        alignItems: wrap ? 'center' : undefined,
        justifyContent: wrap ? 'center' : undefined,
        width: '100%',
        height: wrap ? '100%' : undefined,
        overflow: 'hidden',
        whiteSpace: wrap ? 'normal' : 'nowrap',
        textAlign: wrap ? 'center' : undefined,
        wordBreak: wrap ? 'break-word' : undefined,
        lineHeight: wrap ? 1.1 : undefined,
        fontSize: `${fontSize}px`,
        ...style,
      }}
    >
      {text}
    </span>
  );
}

export default function TacticsPage() {
  const location = useLocation();
  const currentPath = location.pathname;
  const { currentYear } = useYear();
  const initialTacticsSettings = useMemo(() => loadTacticsSettings(), []);
  const [startDay, setStartDay] = useState(initialTacticsSettings.startDay);
  const [incrementMinutes, setIncrementMinutes] = useState(
    initialTacticsSettings.incrementMinutes
  );

  // Page-specific size setting
  const { sizeScale: textSizeScale } = usePageSize('plan');
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
  const [startHour, setStartHour] = useState(initialTacticsSettings.startHour);
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
  const [startMinute, setStartMinute] = useState(initialTacticsSettings.startMinute);
  const [showAmPm, setShowAmPm] = useState(initialTacticsSettings.showAmPm);
  const [use24Hour, setUse24Hour] = useState(initialTacticsSettings.use24Hour);
  const [chipDisplayModes, setChipDisplayModes] = useState(initialTacticsSettings.chipDisplayModes);
  const [summaryRowOrder, setSummaryRowOrder] = useState(initialTacticsSettings.summaryRowOrder);

  const handleToggleChipDisplayFlag = useCallback((projectId, flag) => {
    setChipDisplayModes((prev) => {
      const current = prev[projectId] && typeof prev[projectId] === 'object' ? prev[projectId] : { duration: false, clock: false };
      return { ...prev, [projectId]: { ...current, [flag]: !current[flag] } };
    });
  }, []);

  useEffect(() => {
    saveTacticsSettings({ startHour, startMinute, incrementMinutes, showAmPm, use24Hour, startDay, chipDisplayModes, summaryRowOrder });
  }, [startHour, startMinute, incrementMinutes, showAmPm, use24Hour, startDay, chipDisplayModes, summaryRowOrder]);
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
  const [projectChips, setProjectChips] = useState(() => {
    // Load saved chips from storage first
    const chipState = loadTacticsChipsState(currentYear);
    if (chipState.projectChips) {
      const deduped = dedupeChipsById(chipState.projectChips);
      updateChipSequenceFromList(deduped);
      // Backfill dayName for chips saved before this field was introduced
      return deduped.map((chip) => {
        if (chip.dayName != null || chip.columnIndex >= DAY_COLUMN_COUNT) return chip;
        return { ...chip, dayName: displayedWeekDays[chip.columnIndex] ?? null };
      });
    }
    // Fall back to initial sleep blocks if no saved state
    return buildInitialSleepBlocks(displayedWeekDays);
  });
  const [selectedBlockIds, setSelectedBlockIds] = useState(() => new Set());
  // Derived: last/primary selected ID (for drag, resize, highlight, paste target)
  const selectedBlockId = useMemo(() => {
    const arr = [...selectedBlockIds];
    return arr.length > 0 ? arr[arr.length - 1] : null;
  }, [selectedBlockIds]);
  const setSelectedBlockId = useCallback((idOrUpdater) => {
    setSelectedBlockIds((prev) => {
      const next = typeof idOrUpdater === 'function' ? idOrUpdater(prev.size > 0 ? [...prev][prev.size - 1] : null) : idOrUpdater;
      return next ? new Set([next]) : new Set();
    });
  }, []);
  const [resizingBlockId, setResizingBlockId] = useState(null);
  const [rowMetrics, setRowMetrics] = useState({});
  const [dragPreview, setDragPreview] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [columnRects, setColumnRects] = useState([]);
  const [stagingProjects, setStagingProjects] = useState([]);
  const highlightedProjectsCount = useMemo(
    () =>
      stagingProjects.filter((project) => {
        const colorValue = typeof project?.color === 'string' ? project.color.trim() : '';
        if (!colorValue) return false;
        return colorValue.toLowerCase() !== '#f3f4f6';
      }).length,
    [stagingProjects]
  );
  const stagingColumnCount = highlightedProjectsCount + 1;
  const maxChipColumnIndex = useMemo(
    () =>
      projectChips.reduce(
        (maxValue, chip) =>
          Number.isFinite(chip?.columnIndex) && chip.columnIndex > maxValue
            ? chip.columnIndex
            : maxValue,
        -1
      ),
    [projectChips]
  );
  const totalColumnCount = Math.max(DAY_COLUMN_COUNT + stagingColumnCount, maxChipColumnIndex + 1);
  const [selectedSummaryRowId, setSelectedSummaryRowId] = useState(null);
  useEffect(() => {
    const handler = (e) => {
      if (!e.target.closest('[data-summary-row]')) {
        setSelectedSummaryRowId(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);
  const [selectedCell, setSelectedCell] = useState(null);
  const [cellMenu, setCellMenu] = useState(null);
  const [scheduleItemPanelOpen, setScheduleItemPanelOpen] = useState(false);

  // Column widths for resizing (index 0 is the time column, rest are day/project columns)
  const [columnWidths, setColumnWidths] = useState(() => {
    const saved = loadTacticsColumnWidths(currentYear);
    if (saved) return saved;
    // Default: 120px for time column, 140px for all other columns
    return Array.from({ length: 30 }, (_, i) => i === 0 ? 120 : 140);
  });

  // Save column widths to storage when they change
  useEffect(() => {
    saveTacticsColumnWidths(columnWidths, currentYear);
  }, [columnWidths, currentYear]);


  const [clipboardProject, setClipboardProject] = useState(null);
  const [editingChipId, setEditingChipId] = useState(null);
  const [editingChipLabel, setEditingChipLabel] = useState('');
  const [editingChipIsCustom, setEditingChipIsCustom] = useState(false);
  const [editingChipIsTime, setEditingChipIsTime] = useState(false);
  const [editingChipMinutes, setEditingChipMinutes] = useState('');
  const [chipTimeOverrides, setChipTimeOverrides] = useState(() => {
    const chipState = loadTacticsChipsState(currentYear);
    return chipState.chipTimeOverrides ?? {};
  });
  const editingInputRef = useRef(null);
  const editingMinutesRef = useRef(null);
  const editingChipContainerRef = useRef(null);
  const [colorEditorProjectId, setColorEditorProjectId] = useState(null);
  const [colorEditorColor, setColorEditorColor] = useState('#c9daf8');
  const colorInputRef = useRef(null);
  const [menuRenamingChipId, setMenuRenamingChipId] = useState(null);
  const [menuRenamingLabel, setMenuRenamingLabel] = useState('');
  const menuRenameInputRef = useRef(null);
  const [menuRenamingProjectId, setMenuRenamingProjectId] = useState(null);
  const [menuRenamingProjectLabel, setMenuRenamingProjectLabel] = useState('');
  const menuRenameProjectInputRef = useRef(null);
  const [pendingCustomId, setPendingCustomId] = useState(null);
  const [pendingCustomLabel, setPendingCustomLabel] = useState('');
  const pendingCustomInputRef = useRef(null);
  const [customProjects, setCustomProjects] = useState(() => {
    // Load saved custom projects from storage first
    const chipState = loadTacticsChipsState(currentYear);
    return chipState.customProjects || [];
  });

  const { undoStack, redoStack, executeCommand, undo, redo } = useCommandPattern();

  // Refs kept in sync so command execute/undo closures can read current state
  const projectChipsRef = useRef(projectChips);
  const customProjectsRef = useRef(customProjects);
  const chipTimeOverridesRef = useRef(chipTimeOverrides);
  useEffect(() => { projectChipsRef.current = projectChips; }, [projectChips]);
  useEffect(() => { customProjectsRef.current = customProjects; }, [customProjects]);
  useEffect(() => { chipTimeOverridesRef.current = chipTimeOverrides; }, [chipTimeOverrides]);
  const displayedWeekDaysRef = useRef(displayedWeekDays);
  useEffect(() => { displayedWeekDaysRef.current = displayedWeekDays; }, [displayedWeekDays]);

  // Remap day-column chips to their correct columnIndex when the start day changes
  const handleStartDayChange = useCallback((newStartDay) => {
    const newStartIndex = DAYS_OF_WEEK.indexOf(newStartDay);
    if (newStartIndex < 0) { setStartDay(newStartDay); return; }
    const newWeek = Array.from({ length: 7 }, (_, i) => DAYS_OF_WEEK[(newStartIndex + i) % DAYS_OF_WEEK.length]);
    setProjectChips((prev) =>
      prev.map((chip) => {
        if (chip.columnIndex >= DAY_COLUMN_COUNT || !chip.dayName) return chip;
        const newColIdx = newWeek.indexOf(chip.dayName);
        if (newColIdx < 0 || newColIdx === chip.columnIndex) return chip;
        return { ...chip, columnIndex: newColIdx };
      })
    );
    setStartDay(newStartDay);
  }, []);

  const highlightedProjects = useMemo(() => {
    if (!stagingProjects.length) return [];
    return stagingProjects
      .filter((project) => project.addedToPlan === true)
      .map((project) => {
        const nickname = (project.projectNickname || '').trim();
        const label = nickname || project.projectName || project.text || 'Project';
        return {
          id: project.id,
          label,
          color: project.color,
          planSummary: project.planSummary,
          projectTagline: project.projectTagline ?? '',
        };
      });
  }, [stagingProjects]);
  const scheduleLayout = useMemo(
    () => buildScheduleLayout(highlightedProjects),
    [highlightedProjects]
  );
  const customSequenceRef = useRef(0);
  const getProjectChipsByColumnIndex = useCallback(
    (columnIndex) => dedupeChipsById(projectChips.filter((block) => block.columnIndex === columnIndex)),
    [projectChips]
  );
  // Chips that cover at least one fully-hidden chip (same column + start + end)
  const coveringChipIds = useMemo(() => {
    const deduped = dedupeChipsById(projectChips);
    const covering = new Set();
    const groups = new Map();
    deduped.forEach((chip) => {
      const key = `${chip.columnIndex}|${chip.startRowId}|${chip.endRowId ?? chip.startRowId}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(chip.id);
    });
    groups.forEach((ids) => {
      if (ids.length > 1) {
        // The last chip in DOM order is the visible one covering the rest
        covering.add(ids[ids.length - 1]);
      }
    });
    return covering;
  }, [projectChips]);
  const getProjectChipById = useCallback(
    (blockId) => dedupeChipsById(projectChips).find((block) => block.id === blockId) ?? null,
    [projectChips]
  );
  const draggingSleepChipIdRef = useRef(null);
  const dragAnchorOffsetRef = useRef(0);
  const transparentDragImageRef = useRef(null);
  const dragScrollRafRef = useRef(null);
  const dragScrollSpeedRef = useRef(0);
  const tableContainerRef = useRef(null);
  const tableElementRef = useRef(null);
  const navBarRef = useRef(null);
  const [navBarHeight, setNavBarHeight] = useState(0);
  const headerContainerRef = useRef(null);
  const cellMenuRef = useRef(null);
  const hasLoadedInitialState = useRef(false);
  const [tableRect, setTableRect] = useState(null);
  useEffect(() => {
    // Ensure we always have a transparent drag image to avoid browser-specific cancellations
    if (!transparentDragImageRef.current && typeof document !== 'undefined') {
      const img = document.createElement('div');
      img.style.width = '1px';
      img.style.height = '1px';
      img.style.opacity = '0';
      img.style.position = 'fixed';
      img.style.top = '0';
      img.style.left = '0';
      document.body.appendChild(img);
      transparentDragImageRef.current = img;
    }
    // Global drag listeners to see if events reach the window (helps debug when drop targets are not firing)
    let dragOverCount = 0;
    const handleWindowDragOver = (event) => {
      dragOverCount += 1;
      if (dragOverCount > 10) return; // prevent spam
      logDragDebug('Window dragover', {
        target: event.target?.tagName,
        hasDataTransfer: Boolean(event.dataTransfer),
        types: event.dataTransfer?.types,
        client: { x: event.clientX, y: event.clientY },
      });
    };
    const handleWindowDrop = (event) => {
      logDragDebug('Window drop', {
        target: event.target?.tagName,
        hasDataTransfer: Boolean(event.dataTransfer),
        types: event.dataTransfer?.types,
        client: { x: event.clientX, y: event.clientY },
      });
    };
    window.addEventListener('dragover', handleWindowDragOver);
    window.addEventListener('drop', handleWindowDrop);
    if (editingChipId && editingInputRef.current) {
      editingInputRef.current.focus();
      editingInputRef.current.select();
    }
    return () => {
      window.removeEventListener('dragover', handleWindowDragOver);
      window.removeEventListener('drop', handleWindowDrop);
    };
  }, [editingChipId]);
  useEffect(() => {
    if (colorEditorProjectId && colorInputRef.current) {
      colorInputRef.current.focus();
    }
  }, [colorEditorProjectId]);
  useEffect(() => {
    if (menuRenamingChipId && menuRenameInputRef.current) {
      menuRenameInputRef.current.focus();
      menuRenameInputRef.current.select();
    }
  }, [menuRenamingChipId]);
  useEffect(() => {
    if (menuRenamingProjectId && menuRenameProjectInputRef.current) {
      menuRenameProjectInputRef.current.focus();
      menuRenameProjectInputRef.current.select();
    }
  }, [menuRenamingProjectId]);
  useEffect(() => {
    const handleDragEnd = () => {
      draggingSleepChipIdRef.current = null;
      setDragPreview(null);
      setIsDragging(false);
      dragAnchorOffsetRef.current = 0;
      dragScrollSpeedRef.current = 0;
      if (dragScrollRafRef.current) {
        cancelAnimationFrame(dragScrollRafRef.current);
        dragScrollRafRef.current = null;
      }
    };
    window.addEventListener('dragend', handleDragEnd);
    return () => {
      window.removeEventListener('dragend', handleDragEnd);
    };
  }, [setSelectedBlockId]);
  useEffect(() => {
    const SCROLL_ZONE = 120; // px from left/right edge of container to trigger scroll
    const MAX_SPEED = 20; // max px per frame
    const scrollLoop = () => {
      const speed = dragScrollSpeedRef.current;
      if (speed !== 0 && tableContainerRef.current) {
        tableContainerRef.current.scrollLeft += speed;
      }
      dragScrollRafRef.current = requestAnimationFrame(scrollLoop);
    };
    const handleDragOverScroll = (event) => {
      if (!draggingSleepChipIdRef.current) return;
      const container = tableContainerRef.current;
      if (!container) return;
      const { clientX } = event;
      const rect = container.getBoundingClientRect();
      const distFromLeft = clientX - rect.left;
      const distFromRight = rect.right - clientX;
      if (distFromLeft < SCROLL_ZONE && distFromLeft >= 0) {
        dragScrollSpeedRef.current = -MAX_SPEED * (1 - distFromLeft / SCROLL_ZONE);
      } else if (distFromRight < SCROLL_ZONE && distFromRight >= 0) {
        dragScrollSpeedRef.current = MAX_SPEED * (1 - distFromRight / SCROLL_ZONE);
      } else {
        dragScrollSpeedRef.current = 0;
      }
    };
    dragScrollRafRef.current = requestAnimationFrame(scrollLoop);
    window.addEventListener('dragover', handleDragOverScroll);
    return () => {
      window.removeEventListener('dragover', handleDragOverScroll);
      if (dragScrollRafRef.current) {
        cancelAnimationFrame(dragScrollRafRef.current);
        dragScrollRafRef.current = null;
      }
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
  }, [setSelectedBlockId]);
  // Load initial state when year changes (not on first mount, since state initializers handle that)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Skip on first mount - state initializers already loaded the data
    if (!hasLoadedInitialState.current) {
      hasLoadedInitialState.current = true;

      // Load staging projects on first mount
      const state = loadStagingState(currentYear);
      setStagingProjects(Array.isArray(state?.shortlist) ? state.shortlist : []);
      return;
    }

    const readProjects = () => {
      const state = loadStagingState(currentYear);
      setStagingProjects(Array.isArray(state?.shortlist) ? state.shortlist : []);
    };

    // Load tactics chips for current year when year changes
    const chipState = loadTacticsChipsState(currentYear);
    const weekDays = displayedWeekDaysRef.current;
    if (chipState.projectChips) {
      const dedupedChips = dedupeChipsById(chipState.projectChips);
      updateChipSequenceFromList(dedupedChips);
      // Backfill dayName for chips saved before this field was introduced
      setProjectChips(dedupedChips.map((chip) => {
        if (chip.dayName != null || chip.columnIndex >= DAY_COLUMN_COUNT) return chip;
        return { ...chip, dayName: weekDays[chip.columnIndex] ?? null };
      }));
    } else {
      // Reset to initial sleep blocks if no saved chips for this year
      setProjectChips(buildInitialSleepBlocks(weekDays));
    }
    if (chipState.customProjects) {
      setCustomProjects(chipState.customProjects);
    } else {
      setCustomProjects([]);
    }

    // Always reload projects for current year
    readProjects();
  }, [currentYear]);

  // Set up storage event listeners
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const readProjects = () => {
      const state = loadStagingState(currentYear);
      setStagingProjects(Array.isArray(state?.shortlist) ? state.shortlist : []);
    };

    const handleStorage = (event) => {
      // Check for year-specific staging keys (staging-year-{yearNumber}-shortlist) or legacy key
      if (event?.key && !event.key.startsWith('staging-year-') && event.key !== STAGING_STORAGE_KEY) return;
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
  }, [currentYear]);
  useEffect(() => {
    setProjectChips((prev) => {
      const nextBlocks = dedupeChipsById(prev);
      // Track columns that already have a default sleep chip (by ID), regardless of position
      const trackedColumns = new Set(
        nextBlocks
          .filter((entry) => typeof entry.id === 'string' && /^sleep-\d+$/.test(entry.id))
          .map((entry) => entry.columnIndex)
      );
      for (let columnIndex = 0; columnIndex < displayedWeekDays.length; columnIndex += 1) {
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
  }, [displayedWeekDays, totalColumnCount]);


  useEffect(() => {
    setSelectedBlockIds((prev) => {
      const next = new Set([...prev].filter((id) => projectChips.some((block) => block.id === id)));
      return next.size === prev.size ? prev : next;
    });
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

  // Keep default sleep blocks (sleep-0, sleep-1, ...) spanning from sleep-start to the last hour row
  // when the timeline actually changes (bed time, wake time, or increment changes).
  // Skips on initial mount so saved positions are preserved across refreshes.
  const prevTimelineForSleepRef = useRef(null);
  useEffect(() => {
    const prevTimeline = prevTimelineForSleepRef.current;
    prevTimelineForSleepRef.current = timelineRowIds;
    // Skip on first mount — saved chip positions should be preserved
    if (prevTimeline === null) return;
    // Skip if timeline didn't actually change (use value equality, not reference equality,
    // because useMemo caches are cleared on hot reload producing a new array identity
    // even when the values are identical — reference equality would falsely trigger a reset)
    if (
      prevTimeline.length === timelineRowIds.length &&
      prevTimeline.every((id, i) => id === timelineRowIds[i])
    ) return;
    // Find the last hour-* row — that's the row just before sleep-end
    const lastHourRow = [...timelineRowIds].reverse().find((id) => id.startsWith('hour-'));
    if (!lastHourRow) return;
    setProjectChips((prev) =>
      prev.map((entry) => {
        // Only reset the built-in per-column sleep chips, not user-created ones
        if (!/^sleep-\d+$/.test(entry.id)) return entry;
        return { ...entry, startRowId: 'sleep-start', endRowId: lastHourRow };
      })
    );
  }, [timelineRowIds]);


  const rowIndexMap = useMemo(
    () => new Map(timelineRowIds.map((rowId, index) => [rowId, index])),
    [timelineRowIds]
  );

  // One-time backfill: set durationMinutes on day-column chips that are missing it.
  // This handles chips saved before durationMinutes was introduced.
  const hasDurationBackfilledRef = useRef(false);
  useEffect(() => {
    if (hasDurationBackfilledRef.current) return;
    if (!timelineRowIds.length || !rowIndexMap.size || !incrementMinutes) return;
    hasDurationBackfilledRef.current = true;
    setProjectChips((prev) => {
      let changed = false;
      const next = prev.map((chip) => {
        if (chip.durationMinutes != null) return chip;
        if (chip.columnIndex >= DAY_COLUMN_COUNT) return chip;
        const duration = getBlockDuration(chip, rowIndexMap, timelineRowIds, incrementMinutes);
        if (!duration) return chip;
        changed = true;
        return { ...chip, durationMinutes: duration };
      });
      return changed ? next : prev;
    });
  }, [timelineRowIds, rowIndexMap, incrementMinutes]);

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
              ...(entry.projectId === 'sleep' ? { userModified: true } : {}),
            };
          });
          if (!updated) {
            setResizingBlockId(null);
            return prev;
          }
          return next;
        });
    };
    const handleMouseUp = () => {
      setProjectChips((prev) => {
        const chip = prev.find((c) => c.id === resizingBlockId);
        if (
          chip &&
          chip.id.startsWith('schedule-chip-') &&
          chip.id.includes('-extra-chip-') &&
          chip.columnIndex < 8
        ) {
          const startIdx = rowIndexMap.get(chip.startRowId);
          const endIdx = rowIndexMap.get(chip.endRowId);
          if (startIdx != null && endIdx != null) {
            const rowCount = Math.abs(endIdx - startIdx) + 1;
            const newDuration = rowCount * incrementMinutes;
            if (newDuration !== chip.durationMinutes) {
              // Clear any time override so durationMinutes is the source of truth
              setChipTimeOverrides((prev) => {
                if (prev[resizingBlockId] == null) return prev;
                const next = { ...prev };
                delete next[resizingBlockId];
                return next;
              });
              return prev.map((c) =>
                c.id === resizingBlockId ? { ...c, durationMinutes: newDuration } : c
              );
            }
          }
        }
        return prev;
      });
      setResizingBlockId(null);
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [findRowIdByPointerY, getProjectChipById, incrementMinutes, resizingBlockId, rowIndexMap, timelineRowIds]);
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
    textSizeScale,
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
      const ordered = Array.from({ length: totalColumnCount }, (_, idx) => rectMap.get(idx) ?? null);
      setColumnRects(ordered);
      logDragDebug('Column rects measured', ordered.map((entry, idx) => ({ idx, ...entry })));
    };
    const scheduleMeasure = () => {
      if (animationFrame != null) return;
      animationFrame = window.requestAnimationFrame(() => {
        animationFrame = null;
        measureColumns();
      });
    };
    scheduleMeasure();
    const containerEl = tableContainerRef.current;
    if (containerEl) {
      containerEl.addEventListener('scroll', scheduleMeasure);
    }
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
      if (containerEl) {
        containerEl.removeEventListener('scroll', scheduleMeasure);
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
  }, [displayedWeekDays, totalColumnCount]);
  const updateDragPreview = useCallback(
    (targetColumnIndex, rowId) => {
      logDragDebug('Update preview request', { targetColumnIndex, rowId });
      if (targetColumnIndex == null || Number.isNaN(targetColumnIndex) || !rowId) {
        logDragDebug('Preview skipped: bad input', { targetColumnIndex, rowId });
        return;
      }
      const sourceChipId = draggingSleepChipIdRef.current;
      if (!sourceChipId) {
        logDragDebug('Preview skipped: no source chip');
        return;
      }
      const block = getProjectChipById(sourceChipId);
      if (!block) {
        logDragDebug('Preview skipped: missing block', { sourceChipId });
        return;
      }
      const startIdx = rowIndexMap.get(block.startRowId);
      const endIdx = rowIndexMap.get(block.endRowId);
      const targetIdx = rowIndexMap.get(rowId);
      if (startIdx == null || endIdx == null || targetIdx == null) {
        logDragDebug('Preview skipped: missing row index', {
          startIdx,
          endIdx,
          targetIdx,
          rowId,
        });
        return;
      }
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
      logDragDebug('Preview updated', {
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
      logDragDebug('Drag start', {
        chipId,
        isDragging,
        hasPreview: Boolean(dragPreview),
        client: { x: event.clientX, y: event.clientY },
      });
      setIsDragging(true);
      event.dataTransfer.setData(SLEEP_DRAG_TYPE, chipId);
      // Some browsers require at least one plain-text payload to initiate drag
      event.dataTransfer.setData('text/plain', chipId);
      event.dataTransfer.effectAllowed = 'move';
      if (event.dataTransfer.setDragImage) {
        const dragImage = transparentDragImageRef.current;
        if (dragImage) {
          event.dataTransfer.setDragImage(dragImage, 0, 0);
        }
      }
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
          logDragDebug('Anchor offset set', {
            chipId,
            rowHeight,
            pointerY,
            offset: normalizedOffset,
          });
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
    },
    [getProjectChipById, rowMetrics, setSelectedCell]
  );
  const handleSleepDragOver = useCallback(
    (event) => {
      event.preventDefault();
      logDragDebug('Cell drag over', {
        rowId: event.currentTarget.dataset.rowId,
        columnIndex: event.currentTarget.dataset.dayColumn,
      });
      if (!draggingSleepChipIdRef.current) return;
      event.dataTransfer.dropEffect = 'move';
      const rowId = event.currentTarget.dataset.rowId;
      const columnIndexValue = event.currentTarget.dataset.dayColumn;
      if (!rowId || columnIndexValue == null) {
        logDragDebug('Cell drag over skipped: missing row/column', { rowId, columnIndexValue });
        return;
      }
      const columnIndex = parseInt(columnIndexValue, 10);
      if (Number.isNaN(columnIndex)) {
        logDragDebug('Cell drag over skipped: NaN column', { columnIndexValue });
        return;
      }
      updateDragPreview(columnIndex, rowId);
    },
    [updateDragPreview]
  );
  const applyDragPreview = useCallback(() => {
    if (!dragPreview) return;
    const { sourceChipId, targetColumnIndex, startRowId, endRowId } = dragPreview;
    logDragDebug('Applying preview', {
      sourceChipId,
      targetColumnIndex,
      startRowId,
      endRowId,
    });
    if (targetColumnIndex == null || Number.isNaN(targetColumnIndex)) return;
    const sourceBlock = getProjectChipById(sourceChipId);
    if (!sourceBlock) return;

    const prevChips = projectChipsRef.current;
    const computeNextChips = (prev) => {
      const targetIndex = prev.findIndex((entry) => entry.id === sourceChipId);
      if (targetIndex < 0) return prev;
      const next = [...prev];
      const target = next[targetIndex];
      next[targetIndex] = {
        ...target,
        columnIndex: targetColumnIndex,
        dayName: targetColumnIndex < DAY_COLUMN_COUNT ? (displayedWeekDays[targetColumnIndex] ?? null) : null,
        startRowId,
        endRowId,
        startMinutes: rowIdToClockMinutes(startRowId, trailingMinuteRows),
        ...(target.projectId === 'sleep' ? { userModified: true } : {}),
      };

      // When a schedule chip lands in a day column, remove its canonical project-column
      // chip so the project row no longer shows it as available.
      const droppedInDayColumn = targetColumnIndex < DAY_COLUMN_COUNT;
      const isScheduleChip = target.projectId &&
        target.projectId !== 'sleep' &&
        target.projectId !== 'rest' &&
        target.projectId !== 'buffer';

      if (droppedInDayColumn && isScheduleChip) {
        const projectId = target.projectId;
        const prefix = `schedule-chip-${projectId}-`;
        const rest = sourceChipId.slice(prefix.length);
        const itemIdx = parseInt(rest, 10);
        if (Number.isFinite(itemIdx)) {
          const canonicalId = `schedule-chip-${projectId}-${itemIdx}`;
          const canonicalIdx = next.findIndex((c) => c.id === canonicalId);
          if (canonicalIdx >= 0) {
            next.splice(canonicalIdx, 1);
          }
        }
      }

      return next;
    };
    const nextChips = computeNextChips(prevChips);

    executeCommand({
      execute: () => setProjectChips(nextChips),
      undo: () => setProjectChips(prevChips),
    });
    setSelectedCell(null);
    setSelectedBlockId(sourceChipId);
    setDragPreview(null);
    draggingSleepChipIdRef.current = null;
    setIsDragging(false);
    dragAnchorOffsetRef.current = 0;
    logDragDebug('Preview applied and cleared');
  }, [
    dragPreview,
    executeCommand,
    getProjectChipById,
    setProjectChips,
    setSelectedCell,
    trailingMinuteRows,
  ]);
  const handleSleepDrop = useCallback(
    (event) => {
      if (!draggingSleepChipIdRef.current) return;
      event.preventDefault();
      logDragDebug('Sleep drop on cell', {
        rowId: event.currentTarget.dataset?.rowId,
        columnIndex: event.currentTarget.dataset?.dayColumn,
      });
      applyDragPreview();
    },
    [applyDragPreview]
  );
  const handleTableDrop = useCallback(
    (event) => {
      if (!draggingSleepChipIdRef.current || !dragPreview) return;
      event.preventDefault();
      logDragDebug('Table drop', {
        pointer: { x: event.clientX, y: event.clientY },
        dragPreview,
      });
      applyDragPreview();
    },
    [applyDragPreview, dragPreview]
  );
  const handleRootDragOver = useCallback((event) => {
    event.preventDefault();
    logDragDebug('Root dragover', {
      target: event.target?.tagName,
      types: event.dataTransfer?.types,
      client: { x: event.clientX, y: event.clientY },
    });
  }, []);
  const handleRootDrop = useCallback((event) => {
    event.preventDefault();
    logDragDebug('Root drop', {
      target: event.target?.tagName,
      types: event.dataTransfer?.types,
      client: { x: event.clientX, y: event.clientY },
    });
  }, []);
  const handleTableDragOver = useCallback(
    (event) => {
      event.preventDefault();
      logDragDebug('Table drag over', {
        isDragging,
        dayColumns: columnRects.length,
        pointer: { x: event.clientX, y: event.clientY },
      });
      if (!draggingSleepChipIdRef.current) return;
      const pointerY = event.clientY + (window.scrollY || 0);
      const adjustedY = pointerY - (dragAnchorOffsetRef.current || 0);
      const targetRowId = findRowIdByPointerY(adjustedY);
      if (!targetRowId) {
        logDragDebug('Table drag over: no targetRowId', { adjustedY });
        return;
      }
      const pointerX = event.clientX + (window.scrollX || 0);
      let dayIndex = -1;
      for (let idx = 0; idx < columnRects.length; idx += 1) {
        const rect = columnRects[idx];
        if (!rect) continue;
        if (pointerX >= rect.left && pointerX <= rect.right) {
          dayIndex = idx;
          break;
        }
      }
      const isInteractiveColumn =
        dayIndex >= 0 &&
        dayIndex < totalColumnCount &&
        (dayIndex >= DAY_COLUMN_COUNT || Boolean(displayedWeekDays[dayIndex]));
      if (!isInteractiveColumn) {
        logDragDebug('Table drag over: column not interactive', { dayIndex });
        return;
      }
      logDragDebug('Table drag mapped to', {
        targetRowId,
        dayIndex,
        pointer: { x: pointerX, y: pointerY },
      });
      updateDragPreview(dayIndex, targetRowId);
    },
    [columnRects, displayedWeekDays, findRowIdByPointerY, totalColumnCount, updateDragPreview]
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
  const summaryDragRef = useRef(null);
  const [summaryDragOverId, setSummaryDragOverId] = useState(null);
  const handleSummaryDragStart = useCallback((e, id) => {
    summaryDragRef.current = id;
    e.dataTransfer.effectAllowed = 'move';
  }, []);
  const handleSummaryDragOver = useCallback((e, id) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setSummaryDragOverId(id);
  }, []);
  const handleSummaryDragLeave = useCallback((e) => {
    // Only clear when leaving the row entirely, not when moving between child cells
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setSummaryDragOverId(null);
    }
  }, []);
  const handleSummaryDrop = useCallback((e, targetId, currentIds) => {
    e.preventDefault();
    setSummaryDragOverId(null);
    const sourceId = summaryDragRef.current;
    summaryDragRef.current = null;
    if (!sourceId || sourceId === targetId) return;
    setSummaryRowOrder((prev) => {
      const base = prev ?? currentIds;
      const from = base.indexOf(sourceId);
      const to = base.indexOf(targetId);
      if (from === -1 || to === -1) return base;
      const next = [...base];
      next.splice(from, 1);
      next.splice(to, 0, sourceId);
      return next;
    });
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
    setMenuRenamingProjectId(null);
    setMenuRenamingProjectLabel('');
  }, []);
  const handleCellContextMenu = useCallback(
    (event, columnIndex, rowId) => {
      event.preventDefault();
      event.stopPropagation();
      if (columnIndex == null || rowId == null) return;
      const isInteractiveColumn =
        columnIndex >= 0 &&
        columnIndex < totalColumnCount &&
        (columnIndex >= DAY_COLUMN_COUNT || Boolean(displayedWeekDays[columnIndex]));
      if (!isInteractiveColumn) return;
      setSelectedCell({ columnIndex, rowId });
      const cellRect = event.currentTarget.getBoundingClientRect();
      const MENU_WIDTH = 260;
      const VIEWPORT_PADDING = 8;
      const stickyHeaderBottom = navBarRef.current
        ? navBarRef.current.getBoundingClientRect().bottom
        : 0;
      // Clamp left so menu doesn't spill off the right edge of the viewport
      const rawLeft = cellRect.left;
      const maxLeft = window.innerWidth - MENU_WIDTH - VIEWPORT_PADDING;
      const left = Math.min(Math.max(rawLeft, VIEWPORT_PADDING), maxLeft);
      // Decide whether to open below or above the cell
      const spaceBelow = window.innerHeight - cellRect.bottom - VIEWPORT_PADDING;
      const spaceAbove = cellRect.top - stickyHeaderBottom - VIEWPORT_PADDING;
      const openAbove = spaceBelow < 200 && spaceAbove > spaceBelow;
      const maxHeight = Math.floor((openAbove ? spaceAbove : spaceBelow) - 4);
      const top = openAbove
        ? cellRect.top - 4  // menu will use `bottom` anchor instead
        : Math.max(cellRect.bottom + 4, stickyHeaderBottom + VIEWPORT_PADDING);
      setColorEditorProjectId(null);
      setCellMenu({
        columnIndex,
        rowId,
        position: { top, left, width: cellRect.width, openAbove, maxHeight },
      });
    },
    [displayedWeekDays, totalColumnCount]
  );

  const cellMenuBlockId = useMemo(() => {
    const target = cellMenu ?? selectedCell;
    if (!target) return null;
    const { columnIndex, rowId } = target;
    if (columnIndex == null || !rowId) return null;
    const columnBlocks = getProjectChipsByColumnIndex(columnIndex);
    const block = columnBlocks.find((entry) => entry.startRowId === rowId) ?? columnBlocks.find((entry) => isRowWithinBlock(rowId, entry));
    return block?.id ?? null;
  }, [cellMenu, selectedCell, getProjectChipsByColumnIndex, isRowWithinBlock]);

  const removableBlockId = cellMenuBlockId ?? selectedBlockId;
  const handleProjectSelection = useCallback(
    (projectId, options = {}) => {
      if (!projectId) return;
      const target = cellMenu ?? selectedCell;
      if (!target) return;
      const { columnIndex, rowId } = target;
      if (columnIndex == null || !rowId) return;
      const { startRowIdOverride, endRowIdOverride, displayLabelOverride } = options;
      const targetStartRowId = startRowIdOverride ?? rowId;
      const targetEndRowId = endRowIdOverride ?? targetStartRowId;

      const prevChips = projectChipsRef.current;
      let assignedId = null;
      let nextChips;
      let updated = false;
      const mapped = prevChips.map((entry) => {
        if (entry.columnIndex === columnIndex && entry.startRowId === rowId) {
          updated = true;
          assignedId = entry.id;
          return {
            ...entry,
            projectId,
            endRowId: targetEndRowId,
            startRowId: targetStartRowId,
            displayLabel:
              displayLabelOverride != null ? displayLabelOverride : null,
          };
        }
        return entry;
      });
      if (updated) {
        nextChips = mapped;
      } else {
        const chipId = createProjectChipId();
        assignedId = chipId;
        nextChips = [
          ...prevChips,
          {
            id: chipId,
            columnIndex,
            dayName: columnIndex < DAY_COLUMN_COUNT ? (displayedWeekDays[columnIndex] ?? null) : null,
            startRowId: targetStartRowId,
            endRowId: targetEndRowId,
            projectId,
            ...(displayLabelOverride != null
              ? { displayLabel: displayLabelOverride }
              : {}),
          },
        ];
      }

      executeCommand({
        execute: () => setProjectChips(nextChips),
        undo: () => setProjectChips(prevChips),
      });
      if (assignedId) {
        setSelectedBlockId(assignedId);
      }
      closeCellMenu();
      setSelectedCell(null);
    },
    [cellMenu, closeCellMenu, executeCommand, selectedCell, setProjectChips, setSelectedBlockId, setSelectedCell]
  );
  const handleCopySelectedBlock = useCallback(() => {
    if (selectedBlockIds.size === 0) return;
    // Collect all selected chips, sorted by their row index so paste order is top-to-bottom
    const blocks = [...selectedBlockIds]
      .map((id) => getProjectChipById(id))
      .filter(Boolean)
      .sort((a, b) => {
        const ai = rowIndexMap.get(a.startRowId) ?? 0;
        const bi = rowIndexMap.get(b.startRowId) ?? 0;
        return ai - bi;
      });
    if (blocks.length === 0) return;
    setClipboardProject(
      blocks.map((block) => {
        const timeOverride = chipTimeOverrides[block.id] ?? null;
        // For schedule chips, derive the effective minutes from the schedule item's time value
        // so that chips with sub-increment durations (e.g. 15 min on a 60-min grid) are
        // preserved correctly on paste. block.durationMinutes may be clamped to incrementMinutes
        // by buildAndAddScheduleItemChip, so it can't be trusted as the semantic time.
        let effectiveDurationMinutes = timeOverride ?? block.durationMinutes ?? null;
        if (timeOverride == null && block.id.startsWith('schedule-chip-')) {
          const extraMarker = block.id.indexOf('-extra-chip-');
          const idForParsing = extraMarker !== -1 ? block.id.slice(0, extraMarker) : block.id;
          const itemIdxMatch = idForParsing.match(/-(\d+)$/);
          const itemIdx = itemIdxMatch ? parseInt(itemIdxMatch[1], 10) : null;
          if (itemIdx != null) {
            const scheduleItems = scheduleLayout?.scheduleItemsByProject?.get(block.projectId) ?? [];
            const scheduleItem = scheduleItems[itemIdx];
            if (scheduleItem) {
              const parsedMins = parseEstimateLabelToMinutes(scheduleItem.timeValue);
              if (Number.isFinite(parsedMins) && parsedMins > 0) {
                effectiveDurationMinutes = parsedMins;
              }
            }
          }
        }
        // Capture itemIdx so pasted chips get a schedule-chip-style ID and count toward quota
        let scheduleItemIdx = null;
        if (block.id.startsWith('schedule-chip-')) {
          const extraMarker = block.id.indexOf('-extra-chip-');
          const idForIdx = extraMarker !== -1 ? block.id.slice(0, extraMarker) : block.id;
          const idxMatch = idForIdx.match(/-(\d+)$/);
          if (idxMatch) scheduleItemIdx = parseInt(idxMatch[1], 10);
        }
        return {
          projectId: block.projectId ?? 'sleep',
          displayLabel: block.displayLabel ?? null,
          startRowId: block.startRowId,
          endRowId: block.endRowId,
          timeOverride,
          durationMinutes: effectiveDurationMinutes,
          ...(scheduleItemIdx != null ? { scheduleItemIdx } : {}),
        };
      })
    );
  }, [getProjectChipById, selectedBlockIds, rowIndexMap, chipTimeOverrides, scheduleLayout]);
  const handlePasteIntoCell = useCallback(() => {
    if (!clipboardProject || !selectedCell) return;
    const baseRowId = selectedCell.rowId;
    if (!baseRowId) return;
    const baseRowIdx = rowIndexMap.get(baseRowId);
    if (baseRowIdx == null) return;

    // Normalise clipboard to always be an array
    const entries = Array.isArray(clipboardProject) ? clipboardProject : [clipboardProject];
    if (entries.length === 0) return;

    const prevChips = projectChipsRef.current;
    const prevOverrides = chipTimeOverridesRef.current;
    const { columnIndex } = selectedCell;
    let cursorIdx = baseRowIdx;
    const newChips = [];
    const overridesToAdd = {};

    entries.forEach((entry) => {
      const sourceStartIdx = rowIndexMap.get(entry.startRowId ?? entry.endRowId ?? baseRowId) ?? 0;
      const sourceEndIdx = rowIndexMap.get(entry.endRowId ?? entry.startRowId ?? baseRowId) ?? 0;
      const span = Math.max(0, sourceEndIdx - sourceStartIdx);
      const targetStartIdx = cursorIdx;
      const targetEndIdx = Math.min(targetStartIdx + span, timelineRowIds.length - 1);
      const targetStartRowId = timelineRowIds[targetStartIdx];
      const targetEndRowId = timelineRowIds[targetEndIdx] ?? targetStartRowId;
      if (!targetStartRowId) return;

      const existing = prevChips.find(
        (c) => c.columnIndex === columnIndex && c.startRowId === targetStartRowId
      );
      const baseId = createProjectChipId();
      const chipId = existing
        ? existing.id
        : entry.scheduleItemIdx != null
          ? `schedule-chip-${entry.projectId}-${entry.scheduleItemIdx}-extra-${baseId}`
          : baseId;

      if (existing) {
        newChips.push({
          ...existing,
          projectId: entry.projectId,
          endRowId: targetEndRowId,
          displayLabel: entry.displayLabel ?? existing.displayLabel,
          ...(entry.durationMinutes != null ? { durationMinutes: entry.durationMinutes } : {}),
        });
      } else {
        newChips.push({
          id: chipId,
          columnIndex,
          dayName: columnIndex < DAY_COLUMN_COUNT ? (displayedWeekDays[columnIndex] ?? null) : null,
          startRowId: targetStartRowId,
          endRowId: targetEndRowId,
          projectId: entry.projectId,
          ...(entry.displayLabel != null ? { displayLabel: entry.displayLabel } : {}),
          ...(entry.durationMinutes != null ? { durationMinutes: entry.durationMinutes } : {}),
        });
      }

      if (entry.timeOverride != null) {
        overridesToAdd[chipId] = entry.timeOverride;
      }

      cursorIdx = targetEndIdx + 1;
    });

    if (newChips.length === 0) return;

    const nextChips = (() => {
      const updated = prevChips.map((c) => {
        const replacement = newChips.find((n) => n.id === c.id);
        return replacement ?? c;
      });
      const added = newChips.filter((c) => !prevChips.some((p) => p.id === c.id));
      return [...updated, ...added];
    })();

    const nextOverrides = Object.keys(overridesToAdd).length > 0
      ? { ...prevOverrides, ...overridesToAdd }
      : prevOverrides;

    executeCommand({
      execute: () => {
        setProjectChips(nextChips);
        if (nextOverrides !== prevOverrides) setChipTimeOverrides(nextOverrides);
      },
      undo: () => {
        setProjectChips(prevChips);
        if (nextOverrides !== prevOverrides) setChipTimeOverrides(prevOverrides);
      },
    });
    setSelectedBlockIds(new Set(newChips.map((c) => c.id)));
    setSelectedCell(null);
    closeCellMenu();
  }, [
    clipboardProject,
    selectedCell,
    rowIndexMap,
    timelineRowIds,
    createProjectChipId,
    displayedWeekDays,
    executeCommand,
    setProjectChips,
    setChipTimeOverrides,
    setSelectedBlockIds,
    setSelectedCell,
    closeCellMenu,
  ]);
  useEffect(() => {
    saveTacticsChipsState({ projectChips, customProjects, chipTimeOverrides }, currentYear);
  }, [projectChips, customProjects, chipTimeOverrides, currentYear]);
  const restoreCanonicalScheduleChip = useCallback((chip, filtered) => {
    const isScheduleChip =
      chip &&
      chip.id.startsWith('schedule-chip-') &&
      chip.columnIndex < DAY_COLUMN_COUNT &&
      chip.projectId &&
      chip.projectId !== 'sleep' &&
      chip.projectId !== 'rest' &&
      chip.projectId !== 'buffer';
    if (!isScheduleChip) return;
    const { projectId } = chip;
    const prefix = `schedule-chip-${projectId}-`;
    const rest = chip.id.slice(prefix.length);
    const itemIdx = parseInt(rest, 10);
    if (!Number.isFinite(itemIdx)) return;
    const canonicalId = `schedule-chip-${projectId}-${itemIdx}`;
    if (filtered.some((c) => c.id === canonicalId)) return;
    const colConfig = stagingColumnConfigsRef.current.find(
      (c) => c.type === 'project' && c.project?.id === projectId
    );
    if (!colConfig) return;
    const stagingIdx = stagingColumnConfigsRef.current.indexOf(colConfig);
    const projectColumnIndex = DAY_COLUMN_COUNT + stagingIdx;
    const schedItems = scheduleLayout?.scheduleItemsByProject?.get(projectId) ?? [];
    const scheduleItem = schedItems[itemIdx];
    if (!scheduleItem) return;
    const minutes = parseEstimateLabelToMinutes(scheduleItem.timeValue);
    const durationMinutes = Number.isFinite(minutes) ? minutes : incrementMinutes;
    const span = Math.max(1, Math.ceil(durationMinutes / Math.max(1, incrementMinutes)));
    const existingInCol = filtered.filter(
      (c) => c.columnIndex === projectColumnIndex && c.id.startsWith('schedule-chip-')
    );
    const localRowIndexMap = new Map(timelineRowIds.map((id, i) => [id, i]));
    let startRowIdx = 2;
    existingInCol.forEach((c) => {
      const endIdx = localRowIndexMap.get(c.endRowId);
      if (endIdx != null && endIdx + 1 > startRowIdx) startRowIdx = endIdx + 1;
    });
    startRowIdx = Math.min(startRowIdx, timelineRowIds.length - 1);
    const endRowIdx = Math.min(startRowIdx + span - 1, timelineRowIds.length - 1);
    const newStartRowId = timelineRowIds[startRowIdx] ?? timelineRowIds[timelineRowIds.length - 1];
    const newEndRowId = timelineRowIds[endRowIdx] ?? newStartRowId;
    const scheduleDefaultText = SECTION_CONFIG.Schedule.placeholder;
    const trimmedName = (scheduleItem.name ?? '').trim();
    const hasScheduleName = Boolean(trimmedName && trimmedName !== scheduleDefaultText);
    filtered.push({
      id: canonicalId,
      columnIndex: projectColumnIndex,
      startRowId: newStartRowId,
      endRowId: newEndRowId,
      startMinutes: rowIdToClockMinutes(newStartRowId, trailingMinuteRows),
      projectId,
      displayLabel: hasScheduleName ? trimmedName : null,
      hasScheduleName,
      durationMinutes,
    });
  }, [scheduleLayout, incrementMinutes, timelineRowIds, trailingMinuteRows]);

  const handleRemoveSelectedChip = useCallback(() => {
    if (!removableBlockId) return;

    // Build the set of IDs to remove: context-menu target, or all selected chips
    const idsToRemove = cellMenuBlockId
      ? new Set([cellMenuBlockId])
      : new Set(selectedBlockIds);
    if (idsToRemove.size === 0) return;

    const prevChips = projectChipsRef.current;
    const computeNextChips = (prev) => {
      const deduped = dedupeChipsById(prev);
      const filtered = deduped.filter((block) => !idsToRemove.has(block.id));
      return filtered;
    };
    const nextChips = computeNextChips(prevChips);

    executeCommand({
      execute: () => setProjectChips(nextChips),
      undo: () => setProjectChips(prevChips),
    });
    setSelectedBlockIds((prev) => {
      const next = new Set([...prev].filter((id) => !idsToRemove.has(id)));
      return next;
    });
    closeCellMenu();
  }, [
    closeCellMenu,
    executeCommand,
    removableBlockId,
    cellMenuBlockId,
    selectedBlockIds,
    setProjectChips,
  ]);
  const finishColorEdit = useCallback(() => {
    setColorEditorProjectId(null);
  }, []);
  const startColorEdit = useCallback((projectId, currentColor = '#c9daf8') => {
    setColorEditorProjectId(projectId);
    setColorEditorColor(currentColor || '#c9daf8');
  }, []);
  const handleCreateCustomProject = useCallback(() => {
    customSequenceRef.current += 1;
    const customId = `custom-${Date.now()}-${customSequenceRef.current}`;
    const label = `Custom ${customSequenceRef.current}`;
    const customProject = { id: customId, label: label.toUpperCase(), color: pickCustomChipColour(customProjects, stagingProjects) };
    const prevCustomProjects = customProjectsRef.current;
    const nextCustomProjects = [...prevCustomProjects, customProject];
    executeCommand({
      execute: () => setCustomProjects(nextCustomProjects),
      undo: () => setCustomProjects(prevCustomProjects),
    });
    setPendingCustomId(customId);
    setPendingCustomLabel(label.toUpperCase());
    startColorEdit(customId, customProject.color);
    setTimeout(() => pendingCustomInputRef.current?.focus(), 0);
  }, [customProjects, executeCommand, stagingProjects, startColorEdit]);

  const handlePendingCustomConfirm = useCallback(() => {
    if (!pendingCustomId) return;
    const trimmed = pendingCustomLabel.trim();
    const finalLabel = trimmed ? trimmed.toUpperCase() : `CUSTOM ${customSequenceRef.current}`;
    const prevCustomProjects = customProjectsRef.current;
    const nextCustomProjects = prevCustomProjects.map((p) =>
      p.id === pendingCustomId ? { ...p, label: finalLabel } : p
    );
    executeCommand({
      execute: () => setCustomProjects(nextCustomProjects),
      undo: () => setCustomProjects(prevCustomProjects),
    });
    handleProjectSelection(pendingCustomId);
    setPendingCustomId(null);
    setPendingCustomLabel('');
  }, [pendingCustomId, pendingCustomLabel, executeCommand, handleProjectSelection]);
  const handleDeleteCustomProject = useCallback(
    (projectId) => {
      if (!projectId) return;
      const prevCustomProjects = customProjectsRef.current;
      const prevChips = projectChipsRef.current;
      const nextCustomProjects = prevCustomProjects.filter((project) => project.id !== projectId);
      const nextChips = prevChips.filter((block) => block.projectId !== projectId);
      executeCommand({
        execute: () => {
          setCustomProjects(nextCustomProjects);
          setProjectChips(nextChips);
        },
        undo: () => {
          setCustomProjects(prevCustomProjects);
          setProjectChips(prevChips);
        },
      });
      if (colorEditorProjectId === projectId) {
        setColorEditorProjectId(null);
      }
    },
    [colorEditorProjectId, executeCommand]
  );
  const handleColorChange = useCallback(
    (value) => {
      if (!colorEditorProjectId) return;
      setCustomProjects((prev) =>
        prev.map((project) =>
          project.id === colorEditorProjectId ? { ...project, color: value } : project
        )
      );
      setColorEditorColor(value);
    },
    [colorEditorProjectId]
  );
  const handleMenuRenameStart = useCallback((chipId, currentLabel) => {
    setMenuRenamingChipId(chipId);
    setMenuRenamingLabel(currentLabel);
  }, []);
  const handleMenuRenameConfirm = useCallback(() => {
    if (!menuRenamingChipId) return;
    const trimmed = menuRenamingLabel.trim();
    if (!trimmed) {
      setMenuRenamingChipId(null);
      setMenuRenamingLabel('');
      return;
    }
    const prevChips = projectChipsRef.current;
    const block = prevChips.find((b) => b.id === menuRenamingChipId);
    if (block) {
      const normalized = trimmed;
      const nextChips = prevChips.map((b) =>
        b.id === menuRenamingChipId ? { ...b, displayLabel: normalized } : b
      );
      executeCommand({
        execute: () => setProjectChips(nextChips),
        undo: () => setProjectChips(prevChips),
      });
    }
    setMenuRenamingChipId(null);
    setMenuRenamingLabel('');
  }, [executeCommand, menuRenamingChipId, menuRenamingLabel]);
  const handleMenuDefinitionRenameStart = useCallback((projectId, currentLabel) => {
    setMenuRenamingProjectId(projectId);
    setMenuRenamingProjectLabel(currentLabel);
  }, []);
  const handleMenuDefinitionRenameConfirm = useCallback(() => {
    if (!menuRenamingProjectId) return;
    const trimmed = menuRenamingProjectLabel.trim();
    if (trimmed) {
      const prevCustomProjects = customProjectsRef.current;
      const nextCustomProjects = prevCustomProjects.map((p) =>
        p.id === menuRenamingProjectId ? { ...p, label: trimmed.toUpperCase() } : p
      );
      executeCommand({
        execute: () => setCustomProjects(nextCustomProjects),
        undo: () => setCustomProjects(prevCustomProjects),
      });
    }
    setMenuRenamingProjectId(null);
    setMenuRenamingProjectLabel('');
  }, [executeCommand, menuRenamingProjectId, menuRenamingProjectLabel]);
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
    const isInteractive =
      cellMenu.columnIndex >= 0 &&
      cellMenu.columnIndex < totalColumnCount &&
      (cellMenu.columnIndex >= DAY_COLUMN_COUNT ||
        Boolean(displayedWeekDays[cellMenu.columnIndex]));
    if (!isInteractive) {
      closeCellMenu();
    }
  }, [cellMenu, closeCellMenu, displayedWeekDays, totalColumnCount]);
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
  const dropdownProjects = useMemo(
    () => [...customProjects, ...highlightedProjects],
    [customProjects, highlightedProjects]
  );
  const nextCustomChipColour = useMemo(
    () => pickCustomChipColour(customProjects, stagingProjects),
    [customProjects, stagingProjects]
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
      const isScheduleChip = typeof block.id === 'string' && block.id.startsWith('schedule-chip-');
      if (isScheduleChip) {
        // For schedule chips, edit both name and time
        const extraMarker = block.id.indexOf('-extra-chip-');
        const idForParsing = extraMarker !== -1 ? block.id.slice(0, extraMarker) : block.id;
        const itemIdxMatch = idForParsing.match(/-(\d+)$/);
        const itemIdx = itemIdxMatch ? parseInt(itemIdxMatch[1], 10) : null;
        const scheduleItems = itemIdx != null
          ? (scheduleLayout.scheduleItemsByProject.get(block.projectId) ?? [])
          : [];
        const scheduleItem = itemIdx != null ? scheduleItems[itemIdx] : null;
        const currentOverride = chipTimeOverrides[chipId];
        const spanMinutes = getBlockDuration(block, rowIndexMap, timelineRowIds, incrementMinutes);
        let currentMinutes;
        if (currentOverride != null) {
          currentMinutes = currentOverride;
        } else if (scheduleItem) {
          currentMinutes = parseEstimateLabelToMinutes(scheduleItem.timeValue) ?? block.durationMinutes ?? spanMinutes;
        } else if (block.durationMinutes) {
          currentMinutes = block.durationMinutes;
        } else {
          currentMinutes = spanMinutes;
        }
        const scheduleDefaultText = SECTION_CONFIG.Schedule.placeholder;
        const rawName = scheduleItem ? (scheduleItem.name ?? '').trim() : '';
        const currentName = rawName && rawName !== scheduleDefaultText ? rawName : (block.displayLabel ?? '');
        setEditingChipIsTime(true);
        setEditingChipIsCustom(false);
        setEditingChipLabel(currentName);
        setEditingChipMinutes(formatMinutesToHHmm(currentMinutes));
        setEditingChipId(chipId);
        return;
      }
      const metadata = projectMetadata.get(block.projectId);
      const fallbackLabel = metadata?.label ?? block.projectId ?? 'Project';
      const isCustom = typeof block.projectId === 'string' && block.projectId.startsWith('custom-');
      const labelValue = block.displayLabel ?? fallbackLabel;
      const currentOverride = chipTimeOverrides[chipId];
      const storedMinutes = currentOverride ?? block.durationMinutes ?? 0;
      const currentMinutes = storedMinutes > 0
        ? storedMinutes
        : getBlockDuration(block, rowIndexMap, timelineRowIds, incrementMinutes);
      setEditingChipIsTime(true);
      setEditingChipIsCustom(isCustom);
      setEditingChipLabel(isCustom ? labelValue.toUpperCase() : labelValue.toUpperCase());
      setEditingChipMinutes(formatMinutesToHHmm(currentMinutes));
      setEditingChipId(chipId);
    },
    [getProjectChipById, projectMetadata, scheduleLayout, chipTimeOverrides, rowIndexMap, timelineRowIds, incrementMinutes]
  );
  const handleConfirmLabelEdit = useCallback(() => {
    if (!editingChipId) return;
    const prevChips = projectChipsRef.current;
    const prevOverrides = chipTimeOverridesRef.current;
    if (editingChipIsTime) {
      const hhmmMatch = editingChipMinutes.match(/^(\d+)(?:[.,:](\d{1,2}))?$/);
      const parsedMins = hhmmMatch
        ? parseInt(hhmmMatch[1], 10) * 60 + parseInt(hhmmMatch[2] ?? '0', 10)
        : parseInt(editingChipMinutes, 10);
      const trimmedName = editingChipLabel.trim();
      const nextOverrides = Number.isFinite(parsedMins) && parsedMins > 0
        ? { ...prevOverrides, [editingChipId]: parsedMins }
        : prevOverrides;
      const nextChips = prevChips.map((block) =>
        block.id === editingChipId
          ? { ...block, displayLabel: trimmedName || null }
          : block
      );
      executeCommand({
        execute: () => {
          setChipTimeOverrides(nextOverrides);
          setProjectChips(nextChips);
        },
        undo: () => {
          setChipTimeOverrides(prevOverrides);
          setProjectChips(prevChips);
        },
      });
      setEditingChipId(null);
      setEditingChipLabel('');
      setEditingChipMinutes('');
      setEditingChipIsTime(false);
      setEditingChipIsCustom(false);
      return;
    }
    const normalizedLabel = editingChipLabel.toUpperCase();
    const nextChips = prevChips.map((block) =>
      block.id === editingChipId ? { ...block, displayLabel: normalizedLabel } : block
    );
    executeCommand({
      execute: () => setProjectChips(nextChips),
      undo: () => setProjectChips(prevChips),
    });
    setEditingChipId(null);
    setEditingChipLabel('');
    setEditingChipIsCustom(false);
  }, [
    editingChipId,
    editingChipIsTime,
    editingChipIsCustom,
    editingChipLabel,
    editingChipMinutes,
    executeCommand,
    setProjectChips,
  ]);
  const handleCancelLabelEdit = useCallback(() => {
    setEditingChipId(null);
    setEditingChipLabel('');
    setEditingChipMinutes('');
    setEditingChipIsCustom(false);
    setEditingChipIsTime(false);
  }, []);
  useEffect(() => {
    if (!editingChipIsTime) return undefined;
    const handleMouseDown = (event) => {
      const container = editingChipContainerRef.current;
      if (container && container.contains(event.target)) return;
      handleConfirmLabelEdit();
    };
    window.addEventListener('mousedown', handleMouseDown, true);
    return () => window.removeEventListener('mousedown', handleMouseDown, true);
  }, [editingChipIsTime, handleConfirmLabelEdit]);
  const projectColumnTotals = useMemo(() => {
    const totals = new Map();
    const columnLength = visibleColumnCount || DAY_COLUMN_COUNT;

    // First pass: compute duration for every chip
    const chipDurations = new Map(); // chip.id -> { projectId, columnIndex, duration, startIdx, endIdx }
    projectChips.forEach((block) => {
      const targetProjectId = block.projectId || 'sleep';
      const columnIndex =
        typeof block.columnIndex === 'number' ? block.columnIndex : 0;
      if (columnIndex < 0 || columnIndex >= columnLength) {
        return;
      }
      let duration;
      const isScheduleChip = typeof block.id === 'string' && block.id.startsWith('schedule-chip-');
      const isSingleCell = block.startRowId === (block.endRowId ?? block.startRowId);
      if (isScheduleChip && isSingleCell) {
        const overrideMins = chipTimeOverrides[block.id];
        if (overrideMins != null && overrideMins > 0) {
          duration = overrideMins;
        } else {
          const extraMarker = block.id.indexOf('-extra-chip-');
          const idForParsing = extraMarker !== -1 ? block.id.slice(0, extraMarker) : block.id;
          const itemIdxMatch = idForParsing.match(/-(\d+)$/);
          const itemIdx = itemIdxMatch ? parseInt(itemIdxMatch[1], 10) : null;
          const scheduleItems = itemIdx != null
            ? (scheduleLayout.scheduleItemsByProject.get(block.projectId) ?? [])
            : [];
          const scheduleItem = itemIdx != null ? scheduleItems[itemIdx] : null;
          const parsedMins = scheduleItem ? parseEstimateLabelToMinutes(scheduleItem.timeValue) : null;
          if (Number.isFinite(parsedMins) && parsedMins > 0 && parsedMins < incrementMinutes) {
            duration = parsedMins;
          }
        }
      }
      if (duration == null && isSingleCell) {
        const overrideMins = chipTimeOverrides[block.id];
        const effectiveMins = overrideMins ?? block.durationMinutes ?? null;
        if (Number.isFinite(effectiveMins) && effectiveMins > 0) {
          duration = effectiveMins;
        }
      }
      if (duration == null) {
        duration = getBlockDuration(block, rowIndexMap, timelineRowIds, incrementMinutes);
      }
      if (duration <= 0) return;

      const startIdx = rowIndexMap.get(block.startRowId);
      const endIdx = rowIndexMap.get(block.endRowId ?? block.startRowId);
      if (startIdx == null || endIdx == null) return;

      chipDurations.set(block.id, {
        projectId: targetProjectId,
        columnIndex,
        duration,
        startIdx: Math.min(startIdx, endIdx),
        endIdx: Math.max(startIdx, endIdx),
      });
    });

    // Second pass: for each chip, check if it is spatially contained within a chip
    // of a different project in the same column — if so, deduct this chip's duration
    // from the containing chip's total (the smaller chip "eats into" the larger).
    const deductions = new Map(); // chip.id -> minutes to deduct
    const chipEntries = Array.from(chipDurations.entries());
    chipEntries.forEach(([idA, infoA]) => {
      chipEntries.forEach(([idB, infoB]) => {
        if (idA === idB) return;
        if (infoA.columnIndex !== infoB.columnIndex) return;
        if (infoA.projectId === infoB.projectId) return;
        // Check if B is fully contained within A
        if (infoB.startIdx >= infoA.startIdx && infoB.endIdx <= infoA.endIdx) {
          deductions.set(idA, (deductions.get(idA) ?? 0) + infoB.duration);
        }
      });
    });

    // Third pass: accumulate into totals, applying deductions
    chipDurations.forEach((info, chipId) => {
      const { projectId, columnIndex, duration } = info;
      const deduction = deductions.get(chipId) ?? 0;
      const effectiveDuration = Math.max(0, duration - deduction);
      if (effectiveDuration <= 0) return;
      if (!totals.has(projectId)) {
        totals.set(projectId, Array.from({ length: columnLength }, () => 0));
      }
      const columnTotals = totals.get(projectId);
      if (!Array.isArray(columnTotals)) return;
      columnTotals[columnIndex] += effectiveDuration;
    });

    return totals;
  }, [
    chipTimeOverrides,
    incrementMinutes,
    projectChips,
    rowIndexMap,
    scheduleLayout,
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
      if (
        projectId === 'sleep' ||
        projectId === 'rest' ||
        projectId === 'buffer' ||
        (typeof projectId === 'string' && projectId.startsWith('custom-'))
      ) {
        return;
      }
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
  const orderedProjectSummaries = useMemo(() => {
    if (!summaryRowOrder || summaryRowOrder.length === 0) return projectSummaries;
    const indexMap = new Map(summaryRowOrder.map((id, i) => [id, i]));
    const sorted = [...projectSummaries].sort((a, b) => {
      const ai = indexMap.has(a.id) ? indexMap.get(a.id) : Infinity;
      const bi = indexMap.has(b.id) ? indexMap.get(b.id) : Infinity;
      return ai - bi;
    });
    return sorted;
  }, [projectSummaries, summaryRowOrder]);
  useEffect(() => {
    const projectWeeklyQuotas = projectSummaries.map((summary) => ({
      id: summary.id,
      label: summary.label,
      weeklyHours: minutesToHourMinuteDecimal(summary.totalMinutes),
    }));
    const dailyBounds = displayedWeekDays.map((day, idx) => ({
      day,
      dailyMaxHours: minutesToHourMinuteDecimal(availableColumnTotals[idx] ?? 0),
      dailyMinHours: minutesToHourMinuteDecimal(workingColumnTotals[idx] ?? 0),
    }));
    const weeklyTotals = {
      availableHours: minutesToHourMinuteDecimal(totalAvailableMinutes),
      workingHours: minutesToHourMinuteDecimal(totalWorkingMinutes),
    };
    saveTacticsMetrics({
      projectWeeklyQuotas,
      dailyBounds,
      weeklyTotals,
    }, currentYear);
  }, [
    availableColumnTotals,
    displayedWeekDays,
    projectSummaries,
    totalAvailableMinutes,
    totalWorkingMinutes,
    currentYear,
    workingColumnTotals,
  ]);
  const [sendToSystemDone, setSendToSystemDone] = useState(false);
  const handleSendToSystem = useCallback(() => {
    const yearInfo = getYearInfo(currentYear);
    if (yearInfo?.startDate) {
      saveStartDate(yearInfo.startDate, undefined, currentYear);
    }

    // Re-dispatch tactics metrics so System page reflects current totals and quotas
    const projectWeeklyQuotas = projectSummaries.map((summary) => ({
      id: summary.id,
      label: summary.label,
      weeklyHours: minutesToHourMinuteDecimal(summary.totalMinutes),
    }));
    const dailyBounds = displayedWeekDays.map((day, idx) => ({
      day,
      dailyMaxHours: minutesToHourMinuteDecimal(availableColumnTotals[idx] ?? 0),
      dailyMinHours: minutesToHourMinuteDecimal(workingColumnTotals[idx] ?? 0),
    }));
    saveTacticsMetrics({
      projectWeeklyQuotas,
      dailyBounds,
      weeklyTotals: {
        availableHours: minutesToHourMinuteDecimal(totalAvailableMinutes),
        workingHours: minutesToHourMinuteDecimal(totalWorkingMinutes),
      },
    }, currentYear);

    // Re-dispatch chips state so System page reflects current subproject rows
    saveTacticsChipsState({ projectChips, customProjects, chipTimeOverrides }, currentYear);

    // Write timestamp so System page resets subproject labels even if it mounts after this fires
    localStorage.setItem(TACTICS_SEND_TO_SYSTEM_TS_KEY, Date.now().toString());
    // Also signal if System is already mounted
    window.dispatchEvent(new CustomEvent(TACTICS_SEND_TO_SYSTEM_EVENT));

    setSendToSystemDone(true);
    setTimeout(() => setSendToSystemDone(false), 2000);
  }, [
    currentYear,
    projectSummaries,
    displayedWeekDays,
    availableColumnTotals,
    workingColumnTotals,
    totalAvailableMinutes,
    totalWorkingMinutes,
    projectChips,
    customProjects,
    chipTimeOverrides,
  ]);

  const stagingColumnConfigs = useMemo(() => {
    const columns = [{ id: 'extra-empty', type: 'empty' }];
    highlightedProjects.forEach((project) => {
      columns.push({
        id: `project-${project.id}`,
        type: 'project',
        project,
      });
    });
    return columns;
  }, [highlightedProjects]);
  const stagingColumnConfigsRef = useRef(stagingColumnConfigs);
  stagingColumnConfigsRef.current = stagingColumnConfigs;
  const extendedStagingColumnConfigs = useMemo(() => {
    const required = Math.max(0, totalColumnCount - DAY_COLUMN_COUNT);
    if (required <= stagingColumnConfigs.length) return stagingColumnConfigs;
    const placeholders = Array.from({ length: required - stagingColumnConfigs.length }, (_, idx) => ({
      id: `placeholder-${idx}`,
      type: 'placeholder',
    }));
    return [...stagingColumnConfigs, ...placeholders];
  }, [stagingColumnConfigs, totalColumnCount]);
  // Builds a new schedule item chip object and adds it to projectChips.
  // Returns the new chip, or null if the project/item can't be found.
  const buildAndAddScheduleItemChip = useCallback(
    (projectId, itemIdx) => {
      const colConfig = stagingColumnConfigs.find(
        (c) => c.type === 'project' && c.project?.id === projectId
      );
      if (!colConfig) return null;
      const stagingIdx = stagingColumnConfigs.indexOf(colConfig);
      const columnIndex = DAY_COLUMN_COUNT + stagingIdx;

      const schedItems = scheduleLayout?.scheduleItemsByProject?.get(projectId) ?? [];
      const scheduleItem = schedItems[itemIdx];
      if (!scheduleItem) return null;

      const minutes = parseEstimateLabelToMinutes(scheduleItem.timeValue);
      const totalMinutes = Number.isFinite(minutes) ? minutes : incrementMinutes;
      // Compute how many minutes are already placed in day columns for this item
      const canonicalId = `schedule-chip-${projectId}-${itemIdx}`;
      const alreadyPlaced = projectChips.reduce((sum, c) => {
        if (!c.id.startsWith('schedule-chip-')) return sum;
        if (c.columnIndex >= 8) return sum;
        const extraIdx = c.id.indexOf('-extra-chip-');
        if (extraIdx === -1) return sum;
        const inner = c.id.slice('schedule-chip-'.length, extraIdx);
        const lastDash = inner.lastIndexOf('-');
        if (lastDash === -1) return sum;
        if (inner.slice(0, lastDash) !== projectId) return sum;
        if (parseInt(inner.slice(lastDash + 1), 10) !== itemIdx) return sum;
        const chipMins = chipTimeOverrides[c.id] ?? chipTimeOverrides[canonicalId] ?? c.durationMinutes ?? 0;
        return sum + chipMins;
      }, 0);
      const remainingMinutes = Math.max(incrementMinutes, totalMinutes - alreadyPlaced);
      const durationMinutes = Math.max(1, totalMinutes - alreadyPlaced);
      const span = Math.max(1, Math.ceil(remainingMinutes / Math.max(1, incrementMinutes)));

      const existingInCol = projectChips.filter(
        (c) => c.columnIndex === columnIndex && c.id.startsWith('schedule-chip-')
      );
      let startRowIdx = 2;
      existingInCol.forEach((c) => {
        const endIdx = rowIndexMap.get(c.endRowId);
        if (endIdx != null && endIdx + 1 > startRowIdx) startRowIdx = endIdx + 1;
      });
      startRowIdx = Math.min(startRowIdx, timelineRowIds.length - 1);
      const endRowIdx = Math.min(startRowIdx + span - 1, timelineRowIds.length - 1);
      const startRowId = timelineRowIds[startRowIdx] ?? timelineRowIds[timelineRowIds.length - 1];
      const endRowId = timelineRowIds[endRowIdx] ?? startRowId;
      const startMinutes = rowIdToClockMinutes(startRowId, trailingMinuteRows);

      const scheduleDefaultText = SECTION_CONFIG.Schedule.placeholder;
      const trimmedName = (scheduleItem.name ?? '').trim();
      const hasScheduleName = Boolean(trimmedName && trimmedName !== scheduleDefaultText);
      const displayLabel = hasScheduleName ? trimmedName : null;

      const newChip = {
        id: `schedule-chip-${projectId}-${itemIdx}-extra-${createProjectChipId()}`,
        columnIndex,
        dayName: null,
        startRowId,
        endRowId,
        startMinutes,
        projectId,
        displayLabel,
        hasScheduleName,
        durationMinutes,
      };

      const prevChips = projectChipsRef.current;
      const nextChips = [...prevChips, newChip];
      executeCommand({
        execute: () => setProjectChips(nextChips),
        undo: () => setProjectChips(prevChips),
      });
      return newChip;
    },
    [
      executeCommand,
      stagingColumnConfigs,
      scheduleLayout,
      incrementMinutes,
      projectChips,
      chipTimeOverrides,
      rowIndexMap,
      timelineRowIds,
      trailingMinuteRows,
      setProjectChips,
    ]
  );

  const handleAddScheduleItemChip = useCallback(
    (projectId, itemIdx) => { buildAndAddScheduleItemChip(projectId, itemIdx); },
    [buildAndAddScheduleItemChip]
  );

  const handlePanelDragStart = useCallback(
    (projectId, itemIdx, dragEvent) => {
      const newChip = buildAndAddScheduleItemChip(projectId, itemIdx);
      if (!newChip) return;

      dragEvent.dataTransfer.setData(SLEEP_DRAG_TYPE, newChip.id);
      dragEvent.dataTransfer.setData('text/plain', newChip.id);
      dragEvent.dataTransfer.effectAllowed = 'move';
      if (dragEvent.dataTransfer.setDragImage && transparentDragImageRef.current) {
        dragEvent.dataTransfer.setDragImage(transparentDragImageRef.current, 0, 0);
      }

      draggingSleepChipIdRef.current = newChip.id;
      dragAnchorOffsetRef.current = 0;
      setIsDragging(true);
      setSelectedBlockId(newChip.id);
      setDragPreview({
        sourceChipId: newChip.id,
        targetColumnIndex: newChip.columnIndex,
        startRowId: newChip.startRowId,
        endRowId: newChip.endRowId,
      });
    },
    [buildAndAddScheduleItemChip, setSelectedBlockId]
  );

  const hasInitializedScheduleChips = useRef(false);
  // Track previous staging projects to detect changes
  const prevStagingProjectsRef = useRef(null);

  useEffect(() => {
    // Canonical schedule chips (those without '-extra-' in their ID) are no longer
    // created for project columns — the side menu surfaces schedule items instead.
    // Strip any stale canonical chips persisted from a previous session on mount.
    // User-placed '-extra-' chips from the side menu are preserved.
    setProjectChips((prev) => {
      const filtered = prev.filter((entry) =>
        !entry.id.startsWith('schedule-chip-') || entry.id.includes('-extra-')
      );
      return filtered.length === prev.length ? prev : filtered;
    });
    hasInitializedScheduleChips.current = true;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const resetChips = useCallback((forIncrement) => {
    const baseChips = buildInitialSleepBlocks(displayedWeekDays);
    setProjectChips(baseChips);
    hasInitializedScheduleChips.current = true;
    setSelectedBlockId(null);
    setSelectedCell(null);
    setCellMenu(null);
  }, [displayedWeekDays]);

  const handleClearAllChips = useCallback(() => {
    if (typeof window !== 'undefined') {
      const confirmed = window.confirm(
        'Clear all chips? This will reset to default sleep blocks. Custom projects will stay in the dropdown.'
      );
      if (!confirmed) return;
    }
    const baseChips = buildInitialSleepBlocks(displayedWeekDays);
    setProjectChips(baseChips);
    hasInitializedScheduleChips.current = true;
    setSelectedBlockId(null);
    setSelectedCell(null);
    setCellMenu(null);
  }, [displayedWeekDays]);

  // Keyboard shortcuts: Cmd/Ctrl+Z to undo, Cmd/Ctrl+Shift+Z to redo
  useEffect(() => {
    const handleKeyDown = (event) => {
      const isMac = navigator.platform.toUpperCase().includes('MAC');
      const modifier = isMac ? event.metaKey : event.ctrlKey;
      if (!modifier || event.key !== 'z') return;
      // Don't intercept while a text input is focused
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable) return;
      event.preventDefault();
      if (event.shiftKey) {
        redo();
      } else {
        undo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo]);

  // Keyboard shortcut: Delete/Backspace to remove the selected chip
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key !== 'Delete' && event.key !== 'Backspace') return;
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable) return;
      if (selectedBlockIds.size === 0) return;
      event.preventDefault();
      handleRemoveSelectedChip();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedBlockIds, handleRemoveSelectedChip]);

  // Compute the minimum width needed for column 0 to fit its longest string
  const col0MinWidth = useMemo(() => {
    const fontSize = 14 * textSizeScale;
    const font = `700 ${fontSize}px Inter, ui-sans-serif, system-ui, sans-serif`;
    const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
    if (!canvas) return 120;
    const ctx = canvas.getContext('2d');
    ctx.font = font;
    const padding = 24; // px-3 = 12px each side
    const candidates = [
      'Sleep', 'REST', 'Working Hours', 'Buffer', 'Available Hours',
      ...projectSummaries.map((s) => s.label ?? ''),
      ...hourRows.map((h) => formatTime(h, '00', { use24Hour, showAmPm })),
    ];
    if (startHour) {
      const m = parseHour12ToMinutes(startHour);
      if (m != null) {
        candidates.push(formatTime(Math.floor(m / 60), (m % 60).toString().padStart(2, '0'), { use24Hour, showAmPm }));
      }
    }
    const maxText = Math.max(...candidates.map((s) => ctx.measureText(s).width));
    return Math.ceil(maxText + padding);
  }, [textSizeScale, projectSummaries, hourRows, use24Hour, showAmPm, startHour]);

  const { gridTemplateColumns, col0Width, tableWidth } = useMemo(() => {
    // Build grid template with specific pixel widths from columnWidths state, scaled by textSizeScale
    const columns = [];
    let firstColWidth = 0;
    let total = 0;
    for (let i = 0; i <= totalColumnCount; i++) {
      const baseWidth = columnWidths[i] || (i === 0 ? 120 : 140);
      const scaled = Math.round(baseWidth * textSizeScale);
      const width = i === 0 ? Math.max(scaled, col0MinWidth) : scaled;
      if (i === 0) firstColWidth = width;
      total += width;
      columns.push(`${width}px`);
    }
    return { gridTemplateColumns: columns.join(' '), col0Width: firstColWidth, tableWidth: total };
  }, [totalColumnCount, columnWidths, textSizeScale, col0MinWidth]);

  // Column resize handler
  const handleColumnResize = useCallback((columnIndex, startX, startWidth) => {
    const handleMouseMove = (e) => {
      // diff is in screen pixels; divide by scale to get base-width units
      const diff = (e.clientX - startX) / textSizeScale;
      const newWidth = Math.max(60, startWidth + diff); // Min width 60px
      setColumnWidths(prev => {
        const updated = [...prev];
        // Ensure array is long enough
        while (updated.length <= columnIndex) {
          updated.push(140);
        }
        updated[columnIndex] = newWidth;
        return updated;
      });
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [textSizeScale]);
  const renderExtraColumnCells = useCallback(
    (rowKey, showHeaderLabel = false) =>
      extendedStagingColumnConfigs.map((column, extraIndex) => {
        const baseClass =
          'border border-[#e5e7eb] px-3 py-px text-center overflow-visible';
        // The grid has 9 columns before extra columns (0-8), so project columns start at index 9
        const columnIndex = 9 + extraIndex;

        if (column.type === 'empty' || column.type === 'placeholder') {
          return <td key={`${rowKey}-${column.id}`} className={baseClass} style={{ position: 'relative', fontSize: `${14 * textSizeScale}px` }} />;
        }
        const metadata = projectMetadata.get(column.project.id);
        if (showHeaderLabel) {
          const label = metadata?.label ?? column.project.label ?? 'Project';
          const backgroundColor =
            metadata?.color ?? column.project.color ?? '#d9d9d9';
          const textColor = metadata?.textColor ?? '#000000';
          return (
            <td
              key={`${rowKey}-${column.id}`}
              className={`${baseClass} font-semibold uppercase`}
              style={{ backgroundColor, color: textColor, position: 'relative', fontSize: `${14 * textSizeScale}px` }}
            >
              {label}
              {/* Resize handle */}
              <div
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const width = columnWidths[columnIndex] || 140;
                  handleColumnResize(columnIndex, e.clientX, width);
                }}
                style={{
                  position: 'absolute',
                  right: '-2px',
                  top: 0,
                  bottom: 0,
                  width: '8px',
                  cursor: 'col-resize',
                  backgroundColor: 'transparent',
                  zIndex: 10,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#000000';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
                title="Drag to resize column"
              />
            </td>
          );
        }
        return <td key={`${rowKey}-${column.id}`} className={baseClass} style={{ fontSize: `${14 * textSizeScale}px` }} />;
      }),
    [extendedStagingColumnConfigs, projectMetadata, columnWidths, handleColumnResize, textSizeScale]
  );
  const renderProjectChip = useCallback(
    (chipId, rowId) => {
      if (!chipId) return null;
      const block = getProjectChipById(chipId);
      if (!block || block.startRowId !== rowId) return null;
      const projectId = block.projectId || 'sleep';
      const metadata = projectMetadata.get(projectId);
      const isScheduleChip = block.id.startsWith('schedule-chip-');
      const displayFlags = chipDisplayModes['__default__'] && typeof chipDisplayModes['__default__'] === 'object' ? chipDisplayModes['__default__'] : { duration: false, clock: false };
      const showDuration = Boolean(displayFlags.duration);
      const showClock = Boolean(displayFlags.clock);
      let rawLabel;
      let largeTimeStr = null;
      if (isScheduleChip) {
        // Derive label directly from schedule data at render time so it's always fresh.
        // Extra-copy IDs: schedule-chip-{projectId}-{itemIdx}-extra-chip-{N}
        // Canonical IDs:  schedule-chip-{projectId}-{itemIdx}
        // Use fixed "-extra-chip-" split to avoid matching the trailing sequence number.
        const extraMarker = block.id.indexOf('-extra-chip-');
        const idForParsing = extraMarker !== -1 ? block.id.slice(0, extraMarker) : block.id;
        const itemIdxMatch = idForParsing.match(/-(\d+)$/);
        const itemIdx = itemIdxMatch ? parseInt(itemIdxMatch[1], 10) : null;
        const scheduleItems = itemIdx != null
          ? (scheduleLayout.scheduleItemsByProject.get(block.projectId) ?? [])
          : [];
        const scheduleItem = itemIdx != null ? scheduleItems[itemIdx] : null;
        const scheduleDefaultText = SECTION_CONFIG.Schedule.placeholder;
        // Prefer user-edited displayLabel, then scheduleItem name, then project label
        const itemName = scheduleItem ? (scheduleItem.name ?? '').trim() : '';
        const hasScheduleName = Boolean(itemName && itemName !== scheduleDefaultText);
        const baseName = block.displayLabel || (hasScheduleName ? itemName : (metadata?.label ?? 'Project'));
        const overrideMins = chipTimeOverrides[chipId];
        const mins = overrideMins != null ? overrideMins : (scheduleItem ? (parseEstimateLabelToMinutes(scheduleItem.timeValue) ?? block.durationMinutes) : block.durationMinutes);
        const isMultiRow = block.endRowId && block.endRowId !== block.startRowId;
        const displayMins = !isMultiRow && Number.isFinite(mins) && mins > 0 && mins < incrementMinutes ? mins : null;
        let timeStr = null;
        if (displayMins != null) {
          const h = Math.floor(displayMins / 60);
          const m = displayMins % 60;
          if (h === 0) timeStr = `${m}`;
          else if (m === 0) timeStr = `${h}`;
          else timeStr = `${h}.${String(m).padStart(2, '0')}`;
        }
        if (showDuration) {
          if (isMultiRow) {
            const startIdx = rowIndexMap.get(block.startRowId);
            const endIdx = rowIndexMap.get(block.endRowId);
            if (startIdx != null && endIdx != null) {
              const rowCount = Math.abs(endIdx - startIdx) + 1;
              const blockMins = rowCount * incrementMinutes;
              if (Number.isFinite(blockMins) && blockMins > 0) {
                const h = Math.floor(blockMins / 60);
                const m = blockMins % 60;
                largeTimeStr = m === 0 ? `${h}` : `${h}.${String(m).padStart(2, '0')}`;
              }
            }
          } else {
            const blockMins = (Number.isFinite(mins) && mins > 0) ? mins : incrementMinutes;
            const h = Math.floor(blockMins / 60);
            const m = blockMins % 60;
            largeTimeStr = h === 0 ? `${m}` : m === 0 ? `${h}` : `${h}.${String(m).padStart(2, '0')}`;
          }
        }
        rawLabel = timeStr != null ? `${baseName}: ${timeStr}` : baseName;
      } else {
        const baseName = block.displayLabel ?? metadata?.label ?? 'Project';
        const overrideMins = chipTimeOverrides[chipId];
        const effectiveMins = overrideMins ?? block.durationMinutes ?? null;
        const isMultiRow = block.endRowId && block.endRowId !== block.startRowId;
        if (showDuration) {
          if (isMultiRow) {
            const startIdx = rowIndexMap.get(block.startRowId);
            const endIdx = rowIndexMap.get(block.endRowId);
            if (startIdx != null && endIdx != null) {
              const rowCount = Math.abs(endIdx - startIdx) + 1;
              const blockMins = rowCount * incrementMinutes;
              if (Number.isFinite(blockMins) && blockMins > 0) {
                const h = Math.floor(blockMins / 60);
                const m = blockMins % 60;
                largeTimeStr = m === 0 ? `${h}` : `${h}.${String(m).padStart(2, '0')}`;
              }
            }
          } else {
            const blockMins = overrideMins ?? block.durationMinutes ?? incrementMinutes;
            const h = Math.floor(blockMins / 60);
            const m = blockMins % 60;
            largeTimeStr = h === 0 ? `${m}` : m === 0 ? `${h}` : `${h}.${String(m).padStart(2, '0')}`;
          }
        }
        const showTime = !isMultiRow && Number.isFinite(effectiveMins) && effectiveMins > 0 &&
          effectiveMins < incrementMinutes;
        if (showTime) {
          const h = Math.floor(effectiveMins / 60);
          const m = effectiveMins % 60;
          const timeStr = h === 0 ? `${m}` : m === 0 ? `${h}` : `${h}.${String(m).padStart(2, '0')}`;
          rawLabel = `${baseName}: ${timeStr}`;
        } else {
          rawLabel = baseName;
        }
      }
      // Compute sleep time info for sleep chips (only shown when clock mode is on)
      let sleepTimeInfo = null;
      if (projectId === 'sleep' && showClock) {
        const isTopChip = block.startRowId === 'sleep-start';
        let displayMins = null;
        if (isTopChip) {
          // Top chip: show wake time (row after endRowId)
          const endRowIdx = rowIndexMap.get(block.endRowId);
          if (endRowIdx != null) {
            const nextRowId = timelineRowIds[endRowIdx + 1];
            if (nextRowId === 'sleep-end' || nextRowId == null) {
              displayMins = parseHour12ToMinutes(startMinute);
            } else {
              displayMins = rowIdToClockMinutes(nextRowId, trailingMinuteRows);
            }
          }
          if (displayMins == null) displayMins = parseHour12ToMinutes(startMinute);
        } else {
          // Bottom chip: show bed time (start of startRowId)
          displayMins = rowIdToClockMinutes(block.startRowId, trailingMinuteRows);
        }
        if (displayMins != null) {
          const h = Math.floor(displayMins / 60);
          const m = String(displayMins % 60).padStart(2, '0');
          sleepTimeInfo = { timeStr: formatTime(h, m, { use24Hour, showAmPm }), isTopChip };
        }
      }
      const backgroundColor = metadata?.color ?? '#d9d9d9';
      const textColor = metadata?.textColor ?? '#000';
      const fontWeight = metadata?.fontWeight ?? 600;
      const isActive = highlightedBlockId === block.id || selectedBlockIds.has(block.id);
      const blockHeight = getBlockHeight(block.startRowId, block.endRowId);
      const isCustomProject =
        typeof block.projectId === 'string' && block.projectId.startsWith('custom-');
      const normalizedLabel = rawLabel.toUpperCase();
      const baseFontSize = 14 * textSizeScale;
      const chipIsMultiRow = block.endRowId && block.endRowId !== block.startRowId;

      // Clock mode
      let clockStr = null;
      if (showClock) {
        const startMins = rowIdToClockMinutes(block.startRowId, trailingMinuteRows);
        const endRowId = block.endRowId ?? block.startRowId;
        const endMins = rowIdToClockMinutes(endRowId, trailingMinuteRows);
        if (startMins != null) {
          const startFormatted = formatTime(Math.floor(startMins / 60), (startMins % 60).toString().padStart(2, '0'), { use24Hour, showAmPm });
          const endMinsAdjusted = endMins != null ? (endMins + incrementMinutes) % (24 * 60) : null;
          if (endMinsAdjusted != null) {
            const endFormatted = formatTime(Math.floor(endMinsAdjusted / 60), (endMinsAdjusted % 60).toString().padStart(2, '0'), { use24Hour, showAmPm });
            clockStr = `${startFormatted} – ${endFormatted}`;
          } else {
            clockStr = startFormatted;
          }
        }
      }

      const isCovering = coveringChipIds.has(chipId);
      const isEditing = editingChipId === block.id;
      const isEditingTime = isEditing && editingChipIsTime;
      const isChipBeingDragged =
        Boolean(dragPreview && dragPreview.sourceChipId === chipId);
      return (
        <div
          key={chipId}
          className="absolute left-0 top-0 flex w-full justify-center"
          style={{
            height: `${blockHeight}px`,
            zIndex: isActive || isEditing ? 11 : 10,
            pointerEvents: 'auto',
          }}
          draggable={!resizingBlockId && !isEditing}
          onDragStart={(event) => {
            if (resizingBlockId) {
              event.preventDefault();
              return;
            }
            handleSleepDragStart(event, chipId);
          }}
          onDrag={(event) => {
            logDragDebug('Chip drag', {
              chipId,
              client: { x: event.clientX, y: event.clientY },
              dataTypes: event.dataTransfer?.types,
            });
          }}
          onDragEnd={(event) => {
            logDragDebug('Chip drag end', {
              chipId,
              client: { x: event.clientX, y: event.clientY },
              dataTypes: event.dataTransfer?.types,
            });
          }}
        >
            <div
              className={`relative flex h-full w-full cursor-move select-none items-center justify-center rounded border border-transparent px-2 py-1 text-center font-semibold shadow-sm ${
                isActive ? 'outline outline-[2px]' : ''
              }`}
              style={{
                pointerEvents: isChipBeingDragged ? 'none' : 'auto',
              backgroundColor,
              color: textColor,
              fontWeight,
              border: isCovering ? '2px dashed #f97316' : '1px solid #ffffff',
              fontSize: `${14 * textSizeScale}px`,
              ...(isActive ? { outlineColor: '#000', outlineOffset: 0 } : null),
            }}
            onClick={(event) => {
              event.stopPropagation();
              setSelectedCell(null);
              if (event.shiftKey) {
                setSelectedBlockIds((prev) => {
                  const next = new Set(prev);
                  if (next.has(chipId)) {
                    next.delete(chipId);
                  } else {
                    next.add(chipId);
                  }
                  return next;
                });
              } else {
                setSelectedBlockIds((prev) => (prev.size === 1 && prev.has(chipId) ? new Set() : new Set([chipId])));
              }
            }}
            onDoubleClick={(event) => {
              event.stopPropagation();
              handleStartLabelEdit(chipId);
            }}
          >
            {isEditingTime ? (
              <div
                ref={editingChipContainerRef}
                className="flex w-full items-center gap-0.5"
                onMouseDown={(e) => e.stopPropagation()}
              >
                <input
                  ref={editingInputRef}
                  placeholder="Name"
                  className="min-w-0 flex-1 bg-transparent px-0.5 font-semibold text-slate-800 outline-none"
                  style={{ fontSize: `${13 * textSizeScale}px`, borderBottom: '1px solid rgba(0,0,0,0.3)' }}
                  value={editingChipLabel}
                  onChange={(event) => setEditingChipLabel(event.target.value.toUpperCase())}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') { event.preventDefault(); editingMinutesRef.current?.focus(); }
                    else if (event.key === 'Escape') { event.preventDefault(); handleCancelLabelEdit(); }
                  }}
                />
                <span className="shrink-0 font-semibold text-slate-800" style={{ fontSize: `${13 * textSizeScale}px` }}>:</span>
                <input
                  ref={editingMinutesRef}
                  placeholder="H.MM"
                  className="w-8 shrink-0 bg-transparent pr-0.5 font-semibold text-slate-800 outline-none"
                  style={{ fontSize: `${13 * textSizeScale}px`, borderBottom: '1px solid rgba(0,0,0,0.3)' }}
                  value={editingChipMinutes}
                  onChange={(event) => setEditingChipMinutes(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') { event.preventDefault(); handleConfirmLabelEdit(); }
                    else if (event.key === 'Escape') { event.preventDefault(); handleCancelLabelEdit(); }
                  }}
                />
              </div>
            ) : isEditing ? (
              <input
                ref={editingInputRef}
                className="w-full bg-white px-1 font-semibold text-slate-800 outline-none"
                style={{ fontSize: `${14 * textSizeScale}px` }}
                value={editingChipLabel}
                onChange={(event) => setEditingChipLabel(event.target.value.toUpperCase())}
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
              <ChipLabel
                normalizedLabel={normalizedLabel}
                baseFontSize={baseFontSize}
                wrap={isScheduleChip && chipIsMultiRow && blockHeight >= baseFontSize * 2.8}
                largeTimeStr={largeTimeStr}
                isEditing={isEditing}
                textSizeScale={textSizeScale}
                chipHeight={blockHeight}
                clockStr={projectId === 'sleep' ? null : clockStr}
                bottomOffset={sleepTimeInfo?.isTopChip ? '18px' : '2px'}
              />
            )}
            {sleepTimeInfo && !isEditing ? (() => {
              const startIdx = rowIndexMap.get(block.startRowId);
              const endIdx = rowIndexMap.get(block.endRowId ?? block.startRowId);
              const rowCount = startIdx != null && endIdx != null ? Math.abs(endIdx - startIdx) + 1 : 1;
              if (rowCount < 3) return null;
              return (
                <div
                  style={{
                    position: 'absolute',
                    [sleepTimeInfo.isTopChip ? 'bottom' : 'top']: '4px',
                    left: 0,
                    right: 0,
                    textAlign: 'center',
                    pointerEvents: 'none',
                    fontSize: `${11 * textSizeScale}px`,
                    opacity: 0.65,
                    fontWeight: 700,
                    lineHeight: 1,
                  }}
                >
                  {sleepTimeInfo.timeStr} {sleepTimeInfo.isTopChip ? 'Wake' : 'Bed'}
                </div>
              );
            })() : null}
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
      selectedBlockIds,
      projectMetadata,
      resizingBlockId,
      editingChipId,
      editingChipLabel,
      handleStartLabelEdit,
      handleConfirmLabelEdit,
      handleCancelLabelEdit,
      editingChipIsCustom,
      editingChipIsTime,
      editingChipMinutes,
      chipTimeOverrides,
      scheduleLayout,
      isDragging,
      setSelectedCell,
      setProjectChips,
      timelineRowIds,
      rowIndexMap,
      incrementMinutes,
      dragPreview,
      textSizeScale,
      startMinute,
      use24Hour,
      showAmPm,
      trailingMinuteRows,
      chipDisplayModes,
    ]
  );
  const renderDragOutline = useCallback(() => {
    if (!dragPreview) return null;
    const outlineHeight = getBlockHeight(
      dragPreview.startRowId,
      dragPreview.endRowId
    );
    const columnIndex = dragPreview.targetColumnIndex ?? -1;
    if (columnIndex < 0) return null;
    const columnRect = columnRects[columnIndex];
    if (!columnRect) return null;
    const baseRowIdx = rowIndexMap.get(dragPreview.startRowId);
    if (baseRowIdx == null) return null;
    const metrics = rowMetrics[dragPreview.startRowId];
    if (!metrics) return null;
    const scrollY = typeof window === 'undefined' ? 0 : window.scrollY || 0;
    const scrollX = typeof window === 'undefined' ? 0 : window.scrollX || 0;

    // columnRect.left and metrics.top are in absolute page coordinates (getBoundingClientRect + scroll)
    // We position the outline using fixed positioning to avoid any parent offset issues
    const left = columnRect.left - scrollX;
    const top = metrics.top - scrollY;

    return (
      <div
        className="pointer-events-none fixed z-20"
        style={{
          top,
          left,
          width: columnRect.width || 0,
          height: outlineHeight,
        }}
      >
        <div className="h-full w-full rounded border-2 border-dashed border-[#111827] bg-white/60" />
      </div>
    );
  }, [columnRects, dragPreview, getBlockHeight, rowIndexMap, rowMetrics]);
  const renderCellProjectMenu = useCallback(() => {
    if (!cellMenu) return null;
    const { position } = cellMenu;

    const stagedProjects = dropdownProjects.filter((p) => !p.id.startsWith('custom-'));
    const customChips = dropdownProjects.filter((p) => p.id.startsWith('custom-'));

    // Get the chip currently at the menu target cell (may be null)
    const targetChip = cellMenuBlockId ? projectChips.find((b) => b.id === cellMenuBlockId) : null;

    const renderRenameRow = (chipId, currentLabel) => {
      const isRenaming = menuRenamingChipId === chipId;
      if (!isRenaming) return null;
      return (
        <div className="px-3 pb-2" onClick={(e) => e.stopPropagation()}>
          <input
            ref={menuRenameInputRef}
            type="text"
            className="w-full rounded border border-[#94a3b8] bg-white px-2 py-1 text-[11px] text-slate-800 outline-none focus:border-black"
            value={menuRenamingLabel}
            onChange={(e) => setMenuRenamingLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); handleMenuRenameConfirm(); }
              else if (e.key === 'Escape') { e.preventDefault(); setMenuRenamingChipId(null); setMenuRenamingLabel(''); }
            }}
            onBlur={handleMenuRenameConfirm}
          />
        </div>
      );
    };

    return (
      <div
        ref={cellMenuRef}
        className="fixed z-50 rounded border border-[#94a3b8] shadow-2xl overflow-y-auto"
        style={{
          ...(position?.openAbove
            ? { bottom: window.innerHeight - (position?.top ?? 0), top: 'auto' }
            : { top: position?.top ?? 0 }),
          left: position?.left ?? 0,
          minWidth: Math.max(position?.width ?? 0, 260),
          maxHeight: position?.maxHeight ?? '80vh',
          backgroundColor: '#f8fafc',
        }}
      >
        {/* ── Schedule Items button ─────────────────────────────── */}
        <div className="px-2 pt-2 pb-1">
          <button
            type="button"
            className="flex w-full items-center justify-between px-2 py-1.5 rounded-sm text-[11px] font-semibold text-slate-600 hover:bg-slate-100"
            onClick={(e) => { e.stopPropagation(); setScheduleItemPanelOpen(true); }}
          >
            <span>Schedule Items</span>
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
              <path d="M4 8a.5.5 0 0 1 .5-.5h5.793L8.146 5.354a.5.5 0 1 1 .708-.708l3 3a.5.5 0 0 1 0 .708l-3 3a.5.5 0 0 1-.708-.708L10.293 8.5H4.5A.5.5 0 0 1 4 8z"/>
            </svg>
          </button>
        </div>
        <div className="mx-3 mb-1 border-t border-[#e5e7eb]" />

        {/* ── Projects section ──────────────────────────────────── */}
        <div className="px-3 pt-1 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          Projects
        </div>

        {stagedProjects.length ? (
          <ul className="list-none pb-1">
            {stagedProjects.map((project) => {
              const chipForProject = targetChip?.projectId === project.id ? targetChip : null;
              const chipId = chipForProject?.id ?? null;
              const isRenaming = chipId && menuRenamingChipId === chipId;
              return (
                <li key={project.id}>
                  <div className="flex items-center gap-1 px-2 py-1">
                    <button
                      type="button"
                      className="flex-1 px-2 py-1.5 text-left text-[11px] font-semibold rounded-sm hover:opacity-80 truncate"
                      style={{ backgroundColor: project.color || '#0f172a', color: '#ffffff' }}
                      onClick={() => handleProjectSelection(project.id)}
                    >
                      {project.label}
                    </button>
                    {chipId ? (
                      <button
                        type="button"
                        title="Rename chip"
                        className={`shrink-0 rounded p-1 text-slate-400 hover:text-slate-700 ${isRenaming ? 'text-blue-500' : ''}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (isRenaming) { handleMenuRenameConfirm(); }
                          else { handleMenuRenameStart(chipId, project.label); }
                        }}
                      >
                        <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M11.498 1.499a1.707 1.707 0 0 1 2.414 2.414l-9.5 9.5a1 1 0 0 1-.39.242l-3 1a1 1 0 0 1-1.268-1.268l1-3a1 1 0 0 1 .242-.39l9.502-9.498zm1 1-9.5 9.5-.646 1.94 1.94-.646 9.5-9.5a.707.707 0 0 0-1-1z"/></svg>
                      </button>
                    ) : null}
                  </div>
                  {chipId ? renderRenameRow(chipId, project.label) : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="px-3 py-1 text-[11px] text-slate-400">No projects added to plan</div>
        )}

        {/* ── Custom chips section ──────────────────────────────── */}
        {customChips.length ? (
          <>
            <div className="mx-3 my-1 border-t border-[#e5e7eb]" />
            <ul className="list-none pb-1">
              {customChips.map((project) => {
                const isRenamingDefinition = menuRenamingProjectId === project.id;
                const isEditingColor = colorEditorProjectId === project.id;
                const isPending = pendingCustomId === project.id;
                return (
                  <li key={project.id}>
                    <div className="flex items-center gap-1 px-2 py-1">
                      {isPending ? (
                        /* ── Inline text edit for newly created chip ── */
                        <>
                          <button
                            type="button"
                            title="Change colour"
                            className="shrink-0 rounded p-0.5 hover:opacity-80"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (isEditingColor) { setColorEditorProjectId(null); }
                              else { startColorEdit(project.id, project.color); }
                            }}
                          >
                            <span
                              className="block h-4 w-4 rounded-sm border border-[#94a3b8]"
                              style={{ backgroundColor: project.color || '#c9daf8' }}
                            />
                          </button>
                          <input
                            ref={pendingCustomInputRef}
                            type="text"
                            value={pendingCustomLabel}
                            onChange={(e) => setPendingCustomLabel(e.target.value.toUpperCase())}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') { e.preventDefault(); handlePendingCustomConfirm(); }
                              if (e.key === 'Escape') { e.preventDefault(); handlePendingCustomConfirm(); }
                            }}
                            className="flex-1 px-2 py-1 text-[11px] font-semibold rounded-sm border border-black bg-white text-slate-800 focus:outline-none uppercase"
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => e.stopPropagation()}
                          />
                          <button
                            type="button"
                            title="Confirm name"
                            className="shrink-0 rounded p-1 text-blue-500 hover:text-blue-700"
                            onClick={(e) => { e.stopPropagation(); handlePendingCustomConfirm(); }}
                          >
                            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M13.854 3.646a.5.5 0 0 1 0 .708l-7 7a.5.5 0 0 1-.708 0l-3.5-3.5a.5.5 0 1 1 .708-.708L6.5 10.293l6.646-6.647a.5.5 0 0 1 .708 0z"/></svg>
                          </button>
                        </>
                      ) : (
                        /* ── Normal chip row ── */
                        <>
                          <button
                            type="button"
                            className="flex-1 px-2 py-1.5 text-left text-[11px] font-semibold rounded-sm hover:opacity-80 truncate"
                            style={{ backgroundColor: project.color || '#0f172a', color: '#ffffff' }}
                            onClick={() => handleProjectSelection(project.id)}
                          >
                            {project.label.toUpperCase()}
                          </button>
                          {/* Colour swatch button — one click opens picker */}
                          <button
                            type="button"
                            title="Change colour"
                            className="shrink-0 rounded p-0.5 hover:opacity-80"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (isEditingColor) { setColorEditorProjectId(null); }
                              else { startColorEdit(project.id, project.color); }
                            }}
                          >
                            <span
                              className="block h-4 w-4 rounded-sm border border-[#94a3b8]"
                              style={{ backgroundColor: project.color || '#c9daf8' }}
                            />
                          </button>
                          {/* Rename button — renames the definition */}
                          <button
                            type="button"
                            title="Rename chip"
                            className={`shrink-0 rounded p-1 hover:text-slate-700 ${isRenamingDefinition ? 'text-blue-500' : 'text-slate-400'}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (isRenamingDefinition) { handleMenuDefinitionRenameConfirm(); }
                              else { handleMenuDefinitionRenameStart(project.id, project.label); }
                            }}
                          >
                            <Pencil size={14} />
                          </button>
                          {/* Delete button */}
                          <button
                            type="button"
                            title="Delete custom chip"
                            className="shrink-0 rounded p-1 text-slate-300 hover:text-red-600"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteCustomProject(project.id);
                            }}
                          >
                            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M6.5 1h3a.5.5 0 0 1 .5.5v1H6v-1a.5.5 0 0 1 .5-.5M11 2.5v-1A1.5 1.5 0 0 0 9.5 0h-3A1.5 1.5 0 0 0 5 1.5v1H1.5a.5.5 0 0 0 0 1h.538l.853 10.66A2 2 0 0 0 4.885 16h6.23a2 2 0 0 0 1.994-1.84l.853-10.66h.538a.5.5 0 0 0 0-1zm1.958 1-.846 10.58a1 1 0 0 1-.997.92h-6.23a1 1 0 0 1-.997-.92L3.042 3.5zm-7.487 1a.5.5 0 0 1 .528.47l.5 8.5a.5.5 0 0 1-.998.06L5 5.03a.5.5 0 0 1 .47-.53Zm5.058 0a.5.5 0 0 1 .47.53l-.5 8.5a.5.5 0 1 1-.998-.06l.5-8.5a.5.5 0 0 1 .528-.47M8 4.5a.5.5 0 0 1 .5.5v8.5a.5.5 0 0 1-1 0V5a.5.5 0 0 1 .5-.5"/></svg>
                          </button>
                        </>
                      )}
                    </div>
                    {/* Inline colour picker — opens immediately (defaultOpen) */}
                    {isEditingColor ? (
                      <div className="px-3 pb-2" onClick={(e) => e.stopPropagation()}>
                        <ColourPicker
                          value={colorEditorColor}
                          onChange={handleColorChange}
                          defaultOpen
                        />
                      </div>
                    ) : null}
                    {isRenamingDefinition ? (
                      <div className="px-3 pb-2" onClick={(e) => e.stopPropagation()}>
                        <input
                          ref={menuRenameProjectInputRef}
                          type="text"
                          value={menuRenamingProjectLabel}
                          onChange={(e) => setMenuRenamingProjectLabel(e.target.value.toUpperCase())}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') { e.preventDefault(); handleMenuDefinitionRenameConfirm(); }
                            else if (e.key === 'Escape') { e.preventDefault(); setMenuRenamingProjectId(null); setMenuRenamingProjectLabel(''); }
                          }}
                          onBlur={handleMenuDefinitionRenameConfirm}
                          className="w-full px-2 py-1 text-[11px] font-semibold rounded-sm border border-black bg-white text-slate-800 focus:outline-none uppercase"
                          onMouseDown={(e) => e.stopPropagation()}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </>
        ) : null}

        {/* Add custom button */}
        <div className="px-2 pb-2">
          <button
            type="button"
            className="w-full px-3 py-1.5 text-center text-[11px] font-semibold rounded-sm border border-dashed border-[#94a3b8] text-slate-500 hover:border-slate-400 hover:text-slate-700 hover:bg-slate-50"
            onClick={handleCreateCustomProject}
          >
            + Add custom
          </button>
        </div>

        {/* ── Defaults section ──────────────────────────────────── */}
        <div className="mx-3 my-1 border-t border-[#e5e7eb]" />
        <div className="px-3 pt-1 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          Defaults
        </div>
        <div className="flex gap-1.5 px-2 pb-2">
          <button
            type="button"
            className="flex-1 px-2 py-1.5 text-center text-[11px] font-semibold rounded-sm hover:opacity-80"
            style={{ backgroundColor: '#d9d9d9', color: '#000000' }}
            onClick={() => handleProjectSelection('sleep')}
          >
            Sleep
          </button>
          <button
            type="button"
            className="flex-1 px-2 py-1.5 text-center text-[11px] font-semibold rounded-sm hover:opacity-80"
            style={{ backgroundColor: '#666666', color: '#ffffff' }}
            onClick={() => handleProjectSelection('rest')}
          >
            REST
          </button>
          <button
            type="button"
            className="flex-1 px-2 py-1.5 text-center text-[11px] font-semibold rounded-sm hover:opacity-80"
            style={{ backgroundColor: '#fe8afe', color: '#ffffff' }}
            onClick={() => handleProjectSelection('buffer')}
          >
            BUFFER
          </button>
        </div>

        {/* ── Rename schedule chip ──────────────────────────────── */}
        {targetChip?.id?.startsWith('schedule-chip-') ? (() => {
          const extraMarker = targetChip.id.indexOf('-extra-chip-');
          const idForParsing = extraMarker !== -1 ? targetChip.id.slice(0, extraMarker) : targetChip.id;
          const itemIdxMatch = idForParsing.match(/-(\d+)$/);
          const itemIdx = itemIdxMatch ? parseInt(itemIdxMatch[1], 10) : null;
          const scheduleItems = itemIdx != null
            ? (scheduleLayout.scheduleItemsByProject.get(targetChip.projectId) ?? [])
            : [];
          const scheduleItem = itemIdx != null ? scheduleItems[itemIdx] : null;
          const scheduleDefaultText = SECTION_CONFIG.Schedule.placeholder;
          const itemName = scheduleItem ? (scheduleItem.name ?? '').trim() : '';
          const hasScheduleName = Boolean(itemName && itemName !== scheduleDefaultText);
          const currentLabel = targetChip.displayLabel || (hasScheduleName ? itemName : (projectMetadata.get(targetChip.projectId)?.label ?? 'Project'));
          const isRenaming = menuRenamingChipId === targetChip.id;
          return (
            <>
              <div className="mx-3 my-1 border-t border-[#e5e7eb]" />
              <div className="px-2 pb-1">
                <div className="flex items-center gap-1 px-1 py-1">
                  <span className="flex-1 px-1 text-[11px] text-slate-500 truncate">{currentLabel}</span>
                  <button
                    type="button"
                    title="Rename chip"
                    className={`shrink-0 rounded p-1 hover:text-slate-700 ${isRenaming ? 'text-blue-500' : 'text-slate-400'}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (isRenaming) { handleMenuRenameConfirm(); }
                      else { handleMenuRenameStart(targetChip.id, currentLabel); }
                    }}
                  >
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M11.498 1.499a1.707 1.707 0 0 1 2.414 2.414l-9.5 9.5a1 1 0 0 1-.39.242l-3 1a1 1 0 0 1-1.268-1.268l1-3a1 1 0 0 1 .242-.39l9.502-9.498zm1 1-9.5 9.5-.646 1.94 1.94-.646 9.5-9.5a.707.707 0 0 0-1-1z"/></svg>
                  </button>
                </div>
                {renderRenameRow(targetChip.id, currentLabel)}
              </div>
            </>
          );
        })() : null}

        {/* ── Display mode ──────────────────────────────────────── */}
        {(() => {
          const flags = chipDisplayModes['__default__'] && typeof chipDisplayModes['__default__'] === 'object' ? chipDisplayModes['__default__'] : { duration: false, clock: false };
          const toggles = [
            { flag: 'duration', label: 'Duration' },
            { flag: 'clock', label: 'Clock time' },
          ];
          return (
            <>
              <div className="mx-3 my-1 border-t border-[#e5e7eb]" />
              <div className="px-3 pt-1 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Display
              </div>
              <div className="flex gap-1 px-2 pb-2">
                {toggles.map(({ flag, label }) => (
                  <button
                    key={flag}
                    type="button"
                    className={`flex-1 rounded-sm px-1.5 py-1 text-[10px] font-semibold transition-colors ${
                      flags[flag]
                        ? 'bg-slate-700 text-white'
                        : 'bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700'
                    }`}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleToggleChipDisplayFlag('__default__', flag);
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </>
          );
        })()}

        {/* ── Remove chip ───────────────────────────────────────── */}
        <div className="border-t border-[#e5e7eb] px-3 py-1.5">
          <button
            type="button"
            className="flex w-full items-center gap-2 py-1 text-left text-[11px] font-semibold text-red-500 hover:text-red-700 disabled:text-slate-300 disabled:cursor-not-allowed"
            onClick={handleRemoveSelectedChip}
            disabled={!removableBlockId}
          >
            Remove chip
          </button>
        </div>
      </div>
    );
  }, [
    cellMenu,
    cellMenuBlockId,
    projectChips,
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
    menuRenamingChipId,
    menuRenamingLabel,
    menuRenameInputRef,
    handleMenuRenameStart,
    handleMenuRenameConfirm,
    setMenuRenamingChipId,
    setMenuRenamingLabel,
    pendingCustomId,
    pendingCustomLabel,
    setPendingCustomLabel,
    pendingCustomInputRef,
    handlePendingCustomConfirm,
    menuRenamingProjectId,
    menuRenamingProjectLabel,
    setMenuRenamingProjectLabel,
    menuRenameProjectInputRef,
    handleMenuDefinitionRenameStart,
    handleMenuDefinitionRenameConfirm,
    setMenuRenamingProjectId,
    setScheduleItemPanelOpen,
    scheduleLayout,
    projectMetadata,
    chipDisplayModes,
    handleToggleChipDisplayFlag,
  ]);

  // Sync sticky header horizontal scroll with table container
  useEffect(() => {
    const container = tableContainerRef.current;
    const header = headerContainerRef.current;
    if (!container || !header) return undefined;
    const onScroll = () => { header.scrollLeft = container.scrollLeft; };
    container.addEventListener('scroll', onScroll);
    return () => container.removeEventListener('scroll', onScroll);
  }, []);

  // Measure nav bar height for sticky header offset
  useEffect(() => {
    if (!navBarRef.current) return undefined;
    const observer = new ResizeObserver(() => {
      setNavBarHeight(navBarRef.current?.offsetHeight ?? 0);
    });
    observer.observe(navBarRef.current);
    setNavBarHeight(navBarRef.current.offsetHeight);
    return () => observer.disconnect();
  }, []);

  // Override global overflow:hidden to allow page scrolling
  useEffect(() => {
    const root = document.getElementById('root');
    const html = document.documentElement;
    const body = document.body;

    // Store original values
    const originalRootOverflow = root?.style.overflow;
    const originalHtmlOverflow = html?.style.overflow;
    const originalBodyOverflow = body?.style.overflow;
    const originalRootHeight = root?.style.height;

    // Set to visible/auto for scrolling - only body gets vertical scrollbar to avoid double scrollbar
    if (root) {
      root.style.overflow = 'visible';
      root.style.height = 'auto';
    }
    if (html) html.style.overflow = 'visible';
    if (body) body.style.overflow = 'auto';

    // Cleanup: restore original values when unmounting
    return () => {
      if (root) {
        root.style.overflow = originalRootOverflow || '';
        root.style.height = originalRootHeight || '';
      }
      if (html) html.style.overflow = originalHtmlOverflow || '';
      if (body) body.style.overflow = originalBodyOverflow || '';
    };
  }, []);

  return (
    <div
      className="w-full min-h-screen bg-gray-100 text-slate-800"
      onDragOver={handleRootDragOver}
      onDrop={handleRootDrop}
    >
      <div className="space-y-4">
        <div ref={navBarRef} className="sticky top-0 z-20 bg-gray-100 px-4 pt-4 pb-4">
        <NavigationBar
          listicalButton={
            <ListicalMenu
              incrementMinutes={incrementMinutes}
              onIncrementChange={setIncrementMinutes}
              onResetChips={resetChips}
              onClearAllChips={handleClearAllChips}
              startDay={startDay}
              onStartDayChange={handleStartDayChange}
              startHour={startHour}
              onStartHourChange={setStartHour}
              startMinute={startMinute}
              onStartMinuteChange={setStartMinute}
              hourOptions={hourOptions}
              minuteOptions={minuteOptions}
              showAmPm={showAmPm}
              onShowAmPmChange={setShowAmPm}
              use24Hour={use24Hour}
              onUse24HourChange={setUse24Hour}
              undoStack={undoStack}
              redoStack={redoStack}
              undo={undo}
              redo={redo}
            />
          }
          actionButton={
            <button
              type="button"
              onClick={handleSendToSystem}
              className="px-4 py-2 text-sm font-semibold rounded-lg transition-all duration-200 border border-slate-200 bg-white text-slate-700 hover:bg-slate-900 hover:text-white hover:border-slate-900"
            >
              {sendToSystemDone ? 'Sent ✓' : 'Send to System →'}
            </button>
          }
        />
        </div>
        <div className="rounded border border-[#ced3d0] bg-white shadow-sm mx-4 mb-4">
          {/* Sticky header row — outside the horizontal scroll container so it can stick vertically */}
          <div
            style={{
              position: 'sticky',
              top: navBarHeight,
              zIndex: 12,
              backgroundColor: 'white',
            }}
          >
            <div
              ref={headerContainerRef}
              style={{ overflowX: 'hidden', paddingRight: `calc(100vw - ${col0Width}px)`, userSelect: 'none' }}
            >
            <table
              className="border-collapse text-[11px] text-slate-800"
              style={{ display: 'table', width: `${tableWidth}px`, minWidth: `${tableWidth}px`, userSelect: 'none' }}
            >
              <tbody>
                <tr className="grid text-sm" style={{ gridTemplateColumns }}>
                {Array.from({ length: 9 }, (_, index) => {
                  if (index === 0 || index === 8) {
                    return (
                      <td
                        key={`blank-${index}`}
                        className="border border-[#e5e7eb] px-3 py-px text-center font-semibold"
                        style={index === 0 ? { position: 'sticky', left: 0, zIndex: 11, backgroundColor: 'white' } : { position: 'relative' }}
                      >
                        {/* Add resize handle */}
                        <div
                          onMouseDown={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            const width = columnWidths[index] || (index === 0 ? 120 : 140);
                            handleColumnResize(index, e.clientX, width);
                          }}
                          style={{
                            position: 'absolute',
                            right: '-2px',
                            top: 0,
                            bottom: 0,
                            width: '8px',
                            cursor: 'col-resize',
                            backgroundColor: 'transparent',
                            zIndex: 10,
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = '#000000';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = 'transparent';
                          }}
                          title="Drag to resize column"
                        />
                      </td>
                    );
                  }
                  if (index === 1) {
                    return (
                      <td key="selector" className="border border-[#e5e7eb] px-3 py-px text-center font-semibold" style={{ position: 'relative' }}>
                        {startDay}
                        {/* Add resize handle */}
                        <div
                          onMouseDown={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            const width = columnWidths[index] || 140;
                            handleColumnResize(index, e.clientX, width);
                          }}
                          style={{
                            position: 'absolute',
                            right: '-2px',
                            top: 0,
                            bottom: 0,
                            width: '8px',
                            cursor: 'col-resize',
                            backgroundColor: 'transparent',
                            zIndex: 10,
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = '#000000';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = 'transparent';
                          }}
                          title="Drag to resize column"
                        />
                      </td>
                    );
                  }
                  const dayIndex = index - 2;
                      return (
                        <td key={`day-${index}`} className="border border-[#e5e7eb] px-3 py-px text-center font-semibold" style={{ position: 'relative' }}>
                          {sequence[dayIndex] ?? ''}
                          {/* Add resize handle */}
                          <div
                            onMouseDown={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              const width = columnWidths[index] || 140;
                              handleColumnResize(index, e.clientX, width);
                            }}
                            style={{
                              position: 'absolute',
                              right: '-2px',
                              top: 0,
                              bottom: 0,
                              width: '8px',
                              cursor: 'col-resize',
                              backgroundColor: 'transparent',
                              zIndex: 10,
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = '#000000';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = 'transparent';
                            }}
                            title="Drag to resize column"
                          />
                        </td>
                      );
                    })}
                {renderExtraColumnCells('header')}
                </tr>
              </tbody>
            </table>
            </div>
          </div>
          {/* Scrollable body — horizontal scroll only */}
          <div
            ref={tableContainerRef}
            onDrop={handleTableDrop}
            onDragOver={handleTableDragOver}
            style={{ display: 'block', paddingBottom: '440px', paddingRight: `calc(100vw - ${col0Width}px)`, overflowX: 'auto', userSelect: 'none' }}
          >
          {renderDragOutline()}
          <table
            ref={tableElementRef}
            className="border-collapse text-[11px] text-slate-800"
            style={{ display: 'table', width: `${tableWidth}px`, minWidth: `${tableWidth}px`, userSelect: 'none' }}
          >
            <tbody>
              <tr className="grid" style={{ gridTemplateColumns }}>
                <td
                  className="border border-[#e5e7eb] px-3 py-px font-semibold text-center"
                  data-row-id-anchor="sleep-start"
                  style={{ fontSize: `${14 * textSizeScale}px`, position: 'sticky', left: 0, zIndex: 11, backgroundColor: 'white' }}
                >
                  {(() => {
                    if (!startHour) return '—';
                    const m = parseHour12ToMinutes(startHour);
                    return m != null ? formatTime(Math.floor(m / 60), (m % 60).toString().padStart(2, '0'), { use24Hour, showAmPm }) : startHour;
                  })()}
                </td>
                {Array.from({ length: totalColumnCount }, (_, index) => {
                  const isDayColumn = index < DAY_COLUMN_COUNT;
                  const dayLabel = isDayColumn ? displayedWeekDays[index] ?? '' : '';
                  const hasDay = isDayColumn && Boolean(dayLabel);
                  const stagingIdx = index - DAY_COLUMN_COUNT;
                  const stagingConfig =
                    !isDayColumn && stagingIdx >= 0
                      ? extendedStagingColumnConfigs[stagingIdx]
                      : null;
                  const hasSavedChips =
                    !isDayColumn && getProjectChipsByColumnIndex(index).length > 0;
                  const isProjectColumn =
                    !isDayColumn && (stagingConfig?.type === 'project' || hasSavedChips);
                  const isInteractiveColumn = hasDay || isProjectColumn;
                  const rowId = 'sleep-start';
                  const columnBlocks = isInteractiveColumn
                    ? getProjectChipsByColumnIndex(index)
                    : [];
                  const activeBlock =
                    isInteractiveColumn && highlightedBlockId != null
                      ? columnBlocks.find((block) => block.id === highlightedBlockId)
                      : null;
                  const isCovered = activeBlock ? isRowWithinBlock(rowId, activeBlock) : false;
                  const labels = isInteractiveColumn
                    ? columnBlocks
                        .filter((block) => block.startRowId === rowId)
                        .map((block) => renderProjectChip(block.id, rowId))
                    : [];
                  const cellSelected = isInteractiveColumn && isCellSelected(index, rowId);
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
                      className={`relative border border-[#e5e7eb] px-3 py-px text-center overflow-visible ${
                        cellSelected ? 'outline outline-[2px]' : ''
                      }`}
                      style={Object.keys(cellStyle).length ? cellStyle : undefined}
                      data-row-id={rowId}
                      data-day-column={index}
                      data-day={hasDay ? dayLabel : undefined}
                      onMouseDown={isInteractiveColumn ? (event) => { if (event.shiftKey) event.preventDefault(); } : undefined}
                      onDragOver={isInteractiveColumn ? handleSleepDragOver : undefined}
                      onDrop={isInteractiveColumn ? handleSleepDrop : undefined}
                      onClick={
                        isInteractiveColumn ? () => toggleCellSelection(index, rowId) : undefined
                      }
                      onContextMenu={
                        isInteractiveColumn
                          ? (event) => handleCellContextMenu(event, index, rowId)
                          : undefined
                      }
                    >
                      {labels}
                    </td>
                  );
                })}
              </tr>
              {hourRows.map((hourValue) => (
                <tr key={`hour-row-${hourValue}`} className="grid" style={{ gridTemplateColumns }}>
                  <td
                    className="border border-[#e5e7eb] px-3 py-px font-semibold text-center"
                    data-row-id-anchor={`hour-${hourValue}`}
                    style={{ fontSize: `${14 * textSizeScale}px`, position: 'sticky', left: 0, zIndex: 11, backgroundColor: 'white' }}
                  >
                    {formatTime(hourValue, '00', { use24Hour, showAmPm })}
                  </td>
                  {Array.from({ length: totalColumnCount }, (_, index) => {
                    const isDayColumn = index < DAY_COLUMN_COUNT;
                    const dayLabel = isDayColumn ? displayedWeekDays[index] ?? '' : '';
                    const hasDay = isDayColumn && Boolean(dayLabel);
                    const stagingIdx = index - DAY_COLUMN_COUNT;
                    const stagingConfig =
                      !isDayColumn && stagingIdx >= 0
                        ? extendedStagingColumnConfigs[stagingIdx]
                        : null;
                    const hasSavedChips =
                      !isDayColumn && getProjectChipsByColumnIndex(index).length > 0;
                    const isProjectColumn =
                      !isDayColumn && (stagingConfig?.type === 'project' || hasSavedChips);
                    const isInteractiveColumn = hasDay || isProjectColumn;
                    const rowId = `hour-${hourValue}`;
                    const columnBlocks = isInteractiveColumn
                      ? getProjectChipsByColumnIndex(index)
                      : [];
                    const activeBlock =
                      isInteractiveColumn && highlightedBlockId != null
                        ? columnBlocks.find((block) => block.id === highlightedBlockId)
                        : null;
                    const isCovered = activeBlock ? isRowWithinBlock(rowId, activeBlock) : false;
                    const labels = isInteractiveColumn
                      ? columnBlocks
                          .filter((block) => block.startRowId === rowId)
                          .map((block) => renderProjectChip(block.id, rowId))
                      : [];
                    const cellSelected = isInteractiveColumn && isCellSelected(index, rowId);
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
                        className={`relative border border-[#e5e7eb] px-3 py-px text-center overflow-visible ${
                          cellSelected ? 'outline outline-[2px]' : ''
                        }`}
                        style={Object.keys(cellStyle).length ? cellStyle : undefined}
                        data-row-id={rowId}
                        data-day-column={index}
                        data-day={hasDay ? dayLabel : undefined}
                        onMouseDown={isInteractiveColumn ? (event) => { if (event.shiftKey) event.preventDefault(); } : undefined}
                        onDragOver={isInteractiveColumn ? handleSleepDragOver : undefined}
                        onDrop={isInteractiveColumn ? handleSleepDrop : undefined}
                        onClick={
                          isInteractiveColumn ? () => toggleCellSelection(index, rowId) : undefined
                        }
                        onContextMenu={
                          isInteractiveColumn
                            ? (event) => handleCellContextMenu(event, index, rowId)
                            : undefined
                        }
                      >
                        {labels}
                      </td>
                    );
                  })}
                </tr>
              ))}
              <tr className="grid" style={{ gridTemplateColumns }}>
                <td
                  className="border border-[#e5e7eb] px-3 py-px font-semibold text-center"
                  data-row-id-anchor="sleep-end"
                  style={{ fontSize: `${14 * textSizeScale}px`, position: 'sticky', left: 0, zIndex: 11, backgroundColor: 'white' }}
                >
                  {(() => {
                    if (!startMinute) return '—';
                    const m = parseHour12ToMinutes(startMinute);
                    return m != null ? formatTime(Math.floor(m / 60), (m % 60).toString().padStart(2, '0'), { use24Hour, showAmPm }) : startMinute;
                  })()}
                </td>
                {Array.from({ length: totalColumnCount }, (_, index) => {
                  const isDayColumn = index < DAY_COLUMN_COUNT;
                  const dayLabel = isDayColumn ? displayedWeekDays[index] ?? '' : '';
                  const hasDay = isDayColumn && Boolean(dayLabel);
                  const stagingIdx = index - DAY_COLUMN_COUNT;
                  const stagingConfig =
                    !isDayColumn && stagingIdx >= 0
                      ? extendedStagingColumnConfigs[stagingIdx]
                      : null;
                  const hasSavedChips =
                    !isDayColumn && getProjectChipsByColumnIndex(index).length > 0;
                  const isProjectColumn =
                    !isDayColumn && (stagingConfig?.type === 'project' || hasSavedChips);
                  const isInteractiveColumn = hasDay || isProjectColumn;
                  const rowId = 'sleep-end';
                  const columnBlocks = isInteractiveColumn
                    ? getProjectChipsByColumnIndex(index)
                    : [];
                  const activeBlock =
                    isInteractiveColumn && highlightedBlockId != null
                      ? columnBlocks.find((block) => block.id === highlightedBlockId)
                      : null;
                  const isCovered = activeBlock ? isRowWithinBlock(rowId, activeBlock) : false;
                  const labels = isInteractiveColumn
                    ? columnBlocks
                        .filter((block) => block.startRowId === rowId)
                        .map((block) => renderProjectChip(block.id, rowId))
                    : [];
                  const cellSelected = isInteractiveColumn && isCellSelected(index, rowId);
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
                      className={`relative border border-[#e5e7eb] px-3 py-px text-center overflow-visible ${
                        cellSelected ? 'outline outline-[2px]' : ''
                      }`}
                      style={Object.keys(cellStyle).length ? cellStyle : undefined}
                      data-row-id={rowId}
                      data-day-column={index}
                      data-day={hasDay ? dayLabel : undefined}
                      onMouseDown={isInteractiveColumn ? (event) => { if (event.shiftKey) event.preventDefault(); } : undefined}
                      onDragOver={isInteractiveColumn ? handleSleepDragOver : undefined}
                      onDrop={isInteractiveColumn ? handleSleepDrop : undefined}
                      onClick={
                        isInteractiveColumn ? () => toggleCellSelection(index, rowId) : undefined
                      }
                      onContextMenu={
                        isInteractiveColumn
                          ? (event) => handleCellContextMenu(event, index, rowId)
                          : undefined
                      }
                    >
                      {labels}
                    </td>
                  );
                })}
              </tr>
              {trailingMinuteRows.map((minutesValue, rowIdx) => (
                <tr key={`trailing-row-${rowIdx}`} className="grid" style={{ gridTemplateColumns }}>
                  <td
                    className="border border-[#e5e7eb] px-3 py-px font-semibold text-center"
                    data-row-id-anchor={`trailing-${rowIdx}`}
                    style={{ fontSize: `${14 * textSizeScale}px`, position: 'sticky', left: 0, zIndex: 11, backgroundColor: 'white' }}
                  >
                    {formatTime(
                      Math.floor(minutesValue / 60),
                      (minutesValue % 60).toString().padStart(2, '0'),
                      { use24Hour, showAmPm }
                    )}
                  </td>
                  {Array.from({ length: totalColumnCount }, (_, index) => {
                    const isDayColumn = index < DAY_COLUMN_COUNT;
                    const dayLabel = isDayColumn ? displayedWeekDays[index] ?? '' : '';
                    const hasDay = isDayColumn && Boolean(dayLabel);
                    const stagingIdx = index - DAY_COLUMN_COUNT;
                    const stagingConfig =
                      !isDayColumn && stagingIdx >= 0
                        ? extendedStagingColumnConfigs[stagingIdx]
                        : null;
                    const hasSavedChips =
                      !isDayColumn && getProjectChipsByColumnIndex(index).length > 0;
                    const isProjectColumn =
                      !isDayColumn && (stagingConfig?.type === 'project' || hasSavedChips);
                    const isInteractiveColumn = hasDay || isProjectColumn;
                    const rowId = `trailing-${rowIdx}`;
                    const columnBlocks = isInteractiveColumn
                      ? getProjectChipsByColumnIndex(index)
                      : [];
                    const activeBlock =
                      isInteractiveColumn && highlightedBlockId != null
                        ? columnBlocks.find((block) => block.id === highlightedBlockId)
                        : null;
                    const isCovered = activeBlock ? isRowWithinBlock(rowId, activeBlock) : false;
                    const labels = isInteractiveColumn
                      ? columnBlocks
                          .filter((block) => block.startRowId === rowId)
                          .map((block) => renderProjectChip(block.id, rowId))
                      : [];
                    const cellSelected = isInteractiveColumn && isCellSelected(index, rowId);
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
                        className={`relative border border-[#e5e7eb] px-3 py-px text-center overflow-visible ${
                          cellSelected ? 'outline outline-[2px]' : ''
                        }`}
                        style={Object.keys(cellStyle).length ? cellStyle : undefined}
                        data-row-id={rowId}
                        data-day-column={index}
                        data-day={hasDay ? dayLabel : undefined}
                        onMouseDown={isInteractiveColumn ? (event) => { if (event.shiftKey) event.preventDefault(); } : undefined}
                        onDragOver={isInteractiveColumn ? handleSleepDragOver : undefined}
                        onDrop={isInteractiveColumn ? handleSleepDrop : undefined}
                        onClick={
                          isInteractiveColumn ? () => toggleCellSelection(index, rowId) : undefined
                        }
                        onContextMenu={
                          isInteractiveColumn
                            ? (event) => handleCellContextMenu(event, index, rowId)
                            : undefined
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
                  colSpan={1 + totalColumnCount}
                  className="px-3 py-2 text-[11px]"
                  style={{ height: '14px', backgroundColor: '#000' }}
                ></td>
              </tr>
              <tr
                data-summary-row
                className={`grid text-sm cursor-pointer ${
                  selectedSummaryRowId === 'sleep-summary' ? 'outline outline-[2px]' : ''
                }`}
                style={
                  selectedSummaryRowId === 'sleep-summary'
                    ? { gridTemplateColumns, outlineColor: '#000', outlineOffset: 0 }
                    : { gridTemplateColumns }
                }
                tabIndex={0}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => toggleSummaryRowSelection('sleep-summary')}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    toggleSummaryRowSelection('sleep-summary');
                  }
                }}
              >
                <td
                  className="border border-[#e5e7eb] px-3 py-px text-center"
                  style={{ backgroundColor: '#d9d9d9', color: '#000', fontWeight: 700, fontSize: `${14 * textSizeScale}px`, position: 'sticky', left: 0, zIndex: 11 }}
                >
                  Sleep
                </td>
                {displayedWeekDays.map((day, idx) => {
                  const minutes = sleepColumnTotals[idx] ?? 0;
                  return (
                    <td
                      key={`sleep-row-${day}-${idx}`}
                      className="border border-[#e5e7eb] px-3 py-px text-center"
                      style={{ backgroundColor: '#efefef', fontSize: `${14 * textSizeScale}px` }}
                    >
                      {formatDuration(minutes)}
                    </td>
                  );
                })}
                <td
                  className="border border-[#e5e7eb] px-3 py-px text-center font-semibold"
                  style={{ backgroundColor: '#efefef', fontSize: `${14 * textSizeScale}px` }}
                >
                  {formatDuration(totalSleepMinutes)}
                </td>
                {renderExtraColumnCells('summary-sleep')}
              </tr>
              {orderedProjectSummaries.map((summary) => {
                const rowSelected = selectedSummaryRowId === summary.id;
                const isDragOver = summaryDragOverId === summary.id;
                return (
                  <tr
                    key={`project-summary-${summary.id}`}
                    data-summary-row
                    className={`grid text-sm cursor-pointer ${
                      rowSelected ? 'outline outline-[2px]' : ''
                    }`}
                    style={
                      rowSelected
                        ? { gridTemplateColumns, outlineColor: '#000', outlineOffset: 0 }
                        : { gridTemplateColumns }
                    }
                    tabIndex={0}
                    draggable
                    onDragStart={(e) => handleSummaryDragStart(e, summary.id)}
                    onDragOver={(e) => handleSummaryDragOver(e, summary.id)}
                    onDragLeave={handleSummaryDragLeave}
                    onDrop={(e) => handleSummaryDrop(e, summary.id, orderedProjectSummaries.map((s) => s.id))}
                    onClick={() => toggleSummaryRowSelection(summary.id)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        toggleSummaryRowSelection(summary.id);
                      }
                    }}
                  >
                    <td
                      className="border border-[#e5e7eb] py-px text-center"
                      style={{
                        backgroundColor: summary.color || '#0f172a',
                        color: '#ffffff',
                        fontWeight: 700,
                        fontSize: `${14 * textSizeScale}px`,
                        position: 'sticky',
                        left: 0,
                        zIndex: 11,
                        display: 'grid',
                        gridTemplateColumns: '20px 1fr',
                        alignItems: 'center',
                        cursor: 'grab',
                        paddingRight: '12px',
                        ...(isDragOver ? { borderTop: '2px solid #111111' } : {}),
                      }}
                    >
                      <span style={{ opacity: 0.45, fontSize: '11px', lineHeight: 1, userSelect: 'none', textAlign: 'center' }}>⠿</span>
                      <span style={{ textAlign: 'center' }}>{summary.label}</span>
                    </td>
                    {displayedWeekDays.map((day, idx) => {
                      const val = summary.columnTotals[idx] ?? 0;
                      const hasValue = val > 0;
                      return (
                        <td
                          key={`project-${summary.id}-${day}-${idx}`}
                          className="border border-[#e5e7eb] px-3 py-px text-center"
                          style={{
                            backgroundColor: hasValue ? '#f5f5f5' : '#ffffff',
                            fontWeight: hasValue ? 700 : 400,
                            color: hasValue ? '#111111' : '#9ca3af',
                            fontSize: `${14 * textSizeScale}px`,
                            ...(isDragOver ? { borderTop: '2px solid #111111' } : {}),
                          }}
                        >
                          {formatDuration(val)}
                        </td>
                      );
                    })}
                    <td
                      className="border border-[#e5e7eb] px-3 py-px text-center font-semibold"
                      style={{ backgroundColor: '#ffffff', fontSize: `${14 * textSizeScale}px`, ...(isDragOver ? { borderTop: '2px solid #111111' } : {}) }}
                    >
                      {formatDuration(summary.totalMinutes)}
                    </td>
                    {renderExtraColumnCells(`summary-${summary.id}`)}
                  </tr>
                );
              })}
              <tr
                data-summary-row
                className={`grid text-sm cursor-pointer ${
                  selectedSummaryRowId === 'rest-summary' ? 'outline outline-[2px]' : ''
                }`}
                style={{
                  gridTemplateColumns,
                  backgroundColor: '#666666',
                  color: '#ffffff',
                  fontWeight: 700,
                  ...(selectedSummaryRowId === 'rest-summary'
                    ? { outlineColor: '#000', outlineOffset: 0 }
                    : null),
                }}
                tabIndex={0}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => toggleSummaryRowSelection('rest-summary')}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    toggleSummaryRowSelection('rest-summary');
                  }
                }}
              >
                <td
                  className="border border-[#e5e7eb] px-3 py-px text-center"
                  style={{ backgroundColor: '#666666', color: '#ffffff', fontWeight: 700, fontSize: `${14 * textSizeScale}px`, position: 'sticky', left: 0, zIndex: 11 }}
                >
                  REST
                </td>
                {displayedWeekDays.map((day, idx) => (
                  <td
                    key={`rest-row-${day}-${idx}`}
                    className="border border-[#e5e7eb] px-3 py-px text-center"
                    style={{ backgroundColor: '#666666', color: '#ffffff', fontWeight: 700, fontSize: `${14 * textSizeScale}px` }}
                  >
                    {formatDuration(restColumnTotals[idx] ?? 0)}
                  </td>
                ))}
                <td
                  className="border border-[#e5e7eb] px-3 py-px text-center font-semibold"
                  style={{ backgroundColor: '#666666', color: '#ffffff', fontWeight: 700, fontSize: `${14 * textSizeScale}px` }}
                >
                  {formatDuration(totalRestMinutes)}
                </td>
                {renderExtraColumnCells('summary-rest')}
              </tr>
              <tr
                className="grid"
                style={{ gridTemplateColumns, backgroundColor: '#ffffff', height: '14px' }}
              >
                {Array.from({ length: 1 + DAY_COLUMN_COUNT }, (_, cellIndex) => (
                  <td
                    key={`spacer-${cellIndex}`}
                    className="px-1"
                    style={{ border: 0, backgroundColor: '#ffffff' }}
                  />
                ))}
                {renderExtraColumnCells('summary-spacer')}
              </tr>
              <tr
                data-summary-row
                className={`grid text-sm cursor-pointer ${
                  selectedSummaryRowId === 'working-summary' ? 'outline outline-[2px]' : ''
                }`}
                style={
                  selectedSummaryRowId === 'working-summary'
                    ? { gridTemplateColumns, outlineColor: '#000', outlineOffset: 0 }
                    : { gridTemplateColumns }
                }
                tabIndex={0}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => toggleSummaryRowSelection('working-summary')}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    toggleSummaryRowSelection('working-summary');
                  }
                }}
              >
                <td
                  className="border border-[#e5e7eb] px-3 py-px text-center"
                  style={{
                    backgroundColor: '#b6d7a8',
                    color: '#0f172a',
                    fontWeight: 700,
                    fontSize: `${14 * textSizeScale}px`,
                    position: 'sticky',
                    left: 0,
                    zIndex: 11,
                  }}
                >
                  Working Hours
                </td>
                {displayedWeekDays.map((day, idx) => (
                  <td
                    key={`working-row-${day}-${idx}`}
                    className="border border-[#e5e7eb] px-3 py-px text-center"
                    style={{ backgroundColor: '#d9ead3', fontSize: `${14 * textSizeScale}px` }}
                  >
                    {formatDuration(workingColumnTotals[idx] ?? 0)}
                  </td>
                ))}
                <td
                  className="border border-[#e5e7eb] px-3 py-px text-center font-semibold"
                  style={{ backgroundColor: '#d9ead3', fontSize: `${14 * textSizeScale}px` }}
                  >
                    {formatDuration(totalWorkingMinutes)}
                  </td>
                  {renderExtraColumnCells('summary-working')}
                </tr>
              <tr
                data-summary-row
                className={`grid text-sm cursor-pointer ${
                  selectedSummaryRowId === 'buffer-summary' ? 'outline outline-[2px]' : ''
                }`}
                style={
                  selectedSummaryRowId === 'buffer-summary'
                    ? { gridTemplateColumns, outlineColor: '#000', outlineOffset: 0 }
                    : { gridTemplateColumns }
                }
                tabIndex={0}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => toggleSummaryRowSelection('buffer-summary')}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    toggleSummaryRowSelection('buffer-summary');
                  }
                }}
              >
                  <td
                    className="border border-[#e5e7eb] px-3 py-px text-center text-[#000000]"
                    style={{
                      backgroundColor: '#ffffff',
                      fontWeight: 700,
                      fontSize: `${14 * textSizeScale}px`,
                      position: 'sticky',
                      left: 0,
                      zIndex: 11,
                    }}
                  >
                    Buffer
                  </td>
                {displayedWeekDays.map((day, idx) => (
                  <td
                    key={`buffer-row-${day}-${idx}`}
                    className="border border-[#e5e7eb] px-3 py-px text-center"
                    style={{ backgroundColor: '#ffffff', fontSize: `${14 * textSizeScale}px` }}
                  >
                    {formatDuration(bufferColumnTotals[idx] ?? 0)}
                  </td>
                ))}
                <td
                  className="border border-[#e5e7eb] px-3 py-px text-center font-semibold"
                  style={{ backgroundColor: '#ffffff', fontSize: `${14 * textSizeScale}px` }}
                >
                  {formatDuration(totalBufferMinutes)}
                </td>
                {renderExtraColumnCells('summary-buffer')}
              </tr>
              <tr
                data-summary-row
                className={`grid text-sm cursor-pointer ${
                  selectedSummaryRowId === 'available-summary' ? 'outline outline-[2px]' : ''
                }`}
                style={
                  selectedSummaryRowId === 'available-summary'
                    ? { gridTemplateColumns, outlineColor: '#000', outlineOffset: 0 }
                    : { gridTemplateColumns }
                }
                tabIndex={0}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => toggleSummaryRowSelection('available-summary')}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    toggleSummaryRowSelection('available-summary');
                  }
                }}
              >
                <td
                  className="border border-[#e5e7eb] px-3 py-px text-center"
                  style={{ backgroundColor: '#ffffff', color: '#000000', fontWeight: 700, fontSize: `${14 * textSizeScale}px`, position: 'sticky', left: 0, zIndex: 11 }}
                >
                  Available Hours
                </td>
                {displayedWeekDays.map((day, idx) => (
                  <td
                    key={`available-row-${day}-${idx}`}
                    className="border border-[#e5e7eb] px-3 py-px text-center"
                    style={{ backgroundColor: '#ffffff', fontSize: `${14 * textSizeScale}px` }}
                  >
                    {formatDuration(availableColumnTotals[idx] ?? 0)}
                  </td>
                ))}
              <td
                className="border border-[#e5e7eb] px-3 py-px text-center font-semibold"
                style={{ backgroundColor: '#ffffff', fontSize: `${14 * textSizeScale}px` }}
              >
                {formatDuration(totalAvailableMinutes)}
              </td>
              {renderExtraColumnCells('summary-available')}
            </tr>
          </tbody>
        </table>
          {renderCellProjectMenu()}
          </div>
        </div>
      </div>
      {scheduleItemPanelOpen && (
        <ScheduleItemPanel
          projects={highlightedProjects.map((p) => {
            const meta = projectMetadata.get(p.id);
            return { ...p, color: meta?.color ?? p.color, textColor: meta?.textColor ?? '#000000' };
          })}
          scheduleLayout={scheduleLayout}
          projectChips={projectChips}
          chipTimeOverrides={chipTimeOverrides}
          incrementMinutes={incrementMinutes}
          rowMetrics={rowMetrics}
          onAddChip={handleAddScheduleItemChip}
          onDragStart={handlePanelDragStart}
          onClose={() => setScheduleItemPanelOpen(false)}
        />
      )}
    </div>
  );
}


function ListicalMenu({
  incrementMinutes,
  onIncrementChange,
  onResetChips,
  onClearAllChips,
  startDay,
  onStartDayChange,
  startHour,
  onStartHourChange,
  startMinute,
  onStartMinuteChange,
  hourOptions,
  minuteOptions,
  showAmPm,
  onShowAmPmChange,
  use24Hour,
  onUse24HourChange,
  undoStack,
  redoStack,
  undo,
  redo,
}) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);
  const [menuStyle, setMenuStyle] = useState({});
  const [pendingIncrement, setPendingIncrement] = useState(null);

  const tryClose = () => {
    if (pendingIncrement === null) setOpen(false);
  };

  useEffect(() => {
    if (!open) {
      setMenuStyle({});
      return undefined;
    }

    const updatePosition = () => {
      if (buttonRef.current) {
        const rect = buttonRef.current.getBoundingClientRect();
        const calculatedLeft = Math.max(16, rect.left);
        setMenuStyle({
          width: '360px',
          top: rect.bottom + 8,
          left: calculatedLeft,
        });
      }
    };

    updatePosition();
    const timer = setTimeout(updatePosition, 10);

    const handleClickOutside = (event) => {
      if (menuRef.current?.contains(event.target)) return;
      if (buttonRef.current?.contains(event.target)) return;
      tryClose();
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        tryClose();
      }
    };
    window.addEventListener('mousedown', handleClickOutside, true);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('mousedown', handleClickOutside, true);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, pendingIncrement]);

  const handleBedTimeChange = (event) => {
    onStartHourChange(event.target.value);
  };

  const handleIncrementChange = (event) => {
    const next = parseInt(event.target.value, 10) || 60;
    if (next !== incrementMinutes) {
      setPendingIncrement(next);
    }
  };

  const confirmIncrementChange = () => {
    onIncrementChange(pendingIncrement);
    onResetChips(pendingIncrement);
    setPendingIncrement(null);
  };

  const cancelIncrementChange = () => {
    setPendingIncrement(null);
  };

  return (
    <div>
      <button
        type="button"
        ref={buttonRef}
        className="inline-flex items-center gap-2 rounded border border-[#ced3d0] bg-white px-3 py-2 font-semibold text-[#065f46] shadow-sm transition hover:bg-[#f2fdf6] hover:shadow-md"
        onClick={() => { if (open) { tryClose(); } else { setOpen(true); } }}
        aria-expanded={open}
      >
        <span>Listical</span>
      </button>
      {open && createPortal(
        <div
          ref={menuRef}
          className="fixed rounded-lg border border-[#94a3b8] p-4 shadow-2xl"
          style={{ ...menuStyle, backgroundColor: 'rgba(255, 255, 255, 0.97)', zIndex: 999999 }}
        >
          {/* Schedule section */}
          <div className="flex flex-col" style={{ gap: '10px' }}>
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Schedule</span>
            {/* Start Day pills */}
            <div className="flex flex-col" style={{ gap: '4px' }}>
              <span className="text-xs font-semibold text-slate-700">Start Day</span>
              <div className="flex flex-wrap" style={{ gap: '4px' }}>
                {DAYS_OF_WEEK.map((day) => (
                  <button
                    key={day}
                    type="button"
                    onClick={() => onStartDayChange(day)}
                    className={`rounded px-2 py-1 text-[11px] font-semibold transition ${
                      startDay === day
                        ? 'bg-[#065f46] text-white border border-[#065f46]'
                        : 'bg-white text-slate-700 border border-[#ced3d0] hover:bg-[#f2fdf6]'
                    }`}
                  >
                    {day.slice(0, 3)}
                  </button>
                ))}
              </div>
            </div>
            {/* Bed Time / Rise Time */}
            <div className="flex" style={{ gap: '12px' }}>
              <div className="flex flex-col flex-1" style={{ gap: '4px' }}>
                <label htmlFor="bed-time-select" className="text-xs font-semibold text-slate-700">
                  Bed Time
                </label>
                <select
                  id="bed-time-select"
                  className="rounded border border-[#ced3d0] bg-white px-2 py-1 text-xs text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-black"
                  value={startHour}
                  onChange={handleBedTimeChange}
                >
                  <option value="">—</option>
                  {hourOptions.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col flex-1" style={{ gap: '4px' }}>
                <label htmlFor="rise-time-select" className="text-xs font-semibold text-slate-700">
                  Rise Time
                </label>
                <select
                  id="rise-time-select"
                  className="rounded border border-[#ced3d0] bg-white px-2 py-1 text-xs text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-black"
                  value={startMinute}
                  onChange={(e) => onStartMinuteChange(e.target.value)}
                  disabled={!startHour}
                >
                  <option value="">—</option>
                  {minuteOptions.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Increment */}
          <div className="mt-3 pt-3 border-t border-[#e2e8f0] flex items-center" style={{ gap: '10px' }}>
            <label
              className="text-xs font-semibold text-slate-700 whitespace-nowrap"
              htmlFor="increment-select"
            >
              Increment
            </label>
            <select
              id="increment-select"
              className="flex-1 rounded border border-[#ced3d0] bg-white px-2 py-1 text-xs text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-black"
              value={pendingIncrement ?? incrementMinutes}
              onChange={handleIncrementChange}
            >
              <option value={15}>15 minutes</option>
              <option value={30}>30 minutes</option>
              <option value={60}>1 hour</option>
            </select>
          </div>

          {/* Increment change confirmation */}
          {pendingIncrement !== null && (
            <div className="mt-3 pt-3 border-t border-[#e2e8f0]">
              <p className="text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-300 rounded px-3 py-2 mb-2">
                Changing the increment will clear all placed chips. This cannot be undone.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={confirmIncrementChange}
                  className="flex-1 px-3 py-1.5 rounded text-[12px] font-semibold bg-red-600 text-white hover:bg-red-700 transition-colors"
                >
                  Confirm
                </button>
                <button
                  type="button"
                  onClick={cancelIncrementChange}
                  className="flex-1 px-3 py-1.5 rounded text-[12px] font-semibold bg-white text-slate-700 border border-[#ced3d0] hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Clock format */}
          <div className="mt-3 pt-3 border-t border-[#e2e8f0] flex flex-col" style={{ gap: '6px' }}>
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Clock Format</span>
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showAmPm}
                onChange={(e) => onShowAmPmChange(e.target.checked)}
                disabled={use24Hour}
              />
              Show AM / PM
            </label>
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={use24Hour}
                onChange={(e) => onUse24HourChange(e.target.checked)}
              />
              24-hour clock
            </label>
          </div>

          {/* History */}
          <div className="mt-3 pt-3 border-t border-[#e2e8f0]">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">History</span>
            <div className="flex gap-2 mt-2">
              <button
                type="button"
                onClick={undo}
                disabled={undoStack.length === 0}
                className={`flex-1 px-3 py-1.5 rounded text-[12px] font-semibold transition-colors ${
                  undoStack.length === 0
                    ? 'bg-gray-200 text-gray-400 cursor-not-allowed border border-gray-300'
                    : 'bg-white text-[#065f46] hover:bg-[#e6f7ed] border border-[#ced3d0]'
                }`}
                title={`Undo (⌘Z) — ${undoStack.length === 0 ? 'nothing to undo' : `${undoStack.length} action${undoStack.length > 1 ? 's' : ''}`}`}
              >
                ↶ Undo
              </button>
              <button
                type="button"
                onClick={redo}
                disabled={redoStack.length === 0}
                className={`flex-1 px-3 py-1.5 rounded text-[12px] font-semibold transition-colors ${
                  redoStack.length === 0
                    ? 'bg-gray-200 text-gray-400 cursor-not-allowed border border-gray-300'
                    : 'bg-white text-[#065f46] hover:bg-[#e6f7ed] border border-[#ced3d0]'
                }`}
                title={`Redo (⌘⇧Z) — ${redoStack.length === 0 ? 'nothing to redo' : `${redoStack.length} action${redoStack.length > 1 ? 's' : ''}`}`}
              >
                ↷ Redo
              </button>
            </div>
          </div>

          {/* Clear chips */}
          <div className="mt-3 pt-3 border-t border-[#e2e8f0]">
            <button
              type="button"
              className="w-full rounded border border-[#ef4444] bg-white px-3 py-2 text-xs font-semibold text-[#b91c1c] shadow-sm transition hover:bg-[#fef2f2] hover:shadow-md"
              onClick={onClearAllChips}
            >
              Clear all chips
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
