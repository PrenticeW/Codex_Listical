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
import { useLocation, useNavigate } from 'react-router-dom';
import { useYear } from '../contexts/YearContext';
import NavigationBar from '../components/planner/NavigationBar';
import { undoDraftYear } from '../utils/planner/undoDraftYear';
import { revertArchive } from '../utils/planner/revertArchive';
import { createDraftYearFromActive } from '../utils/planner/createDraftYear';
import { ArchiveYearModal } from '../components/ArchiveYearModal';
import { loadStagingState, saveStagingState, STAGING_STORAGE_EVENT, STAGING_STORAGE_KEY } from '../lib/stagingStorage';
import { SECTION_CONFIG } from '../utils/staging/sectionConfig';
import { parseEstimateLabelToMinutes, formatMinutesToHHmm, buildProjectPlanSummary } from '../utils/staging/planTableHelpers';
import { pickCustomChipColour } from '../utils/staging/projectColour';
import { saveTacticsMetrics, saveSentMetricsSnapshot, loadSentMetricsSnapshot } from '../lib/tacticsMetricsStorage';
import { saveStartDate, readVisibleDayColumns } from '../utils/planner/storage';
import {
  loadTacticsYearSettings,
  saveTacticsYearSettings,
  loadTacticsChipsState,
  saveTacticsChipsState,
  loadTacticsColumnWidths,
  saveTacticsColumnWidths,
  TACTICS_SEND_TO_SYSTEM_EVENT,
  setSendToSystemTimestamp,
  saveSentChipsSnapshot,
  peekTacticsCache,
} from '../lib/tacticsStorage';
import { GEAR_TACTICS_SETTINGS_EVENT } from '../components/GearPanel';
import { peekStagingCache } from '../lib/stagingStorage';
import { buildScheduleLayout } from '../ScheduleChips';
import usePageSize from '../hooks/usePageSize';
import { PLAN_PANEL_ACTION_EVENT, PLAN_PANEL_STATE_EVENT, PLAN_PANEL_CHIP_EVENT, PLAN_PANEL_SCHEDULE_DATA_EVENT, PLAN_PANEL_NAV_EVENT } from '../components/PlanPanel';
import { getContrastTextColor } from '../utils/colorUtils';

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

// ── Cell-dropdown colour carousel palette (ported from the Plan-page mockup) ──
// 3 slides of 30 hue families x 4 lightness rows, plus a neutrals slide.
const CHIP_PALETTE_LIGHTNESS = [68, 60, 52, 44];
const CHIP_PALETTE_SLIDES = (() => {
  const slides = [];
  for (let g = 0; g < 3; g += 1) {
    const slide = [];
    for (const l of CHIP_PALETTE_LIGHTNESS) {
      for (let c = 0; c < 10; c += 1) {
        const h = (g * 10 + c) * 12;
        slide.push(`hsl(${h}, 65%, ${l}%)`);
      }
    }
    slides.push(slide);
  }
  slides.push([
    'hsl(0,0%,100%)', 'hsl(35,20%,97%)', 'hsl(0,0%,88%)', 'hsl(0,0%,78%)', 'hsl(0,0%,62%)', 'hsl(0,0%,50%)', 'hsl(0,0%,38%)', 'hsl(0,0%,22%)', 'hsl(0,0%,12%)', 'hsl(0,0%,4%)',
    'hsl(40,60%,95%)', 'hsl(35,30%,88%)', 'hsl(38,35%,78%)', 'hsl(35,30%,65%)', 'hsl(33,35%,52%)', 'hsl(25,40%,35%)', 'hsl(22,45%,22%)', 'hsl(35,8%,72%)', 'hsl(35,8%,50%)', 'hsl(35,8%,30%)',
    'hsl(210,30%,97%)', 'hsl(215,18%,82%)', 'hsl(215,16%,68%)', 'hsl(215,14%,55%)', 'hsl(215,14%,42%)', 'hsl(218,18%,30%)', 'hsl(220,20%,20%)', 'hsl(222,25%,12%)', 'hsl(225,30%,6%)', null,
    'hsl(340,18%,88%)', 'hsl(340,18%,72%)', 'hsl(300,12%,62%)', 'hsl(265,18%,78%)', 'hsl(240,18%,72%)', 'hsl(140,14%,72%)', 'hsl(160,16%,78%)', 'hsl(185,18%,78%)', 'hsl(48,30%,82%)', 'hsl(20,35%,82%)',
  ]);
  return slides;
})();

// Pick black/white text for a chip background by relative luminance.
function chipContrastColour(colour) {
  if (typeof document === 'undefined' || !colour) return '#fff';
  const probe = document.createElement('div');
  probe.style.color = colour;
  document.body.appendChild(probe);
  const match = getComputedStyle(probe).color.match(/\d+/g);
  document.body.removeChild(probe);
  if (!match) return '#fff';
  const [r, g, b] = match.map(Number);
  return (0.299 * r + 0.587 * g + 0.114 * b) > 170 ? '#000' : '#fff';
}
const createProjectChipId = () => {
  chipSequence += 1;
  // Include a timestamp so IDs remain unique even if chipSequence resets
  // (e.g. after a Vite HMR module re-evaluation in development).
  return `chip-${Date.now()}-${chipSequence}`;
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

// Module-level: persists across TacticsPage mounts within the same SPA session.
// Stores the JSON fingerprint of chip state at the last successful send so
// we can compare after navigation (re-mount creates fresh object refs).
let _sessionSentFingerprint = null;

export default function TacticsPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const currentPath = location.pathname;
  const { currentYear, draftYear, activeYear, allYears, isCurrentYearArchived, refreshMetadata, getYearInfo } = useYear();

  const [isArchiveModalOpen, setIsArchiveModalOpen] = useState(false);

  const handleUndoDraft = useCallback(async () => {
    const result = await undoDraftYear();
    if (result.success) {
      refreshMetadata();
    }
  }, [refreshMetadata]);

  // Dev revert archive handler — remove before launch
  const handleRevertArchive = useCallback(async () => {
    const result = await revertArchive();
    if (result.success) {
      refreshMetadata();
    } else {
      // eslint-disable-next-line no-alert
      alert(`Could not revert archive: ${result.error}`);
    }
  }, [refreshMetadata]);

  const handlePlanNextYear = useCallback(async () => {
    if (!activeYear) return;
    const result = await createDraftYearFromActive(activeYear.yearNumber);
    if (result.success) {
      refreshMetadata();
      navigate('/staging');
    } else {
      // eslint-disable-next-line no-alert
      alert(`Could not create draft year: ${result.error}`);
    }
  }, [activeYear, refreshMetadata, navigate]);
  // Year-scoped settings: each of the eight Plan-page settings holds its
  // own per-year value. After helper #4's Supabase port the values can no
  // longer be loaded synchronously, but the in-memory + localStorage cache
  // makes a synchronous peek possible — so on a cache hit the page renders
  // with the user's real values on the very first paint. On a cold miss
  // each useState falls back to the same default DEFAULT_YEAR_SETTINGS
  // uses, and the async load below swaps them in once it resolves.
  const tacticsCacheInit = peekTacticsCache(currentYear);
  const stagingCacheInit = peekStagingCache(currentYear);
  const cachedYearSettings = tacticsCacheInit.yearSettings;
  const cachedLiveChips = tacticsCacheInit.liveChips;
  const cachedColumnWidths = tacticsCacheInit.columnWidths;
  const cachedShortlist = Array.isArray(stagingCacheInit?.shortlist) ? stagingCacheInit.shortlist : null;

  const [startDay, setStartDay] = useState(cachedYearSettings?.startDay ?? 'Sunday');
  const [incrementMinutes, setIncrementMinutes] = useState(cachedYearSettings?.incrementMinutes ?? 60);

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
  const [startHour, setStartHour] = useState(cachedYearSettings?.startHour ?? '');
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
  const [startMinute, setStartMinute] = useState(cachedYearSettings?.startMinute ?? '');
  const [showAmPm, setShowAmPm] = useState(
    cachedYearSettings ? cachedYearSettings.showAmPm !== false : true,
  );
  const [use24Hour, setUse24Hour] = useState(
    cachedYearSettings ? cachedYearSettings.use24Hour === true : false,
  );
  const [chipDisplayModes, setChipDisplayModes] = useState(
    cachedYearSettings?.chipDisplayModes ?? { __default__: { duration: false, clock: false } },
  );
  const [summaryRowOrder, setSummaryRowOrder] = useState(
    cachedYearSettings?.summaryRowOrder ?? null,
  );
  // Per-year overrides for the built-in default chips (sleep/rest/buffer).
  // Shape: { [defaultId]: { label?, color? } }. Persisted in the
  // tactics_year_settings row via the settings autosave effect below.
  const [defaultChipOverrides, setDefaultChipOverrides] = useState(
    cachedYearSettings?.defaultChipOverrides ?? {},
  );

  const handleToggleChipDisplayFlag = useCallback((projectId, flag) => {
    setChipDisplayModes((prev) => {
      const current = prev[projectId] && typeof prev[projectId] === 'object' ? prev[projectId] : { duration: false, clock: false };
      return { ...prev, [projectId]: { ...current, [flag]: !current[flag] } };
    });
  }, []);

  useEffect(() => {
    // Settings load completes asynchronously after mount (see the parallel
    // load effect below). Skip the very first save-effect run for each year
    // so the in-memory defaults don't overwrite the freshly loaded Supabase
    // values before they make it into state. Matches the chipsLoadedForYear
    // gate used by the chips autosave.
    if (settingsLoadedForYear.current == null) {
      settingsLoadedForYear.current = currentYear;
      return;
    }
    if (suppressNextSaveRef.current) {
      suppressNextSaveRef.current = false;
      return;
    }
    saveTacticsYearSettings(
      { startHour, startMinute, incrementMinutes, showAmPm, use24Hour, startDay, chipDisplayModes, summaryRowOrder, defaultChipOverrides },
      currentYear
    );
  }, [startHour, startMinute, incrementMinutes, showAmPm, use24Hour, startDay, chipDisplayModes, summaryRowOrder, defaultChipOverrides, currentYear]);
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
  // Chips load asynchronously now (Supabase). Start empty; the async load
  // effect below populates this with the user's saved chips (or sleep-block
  // defaults if no chips exist yet). The chipsLoadedForYear gate on the
  // chip autosave effect prevents this empty default from clobbering DB.
  const [projectChips, setProjectChips] = useState(
    () => (Array.isArray(cachedLiveChips?.projectChips) ? cachedLiveChips.projectChips : []),
  );
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
  const [stagingProjects, setStagingProjects] = useState(() => cachedShortlist ?? []);
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

  // Column widths for resizing (index 0 is the time column, rest are day/project columns).
  // On cache hit (peek above), starts with the user's saved widths so the
  // first render shows the right column layout. On miss, falls back to a
  // sensible default and the async load swaps it in shortly.
  const [columnWidths, setColumnWidths] = useState(() =>
    Array.isArray(cachedColumnWidths) && cachedColumnWidths.length > 0
      ? cachedColumnWidths
      : Array.from({ length: 30 }, (_, i) => i === 0 ? 120 : 140),
  );

  // Save column widths to storage when they change. Gated like the year
  // settings autosave so the default array above doesn't clobber a
  // previously saved width set during the initial async load window.
  // Debounced: setColumnWidths fires on every mousemove pixel during a
  // drag, so without debouncing dozens of concurrent Supabase writes race
  // each other and the one that resolves last (not the final position)
  // wins. The effect cleanup cancels the pending timer on each new value,
  // so only the final resting width is written.
  useEffect(() => {
    if (columnWidthsLoadedForYear.current == null) {
      columnWidthsLoadedForYear.current = currentYear;
      return;
    }
    const widthsToSave = columnWidths;
    const yearToSave = currentYear;
    const timer = setTimeout(() => {
      saveTacticsColumnWidths(widthsToSave, yearToSave);
    }, 600);
    return () => clearTimeout(timer);
  }, [columnWidths, currentYear]);


  const [clipboardProject, setClipboardProject] = useState(null);
  const [editingChipId, setEditingChipId] = useState(null);
  const [editingChipLabel, setEditingChipLabel] = useState('');
  const [editingChipIsCustom, setEditingChipIsCustom] = useState(false);
  const [editingChipIsTime, setEditingChipIsTime] = useState(false);
  const [editingChipMinutes, setEditingChipMinutes] = useState('');
  // Async-loaded with projectChips in the parallel load effect below.
  // Hydrates from cache when available so the first render shows the
  // user's overrides without the post-load shimmer.
  const [chipTimeOverrides, setChipTimeOverrides] = useState(
    () => cachedLiveChips?.chipTimeOverrides ?? {},
  );
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
  // Async-loaded with projectChips in the parallel load effect below.
  // Hydrates from cache when available.
  const [customProjects, setCustomProjects] = useState(
    () => (Array.isArray(cachedLiveChips?.customProjects) ? cachedLiveChips.customProjects : []),
  );

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

  // Refs for timeline state — used by plan-panel chip action handlers to avoid
  // stale closures without re-registering the event listener on every change.
  const timelineRowIdsRef = useRef([]);
  const trailingMinuteRowsRef = useRef([]);
  const rowIndexMapRef = useRef(new Map());
  const incrementMinutesRef = useRef(60);

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
          planSummary: buildProjectPlanSummary(project),
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
  // Chip dragged from the schedule panel that hasn't been committed to state yet.
  // We hold it here during the drag so we can compute preview geometry without
  // adding it to projectChips (and therefore the table) until the user drops.
  const pendingPanelChipRef = useRef(null);

  const getProjectChipById = useCallback(
    (blockId) => {
      const pending = pendingPanelChipRef.current;
      if (pending && pending.id === blockId) return pending;
      return dedupeChipsById(projectChips).find((block) => block.id === blockId) ?? null;
    },
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
  // All three "loaded for year" refs start as null. The autosave effects
  // treat null as "initial load still in flight" and skip saving. The async
  // load effect below resets them to null whenever currentYear changes; each
  // save effect's first post-load run flips its ref to the current year
  // (gate cleared) and returns without saving. Subsequent state changes
  // pass the gate and save normally.
  //
  // Pre helper #4 port the chip ref was initialised to currentYear, which
  // was harmless when the lazy initialisers loaded synchronously (the
  // "redundant first save" wrote the just-loaded value back). After the
  // Supabase port the lazy initialisers can't load, so on first mount the
  // ref would have let the save effect write DEFAULT chips over the user's
  // saved chips before the async load completed. Null init fixes that.
  const chipsLoadedForYear = useRef(null);
  // Set to true when loadTacticsChipsState returns null (auth/network error).
  // The autosave effect checks this after the standard gate so a failed load
  // never lets the save effect write [] (or sleep blocks) over real DB chips.
  // Reset to false at the start of every load effect run.
  const chipLoadFailed = useRef(false);
  const settingsLoadedForYear = useRef(null);
  const columnWidthsLoadedForYear = useRef(null);
  // Suppresses the autosave useEffect for one cycle when GearPanel pushes a
  // settings change so we don't write back the same data a second time.
  const suppressNextSaveRef = useRef(false);

  // Sync Plan page settings changed via GearPanel
  useEffect(() => {
    const handler = (e) => {
      if (e.detail?.__eventYear !== currentYear) return;
      suppressNextSaveRef.current = true;
      if ('startHour'        in e.detail) setStartHour(e.detail.startHour);
      if ('startMinute'      in e.detail) setStartMinute(e.detail.startMinute);
      if ('incrementMinutes' in e.detail) setIncrementMinutes(e.detail.incrementMinutes);
      if ('use24Hour'        in e.detail) setUse24Hour(e.detail.use24Hour);
      if ('showAmPm'         in e.detail) setShowAmPm(e.detail.showAmPm);
      if ('startDay'         in e.detail) handleStartDayChange(e.detail.startDay);
    };
    window.addEventListener(GEAR_TACTICS_SETTINGS_EVENT, handler);
    return () => window.removeEventListener(GEAR_TACTICS_SETTINGS_EVENT, handler);
  }, [currentYear, handleStartDayChange]);

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
      // If the panel chip was never dropped, discard it without adding to state.
      pendingPanelChipRef.current = null;
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
  // Load all Plan-page state for the current year. Runs on first mount and
  // again whenever currentYear changes (Plan Next Year flow, draft promote,
  // etc). After helper #4's Supabase port this is the sole load path; the
  // useState lazy initialisers no longer touch the database.
  //
  // Four things load in parallel:
  //   * staging projects (Goal page shortlist, drives the project columns)
  //   * year settings (eight Plan-page settings)
  //   * column widths (Plan grid layout)
  //   * chip state (projectChips + customProjects + chipTimeOverrides)
  //
  // Each save-gate ref is reset to null at the top so the autosave effects
  // skip the next run after the loaded state lands in setX, then fire
  // normally once the user interacts.
  //
  // The chip dayName backfill uses the just-loaded settings.startDay (not
  // the in-state startDay, which hasn't applied yet by the time the load
  // resolves) so the synthetic day name matches the user's startDay
  // preference, not the default 'Sunday'.
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    let cancelled = false;

    // Skip the async load entirely on cache hit. The useState initialisers
    // already used peekTacticsCache + peekStagingCache to populate state
    // with the saved values; running the load again would set new object
    // references and trigger redundant re-renders (the "page builds in
    // front of me" flash). Saves keep the cache in sync, so the cache is
    // authoritative for the in-session experience.
    const cachedTactics = peekTacticsCache(currentYear);
    const cachedStaging = peekStagingCache(currentYear);
    const hasCachedTacticsState =
      cachedTactics.yearSettings != null ||
      cachedTactics.liveChips != null ||
      cachedTactics.columnWidths != null;
    if (hasCachedTacticsState && cachedStaging) {
      hasLoadedInitialState.current = true;
      if (cachedTactics.liveChips != null) {
        // Full cache hit including chips. The chip autosave uses a
        // "must be explicitly opened" gate (chipsLoadedForYear.current
        // must equal currentYear before any save fires). The old "arm on
        // first run" skip that settings/widths gates use does NOT apply
        // here — if we return without opening the gate, no chip saves
        // will fire for the entire session.
        //
        // This code path is hit most often after a YearContext reload
        // (SIGNED_IN fires → isLoading = true → TacticsPage unmounts
        // mid-load → Supabase calls complete in the background, populate
        // the cache → TacticsPage remounts → sees cache hit here).
        // The useState initialisers already populated projectChips from
        // this same cache, so opening the gate is safe — there are no
        // sleep-block-only chips pending in state.
        chipsLoadedForYear.current = currentYear;
        return () => {};
      }
      // liveChips missing from cache (unusual — settings or widths hit but
      // chips didn't). Fall through to the full async load so chips are
      // fetched from Supabase. Settings/widths helpers will return from
      // their own cache entries immediately, so there's no extra round-trip
      // for those two.
    }

    // Reset gates so the autosave effects don't write defaults to the new
    // year's rows. Each save effect re-arms its own ref on its first
    // post-reset run; subsequent state changes pass through.
    settingsLoadedForYear.current = null;
    columnWidthsLoadedForYear.current = null;
    chipsLoadedForYear.current = null;
    chipLoadFailed.current = false;
    hasLoadedInitialState.current = true;

    (async () => {
      try {
        const [stagingState, settings, widths, chipState] = await Promise.all([
          loadStagingState(currentYear),
          loadTacticsYearSettings(currentYear),
          loadTacticsColumnWidths(currentYear),
          loadTacticsChipsState(currentYear),
        ]);
        if (cancelled) return;

        // Staging projects (Goal page shortlist)
        setStagingProjects(Array.isArray(stagingState?.shortlist) ? stagingState.shortlist : []);

        // Year settings
        setStartDay(settings.startDay);
        setIncrementMinutes(settings.incrementMinutes);
        setStartHour(settings.startHour);
        setStartMinute(settings.startMinute);
        setShowAmPm(settings.showAmPm);
        setUse24Hour(settings.use24Hour);
        setChipDisplayModes(settings.chipDisplayModes);
        setSummaryRowOrder(settings.summaryRowOrder);
        setDefaultChipOverrides(settings.defaultChipOverrides ?? {});

        // Column widths (skip update if Supabase has no saved widths — the
        // useState default already holds the right baseline)
        if (Array.isArray(widths) && widths.length > 0) {
          setColumnWidths(widths);
        }

        // Chip state. dayName backfill uses settings.startDay (the value
        // we just loaded), not the in-state startDay (still 'Sunday' at
        // this point in the microtask).
        //
        // chipState contract (from loadTacticsChipsState):
        //   null                       — read failed (auth/network error). Do NOT
        //                               save default state; real chips may still be
        //                               in DB. Gate stays closed so no autosave fires.
        //   { projectChips: [] }       — confirmed empty DB (first-time user).
        //   { projectChips: [...] }    — real chips loaded.
        const startIndex = Math.max(0, DAYS_OF_WEEK.indexOf(settings.startDay));
        const weekDays = DAYS_OF_WEEK.slice(startIndex).concat(DAYS_OF_WEEK.slice(0, startIndex));
        if (chipState === null) {
          // Read failed. Do NOT call setProjectChips at all.
          //
          // Calling setProjectChips here (even with sleep blocks as a visual
          // placeholder) starts a chain that wipes real chips:
          //   1. Re-render → autosave fires its first run → arms the gate
          //      (sets chipsLoadedForYear.current = currentYear), returns early.
          //   2. Settings load succeeds → setIncrementMinutes called →
          //      timelineRowIds changes → sleep-blocks-update effect fires →
          //      setProjectChips again (mapping positions) → re-render.
          //   3. Autosave fires → gate is now open → writeChipsLayerInner runs
          //      delete-then-insert with sleep blocks, permanently wiping real
          //      chips from Supabase.
          //
          // Leaving projectChips as [] means no chip-related effect can
          // trigger a save. The user sees an empty Plan page; navigating away
          // and back retries the load.
          chipLoadFailed.current = true;
          // Open the gate anyway: chips in state come from peekTacticsCache
          // (the useState initializer ran before this effect). The sleep-blocks-ADD
          // effect fired synchronously before this async branch resolved, so it was
          // already blocked by the closed gate — no sleep-only save is pending.
          // Without opening the gate here, ALL user-placed chips are silently
          // discarded because saveTacticsChipsState never fires.
          chipsLoadedForYear.current = currentYear;
        } else if (chipState.projectChips && chipState.projectChips.length > 0) {
          const dedupedChips = dedupeChipsById(chipState.projectChips);
          updateChipSequenceFromList(dedupedChips);
          setProjectChips(dedupedChips.map((chip) => {
            if (chip.dayName != null || chip.columnIndex >= DAY_COLUMN_COUNT) return chip;
            return { ...chip, dayName: weekDays[chip.columnIndex] ?? null };
          }));
          setCustomProjects(Array.isArray(chipState.customProjects) ? chipState.customProjects : []);
          setChipTimeOverrides(
            chipState.chipTimeOverrides && typeof chipState.chipTimeOverrides === 'object'
              ? chipState.chipTimeOverrides
              : {}
          );
          chipsLoadedForYear.current = currentYear;
        } else {
          // Confirmed empty DB (first-time user for this year).
          setProjectChips(buildInitialSleepBlocks(weekDays));
          setCustomProjects([]);
          setChipTimeOverrides({});
          chipsLoadedForYear.current = currentYear;
        }

        // Explicitly open the settings + column-widths autosave gates.
        // The skip-first-save dance in each save effect only fires if a
        // setX call above caused a re-render — and primitive setX with an
        // unchanged value (e.g. setStartDay('Sunday') when current is
        // 'Sunday') is a no-op in React. Column widths in particular skip
        // setColumnWidths entirely when Supabase has no saved widths,
        // leaving the gate armed forever and silently swallowing every
        // user resize. Opening the gates explicitly here costs one
        // redundant save of the just-loaded data per autosave effect but
        // guarantees subsequent user changes actually persist.
        settingsLoadedForYear.current = currentYear;
        columnWidthsLoadedForYear.current = currentYear;
      } catch (err) {
        console.error('Failed to load Plan page state for year', currentYear, err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [currentYear]);

  // Set up storage event listeners
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const readProjects = async () => {
      const state = await loadStagingState(currentYear);
      setStagingProjects(Array.isArray(state?.shortlist) ? state.shortlist : []);
    };

    const handleStorage = (event) => {
      // Check for year-specific staging keys (staging-year-{yearNumber}-shortlist) or legacy key
      if (event?.key && !event.key.startsWith('staging-year-') && event.key !== STAGING_STORAGE_KEY) return;
      // H3: if the custom event is tagged with a year, only act when it
      // matches the Plan page's current year. Untagged events pass through.
      const eventYear = event?.detail?.__eventYear;
      if (eventYear != null && eventYear !== currentYear) return;
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

  // Keep timeline refs current for chip action handlers
  useEffect(() => { timelineRowIdsRef.current = timelineRowIds; }, [timelineRowIds]);
  useEffect(() => { trailingMinuteRowsRef.current = trailingMinuteRows; }, [trailingMinuteRows]);
  useEffect(() => { rowIndexMapRef.current = rowIndexMap; }, [rowIndexMap]);
  useEffect(() => { incrementMinutesRef.current = incrementMinutes; }, [incrementMinutes]);

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
      // Absorb the click event that fires after mouseup so it doesn't
      // hit the grid cell's toggleCellSelection handler and deselect the chip.
      window.addEventListener('click', (e) => e.stopPropagation(), { capture: true, once: true });

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

    // If this chip came from the schedule panel and was never added to state,
    // add it directly at the drop target rather than moving it from the project column.
    const isPendingPanelChip = pendingPanelChipRef.current?.id === sourceChipId;
    if (isPendingPanelChip) {
      const pendingChip = pendingPanelChipRef.current;
      pendingPanelChipRef.current = null;
      const placedChip = {
        ...pendingChip,
        columnIndex: targetColumnIndex,
        dayName: targetColumnIndex < DAY_COLUMN_COUNT ? (displayedWeekDays[targetColumnIndex] ?? null) : null,
        startRowId,
        endRowId,
        startMinutes: rowIdToClockMinutes(startRowId, trailingMinuteRows),
      };
      const nextChips = [...prevChips, placedChip];
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
      logDragDebug('Panel chip placed and cleared');
      return;
    }

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
      const openAbove = spaceAbove > spaceBelow;
      const top = openAbove
        ? cellRect.top - 4  // menu will use `bottom` anchor instead
        : Math.max(cellRect.bottom + 4, stickyHeaderBottom + VIEWPORT_PADDING);
      setColorEditorProjectId(null);
      setCellMenu({
        columnIndex,
        rowId,
        position: { top, left, width: cellRect.width, openAbove },
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
    const block =
      columnBlocks.find((entry) => entry.startRowId === rowId) ??
      columnBlocks.find((entry) => isRowWithinBlock(rowId, entry));
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
      // If the right-clicked cell is covered by an existing chip block (not
      // necessarily its start row), update that chip instead of creating a new
      // one hidden underneath it.
      const coveringBlockId = cellMenuBlockId;
      const mapped = prevChips.map((entry) => {
        const isMatch = coveringBlockId
          ? entry.id === coveringBlockId
          : entry.columnIndex === columnIndex && entry.startRowId === rowId;
        if (isMatch) {
          updated = true;
          // If this was a schedule chip, reset its ID so it's no longer
          // tracked as a placed schedule item for the old project.
          const newId = entry.id.startsWith('schedule-chip-')
            ? createProjectChipId()
            : entry.id;
          assignedId = newId;
          return {
            ...entry,
            id: newId,
            projectId,
            startRowId: startRowIdOverride != null ? targetStartRowId : entry.startRowId,
            endRowId: endRowIdOverride != null ? targetEndRowId : entry.endRowId,
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
    [cellMenu, cellMenuBlockId, closeCellMenu, executeCommand, selectedCell, setProjectChips, setSelectedBlockId, setSelectedCell]
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
    // Skip saving if chips haven't been loaded for this year yet — prevents
    // the previous year's chips from being written to the new year's storage
    // key during a year switch (the state updates from the load effect haven't
    // applied yet when this effect fires in the same render cycle).
    // Only save after the load effect has explicitly opened the gate for THIS
    // year by setting chipsLoadedForYear.current = currentYear in its success
    // branch. Returning early here blocks:
    //   - The sleep-blocks-ADD effect (fires on every mount before async load
    //     completes, calls setProjectChips([sleep-0..6]) → would trigger this
    //     autosave and wipe real chips from Supabase within 600ms).
    //   - Year-switch races where the previous year's chips are in state but
    //     currentYear has already changed.
    //   - The error path (chipState === null): load opens the gate from cache
    //     so user edits still persist, but no sleep-block save fires because
    //     no state changes are pending by the time the async branch runs.
    // The old design (arm on first run, skip once) let any subsequent state
    // change pass the gate before load completed — this was the wipe bug.
    if (chipsLoadedForYear.current !== currentYear) {
      return;
    }
    // Debounce: chip resize fires setProjectChips on every mousemove pixel,
    // queuing dozens of Supabase writes per drag (each a delete-then-insert).
    // The cleanup cancels the pending save on each new change, so only the
    // final resting state after 600ms of no further updates is written.
    // The mouseup handler also issues two quick setState calls (chipTimeOverrides
    // then projectChips) — the debounce collapses those into one save too.
    const payload = { projectChips, customProjects, chipTimeOverrides };
    const yearToSave = currentYear;
    const timer = setTimeout(() => {
      saveTacticsChipsState(payload, yearToSave);
    }, 600);
    return () => clearTimeout(timer);
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

  // ── Unified chip editor sub-view (default / project / custom chips) ──
  // chipEditor: null | { kind: 'default'|'project'|'custom', id, name, color }
  const [chipEditor, setChipEditor] = useState(null);
  const [chipEditorSlide, setChipEditorSlide] = useState(0);
  const openChipEditor = useCallback((kind, id, name, color, chipId = null) => {
    setChipEditor({ kind, id, name: name ?? '', color: color || '#8a7fd6', chipId });
    setChipEditorSlide(0);
  }, []);
  const closeChipEditor = useCallback(() => setChipEditor(null), []);
  const setChipEditorName = useCallback((value) => {
    setChipEditor((prev) => (prev ? { ...prev, name: value } : prev));
  }, []);
  const setChipEditorColour = useCallback((colour) => {
    setChipEditor((prev) => (prev ? { ...prev, color: colour } : prev));
  }, []);
  const chipEditorEyedropper = useCallback(async () => {
    if (typeof window === 'undefined' || !('EyeDropper' in window)) return;
    try {
      const result = await new window.EyeDropper().open();
      setChipEditorColour(result.sRGBHex);
    } catch {
      /* cancelled */
    }
  }, [setChipEditorColour]);
  const handleCreateCustomProject = useCallback(() => {
    customSequenceRef.current += 1;
    const customId = `custom-${Date.now()}-${customSequenceRef.current}`;
    const label = `Custom ${customSequenceRef.current}`.toUpperCase();
    const colour = pickCustomChipColour(customProjects, stagingProjects);
    const customProject = { id: customId, label, color: colour };
    const prevCustomProjects = customProjectsRef.current;
    const nextCustomProjects = [...prevCustomProjects, customProject];
    executeCommand({
      execute: () => setCustomProjects(nextCustomProjects),
      undo: () => setCustomProjects(prevCustomProjects),
    });
    // Open the full edit sub-view seeded with the new chip (matches mockup).
    openChipEditor('custom', customId, label, colour);
  }, [customProjects, executeCommand, stagingProjects, openChipEditor]);

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
  const commitChipEditor = useCallback(() => {
    const editor = chipEditor;
    if (!editor) return;
    const label = (editor.name || '').trim();
    const colour = editor.color;
    if (editor.kind === 'default') {
      setDefaultChipOverrides((prev) => ({
        ...prev,
        [editor.id]: { ...(label ? { label } : {}), color: colour },
      }));
    } else if (editor.kind === 'custom') {
      const prevCustomProjects = customProjectsRef.current;
      const nextCustomProjects = prevCustomProjects.map((p) =>
        p.id === editor.id
          ? { ...p, label: (label || p.label).toUpperCase(), color: colour }
          : p
      );
      executeCommand({
        execute: () => setCustomProjects(nextCustomProjects),
        undo: () => setCustomProjects(prevCustomProjects),
      });
    } else if (editor.kind === 'project') {
      // Colour applies to the project itself, so write it back to the Goal-page
      // shortlist (Goal page + Plan page stay in sync). The name is a per-chip
      // label only — it does NOT touch the project nickname.
      const cache = peekStagingCache(currentYear);
      const baseShortlist = Array.isArray(cache?.shortlist) ? cache.shortlist : stagingProjects;
      const nextShortlist = baseShortlist.map((p) =>
        p.id === editor.id ? { ...p, color: colour } : p
      );
      setStagingProjects(nextShortlist);
      saveStagingState(
        { shortlist: nextShortlist, archived: Array.isArray(cache?.archived) ? cache.archived : [] },
        currentYear
      );
      // Apply the edited name to the targeted chip only (displayLabel override).
      if (editor.chipId) {
        const prevChips = projectChipsRef.current;
        const target = prevChips.find((b) => b.id === editor.chipId);
        if (target) {
          const nextChips = prevChips.map((b) =>
            b.id === editor.chipId ? { ...b, displayLabel: label || null } : b
          );
          executeCommand({
            execute: () => setProjectChips(nextChips),
            undo: () => setProjectChips(prevChips),
          });
        }
      }
    }
    setChipEditor(null);
  }, [chipEditor, executeCommand, currentYear, stagingProjects]);

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
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') closeCellMenu();
    };
    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
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
  useLayoutEffect(() => {
    if (!cellMenu) return;
    if (cellMenu.position?.clamped) return;
    const menuNode = cellMenuRef.current;
    if (!menuNode) return;
    const VIEWPORT_PADDING = 8;
    const menuHeight = menuNode.offsetHeight;
    if (!menuHeight) return;
    const { position } = cellMenu;
    if (!position) return;
    if (position.openAbove) {
      const menuTop = position.top - menuHeight;
      const stickyHeaderBottom = navBarRef.current
        ? navBarRef.current.getBoundingClientRect().bottom
        : 0;
      if (menuTop < stickyHeaderBottom + VIEWPORT_PADDING) {
        const clampedTop = stickyHeaderBottom + VIEWPORT_PADDING + menuHeight;
        setCellMenu((prev) => prev ? { ...prev, position: { ...prev.position, top: clampedTop, clamped: true } } : prev);
      } else {
        setCellMenu((prev) => prev ? { ...prev, position: { ...prev.position, clamped: true } } : prev);
      }
    } else {
      const menuBottom = position.top + menuHeight;
      if (menuBottom > window.innerHeight - VIEWPORT_PADDING) {
        const clampedTop = window.innerHeight - VIEWPORT_PADDING - menuHeight;
        setCellMenu((prev) => prev ? { ...prev, position: { ...prev.position, top: clampedTop, clamped: true } } : prev);
      } else {
        setCellMenu((prev) => prev ? { ...prev, position: { ...prev.position, clamped: true } } : prev);
      }
    }
  }, [cellMenu]);
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

  // Given a clock time in minutes (0–1439), find the nearest row ID in the
  // current timeline. Used by the panel's start/end time pickers.
  const minutesToNearestRowId = useCallback((targetMins) => {
    const rows = timelineRowIdsRef.current;
    const trailing = trailingMinuteRowsRef.current;
    let bestRowId = null;
    let bestDiff = Infinity;
    for (const rowId of rows) {
      const mins = rowIdToClockMinutes(rowId, trailing);
      if (mins == null) continue;
      const diff = Math.abs(mins - targetMins);
      if (diff < bestDiff) { bestDiff = diff; bestRowId = rowId; }
    }
    return bestRowId;
  }, []);
  const projectMetadata = useMemo(() => {
    const map = new Map();
    const ov = (id) => (defaultChipOverrides && typeof defaultChipOverrides === 'object' ? defaultChipOverrides[id] : null) || {};
    const sleepOv = ov('sleep');
    const restOv = ov('rest');
    const bufferOv = ov('buffer');
    map.set('sleep', {
      label: sleepOv.label || 'Sleep',
      color: sleepOv.color || '#d9d9d9',
    });
    map.set('rest', {
      label: restOv.label || 'REST',
      color: restOv.color || '#666666',
      fontWeight: 700,
    });
    map.set('buffer', {
      label: bufferOv.label || 'BUFFER',
      color: bufferOv.color || '#fe8afe',
      fontWeight: 700,
    });
    dropdownProjects.forEach((project) => {
      const color = project.color || '#0f172a';
      map.set(project.id, {
        label: project.label,
        color,
      });
    });
    return map;
  }, [dropdownProjects, defaultChipOverrides]);
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
        } else if (block.durationMinutes) {
          currentMinutes = block.durationMinutes;
        } else if (scheduleItem) {
          currentMinutes = parseEstimateLabelToMinutes(scheduleItem.timeValue) ?? spanMinutes;
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

      // Manual time override always wins — applies to single-cell AND multi-row
      // chips so that a user-typed duration (e.g. 1:30 on a 60-min grid) is
      // respected even after the chip is resized to span 2 grid rows.
      const overrideMins = chipTimeOverrides[block.id];
      if (Number.isFinite(overrideMins) && overrideMins > 0) {
        duration = overrideMins;
      }

      if (duration == null && isScheduleChip && isSingleCell) {
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
      if (duration == null && isSingleCell) {
        const effectiveMins = block.durationMinutes ?? null;
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
  // Debounced autosave of live tactics metrics. Plan-page metric recomputes
  // fire on every chip drag / settings tweak; without debounce each one is
  // a Supabase round-trip. 500ms idle window matches the staging autosave.
  useEffect(() => {
    const timer = setTimeout(() => {
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
    }, 500);
    return () => clearTimeout(timer);
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
  // Snapshot of chip state at last successful send — used to detect whether
  // the plan has changed since the last send (all three are compared by ref).
  // Bumped after each send so the isUpToDate memo re-runs against the
  // updated _sessionSentFingerprint module variable.
  const [sentFingerprintTick, setSentFingerprintTick] = useState(0);
  const handleSendToSystem = useCallback(async () => {
    const yearInfo = getYearInfo(currentYear);
    if (yearInfo?.startDate) {
      await saveStartDate(yearInfo.startDate, undefined, currentYear);
    }

    // Build metrics payload
    const projectWeeklyQuotas = projectSummaries.map((summary) => ({
      id: summary.id,
      label: summary.label,
      weeklyHours: minutesToHourMinuteDecimal(summary.totalMinutes),
    }));

    // Determine which week of the cycle to target for this Send. We take the
    // LATER of two signals so both common scenarios work:
    //   A) Calendar week: user is physically in week N of the cycle by date.
    //   B) Visible week: user hid week N-1 early on the System page to plan
    //      ahead — the first visible day tells us the intended target week.
    // max(A, B) handles both without the caller having to pick one.

    // Signal A — calendar position
    const cycleStartDate = yearInfo?.startDate;
    let weekFromCalendar = 1;
    if (cycleStartDate) {
      const cycleStart = new Date(cycleStartDate);
      cycleStart.setHours(0, 0, 0, 0);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const daysDiff = Math.floor((today - cycleStart) / (1000 * 60 * 60 * 24));
      weekFromCalendar = Math.max(1, Math.floor(daysDiff / 7) + 1);
    }

    // Signal B — first visible day on the System page (hidden weeks = past)
    let weekFromVisible = 1;
    try {
      const visibleCols = await readVisibleDayColumns(undefined, 84, currentYear);
      const firstVisible = Object.entries(visibleCols)
        .filter(([, v]) => v !== false)
        .map(([k]) => parseInt(k.replace('day-', ''), 10))
        .sort((a, b) => a - b)[0] ?? 0;
      weekFromVisible = Math.floor(firstVisible / 7) + 1;
    } catch (_) {
      // Fall through — weekFromVisible stays 1
    }

    const currentWeekNumber = Math.max(weekFromCalendar, weekFromVisible);

    // Build the new active bounds (no weekNumber = applies to current week
    // AND all future weeks via the mapper's globalMap fallback).
    const newActiveBounds = displayedWeekDays.map((day, idx) => ({
      day,
      dailyMaxHours: minutesToHourMinuteDecimal(availableColumnTotals[idx] ?? 0),
      dailyMinHours: minutesToHourMinuteDecimal(workingColumnTotals[idx] ?? 0),
    }));

    // Load the existing sent snapshot to build the historical record for
    // past weeks. Past weeks need their bounds locked in so they don't
    // change when future sends update the active bounds.
    const existingSnapshot = await loadSentMetricsSnapshot(currentYear, { bypassCache: true });
    const existingBounds = existingSnapshot?.dailyBounds ?? [];

    // Entries with a weekNumber are already-locked historical bounds.
    // Only keep locks for weeks strictly before the current week — future-week
    // locks must be cleared so the new active bounds apply to all upcoming weeks.
    // Entries without a weekNumber are the previously active (global) bounds.
    const existingHistorical = existingBounds.filter(
      (b) => b.weekNumber != null && b.weekNumber < currentWeekNumber,
    );
    const existingActive = existingBounds.filter((b) => b.weekNumber == null);

    // For every past week (1 … currentWeekNumber-1) that doesn't already have
    // a locked historical entry, archive the previous active bounds now.
    // This is what preserves week N-1's values when the user sends from week N.
    const lockedWeeks = new Set(existingHistorical.map((b) => b.weekNumber));
    const archivedBounds = [];
    for (let w = 1; w < currentWeekNumber; w++) {
      if (!lockedWeeks.has(w) && existingActive.length > 0) {
        existingActive.forEach((b) => archivedBounds.push({ ...b, weekNumber: w }));
      }
    }

    // Final merged payload:
    //   historical (locked past weeks) + newly archived + new active (no weekNumber)
    const mergedDailyBounds = [
      ...existingHistorical,
      ...archivedBounds,
      ...newActiveBounds,
    ];

    const weeklyTotals = {
      availableHours: minutesToHourMinuteDecimal(totalAvailableMinutes),
      workingHours: minutesToHourMinuteDecimal(totalWorkingMinutes),
    };

    const liveMetricsPayload = {
      projectWeeklyQuotas,
      dailyBounds: newActiveBounds,
      weeklyTotals,
    };
    const sentMetricsPayload = {
      projectWeeklyQuotas,
      dailyBounds: mergedDailyBounds,
      weeklyTotals,
    };

    // Save the chip state (live + sent snapshot), the send-to-system
    // timestamp, and the metrics (live + sent snapshot) before the event
    // dispatch. All five are async since helper #4's port, and they MUST
    // all complete before TACTICS_SEND_TO_SYSTEM_EVENT fires — otherwise
    // the System page's event handler races the Supabase writes and reads
    // stale data ("subsequent changes ignored" symptom from the previous
    // session's debugging marathon).
    await Promise.all([
      saveTacticsChipsState({ projectChips, customProjects, chipTimeOverrides }, currentYear),
      saveSentChipsSnapshot({ projectChips, customProjects, chipTimeOverrides }, currentYear),
      setSendToSystemTimestamp(currentYear),
      saveTacticsMetrics(liveMetricsPayload, currentYear),
      saveSentMetricsSnapshot(sentMetricsPayload, currentYear),
    ]);

    // Signal System (and any other listeners) that the Send is committed.
    // Tag the event with the year so a System view on a different year
    // does not act on a stale press (H3).
    window.dispatchEvent(new CustomEvent(TACTICS_SEND_TO_SYSTEM_EVENT, {
      detail: { __eventYear: currentYear },
    }));

    // Record the fingerprint of what was just sent so we can detect changes
    // across re-mounts (module-level survives navigation; tick triggers re-render).
    _sessionSentFingerprint = JSON.stringify({ projectChips, customProjects, chipTimeOverrides });
    setSentFingerprintTick((t) => t + 1);
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
    (projectId, itemIdx) => {
      // If the user has a cell selected, place the chip there rather than at the
      // default project-column position.
      if (selectedCell) {
        const schedItems = scheduleLayout?.scheduleItemsByProject?.get(projectId) ?? [];
        const scheduleItem = schedItems[itemIdx];
        if (!scheduleItem) return;

        const canonicalId = `schedule-chip-${projectId}-${itemIdx}`;
        const minutes = parseEstimateLabelToMinutes(scheduleItem.timeValue);
        const totalMinutes = Number.isFinite(minutes) ? minutes : incrementMinutes;
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

        const startRowIdx = rowIndexMap.get(selectedCell.rowId) ?? 2;
        const endRowIdx = Math.min(startRowIdx + span - 1, timelineRowIds.length - 1);
        const startRowId = selectedCell.rowId;
        const endRowId = timelineRowIds[endRowIdx] ?? startRowId;
        const startMinutes = rowIdToClockMinutes(startRowId, trailingMinuteRows);
        const targetColumnIndex = selectedCell.columnIndex;

        const scheduleDefaultText = SECTION_CONFIG.Schedule.placeholder;
        const trimmedName = (scheduleItem.name ?? '').trim();
        const hasScheduleName = Boolean(trimmedName && trimmedName !== scheduleDefaultText);

        const newChip = {
          id: `schedule-chip-${projectId}-${itemIdx}-extra-${createProjectChipId()}`,
          columnIndex: targetColumnIndex,
          dayName: targetColumnIndex < DAY_COLUMN_COUNT ? (displayedWeekDays[targetColumnIndex] ?? null) : null,
          startRowId,
          endRowId,
          startMinutes,
          projectId,
          displayLabel: hasScheduleName ? trimmedName : null,
          hasScheduleName,
          durationMinutes,
        };

        const prevChips = projectChipsRef.current;
        const nextChips = [...prevChips, newChip];
        executeCommand({
          execute: () => setProjectChips(nextChips),
          undo: () => setProjectChips(prevChips),
        });
        setSelectedBlockId(newChip.id);
        setSelectedCell(null);
        return;
      }

      buildAndAddScheduleItemChip(projectId, itemIdx);
    },
    [
      buildAndAddScheduleItemChip,
      chipTimeOverrides,
      displayedWeekDays,
      executeCommand,
      incrementMinutes,
      projectChips,
      projectChipsRef,
      rowIndexMap,
      scheduleLayout,
      selectedCell,
      setProjectChips,
      setSelectedBlockId,
      setSelectedCell,
      timelineRowIds,
      trailingMinuteRows,
    ]
  );

  const handlePanelDragStart = useCallback(
    (projectId, itemIdx, dragEvent) => {
      // Build the chip data without committing it to state. The chip is held in
      // pendingPanelChipRef until the user drops onto a valid cell, at which point
      // applyDragPreview writes it to projectChips in a single undoable command.
      // This prevents the chip from appearing prematurely in the project column.
      const colConfig = stagingColumnConfigs.find(
        (c) => c.type === 'project' && c.project?.id === projectId
      );
      if (!colConfig) return;
      const stagingIdx = stagingColumnConfigs.indexOf(colConfig);
      const columnIndex = DAY_COLUMN_COUNT + stagingIdx;

      const schedItems = scheduleLayout?.scheduleItemsByProject?.get(projectId) ?? [];
      const scheduleItem = schedItems[itemIdx];
      if (!scheduleItem) return;

      const minutes = parseEstimateLabelToMinutes(scheduleItem.timeValue);
      const totalMinutes = Number.isFinite(minutes) ? minutes : incrementMinutes;
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

      // Hold it in the ref — not yet added to projectChips state.
      pendingPanelChipRef.current = newChip;

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
    [
      buildAndAddScheduleItemChip,
      chipTimeOverrides,
      incrementMinutes,
      projectChips,
      rowIndexMap,
      scheduleLayout,
      setSelectedBlockId,
      stagingColumnConfigs,
      timelineRowIds,
      trailingMinuteRows,
    ]
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

  // Broadcast undo/redo availability to PlanPanel whenever stacks change
  useEffect(() => {
    window.dispatchEvent(new CustomEvent(PLAN_PANEL_STATE_EVENT, {
      detail: {
        undoAvailable: undoStack.length > 0,
        redoAvailable: redoStack.length > 0,
      },
    }));
  }, [undoStack.length, redoStack.length]);

  // JSON fingerprint of the current chip state — recomputes only when chips
  // actually change (not on every render).
  const chipsFingerprint = useMemo(
    () => JSON.stringify({ projectChips, customProjects, chipTimeOverrides }),
    [projectChips, customProjects, chipTimeOverrides],
  );

  // True when the current fingerprint matches what was last sent.
  // sentFingerprintTick forces a recheck immediately after a send (because
  // mutating _sessionSentFingerprint alone doesn't trigger React re-renders).
  const isUpToDate = useMemo(
    () => _sessionSentFingerprint !== null && chipsFingerprint === _sessionSentFingerprint,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chipsFingerprint, sentFingerprintTick],
  );

  // Broadcast sync state to PlanPanel
  useEffect(() => {
    window.dispatchEvent(new CustomEvent(PLAN_PANEL_STATE_EVENT, {
      detail: { isUpToDate },
    }));
  }, [isUpToDate]);

  // Listen for actions fired by PlanPanel
  useEffect(() => {
    const handler = (e) => {
      const { action, chipId, value, colour, projectId, minutes } = e.detail ?? {};

      if (action === 'undo') { undo(); return; }
      if (action === 'redo') { redo(); return; }
      if (action === 'sendToSystem') { handleSendToSystem(); return; }

      // ── Chip-specific actions ──────────────────────────────────────────────

      if (action === 'setChipName') {
        if (!chipId) return;
        const label = typeof value === 'string' ? value.trim() || null : null;
        const prevChips = projectChipsRef.current;
        const nextChips = prevChips.map((c) => c.id === chipId ? { ...c, displayLabel: label } : c);
        executeCommand({
          execute: () => setProjectChips(nextChips),
          undo: () => setProjectChips(prevChips),
        });
        return;
      }

      if (action === 'setChipColour') {
        if (!chipId || !colour) return;
        const chip = projectChipsRef.current.find((c) => c.id === chipId);
        if (!chip?.projectId?.startsWith('custom-')) return;
        const pid = chip.projectId;
        const prevCustom = customProjectsRef.current;
        const nextCustom = prevCustom.map((p) => p.id === pid ? { ...p, color: colour } : p);
        executeCommand({
          execute: () => setCustomProjects(nextCustom),
          undo: () => setCustomProjects(prevCustom),
        });
        return;
      }

      if (action === 'setChipGoal') {
        if (!chipId || !projectId) return;
        const prevChips = projectChipsRef.current;
        const nextChips = prevChips.map((c) => {
          if (c.id !== chipId) return c;
          // If this was a schedule chip, reset its ID so it's no longer
          // tracked as a placed schedule item for the old project.
          const newId = c.id.startsWith('schedule-chip-')
            ? createProjectChipId()
            : c.id;
          return { ...c, id: newId, projectId, displayLabel: null };
        });
        executeCommand({
          execute: () => setProjectChips(nextChips),
          undo: () => setProjectChips(prevChips),
        });
        return;
      }

      if (action === 'setChipStartMinutes') {
        if (!chipId || minutes == null) return;
        const newStartRowId = minutesToNearestRowId(minutes);
        if (!newStartRowId) return;
        const prevChips = projectChipsRef.current;
        const nextChips = prevChips.map((c) => {
          if (c.id !== chipId) return c;
          // Preserve duration span
          const idxMap = rowIndexMapRef.current;
          const rows = timelineRowIdsRef.current;
          const oldStartIdx = idxMap.get(c.startRowId) ?? 0;
          const oldEndIdx = idxMap.get(c.endRowId ?? c.startRowId) ?? oldStartIdx;
          const span = Math.max(0, oldEndIdx - oldStartIdx);
          const newStartIdx = idxMap.get(newStartRowId) ?? 0;
          const newEndIdx = Math.min(newStartIdx + span, rows.length - 1);
          return { ...c, startRowId: newStartRowId, endRowId: rows[newEndIdx] ?? newStartRowId };
        });
        executeCommand({
          execute: () => setProjectChips(nextChips),
          undo: () => setProjectChips(prevChips),
        });
        return;
      }

      if (action === 'setChipEndMinutes') {
        if (!chipId || minutes == null) return;
        // End time displayed = last row covered + incrementMinutes.
        // The rowId we want is the one whose clock time = endMinutes - incrementMinutes.
        const rowMins = ((minutes - incrementMinutesRef.current) + 1440) % 1440;
        const newEndRowId = minutesToNearestRowId(rowMins);
        if (!newEndRowId) return;
        const prevChips = projectChipsRef.current;
        const nextChips = prevChips.map((c) => {
          if (c.id !== chipId) return c;
          // Don't allow end before start
          const idxMap = rowIndexMapRef.current;
          const startIdx = idxMap.get(c.startRowId) ?? 0;
          const newEndIdx = idxMap.get(newEndRowId) ?? startIdx;
          if (newEndIdx < startIdx) return c;
          return { ...c, endRowId: newEndRowId };
        });
        executeCommand({
          execute: () => setProjectChips(nextChips),
          undo: () => setProjectChips(prevChips),
        });
        return;
      }

      if (action === 'setChipDuration') {
        if (!chipId || !value) return;
        const parts = String(value).match(/^(\d+):(\d{2})$/);
        if (!parts) return;
        const newDuration = parseInt(parts[1], 10) * 60 + parseInt(parts[2], 10);
        if (newDuration <= 0) return;
        const inc = incrementMinutesRef.current;
        const idxMap = rowIndexMapRef.current;
        const rows = timelineRowIdsRef.current;
        const prevChips = projectChipsRef.current;
        const prevOverrides = chipTimeOverridesRef.current;
        const nextChips = prevChips.map((c) => {
          if (c.id !== chipId) return c;
          // Resize chip to match new duration: compute the endRowId that spans
          // exactly ceil(newDuration / inc) rows from startRowId.
          const startIdx = idxMap.get(c.startRowId);
          if (startIdx == null) return c;
          const rowSpan = inc > 0 ? Math.max(1, Math.ceil(newDuration / inc)) : 1;
          const newEndIdx = Math.min(startIdx + rowSpan - 1, rows.length - 1);
          const newEndRowId = rows[newEndIdx] ?? c.startRowId;
          return { ...c, endRowId: newEndRowId };
        });
        // Store the user-specified duration as a chipTimeOverride — same as the
        // inline double-click editor. This is what the label and totaling code
        // read first, and it works for both single-cell and multi-row chips.
        const nextOverrides = { ...prevOverrides, [chipId]: newDuration };
        executeCommand({
          execute: () => { setProjectChips(nextChips); setChipTimeOverrides(nextOverrides); },
          undo: () => { setProjectChips(prevChips); setChipTimeOverrides(prevOverrides); },
        });
        return;
      }

      if (action === 'toggleChipClock') { handleToggleChipDisplayFlag(chipId ?? '__default__', 'clock'); return; }
      if (action === 'toggleChipDuration') { handleToggleChipDisplayFlag(chipId ?? '__default__', 'duration'); return; }

      if (action === 'removeChip') {
        handleRemoveSelectedChip();
        return;
      }

      if (action === 'addChipToCell') {
        if (!projectId) return;
        handleProjectSelection(projectId);
        return;
      }
    };
    window.addEventListener(PLAN_PANEL_ACTION_EVENT, handler);
    return () => window.removeEventListener(PLAN_PANEL_ACTION_EVENT, handler);
  }, [undo, redo, handleToggleChipDisplayFlag, handleSendToSystem, executeCommand, minutesToNearestRowId, handleRemoveSelectedChip, handleProjectSelection]);

  // Broadcast selected chip data to PlanPanel whenever selection changes.
  // Fires with chip: null on deselect so the panel reverts to the default view.
  useEffect(() => {
    let chip = null;

    if (selectedBlockId) {
      const block = getProjectChipById(selectedBlockId);
      if (block) {
        const projectId = block.projectId ?? 'sleep';
        const metadata = projectMetadata.get(projectId);

        // Chip type
        const isDefault = projectId === 'sleep' || projectId === 'rest' || projectId === 'buffer';
        const isCustom = typeof projectId === 'string' && projectId.startsWith('custom-');
        const chipType = isDefault ? 'default' : isCustom ? 'custom' : 'project';

        // Display name
        const name = block.displayLabel ?? metadata?.label ?? 'Project';

        // Colour
        const colour = metadata?.color ?? '#d9d9d9';

        // Goal info (project chips only)
        const goalName = isDefault || isCustom ? undefined : (metadata?.label ?? undefined);
        const goalColour = isDefault || isCustom ? undefined : (metadata?.color ?? undefined);

        // Clock times from row IDs.
        // sleep-start = configured bed-time hour; sleep-end = configured wake time.
        const startMinutes = rowIdToClockMinutes(block.startRowId, trailingMinuteRows)
          ?? (block.startRowId === 'sleep-start' ? parseHour12ToMinutes(startHour) : null);
        const endRowId = block.endRowId ?? block.startRowId;
        const endRowMinutes = rowIdToClockMinutes(endRowId, trailingMinuteRows);
        const endMinutes = endRowMinutes != null
          ? (endRowMinutes + incrementMinutes) % (24 * 60)
          : (block.endRowId === 'sleep-end' ? parseHour12ToMinutes(startMinute) : null);

        // Duration
        const overrideMins = chipTimeOverrides[selectedBlockId];
        const durationMinutes = overrideMins ?? block.durationMinutes ?? null;

        // Display flags — per-chip entry takes precedence over global __default__
        const defaultFlags = chipDisplayModes['__default__'] && typeof chipDisplayModes['__default__'] === 'object'
          ? chipDisplayModes['__default__']
          : { duration: false, clock: false };
        const perChipFlags = chipDisplayModes[selectedBlockId] && typeof chipDisplayModes[selectedBlockId] === 'object'
          ? chipDisplayModes[selectedBlockId]
          : null;
        const displayFlags = perChipFlags
          ? { ...defaultFlags, ...perChipFlags }
          : defaultFlags;

        chip = {
          id: block.id,
          type: chipType,
          name,
          colour,
          projectId,
          goalName,
          goalColour,
          startMinutes,
          endMinutes,
          durationMinutes,
          showClock: Boolean(displayFlags.clock),
          showDuration: Boolean(displayFlags.duration),
          incrementMinutes,
        };
      }
    }

    // Always build allChips so the panel can show the goal picker even when
    // no chip is selected (empty cell — "Add new chip" flow).
    const toMeta = (id, p) => {
      const meta = projectMetadata.get(id);
      return { id, name: meta?.label ?? p?.label ?? id, colour: meta?.color ?? p?.color ?? '#d9d9d9' };
    };
    const allChips = {
      defaults: ['sleep', 'rest', 'buffer'].map((id) => toMeta(id, null)),
      projects: highlightedProjects.map((p) => toMeta(p.id, p)),
      customs:  customProjects.map((p) => toMeta(p.id, p)),
    };
    if (chip) chip = { ...chip, allChips };

    window.dispatchEvent(new CustomEvent(PLAN_PANEL_CHIP_EVENT, { detail: { chip, allChips } }));
  }, [
    selectedBlockId,
    getProjectChipById,
    projectMetadata,
    trailingMinuteRows,
    incrementMinutes,
    startHour,
    startMinute,
    chipTimeOverrides,
    chipDisplayModes,
    highlightedProjects,
    customProjects,
  ]);

  // Broadcast schedule data to PlanPanel's ScheduleView whenever relevant data changes
  useEffect(() => {
    const enrichedProjects = highlightedProjects.map((p) => {
      const meta = projectMetadata.get(p.id);
      const color = meta?.color ?? p.color;
      return { ...p, color, textColor: meta?.textColor ?? getContrastTextColor(color) };
    });
    // Build allChips here too so PlanPanel always has it — this event fires
    // reliably on mount and whenever projects change, avoiding the race condition
    // where PLAN_PANEL_CHIP_EVENT fires before PlanPanel registers its listener.
    const toMeta = (id, p) => {
      const meta = projectMetadata.get(id);
      return { id, name: meta?.label ?? p?.label ?? id, colour: meta?.color ?? p?.color ?? '#d9d9d9' };
    };
    const allChips = {
      defaults: ['sleep', 'rest', 'buffer'].map((id) => toMeta(id, null)),
      projects: highlightedProjects.map((p) => toMeta(p.id, p)),
      customs:  customProjects.map((p) => toMeta(p.id, p)),
    };
    window.dispatchEvent(new CustomEvent(PLAN_PANEL_SCHEDULE_DATA_EVENT, {
      detail: {
        projects: enrichedProjects,
        scheduleLayout,
        projectChips,
        chipTimeOverrides,
        incrementMinutes,
        rowMetrics,
        onDragStart: handlePanelDragStart,
        onAddChip: handleAddScheduleItemChip,
        allChips,
      },
    }));
  }, [
    highlightedProjects,
    projectMetadata,
    scheduleLayout,
    projectChips,
    chipTimeOverrides,
    incrementMinutes,
    rowMetrics,
    handlePanelDragStart,
    handleAddScheduleItemChip,
    customProjects,
  ]);

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
          const textColor = metadata?.textColor ?? getContrastTextColor(backgroundColor);
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
      const defaultFlags = chipDisplayModes['__default__'] && typeof chipDisplayModes['__default__'] === 'object' ? chipDisplayModes['__default__'] : { duration: false, clock: false };
      const perChipFlags = chipDisplayModes[block.id] && typeof chipDisplayModes[block.id] === 'object' ? chipDisplayModes[block.id] : null;
      const displayFlags = perChipFlags ? { ...defaultFlags, ...perChipFlags } : defaultFlags;
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
          let blockMins;
          if (overrideMins != null) {
            blockMins = overrideMins;
          } else if (isMultiRow) {
            const startIdx = rowIndexMap.get(block.startRowId);
            const endIdx = rowIndexMap.get(block.endRowId);
            if (startIdx != null && endIdx != null) {
              const rowCount = Math.abs(endIdx - startIdx) + 1;
              blockMins = rowCount * incrementMinutes;
            }
          } else {
            blockMins = block.durationMinutes ?? incrementMinutes;
          }
          if (Number.isFinite(blockMins) && blockMins > 0) {
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
      const textColor = metadata?.textColor ?? getContrastTextColor(backgroundColor);
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
              ...(isActive ? { outlineColor: '#cf7d9a', outlineOffset: 0 } : null),
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
        className="fixed rounded border border-[#94a3b8] shadow-2xl"
        style={{
          ...(position?.openAbove
            ? { bottom: window.innerHeight - (position?.top ?? 0), top: 'auto' }
            : { top: position?.top ?? 0 }),
          left: position?.left ?? 0,
          minWidth: Math.max(position?.width ?? 0, 260),
          backgroundColor: '#f8fafc',
          zIndex: 999999,
        }}
      >
        {chipEditor ? (
        /* ════════════════ EDIT SUB-VIEW ════════════════ */
        <div onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            className="flex w-full items-center gap-1.5 px-3 pt-2.5 pb-1.5 text-left text-[11px] font-semibold text-slate-600 hover:text-slate-900"
            onClick={closeChipEditor}
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M11.5 8a.5.5 0 0 0-.5-.5H4.707l2.147-2.146a.5.5 0 1 0-.708-.708l-3 3a.5.5 0 0 0 0 .708l3 3a.5.5 0 0 0 .708-.708L4.707 8.5H11a.5.5 0 0 0 .5-.5z"/></svg>
            <span>Back</span>
          </button>
          <div className="mx-3 mb-1 border-t border-[#e5e7eb]" />
          <div className="px-3 pb-3">
            <div
              className="mb-2.5 flex w-full items-center justify-center rounded-sm px-2 py-2.5 text-[11px] font-bold uppercase truncate"
              style={{ background: chipEditor.color, color: chipContrastColour(chipEditor.color) }}
            >
              {chipEditor.name || ' '}
            </div>

            <div className="mb-1 text-[9px] font-semibold uppercase tracking-wider text-slate-400">Name</div>
            <input
              type="text"
              autoFocus
              value={chipEditor.name}
              onChange={(e) => setChipEditorName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); commitChipEditor(); }
                else if (e.key === 'Escape') { e.preventDefault(); closeChipEditor(); }
              }}
              className="mb-2.5 w-full rounded-sm border border-slate-300 px-2 py-1.5 text-[11px] font-bold uppercase text-slate-800 outline-none focus:border-slate-500"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            />

            <div className="mb-1 text-[9px] font-semibold uppercase tracking-wider text-slate-400">Colour</div>
            <div className="mb-2 flex items-center gap-1.5">
              <button
                type="button"
                disabled={chipEditorSlide === 0}
                onClick={() => setChipEditorSlide((s) => Math.max(0, s - 1))}
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded border border-slate-300 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-25"
              >
                <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor"><path d="M11.354 1.646a.5.5 0 0 1 0 .708L5.707 8l5.647 5.646a.5.5 0 0 1-.708.708l-6-6a.5.5 0 0 1 0-.708l6-6a.5.5 0 0 1 .708 0z"/></svg>
              </button>
              <div className="grid flex-1 grid-cols-10 gap-[3px]">
                {CHIP_PALETTE_SLIDES[chipEditorSlide].map((colour, idx) =>
                  colour ? (
                    <button
                      key={idx}
                      type="button"
                      title={colour}
                      onClick={() => setChipEditorColour(colour)}
                      className="aspect-square rounded-sm transition-transform hover:scale-110"
                      style={{ background: colour }}
                    />
                  ) : (
                    <div key={idx} className="aspect-square" />
                  )
                )}
              </div>
              <button
                type="button"
                disabled={chipEditorSlide === CHIP_PALETTE_SLIDES.length - 1}
                onClick={() => setChipEditorSlide((s) => Math.min(CHIP_PALETTE_SLIDES.length - 1, s + 1))}
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded border border-slate-300 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-25"
              >
                <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor"><path d="M4.646 1.646a.5.5 0 0 1 .708 0l6 6a.5.5 0 0 1 0 .708l-6 6a.5.5 0 0 1-.708-.708L10.293 8 4.646 2.354a.5.5 0 0 1 0-.708z"/></svg>
              </button>
            </div>

            <div className="flex items-center justify-center gap-2.5">
              <button
                type="button"
                title="Pick colour from screen"
                onClick={chipEditorEyedropper}
                className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-600 hover:bg-slate-100"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M13.354.646a1.207 1.207 0 0 0-1.708 0L8.5 3.793l-.646-.647a.5.5 0 1 0-.708.708L8.293 5l-7.147 7.146A.5.5 0 0 0 1 12.5v1.793l-.854.853a.5.5 0 1 0 .708.707L1.707 15H3.5a.5.5 0 0 0 .354-.146L11 7.707l1.146 1.147a.5.5 0 0 0 .708-.708l-.647-.646 3.147-3.146a1.207 1.207 0 0 0 0-1.708zM2 12.707l7-7L10.293 7l-7 7H2z"/></svg>
              </button>
              <label
                title="Mix a custom colour"
                className="relative flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border border-slate-300 bg-white text-slate-600 hover:bg-slate-100"
                onClick={(e) => e.stopPropagation()}
              >
                <input
                  type="color"
                  value={typeof chipEditor.color === 'string' && chipEditor.color.startsWith('#') ? chipEditor.color : '#ffffff'}
                  onInput={(e) => setChipEditorColour(e.target.value)}
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                />
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M6.192 2.78c-.458-.677-.927-1.248-1.35-1.643a3 3 0 0 0-.71-.515c-.217-.104-.56-.205-.882-.02-.367.213-.427.63-.43.896-.003.304.064.664.173 1.044.196.687.556 1.528 1.035 2.402L.752 8.22c-.277.277-.269.656-.218.918.055.283.187.593.36.903.348.627.92 1.361 1.626 2.068.707.707 1.441 1.278 2.068 1.626.31.173.62.305.903.36.262.05.64.059.918-.218l5.615-5.615c.118.257.092.512.05.939-.03.292-.068.665-.073 1.176v.123h.003a1 1 0 0 0 1.993 0H14v-.057a1 1 0 0 0-.004-.117c-.055-1.25-.7-2.738-1.86-3.494a4 4 0 0 0-.211-.434c-.349-.626-.92-1.36-1.627-2.067S8.857 3.052 8.23 2.704c-.31-.172-.62-.304-.903-.36-.262-.05-.64-.058-.918.219z"/></svg>
              </label>
              <button
                type="button"
                title="Confirm"
                onClick={commitChipEditor}
                className="flex h-8 w-11 items-center justify-center rounded-md border border-slate-400 bg-white text-slate-600 hover:bg-slate-100"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M13.854 3.646a.5.5 0 0 1 0 .708l-7 7a.5.5 0 0 1-.708 0l-3.5-3.5a.5.5 0 1 1 .708-.708L6.5 10.293l6.646-6.647a.5.5 0 0 1 .708 0z"/></svg>
              </button>
            </div>
          </div>
        </div>
        ) : (
        <>
        {/* ── Default chips section (top) ───────────────────────── */}
        <div className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          Default chips
        </div>
        {['sleep', 'rest', 'buffer'].map((defaultId) => {
          const meta = projectMetadata.get(defaultId) ?? { label: defaultId, color: '#0f172a' };
          return (
            <div key={defaultId} className="flex items-center gap-1 px-2 py-1">
              <button
                type="button"
                className="flex-1 px-2 py-1.5 text-left text-[11px] font-bold uppercase rounded-sm hover:opacity-80 truncate"
                style={{ backgroundColor: meta.color, color: chipContrastColour(meta.color) }}
                onClick={() => handleProjectSelection(defaultId)}
              >
                {meta.label}
              </button>
              <button
                type="button"
                title="Edit chip"
                className="shrink-0 rounded p-1 text-slate-400 hover:text-slate-700"
                onClick={(e) => { e.stopPropagation(); openChipEditor('default', defaultId, meta.label, meta.color); }}
              >
                <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M11.498 1.499a1.707 1.707 0 0 1 2.414 2.414l-9.5 9.5a1 1 0 0 1-.39.242l-3 1a1 1 0 0 1-1.268-1.268l1-3a1 1 0 0 1 .242-.39l9.502-9.498zm1 1-9.5 9.5-.646 1.94 1.94-.646 9.5-9.5a.707.707 0 0 0-1-1z"/></svg>
              </button>
              <span className="h-5 w-5 shrink-0" />
            </div>
          );
        })}
        <div className="mx-3 my-1 border-t border-[#e5e7eb]" />

        {/* ── Project chips section ─────────────────────────────── */}
        <div className="px-3 pt-1 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          Project chips
        </div>

        {stagedProjects.length ? (
          <ul className="list-none pb-1">
            {stagedProjects.map((project) => {
              const projColour = project.color || '#0f172a';
              // The chip in the targeted cell, if it belongs to this project.
              const projectChip = targetChip?.projectId === project.id ? targetChip : null;
              const chipName = projectChip?.displayLabel || project.label;
              return (
                <li key={project.id}>
                  <div className="flex items-center gap-1 px-2 py-1">
                    <button
                      type="button"
                      className="flex-1 px-2 py-1.5 text-left text-[11px] font-bold uppercase rounded-sm hover:opacity-80 truncate"
                      style={{ backgroundColor: projColour, color: chipContrastColour(projColour) }}
                      onClick={() => handleProjectSelection(project.id)}
                    >
                      {project.label}
                    </button>
                    <button
                      type="button"
                      title="Edit chip"
                      className="shrink-0 rounded p-1 text-slate-400 hover:text-slate-700"
                      onClick={(e) => { e.stopPropagation(); openChipEditor('project', project.id, chipName, projColour, projectChip?.id ?? null); }}
                    >
                      <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M11.498 1.499a1.707 1.707 0 0 1 2.414 2.414l-9.5 9.5a1 1 0 0 1-.39.242l-3 1a1 1 0 0 1-1.268-1.268l1-3a1 1 0 0 1 .242-.39l9.502-9.498zm1 1-9.5 9.5-.646 1.94 1.94-.646 9.5-9.5a.707.707 0 0 0-1-1z"/></svg>
                    </button>
                    <span className="h-5 w-5 shrink-0" />
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="px-3 py-1 text-[11px] text-slate-400">No projects added to plan</div>
        )}

        {/* ── Custom chips section ──────────────────────────────── */}
        <div className="mx-3 my-1 border-t border-[#e5e7eb]" />
        <div className="px-3 pt-1 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          Custom chips
        </div>
        {customChips.length ? (
          <ul className="list-none pb-1">
            {customChips.map((project) => {
              const customColour = project.color || '#0f172a';
              return (
                <li key={project.id}>
                  <div className="flex items-center gap-1 px-2 py-1">
                    <button
                      type="button"
                      className="flex-1 px-2 py-1.5 text-left text-[11px] font-bold uppercase rounded-sm hover:opacity-80 truncate"
                      style={{ backgroundColor: customColour, color: chipContrastColour(customColour) }}
                      onClick={() => handleProjectSelection(project.id)}
                    >
                      {project.label.toUpperCase()}
                    </button>
                    <button
                      type="button"
                      title="Edit chip"
                      className="shrink-0 rounded p-1 text-slate-400 hover:text-slate-700"
                      onClick={(e) => { e.stopPropagation(); openChipEditor('custom', project.id, project.label, customColour); }}
                    >
                      <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M11.498 1.499a1.707 1.707 0 0 1 2.414 2.414l-9.5 9.5a1 1 0 0 1-.39.242l-3 1a1 1 0 0 1-1.268-1.268l1-3a1 1 0 0 1 .242-.39l9.502-9.498zm1 1-9.5 9.5-.646 1.94 1.94-.646 9.5-9.5a.707.707 0 0 0-1-1z"/></svg>
                    </button>
                    <button
                      type="button"
                      title="Delete custom chip"
                      className="shrink-0 rounded p-1 text-slate-300 hover:text-red-600"
                      onClick={(e) => { e.stopPropagation(); handleDeleteCustomProject(project.id); }}
                    >
                      <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M6.5 1h3a.5.5 0 0 1 .5.5v1H6v-1a.5.5 0 0 1 .5-.5M11 2.5v-1A1.5 1.5 0 0 0 9.5 0h-3A1.5 1.5 0 0 0 5 1.5v1H1.5a.5.5 0 0 0 0 1h.538l.853 10.66A2 2 0 0 0 4.885 16h6.23a2 2 0 0 0 1.994-1.84l.853-10.66h.538a.5.5 0 0 0 0-1zm1.958 1-.846 10.58a1 1 0 0 1-.997.92h-6.23a1 1 0 0 1-.997-.92L3.042 3.5z"/></svg>
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
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

        {/* ── View Schedule Items footer link ───────────────────── */}
        <button
          type="button"
          className="mt-1 flex w-full items-center justify-between px-3 py-2.5 text-[11px] font-semibold text-[#33558a] hover:bg-[#dce6f4]"
          style={{ backgroundColor: '#e8eef7' }}
          onClick={(e) => { e.stopPropagation(); window.dispatchEvent(new CustomEvent(PLAN_PANEL_NAV_EVENT, { detail: { view: 'schedule' } })); }}
        >
          <span>View Schedule Items</span>
          <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M4 8a.5.5 0 0 1 .5-.5h5.793L8.146 5.354a.5.5 0 1 1 .708-.708l3 3a.5.5 0 0 1 0 .708l-3 3a.5.5 0 0 1-.708-.708L10.293 8.5H4.5A.5.5 0 0 1 4 8z"/></svg>
        </button>
        </>
        )}
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
    menuRenamingChipId,
    menuRenamingLabel,
    menuRenameInputRef,
    handleMenuRenameStart,
    handleMenuRenameConfirm,
    setMenuRenamingChipId,
    setMenuRenamingLabel,
    scheduleLayout,
    projectMetadata,
    chipEditor,
    chipEditorSlide,
    openChipEditor,
    closeChipEditor,
    setChipEditorName,
    setChipEditorColour,
    chipEditorEyedropper,
    commitChipEditor,
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
            <span className="font-serif text-sm font-medium text-slate-900 select-none">Listical</span>
          }
          onUndoDraft={draftYear ? handleUndoDraft : null}
          onRevertArchive={!draftYear && allYears.some(y => y.status === 'archived') ? handleRevertArchive : null}
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
                  return (
                    <td
                      key={`time-row-${index}`}
                      className={`relative border border-[#e5e7eb] px-3 py-px text-center overflow-visible ${
                        cellSelected ? 'selected-cell' : ''
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
                    return (
                      <td
                        key={`hour-${hourValue}-${index}`}
                        className={`relative border border-[#e5e7eb] px-3 py-px text-center overflow-visible ${
                          cellSelected ? 'selected-cell' : ''
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
                  return (
                    <td
                      key={`minute-row-${index}`}
                      className={`relative border border-[#e5e7eb] px-3 py-px text-center overflow-visible ${
                        cellSelected ? 'selected-cell' : ''
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
                    return (
                      <td
                        key={`trailing-${rowIdx}-${index}`}
                        className={`relative border border-[#e5e7eb] px-3 py-px text-center overflow-visible ${
                          cellSelected ? 'selected-cell' : ''
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
                    ? { gridTemplateColumns, outlineColor: '#cf7d9a', outlineOffset: 0 }
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
                        ? { gridTemplateColumns, outlineColor: '#cf7d9a', outlineOffset: 0 }
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
                    ? { outlineColor: '#cf7d9a', outlineOffset: 0 }
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
                    ? { gridTemplateColumns, outlineColor: '#cf7d9a', outlineOffset: 0 }
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
                    ? { gridTemplateColumns, outlineColor: '#cf7d9a', outlineOffset: 0 }
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
                    ? { gridTemplateColumns, outlineColor: '#cf7d9a', outlineOffset: 0 }
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
          </div>
        {cellMenu ? createPortal(renderCellProjectMenu(), document.body) : null}
        </div>
      </div>
      <ArchiveYearModal
        isOpen={isArchiveModalOpen}
        onClose={() => setIsArchiveModalOpen(false)}
        yearNumber={activeYear?.yearNumber}
      />
    </div>
  );
}

