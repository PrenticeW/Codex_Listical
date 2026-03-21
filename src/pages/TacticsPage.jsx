import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { useYear } from '../contexts/YearContext';
import NavigationBar from '../components/planner/NavigationBar';
import { loadStagingState, STAGING_STORAGE_EVENT, STAGING_STORAGE_KEY } from '../lib/stagingStorage';
import { SECTION_CONFIG } from '../utils/staging/sectionConfig';
import { parseEstimateLabelToMinutes } from '../utils/staging/planTableHelpers';
import { saveTacticsMetrics } from '../lib/tacticsMetricsStorage';
import { buildScheduleLayout } from '../ScheduleChips';
import storage from '../lib/storageService';
import usePageSize from '../hooks/usePageSize';

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

const TACTICS_STORAGE_KEY = 'tactics-page-settings';
const TACTICS_CHIPS_STORAGE_KEY_TEMPLATE = 'tactics-year-{yearNumber}-chips-state';

/**
 * Get year-specific storage key for tactics chips
 */
const getTacticsChipsStorageKey = (yearNumber) => {
  if (yearNumber === null || yearNumber === undefined) {
    return 'tactics-chips-state'; // Legacy key for backward compatibility
  }
  return TACTICS_CHIPS_STORAGE_KEY_TEMPLATE.replace('{yearNumber}', yearNumber.toString());
};

const loadTacticsSettings = () => {
  try {
    const parsed = storage.getJSON(TACTICS_STORAGE_KEY, null);
    if (!parsed) return { startHour: '', startMinute: '', incrementMinutes: 60, showAmPm: true, use24Hour: false, startDay: DAYS_OF_WEEK[0] };
    return {
      startHour: typeof parsed?.startHour === 'string' ? parsed.startHour : '',
      startMinute: typeof parsed?.startMinute === 'string' ? parsed.startMinute : '',
      incrementMinutes:
        typeof parsed?.incrementMinutes === 'number' && Number.isFinite(parsed.incrementMinutes)
          ? parsed.incrementMinutes
          : 60,
      showAmPm: parsed?.showAmPm !== false,
      use24Hour: parsed?.use24Hour === true,
      startDay: DAYS_OF_WEEK.includes(parsed?.startDay) ? parsed.startDay : DAYS_OF_WEEK[0],
    };
  } catch (error) {
    console.error('Failed to read tactics settings', error);
    return { startHour: '', startMinute: '', incrementMinutes: 60, showAmPm: true, use24Hour: false, startDay: DAYS_OF_WEEK[0] };
  }
};
const loadTacticsChipsState = (yearNumber = null) => {
  try {
    const key = getTacticsChipsStorageKey(yearNumber);
    const parsed = storage.getJSON(key, null);
    if (!parsed) return { projectChips: null, customProjects: null, chipTimeOverrides: null };
    return {
      projectChips: Array.isArray(parsed?.projectChips) ? parsed.projectChips : null,
      customProjects: Array.isArray(parsed?.customProjects) ? parsed.customProjects : null,
      chipTimeOverrides: parsed?.chipTimeOverrides && typeof parsed.chipTimeOverrides === 'object' && !Array.isArray(parsed.chipTimeOverrides) ? parsed.chipTimeOverrides : null,
    };
  } catch (error) {
    console.error('Failed to read tactics chip state', error);
    return { projectChips: null, customProjects: null, chipTimeOverrides: null };
  }
};
const saveTacticsSettings = (payload) => {
  try {
    storage.setJSON(TACTICS_STORAGE_KEY, payload);
  } catch (error) {
    console.error('Failed to save tactics settings', error);
  }
};
const saveTacticsChipsState = (payload, yearNumber = null) => {
  try {
    const key = getTacticsChipsStorageKey(yearNumber);
    storage.setJSON(key, payload);
  } catch (error) {
    console.error('Failed to save tactics chip state', error);
  }
};

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


function FitText({ text, maxFontSize, minFontSize = maxFontSize * 0.5, style, wrap = false }) {
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

  useEffect(() => {
    saveTacticsSettings({ startHour, startMinute, incrementMinutes, showAmPm, use24Hour, startDay });
  }, [startHour, startMinute, incrementMinutes, showAmPm, use24Hour, startDay]);
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
      return deduped;
    }
    // Fall back to initial sleep blocks if no saved state
    return buildInitialSleepBlocks(displayedWeekDays);
  });
  const [selectedBlockId, setSelectedBlockId] = useState(null);
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
  const [selectedCell, setSelectedCell] = useState(null);
  const [cellMenu, setCellMenu] = useState(null);

  // Column widths for resizing (index 0 is the time column, rest are day/project columns)
  const [columnWidths, setColumnWidths] = useState(() => {
    const storageKey = `tactics-column-widths-${currentYear}`;
    const saved = storage.getJSON(storageKey, null);
    if (saved && Array.isArray(saved)) {
      return saved;
    }
    // Default: 120px for time column, 140px for all other columns
    return Array.from({ length: 30 }, (_, i) => i === 0 ? 120 : 140);
  });

  // Save column widths to storage when they change
  useEffect(() => {
    const storageKey = `tactics-column-widths-${currentYear}`;
    storage.setJSON(storageKey, columnWidths);
  }, [columnWidths, currentYear]);

  const [clipboardProject, setClipboardProject] = useState(null);
  const [editingChipId, setEditingChipId] = useState(null);
  const [editingChipLabel, setEditingChipLabel] = useState('');
  const [editingChipIsCustom, setEditingChipIsCustom] = useState(false);
  const [editingCustomProjectId, setEditingCustomProjectId] = useState(null);
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
  const [customProjects, setCustomProjects] = useState(() => {
    // Load saved custom projects from storage first
    const chipState = loadTacticsChipsState(currentYear);
    return chipState.customProjects || [];
  });
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
  const getProjectChipById = useCallback(
    (blockId) => dedupeChipsById(projectChips).find((block) => block.id === blockId) ?? null,
    [projectChips]
  );
  const draggingSleepChipIdRef = useRef(null);
  const dragAnchorOffsetRef = useRef(0);
  const transparentDragImageRef = useRef(null);
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
    if (chipState.projectChips) {
      const dedupedChips = dedupeChipsById(chipState.projectChips);
      updateChipSequenceFromList(dedupedChips);
      setProjectChips(dedupedChips);
    } else {
      // Reset to initial sleep blocks if no saved chips for this year
      setProjectChips(buildInitialSleepBlocks(displayedWeekDays));
    }
    if (chipState.customProjects) {
      setCustomProjects(chipState.customProjects);
    } else {
      setCustomProjects([]);
    }

    // Always reload projects for current year
    readProjects();
  }, [currentYear, displayedWeekDays]);

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
    const removedProjectIds = new Set(
      stagingProjects.filter((p) => p.addedToPlan !== true).map((p) => p.id)
    );
    if (removedProjectIds.size === 0) return;
    setProjectChips((prev) => prev.filter((chip) => !removedProjectIds.has(chip.projectId)));
  }, [stagingProjects]);

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

  // Keep default sleep blocks (sleep-0, sleep-1, ...) spanning from sleep-start to the last hour row
  // when the timeline actually changes (bed time, wake time, or increment changes).
  // Skips on initial mount so saved positions are preserved across refreshes.
  const prevTimelineForSleepRef = useRef(null);
  useEffect(() => {
    const prevTimeline = prevTimelineForSleepRef.current;
    prevTimelineForSleepRef.current = timelineRowIds;
    // Skip on first mount — saved chip positions should be preserved
    if (prevTimeline === null) return;
    // Skip if timeline didn't actually change
    if (prevTimeline === timelineRowIds) return;
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

  // Refs to track previous timeline state for increment-change resize logic
  const prevIncrementForResizeRef = useRef(null);
  const prevTimelineRowIdsRef = useRef(null);
  const prevTrailingMinuteRowsRef = useRef([]);

  // When increment changes, recompute endRowId for all non-sleep chips to preserve their duration
  useEffect(() => {
    const prevIncrement = prevIncrementForResizeRef.current;
    const prevRowIds = prevTimelineRowIdsRef.current;
    const prevTrailingMinuteRows = prevTrailingMinuteRowsRef.current;
    prevIncrementForResizeRef.current = incrementMinutes;
    prevTimelineRowIdsRef.current = timelineRowIds;
    prevTrailingMinuteRowsRef.current = trailingMinuteRows;

    // Only act when increment actually changed (not on first render or other timeline changes)
    if (prevIncrement === null || prevIncrement === incrementMinutes) return;
    if (!prevRowIds || !timelineRowIds.length) return;

    const prevRowIndexMap = new Map(prevRowIds.map((id, i) => [id, i]));

    setProjectChips((prev) =>
      prev.map((entry) => {
        if (entry.projectId === 'sleep') return entry;

        // Use stored startMinutes, or derive from current startRowId as fallback (e.g. chips loaded from storage)
        const originalMinutes = entry.startMinutes ?? rowIdToClockMinutes(entry.startRowId, prevTrailingMinuteRows);
        console.log('[resize]', entry.id, 'originalMinutes:', originalMinutes, 'new trailingMinuteRows:', trailingMinuteRows.slice(0,5), 'new timelineRowIds:', timelineRowIds.slice(0,10));
        if (originalMinutes == null) return entry;

        // Compute duration from old rows
        let durationMinutes;
        if (Number.isFinite(entry.durationMinutes)) {
          durationMinutes = entry.durationMinutes;
        } else {
          const startIdx = prevRowIndexMap.get(entry.startRowId);
          const endIdx = prevRowIndexMap.get(entry.endRowId ?? entry.startRowId);
          if (startIdx == null || endIdx == null) return entry;
          durationMinutes = 0;
          for (let i = Math.min(startIdx, endIdx); i <= Math.max(startIdx, endIdx); i += 1) {
            const rowId = prevRowIds[i];
            if (!rowId) continue;
            durationMinutes += (rowId === 'sleep-start' || rowId.startsWith('hour-')) ? 60 : prevIncrement;
          }
        }

        // Find the last new row whose clock time is <= originalMinutes (bias earlier)
        let newStartIdx = null;
        for (let i = 0; i < timelineRowIds.length; i += 1) {
          const m = rowIdToClockMinutes(timelineRowIds[i], trailingMinuteRows);
          if (m == null) continue;
          if (m <= originalMinutes) newStartIdx = i;
          else break;
        }
        console.log('[resize scan]', entry.id, 'originalMinutes:', originalMinutes, 'newStartIdx:', newStartIdx, 'newStartRowId:', timelineRowIds[newStartIdx]);
        if (newStartIdx == null) return entry;

        const newSpan = Math.max(1, Math.ceil(durationMinutes / Math.max(1, incrementMinutes)));
        const newStartRowId = timelineRowIds[newStartIdx];
        const newEndIdx = Math.min(newStartIdx + newSpan - 1, timelineRowIds.length - 1);
        const newEndRowId = timelineRowIds[newEndIdx] ?? newStartRowId;

        if (newStartRowId === entry.startRowId && newEndRowId === entry.endRowId) return entry;
        return { ...entry, startRowId: newStartRowId, endRowId: newEndRowId };
      })
    );
  }, [incrementMinutes, timelineRowIds, trailingMinuteRows, setProjectChips]);

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
        startMinutes: rowIdToClockMinutes(startRowId, trailingMinuteRows),
        ...(target.projectId === 'sleep' ? { userModified: true } : {}),
      };
      return next;
    });
    setSelectedCell(null);
    setSelectedBlockId(sourceChipId);
    setDragPreview(null);
    draggingSleepChipIdRef.current = null;
    setIsDragging(false);
    dragAnchorOffsetRef.current = 0;
    logDragDebug('Preview applied and cleared');
  }, [dragPreview, getProjectChipById, setProjectChips, setSelectedCell, trailingMinuteRows]);
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
      const isInteractiveColumn =
        columnIndex >= 0 &&
        columnIndex < totalColumnCount &&
        (columnIndex >= DAY_COLUMN_COUNT || Boolean(displayedWeekDays[columnIndex]));
      if (!isInteractiveColumn) return;
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
    [displayedWeekDays, totalColumnCount]
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
  useEffect(() => {
    saveTacticsChipsState({ projectChips, customProjects, chipTimeOverrides }, currentYear);
  }, [projectChips, customProjects, chipTimeOverrides, currentYear]);
  const handleRemoveSelectedChip = useCallback(() => {
    if (!removableBlockId) return;
    setProjectChips((prev) => dedupeChipsById(prev).filter((block) => block.id !== removableBlockId));
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
    },
    [colorEditorProjectId]
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
        const itemIdxMatch = block.id.match(/-(\d+)$/);
        const itemIdx = itemIdxMatch ? parseInt(itemIdxMatch[1], 10) : null;
        const scheduleItems = itemIdx != null
          ? (scheduleLayout.scheduleItemsByProject.get(block.projectId) ?? [])
          : [];
        const scheduleItem = itemIdx != null ? scheduleItems[itemIdx] : null;
        const currentOverride = chipTimeOverrides[chipId];
        let currentMinutes;
        if (currentOverride != null) {
          currentMinutes = currentOverride;
        } else if (scheduleItem) {
          currentMinutes = parseEstimateLabelToMinutes(scheduleItem.timeValue) ?? block.durationMinutes ?? 60;
        } else {
          currentMinutes = block.durationMinutes ?? 60;
        }
        const scheduleDefaultText = SECTION_CONFIG.Schedule.placeholder;
        const rawName = scheduleItem ? (scheduleItem.name ?? '').trim() : '';
        const currentName = rawName && rawName !== scheduleDefaultText ? rawName : (block.displayLabel ?? '');
        setEditingChipIsTime(true);
        setEditingChipIsCustom(false);
        setEditingChipLabel(currentName);
        setEditingChipMinutes(String(currentMinutes));
        setEditingCustomProjectId(null);
        setEditingChipId(chipId);
        return;
      }
      const metadata = projectMetadata.get(block.projectId);
      const fallbackLabel = metadata?.label ?? block.projectId ?? 'Project';
      const isCustom = typeof block.projectId === 'string' && block.projectId.startsWith('custom-');
      const labelValue = block.displayLabel ?? fallbackLabel;
      setEditingChipIsTime(false);
      setEditingChipIsCustom(isCustom);
      setEditingChipLabel(isCustom ? labelValue.toUpperCase() : labelValue);
      setEditingCustomProjectId(isCustom ? block.projectId : null);
      setEditingChipId(chipId);
    },
    [getProjectChipById, projectMetadata, scheduleLayout, chipTimeOverrides]
  );
  const handleConfirmLabelEdit = useCallback(() => {
    if (!editingChipId) return;
    if (editingChipIsTime) {
      const parsedMins = parseInt(editingChipMinutes, 10);
      if (Number.isFinite(parsedMins) && parsedMins > 0) {
        setChipTimeOverrides((prev) => ({ ...prev, [editingChipId]: parsedMins }));
      }
      const trimmedName = editingChipLabel.trim();
      setProjectChips((prev) =>
        prev.map((block) =>
          block.id === editingChipId
            ? { ...block, displayLabel: trimmedName || null }
            : block
        )
      );
      setEditingChipId(null);
      setEditingChipLabel('');
      setEditingChipMinutes('');
      setEditingChipIsTime(false);
      return;
    }
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
    editingChipIsTime,
    editingChipIsCustom,
    editingChipLabel,
    editingChipMinutes,
    editingCustomProjectId,
    setProjectChips,
  ]);
  const handleCancelLabelEdit = useCallback(() => {
    setEditingChipId(null);
    setEditingChipLabel('');
    setEditingChipMinutes('');
    setEditingChipIsCustom(false);
    setEditingChipIsTime(false);
    setEditingCustomProjectId(null);
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
          const itemIdxMatch = block.id.match(/-(\d+)$/);
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
      if (duration == null) {
        duration = getBlockDuration(block, rowIndexMap, timelineRowIds, incrementMinutes);
      }
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
  const extendedStagingColumnConfigs = useMemo(() => {
    const required = Math.max(0, totalColumnCount - DAY_COLUMN_COUNT);
    if (required <= stagingColumnConfigs.length) return stagingColumnConfigs;
    const placeholders = Array.from({ length: required - stagingColumnConfigs.length }, (_, idx) => ({
      id: `placeholder-${idx}`,
      type: 'placeholder',
    }));
    return [...stagingColumnConfigs, ...placeholders];
  }, [stagingColumnConfigs, totalColumnCount]);
  const hasInitializedScheduleChips = useRef(false);
  // Track previous staging projects to detect changes
  const prevStagingProjectsRef = useRef(null);
  // Track previous increment to detect changes and recompute spans
  const prevIncrementMinutesRef = useRef(null);

  useEffect(() => {
    // Check if staging projects have changed (by comparing JSON stringify)
    const stagingProjectsKey = JSON.stringify(stagingProjects.map(p => ({ id: p.id, planSummary: p.planSummary })));
    const hasProjectsChanged = prevStagingProjectsRef.current !== stagingProjectsKey;
    prevStagingProjectsRef.current = stagingProjectsKey;

    const hasIncrementChanged = prevIncrementMinutesRef.current !== null && prevIncrementMinutesRef.current !== incrementMinutes;
    prevIncrementMinutesRef.current = incrementMinutes;

    // Only run if we have data, and either it's first load OR projects changed OR increment changed
    if (!scheduleLayout?.scheduleItemsByProject || !timelineRowIds.length) return;
    if (hasInitializedScheduleChips.current && !hasProjectsChanged && !hasIncrementChanged) return;

    setProjectChips((prev) => {
      const next = [...prev];
      const expectedIds = new Set();
      const baseOffset = 2;
      // Build a local rowIndexMap for this render
      const localRowIndexMap = new Map(timelineRowIds.map((id, i) => [id, i]));
      stagingColumnConfigs.forEach((column, idx) => {
        if (column.type !== 'project') return;
        const columnIndex = DAY_COLUMN_COUNT + idx;
        const scheduleItems = scheduleLayout.scheduleItemsByProject.get(column.project.id) ?? [];
        let currentRowIdx = baseOffset;
        scheduleItems.forEach((scheduleItem, itemIdx) => {
          const chipId = `schedule-chip-${column.project.id}-${itemIdx}`;
          expectedIds.add(chipId);
          const scheduleDefaultText = SECTION_CONFIG.Schedule.placeholder;
          const trimmedName = (scheduleItem.name ?? '').trim();
          const hasScheduleName = Boolean(trimmedName && trimmedName !== scheduleDefaultText);
          const displayLabel = hasScheduleName ? trimmedName : null;
          const minutes = parseEstimateLabelToMinutes(scheduleItem.timeValue);
          const durationMinutes = Number.isFinite(minutes) ? minutes : incrementMinutes;
          const span = Math.max(
            1,
            Math.ceil(durationMinutes / Math.max(1, incrementMinutes))
          );
          const existingIndex = next.findIndex((entry) => entry.id === chipId);
          if (existingIndex >= 0) {
            // Preserve the chip's current startRowId (its user-placed time position).
            // Only recompute endRowId based on new span.
            // Only update columnIndex if the chip is still in a project column (not user-moved to a weekday column).
            const existingChip = next[existingIndex];
            const existingStartRowId = existingChip.startRowId;
            const existingStartIdx = localRowIndexMap.get(existingStartRowId);
            const chipIsInProjectColumn = existingChip.columnIndex >= DAY_COLUMN_COUNT;
            const updatedColumnIndex = chipIsInProjectColumn ? columnIndex : existingChip.columnIndex;
            if (existingStartIdx != null) {
              const newEndIdx = Math.min(existingStartIdx + span - 1, timelineRowIds.length - 1);
              const newEndRowId = timelineRowIds[newEndIdx] ?? existingStartRowId;
              currentRowIdx = newEndIdx + 1;
              const needsUpdate =
                existingChip.displayLabel !== displayLabel ||
                existingChip.hasScheduleName !== hasScheduleName ||
                existingChip.durationMinutes !== durationMinutes ||
                existingChip.endRowId !== newEndRowId ||
                existingChip.columnIndex !== updatedColumnIndex;
              if (needsUpdate) {
                next[existingIndex] = { ...existingChip, displayLabel, hasScheduleName, durationMinutes, endRowId: newEndRowId, columnIndex: updatedColumnIndex };
              }
            } else {
              // existingStartRowId no longer valid in timeline — fall back to sequential placement
              const startRowIdx = Math.min(currentRowIdx, timelineRowIds.length - 1);
              const endRowIdx = Math.min(startRowIdx + span - 1, timelineRowIds.length - 1);
              const startRowId = timelineRowIds[startRowIdx] ?? timelineRowIds[timelineRowIds.length - 1];
              const newEndRowId = timelineRowIds[endRowIdx] ?? startRowId;
              const newStartMinutes = rowIdToClockMinutes(startRowId, trailingMinuteRows);
              currentRowIdx = endRowIdx + 1;
              next[existingIndex] = { ...existingChip, displayLabel, hasScheduleName, durationMinutes, startRowId, endRowId: newEndRowId, startMinutes: newStartMinutes, columnIndex: updatedColumnIndex };
            }
            return;
          }
          // New chip — place sequentially
          const startRowIdx = Math.min(currentRowIdx, timelineRowIds.length - 1);
          const endRowIdx = Math.min(startRowIdx + span - 1, timelineRowIds.length - 1);
          const startRowId = timelineRowIds[startRowIdx] ?? timelineRowIds[timelineRowIds.length - 1];
          const endRowId = timelineRowIds[endRowIdx] ?? startRowId;
          const startMinutes = rowIdToClockMinutes(startRowId, trailingMinuteRows);
          currentRowIdx = endRowIdx + 1;
          next.push({
            id: chipId,
            columnIndex,
            startRowId,
            endRowId,
            startMinutes,
            projectId: column.project.id,
            displayLabel,
            hasScheduleName,
            durationMinutes,
          });
        });
      });
      if (!expectedIds.size) return next;
      return next.filter(
        (entry) => !entry.id.startsWith('schedule-chip-') || expectedIds.has(entry.id)
      );
    });
    hasInitializedScheduleChips.current = true;
  }, [
    stagingColumnConfigs,
    scheduleLayout,
    timelineRowIds,
    trailingMinuteRows,
    incrementMinutes,
    setProjectChips,
    stagingProjects,
  ]);
  const handleClearAllChips = useCallback(() => {
    if (typeof window !== 'undefined') {
      const confirmed = window.confirm(
        'Clear all chips? This will reset to default sleep blocks and reload schedule items. Custom projects will stay in the dropdown.'
      );
      if (!confirmed) return;
    }
    const baseChips = buildInitialSleepBlocks(displayedWeekDays);
    const rebuiltChips = [...baseChips];
    if (scheduleLayout?.scheduleItemsByProject && timelineRowIds.length) {
      const baseOffset = 2;
      stagingColumnConfigs.forEach((column, idx) => {
        if (column.type !== 'project') return;
        const columnIndex = DAY_COLUMN_COUNT + idx;
        const scheduleItems = scheduleLayout.scheduleItemsByProject.get(column.project.id) ?? [];
        let currentRowIdx = baseOffset;
        scheduleItems.forEach((scheduleItem, itemIdx) => {
          const chipId = `schedule-chip-${column.project.id}-${itemIdx}`;
          const scheduleDefaultText = SECTION_CONFIG.Schedule.placeholder;
          const trimmedName = (scheduleItem.name ?? '').trim();
          const hasScheduleName = Boolean(trimmedName && trimmedName !== scheduleDefaultText);
          const displayLabel = hasScheduleName ? trimmedName : null;
          const minutes = parseEstimateLabelToMinutes(scheduleItem.timeValue);
          const durationMinutes = Number.isFinite(minutes) ? minutes : incrementMinutes;
          const span = Math.max(1, Math.ceil(durationMinutes / Math.max(1, incrementMinutes)));
          const startRowIdx = Math.min(currentRowIdx, timelineRowIds.length - 1);
          const endRowIdx = Math.min(startRowIdx + span - 1, timelineRowIds.length - 1);
          const startRowId = timelineRowIds[startRowIdx] ?? timelineRowIds[timelineRowIds.length - 1];
          const endRowId = timelineRowIds[endRowIdx] ?? startRowId;
          currentRowIdx = endRowIdx + 1;
          rebuiltChips.push({
            id: chipId,
            columnIndex,
            startRowId,
            endRowId,
            projectId: column.project.id,
            displayLabel,
            hasScheduleName,
            durationMinutes,
          });
        });
      });
      hasInitializedScheduleChips.current = true;
    } else {
      hasInitializedScheduleChips.current = false;
    }
    setProjectChips(rebuiltChips);
    setSelectedBlockId(null);
    setSelectedCell(null);
    setCellMenu(null);
  }, [displayedWeekDays, incrementMinutes, stagingColumnConfigs, scheduleLayout, timelineRowIds]);
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
                  e.currentTarget.style.backgroundColor = '#3b82f6';
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
      let rawLabel;
      let largeTimeStr = null;
      if (isScheduleChip) {
        // Derive label directly from schedule data at render time so it's always fresh
        const itemIdxMatch = block.id.match(/-(\d+)$/);
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
        const mins = overrideMins != null ? overrideMins : (scheduleItem ? parseEstimateLabelToMinutes(scheduleItem.timeValue) : block.durationMinutes);
        const isMultiRow = block.endRowId && block.endRowId !== block.startRowId;
        const displayMins = !isMultiRow && Number.isFinite(mins) && mins > 0 && (overrideMins != null || mins < incrementMinutes) ? mins : null;
        let timeStr = null;
        if (displayMins != null) {
          const h = Math.floor(displayMins / 60);
          const m = displayMins % 60;
          if (h === 0) timeStr = `${m}`;
          else if (m === 0) timeStr = `${h}`;
          else timeStr = `${h}.${String(m).padStart(2, '0')}`;
        }
        if (isMultiRow) {
          const startIdx = rowIndexMap.get(block.startRowId);
          const endIdx = rowIndexMap.get(block.endRowId);
          if (startIdx != null && endIdx != null) {
            const rowCount = Math.abs(endIdx - startIdx) + 1;
            const blockMins = rowCount * incrementMinutes;
            if (Number.isFinite(blockMins) && blockMins > 0) {
              const h = Math.floor(blockMins / 60);
              const m = blockMins % 60;
              if (m === 0) largeTimeStr = `${h}`;
              else largeTimeStr = `${h}.${String(m).padStart(2, '0')}`;
            }
          }
        }
        rawLabel = timeStr != null ? `${baseName}: ${timeStr}` : baseName;
      } else {
        rawLabel = block.displayLabel ?? metadata?.label ?? 'Project';
      }
      // Compute sleep time info for sleep chips
      let sleepTimeInfo = null;
      if (projectId === 'sleep') {
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
      const isActive = highlightedBlockId === block.id;
      const blockHeight = getBlockHeight(block.startRowId, block.endRowId);
      const isCustomProject =
        typeof block.projectId === 'string' && block.projectId.startsWith('custom-');
      const normalizedLabel = rawLabel.toUpperCase();
      const baseFontSize = 14 * textSizeScale;
      const chipIsMultiRow = block.endRowId && block.endRowId !== block.startRowId;
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
            zIndex: 10,
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
              border: '1px solid #ffffff',
              fontSize: `${14 * textSizeScale}px`,
              ...(isActive ? { outlineColor: '#000', outlineOffset: 0 } : null),
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
                  onChange={(event) => setEditingChipLabel(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') { event.preventDefault(); editingMinutesRef.current?.focus(); }
                    else if (event.key === 'Escape') { event.preventDefault(); handleCancelLabelEdit(); }
                  }}
                />
                <span className="shrink-0 font-semibold text-slate-800" style={{ fontSize: `${13 * textSizeScale}px` }}>:</span>
                <input
                  ref={editingMinutesRef}
                  placeholder="min"
                  className="w-4 shrink-0 bg-transparent pr-0.5 font-semibold text-slate-800 outline-none"
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
              <FitText text={normalizedLabel} maxFontSize={baseFontSize} wrap={isScheduleChip && chipIsMultiRow && blockHeight >= baseFontSize * 2.8} />
            )}
            {largeTimeStr && !isEditing ? (
              <span
                style={{
                  position: 'absolute',
                  bottom: '2px',
                  left: 0,
                  right: 0,
                  textAlign: 'center',
                  fontSize: `${14 * textSizeScale}px`,
                  opacity: 0.75,
                  lineHeight: 1,
                  pointerEvents: 'none',
                }}
              >
                {largeTimeStr}
              </span>
            ) : null}
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
            {isActive && projectId === 'sleep' && block.userModified ? (
              <button
                type="button"
                aria-label="Reset sleep block to default"
                onClick={(event) => {
                  event.stopPropagation();
                  const lastHourRow = [...timelineRowIds].reverse().find((id) => id.startsWith('hour-'));
                  if (!lastHourRow) return;
                  setProjectChips((prev) =>
                    prev.map((entry) =>
                      entry.id === chipId
                        ? { ...entry, startRowId: 'sleep-start', endRowId: lastHourRow, userModified: false }
                        : entry
                    )
                  );
                }}
                style={{
                  position: 'absolute',
                  top: '-6px',
                  right: '-6px',
                  height: '12px',
                  width: '12px',
                  borderRadius: '9999px',
                  border: '1px solid #666',
                  backgroundColor: '#fff',
                  padding: 0,
                  fontSize: '8px',
                  lineHeight: '10px',
                  cursor: 'pointer',
                  pointerEvents: 'auto',
                  color: '#666',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                title="Reset to default sleep hours"
              >
                ↺
              </button>
            ) : null}
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
    return (
      <div
        ref={cellMenuRef}
        className="absolute z-10 rounded border border-[#94a3b8] shadow-2xl"
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
            className="w-full px-3 py-2 text-center text-[11px] font-semibold rounded-sm hover:opacity-80"
            style={{ backgroundColor: '#c9daf8', color: '#ffffff' }}
            onClick={handleCreateCustomProject}
          >
            CUSTOM
          </button>
        </div>
        {dropdownProjects.length ? (
          <ul className="max-h-60 overflow-auto py-1 list-none">
                {dropdownProjects.map((project) => {
                  const isCustom = project.id.startsWith('custom-');
                  return (
                    <li key={project.id}>
                      <div className="px-3 py-2">
                        <button
                          type="button"
                          className="w-full px-3 py-2 text-center text-[11px] font-semibold rounded-sm hover:opacity-80"
                          style={{ backgroundColor: project.color || '#0f172a', color: '#ffffff' }}
                          onClick={() => handleProjectSelection(project.id)}
                        >
                          {isCustom ? project.label.toUpperCase() : project.label}
                        </button>
                        {isCustom ? (
                          <div className="flex items-center justify-center gap-1 mt-1">
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
            className="w-full px-3 py-2 text-center text-[11px] font-semibold rounded-sm hover:opacity-80"
            style={{ backgroundColor: '#d9d9d9', color: '#000000' }}
            onClick={() => handleProjectSelection('sleep')}
          >
            Sleep
          </button>
        </div>
        <div className="border-t border-[#e5e7eb] px-3 py-2">
          <button
            type="button"
            className="w-full px-3 py-2 text-center text-[11px] font-semibold rounded-sm hover:opacity-80"
            style={{ backgroundColor: '#666666', color: '#ffffff', fontWeight: 700 }}
            onClick={() => handleProjectSelection('rest')}
          >
            REST
          </button>
        </div>
        <div className="border-t border-[#e5e7eb] px-3 py-2">
          <button
            type="button"
            className="w-full px-3 py-2 text-center text-[11px] font-semibold rounded-sm hover:opacity-80"
            style={{ backgroundColor: '#fe8afe', color: '#ffffff', fontWeight: 700 }}
            onClick={() => handleProjectSelection('buffer')}
          >
            BUFFER
          </button>
        </div>
        <div className="border-t border-[#e5e7eb] px-3 py-2">
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-[11px] font-semibold text-red-600 hover:text-red-700 disabled:text-slate-400 disabled:cursor-not-allowed"
            onClick={handleRemoveSelectedChip}
            disabled={!removableBlockId}
          >
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
      <div className="p-4 space-y-4">
        <div ref={navBarRef} style={{ position: 'sticky', top: 0, zIndex: 20, backgroundColor: '#f3f4f6', paddingTop: '16px', paddingBottom: '16px' }}>
        <NavigationBar
          listicalButton={
            <ListicalMenu
              incrementMinutes={incrementMinutes}
              onIncrementChange={setIncrementMinutes}
              onClearAllChips={handleClearAllChips}
              startDay={startDay}
              onStartDayChange={setStartDay}
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
            />
          }
        />
        </div>
        <div className="rounded border border-[#ced3d0] bg-white shadow-sm">
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
              style={{ overflowX: 'hidden', paddingRight: `calc(100vw - ${col0Width}px)` }}
            >
            <table
              className="border-collapse text-[11px] text-slate-800"
              style={{ display: 'table', width: `${tableWidth}px`, minWidth: `${tableWidth}px` }}
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
                            e.currentTarget.style.backgroundColor = '#3b82f6';
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
                            e.currentTarget.style.backgroundColor = '#3b82f6';
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
                              e.currentTarget.style.backgroundColor = '#3b82f6';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = 'transparent';
                            }}
                            title="Drag to resize column"
                          />
                        </td>
                      );
                    })}
                {renderExtraColumnCells('header', true)}
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
            style={{ display: 'block', paddingBottom: '440px', paddingRight: `calc(100vw - ${col0Width}px)`, overflowX: 'auto' }}
          >
          {renderDragOutline()}
          <table
            ref={tableElementRef}
            className="border-collapse text-[11px] text-slate-800"
            style={{ display: 'table', width: `${tableWidth}px`, minWidth: `${tableWidth}px` }}
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
                className={`grid text-sm cursor-pointer ${
                  selectedSummaryRowId === 'sleep-summary' ? 'outline outline-[2px]' : ''
                }`}
                style={
                  selectedSummaryRowId === 'sleep-summary'
                    ? { gridTemplateColumns, outlineColor: '#000', outlineOffset: 0 }
                    : { gridTemplateColumns }
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
              {projectSummaries.map((summary) => {
                const rowSelected = selectedSummaryRowId === summary.id;
                return (
                  <tr
                    key={`project-summary-${summary.id}`}
                    className={`grid text-sm cursor-pointer ${
                      rowSelected ? 'outline outline-[2px]' : ''
                    }`}
                    style={
                      rowSelected
                        ? { gridTemplateColumns, outlineColor: '#000', outlineOffset: 0 }
                        : { gridTemplateColumns }
                    }
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
                      className="border border-[#e5e7eb] px-3 py-px text-center"
                      style={{
                        backgroundColor: summary.color || '#0f172a',
                        color: '#ffffff',
                        fontWeight: 700,
                        fontSize: `${14 * textSizeScale}px`,
                        position: 'sticky',
                        left: 0,
                        zIndex: 11,
                      }}
                    >
                      {summary.label}
                    </td>
                    {displayedWeekDays.map((day, idx) => (
                      <td
                        key={`project-${summary.id}-${day}-${idx}`}
                        className="border border-[#e5e7eb] px-3 py-px text-center"
                        style={{ backgroundColor: '#ffffff', fontSize: `${14 * textSizeScale}px` }}
                      >
                        {formatDuration(summary.columnTotals[idx] ?? 0)}
                      </td>
                    ))}
                    <td
                      className="border border-[#e5e7eb] px-3 py-px text-center font-semibold"
                      style={{ backgroundColor: '#ffffff', fontSize: `${14 * textSizeScale}px` }}
                    >
                      {formatDuration(summary.totalMinutes)}
                    </td>
                    {renderExtraColumnCells(`summary-${summary.id}`)}
                  </tr>
                );
              })}
              <tr
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
                className={`grid text-sm cursor-pointer ${
                  selectedSummaryRowId === 'working-summary' ? 'outline outline-[2px]' : ''
                }`}
                style={
                  selectedSummaryRowId === 'working-summary'
                    ? { gridTemplateColumns, outlineColor: '#000', outlineOffset: 0 }
                    : { gridTemplateColumns }
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
                className={`grid text-sm cursor-pointer ${
                  selectedSummaryRowId === 'buffer-summary' ? 'outline outline-[2px]' : ''
                }`}
                style={
                  selectedSummaryRowId === 'buffer-summary'
                    ? { gridTemplateColumns, outlineColor: '#000', outlineOffset: 0 }
                    : { gridTemplateColumns }
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
                className={`grid text-sm cursor-pointer ${
                  selectedSummaryRowId === 'available-summary' ? 'outline outline-[2px]' : ''
                }`}
                style={
                  selectedSummaryRowId === 'available-summary'
                    ? { gridTemplateColumns, outlineColor: '#000', outlineOffset: 0 }
                    : { gridTemplateColumns }
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
    </div>
  );
}


function ListicalMenu({
  incrementMinutes,
  onIncrementChange,
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
}) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);
  const [menuStyle, setMenuStyle] = useState({});
  const [incrementChanged, setIncrementChanged] = useState(false);

  const timesValidForIncrement =
    startHour && hourOptions.includes(startHour) &&
    startMinute && minuteOptions.includes(startMinute);

  const canClose = !incrementChanged || timesValidForIncrement;

  useEffect(() => {
    if (incrementChanged && timesValidForIncrement) {
      setIncrementChanged(false);
    }
  }, [incrementChanged, timesValidForIncrement]);

  const tryClose = () => {
    if (canClose) setOpen(false);
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
  }, [open, canClose]);

  const handleBedTimeChange = (event) => {
    onStartHourChange(event.target.value);
  };

  const handleIncrementChange = (event) => {
    onIncrementChange(parseInt(event.target.value, 10) || 60);
    setIncrementChanged(true);
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
                  className="rounded border border-[#ced3d0] bg-white px-2 py-1 text-xs text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
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
                  className="rounded border border-[#ced3d0] bg-white px-2 py-1 text-xs text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
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
              className="flex-1 rounded border border-[#ced3d0] bg-white px-2 py-1 text-xs text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
              value={incrementMinutes}
              onChange={handleIncrementChange}
            >
              <option value={15}>15 minutes</option>
              <option value={30}>30 minutes</option>
              <option value={60}>1 hour</option>
            </select>
          </div>

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

          {/* Increment validation warning */}
          {incrementChanged && !timesValidForIncrement && (
            <div className="mt-3 pt-3 border-t border-[#e2e8f0]">
              <p className="text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-300 rounded px-3 py-2">
                Please set a Bed Time and Rise Time that match the new increment before closing.
              </p>
            </div>
          )}

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
