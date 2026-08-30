import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { gridSvgLayer, useThemeVersion } from '../utils/themeBackground';
import { useLocation, useNavigate } from 'react-router-dom';
import { Archive } from 'lucide-react';
import { useYear } from '../contexts/YearContext';
import usePlannerStorage from '../hooks/planner/usePlannerStorage';
import usePageSize, { usePageScaleVar } from '../hooks/usePageSize';
import usePanelInset from '../hooks/usePanelInset';
import usePlannerColumns from '../hooks/planner/usePlannerColumns';
import useCommandPattern from '../hooks/planner/useCommandPattern';
import useProjectsData from '../hooks/planner/useProjectsData';
import { TACTICS_SEND_TO_SYSTEM_EVENT, getSendToSystemTimestamp, loadSentChipsSnapshot, loadTacticsYearSettings } from '../lib/tacticsStorage';
import { SYSTEM_PANEL_ACTION_EVENT, SYSTEM_PANEL_SELECTION_EVENT, SYSTEM_PANEL_SCALE_EVENT, SYSTEM_PANEL_DAY_FILTER_EVENT, SYSTEM_PANEL_PROJECT_NAMES_EVENT, SYSTEM_PANEL_PROJECT_FILTER_EVENT, SYSTEM_PANEL_ARCHIVE_WEEK_EVENT } from '../components/SystemPanel';
import { useTaskRowPanel, TASK_ROW_DETAIL_UPDATE_EVENT } from '../contexts/TaskRowPanelContext';
import { loadSentMetricsSnapshot, peekTacticsMetricsCache } from '../lib/tacticsMetricsStorage';
import { peekTacticsCache } from '../lib/tacticsStorage';
import { peekStagingCache } from '../lib/stagingStorage';
import { loadStagingState, saveSystemOrder, saveProjectTagline } from '../lib/stagingStorage';
import { createDraftYearFromActive } from '../utils/planner/createDraftYear';
import { undoDraftYear } from '../utils/planner/undoDraftYear';
import { revertArchive } from '../utils/planner/revertArchive';
import { importTasksForDraftYear, hasImportedTasks } from '../utils/planner/importTasksFromYear';
import { placeImportedTasks } from '../utils/planner/placeImportedTasks';
import { isEditableRow } from '../utils/planner/rowTypeChecks';
import { groupChips, chipGroupKey, chipDisplayName } from '../utils/planner/chipGroups';
import usePlannerFilters from '../hooks/planner/usePlannerFilters';
import { useFilteredData, useFilterValues } from '../hooks/planner/useFilteredData';
import { useProjectTotals, useDailyTotals } from '../hooks/planner/useTotalsCalculation';
import useSpreadsheetSelection from '../hooks/planner/useSpreadsheetSelection';
import useKeyboardHandlers from '../hooks/planner/useKeyboardHandlers';
import useEditState from '../hooks/planner/useEditState';
import useDragAndDropRows, { getProjectBlockRange } from '../hooks/planner/useDragAndDropRows';
import useDragAndDropCells from '../hooks/planner/useDragAndDropCells';
import useComputedDataV2 from '../hooks/planner/useComputedDataV2';
import useCollapsibleGroups from '../hooks/planner/useCollapsibleGroups';
import useDayColumnFilters from '../hooks/planner/useDayColumnFilters';
import useFilterButtonHandler from '../hooks/planner/useFilterButtonHandler';
import { MonthRow, WeekRow } from '../components/planner/rows';
import TableRow from '../components/planner/TableRow';
import NavigationBar from '../components/planner/NavigationBar';
import PlannerTable from '../components/planner/PlannerTable';
import FilterPanel from '../components/planner/FilterPanel';
import ArchiveYearModal from '../components/ArchiveYearModal';
import ContextMenu from '../components/planner/ContextMenu';
import MultiPasteModal from '../components/MultiPasteModal';
import useContextMenu from '../hooks/planner/useContextMenu';
import { createInitialData, ensureDailyTotalRow } from '../utils/planner/dataCreators';
import { parseEstimateLabelToMinutes, formatMinutesToHHmm } from '../constants/planner/rowTypes';
import { minutesToEstimateLabel } from '../utils/staging/planTableHelpers';
import { mapDailyBoundsToTimeline } from '../utils/planner/dailyBoundsMapper';
import { createEmptyTaskRows } from '../utils/planner/taskRowGenerator';

// Cap for the multi-line paste to tasks flow (mirrors AddTasksModal's limit)
const MULTI_PASTE_MAX_TASKS = 100;
import {
  getDayColumnId,
  forEachDayColumn,
  createDayColumnUpdates,
  createEmptyDayColumns,
  sumDayColumns,
} from '../utils/planner/dayColumnHelpers';
import {
  normalizeValue,
  coerceToNumber,
} from '../utils/planner/valueNormalizers';
import {
  handleCopyOperation,
  handlePasteOperation,
} from '../utils/planner/clipboardOperations';
import { createSortInboxCommand } from '../utils/planner/sortInbox';
import { createSortPlannerCommand } from '../utils/planner/sortPlanner';
import { saveTaskRows, readTaskRows, invalidateTaskRowsCache, loadChipTaskNote, preloadChipTaskNotes, isTaskRowsSaveInFlight, getLastTaskRowsSaveCompletedAt, writeTaskEvent, isPlannerYearServerFresh, PLANNER_ROWS_STALE_EVENT } from '../utils/planner/storage';
import { supabase } from '../lib/supabase';
import { DEFAULT_PROJECT_ID } from '../constants/plannerStorageKeys';
import {
  calculateWeekRange,
  calculateWeekNumber,
  createArchiveWeekRow,
  createArchivedProjectStructure,
  collectTasksForArchive,
  ARCHIVE_SWEEP_STATUSES,
  snapshotRecurringTask,
  insertArchiveRow,
  insertArchivedProjects,
  moveTasksToArchive,
  insertRecurringSnapshots,
  resetRecurringTasks,
  getArchiveInsertContext,
  isTaskInArchivedWeek,
  taskHasDayOutsideRange,
} from '../utils/planner/archiveHelpers';
import { buildArchiveWeekPanelData } from '../utils/planner/archiveWeekPanelData';
import { useArchiveTotals } from '../hooks/planner/useArchiveTotals';

// Sortable status values for the "Sort Inbox" feature
const SORTABLE_STATUSES = ['Done', 'Scheduled', 'Not Scheduled', 'Blocked', 'On Hold', 'Abandoned', 'Skipped', 'Accounted'];

// --- Tactics data helpers (loaded on mount + "Send to System" only) ---

const SYSTEM_PROJECTS = new Set(['sleep', 'rest', 'buffer']);
const DAY_COLUMN_COUNT = 7;

// Quotas are keyed by project id (not label/nickname) so that renaming a
// project on Goal does not silently zero out the weekly hours shown on System.
// The id is carried on every quota entry by TacticsPage when it writes the
// sent snapshot. ProjectRow translates its nickname to an id via the
// projectIdByNickname map sourced from current staging.
function buildQuotasMap(quotasArray) {
  const quotasMap = new Map();
  if (quotasArray && Array.isArray(quotasArray)) {
    quotasArray.forEach((quota) => {
      // Use id as the stable key. Preserve zero-hour quotas by checking for
      // null/undefined rather than falsiness.
      if (quota?.id && quota.weeklyHours != null) {
        quotasMap.set(quota.id, quota.weeklyHours);
      }
    });
  }
  return quotasMap;
}

async function buildProjectIdToNicknameMap(yearNumber) {
  const { shortlist } = await loadStagingState(yearNumber);
  const map = new Map();
  if (!Array.isArray(shortlist)) return map;
  shortlist.forEach((item) => {
    if (!item?.id) return;
    const nickname = (item.projectNickname || '').trim();
    const name = (item.projectName || '').trim();
    map.set(item.id, nickname || name);
  });
  return map;
}

function estimateDurationFromRowIds(startRowId, endRowId, incrementMinutes) {
  if (!startRowId || !incrementMinutes) return null;
  const end = endRowId || startRowId;
  const rowHour = (id) => {
    if (!id) return null;
    if (id === 'sleep-start') return -1;
    if (id.startsWith('hour-')) {
      const h = parseInt(id.slice(5), 10);
      return Number.isFinite(h) ? h : null;
    }
    return null;
  };
  const isHourRow = (id) => id === 'sleep-start' || (id && id.startsWith('hour-'));
  const isIncrRow = (id) => id === 'sleep-end' || (id && id.startsWith('trailing-'));
  if (startRowId === end) return isHourRow(startRowId) ? 60 : incrementMinutes;
  const startH = rowHour(startRowId);
  const endH = rowHour(end);
  if (startH !== null && endH !== null) {
    const span = ((endH - startH + 24) % 24) + 1;
    return span * 60;
  }
  if (startH !== null && isIncrRow(end)) return 60 + incrementMinutes;
  if (isIncrRow(startRowId)) {
    if (isIncrRow(end)) {
      const si = parseInt(startRowId.startsWith('trailing-') ? startRowId.slice(9) : '0', 10);
      const ei = parseInt(end.startsWith('trailing-') ? end.slice(9) : '0', 10);
      const rows = Math.abs(ei - si) + 1;
      return rows * incrementMinutes;
    }
    return incrementMinutes;
  }
  return incrementMinutes;
}

function formatChipDuration(minutes) {
  if (!Number.isFinite(minutes) || minutes <= 0) return null;
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  if (hours > 0 && remaining > 0) return `${hours} hour${hours !== 1 ? 's' : ''} ${remaining} minutes`;
  if (hours > 0) return `${hours} hour${hours !== 1 ? 's' : ''}`;
  return `${remaining} minutes`;
}

async function loadEnrichedChips(yearNumber) {
  // All three loads are async post helper #4 port. Run them in parallel
  // since none depends on the others.
  const [{ projectChips, chipTimeOverrides }, idToNicknameMap, { incrementMinutes }] = await Promise.all([
    loadSentChipsSnapshot(yearNumber),
    buildProjectIdToNicknameMap(yearNumber),
    loadTacticsYearSettings(yearNumber),
  ]);
  if (!Array.isArray(projectChips)) return [];
  const enriched = projectChips
    .filter((chip) => {
      if (!chip) return false;
      if (SYSTEM_PROJECTS.has(chip.projectId)) return false;
      if (chip.columnIndex >= DAY_COLUMN_COUNT) return false;
      if (!chip.dayName) return false;
      return true;
    })
    .map((chip) => {
      const projectNickname = idToNicknameMap.get(chip.projectId) || null;
      // Duration resolution for project chips. Plan's chip resize updates
      // startRowId/endRowId but does NOT update `durationMinutes` on the chip
      // object, so the stored number is stale after any resize. System used to
      // read it directly and show a value that disagreed with Plan. System
      // projects (sleep/rest/buffer) were filtered out above, so we can safely
      // recompute from row IDs here. An explicit user override in
      // chipTimeOverrides still wins; stored durationMinutes is the final
      // fallback for chips with no usable row IDs. Debugging session 2026-05-16.
      const overrideMinutes = chipTimeOverrides?.[chip.id];
      const fromRows = estimateDurationFromRowIds(chip.startRowId, chip.endRowId, incrementMinutes);
      const durationMinutes = overrideMinutes ?? fromRows ?? chip.durationMinutes ?? null;
      const formattedDuration = durationMinutes != null ? formatChipDuration(durationMinutes) : null;
      return { ...chip, projectNickname, durationMinutes, formattedDuration };
    });
  return enriched;
}

async function loadMetricsData(yearNumber) {
  const metrics = await loadSentMetricsSnapshot(yearNumber, { bypassCache: true });
  return {
    dailyBounds: metrics?.dailyBounds || [],
    projectWeeklyQuotas: buildQuotasMap(metrics?.projectWeeklyQuotas),
  };
}

/**
 * Synchronous version of loadMetricsData using only the in-memory cache.
 * Returns null when the cache has nothing for this year so callers can
 * fall back to defaults.
 */
function peekMetricsData(yearNumber) {
  const cached = peekTacticsMetricsCache(yearNumber);
  if (!cached.sent) return null;
  return {
    dailyBounds: cached.sent.dailyBounds || [],
    projectWeeklyQuotas: buildQuotasMap(cached.sent.projectWeeklyQuotas),
  };
}

/**
 * Synchronous version of loadEnrichedChips. Returns the enriched chip list
 * when all three sources (sent chips snapshot, staging nicknames, year
 * settings) are present in the cache. Returns null on any miss so callers
 * can fall back to defaults.
 */
function peekEnrichedChips(yearNumber) {
  const tactics = peekTacticsCache(yearNumber);
  const stagingState = peekStagingCache(yearNumber);
  if (!tactics.sentChips || !tactics.yearSettings || !stagingState) return null;
  const projectChips = Array.isArray(tactics.sentChips.projectChips)
    ? tactics.sentChips.projectChips
    : [];
  const chipTimeOverrides = tactics.sentChips.chipTimeOverrides || {};
  const incrementMinutes = tactics.yearSettings.incrementMinutes;
  const idToNicknameMap = new Map();
  for (const item of stagingState.shortlist || []) {
    if (!item?.id) continue;
    const nickname = (item.projectNickname || '').trim();
    const name = (item.projectName || '').trim();
    idToNicknameMap.set(item.id, nickname || name);
  }
  return projectChips
    .filter((chip) => {
      if (!chip) return false;
      if (SYSTEM_PROJECTS.has(chip.projectId)) return false;
      if (chip.columnIndex >= DAY_COLUMN_COUNT) return false;
      if (!chip.dayName) return false;
      return true;
    })
    .map((chip) => {
      const projectNickname = idToNicknameMap.get(chip.projectId) || null;
      const overrideMinutes = chipTimeOverrides?.[chip.id];
      const fromRows = estimateDurationFromRowIds(chip.startRowId, chip.endRowId, incrementMinutes);
      const durationMinutes = overrideMinutes ?? fromRows ?? chip.durationMinutes ?? null;
      const formattedDuration = durationMinutes != null ? formatChipDuration(durationMinutes) : null;
      return { ...chip, projectNickname, durationMinutes, formattedDuration };
    });
}

/**
 * Google Sheets-like Spreadsheet using TanStack Table v8
 *
 * Phase 1: Core spreadsheet features
 * - Cell selection (single, multi, range)
 * - Keyboard navigation
 * - Copy/paste
 * - Inline editing
 * - Column resizing
 * - Row virtualization
 */

export default function ProjectTimePlannerV2() {
  // Recompute theme-tinted background layers when the theme changes
  useThemeVersion();

  const location = useLocation();
  const navigate = useNavigate();
  const currentPath = location.pathname;

  // Year context for year-based storage
  const { currentYear, isCurrentYearArchived, isCurrentYearDraft, activeYear, draftYear, allYears, switchToActiveYear, refreshMetadata } = useYear();

  // True once "Send to System" has been triggered — lets draft year bypass
  // the "no imported tasks" guard so chip rows and project headers appear.
  // On a cache hit the initialiser reads the cached send-to-system marker
  // directly so the page doesn't flash a "draft is empty" UI before the
  // async load resolves. On a cache miss it falls back to false and the
  // async load below sets the real value.
  const sendToSystemCached = peekTacticsCache(currentYear).sendToSystemAt;
  const [sentToSystem, setSentToSystem] = useState(() => !!sendToSystemCached);

  // Async load of the Send-to-System marker. On cache hit, the read returns
  // the cached value almost immediately and setSentToSystem with the same
  // value is a React no-op (no re-render). On cache miss this is the real
  // refresh.
  useEffect(() => {
    let cancelled = false;
    getSendToSystemTimestamp(currentYear).then((ts) => {
      if (cancelled) return;
      setSentToSystem(!!ts);
    }).catch((err) => {
      console.error('Failed to read send-to-system timestamp', err);
    });
    return () => {
      cancelled = true;
    };
  }, [currentYear]);

  // Archive modal state
  const [isArchiveModalOpen, setIsArchiveModalOpen] = useState(false);

  // Plan Next Year handler
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

  // Dev undo handler — remove before launch
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

  // Storage management (all persistent settings) - now year-aware
  const {
    columnSizing,
    setColumnSizing,
    startDate,
    setStartDate,
    showRecurring,
    setShowRecurring,
    showSubprojects,
    setShowSubprojects,
    showMaxMinRows,
    setShowMaxMinRows,
    selectedSortStatuses,
    setSelectedSortStatuses,
    selectedSortPlannerStatuses,
    setSelectedSortPlannerStatuses,
    taskRows,
    setTaskRows,
    totalDays,
    setTotalDays,
    visibleDayColumns,
    setVisibleDayColumns,
    weekNames,
    setWeekNames,
    isLoaded: storageLoaded,
  } = usePlannerStorage({ yearNumber: currentYear });

  // Page-specific size setting
  const { sizeScale, increaseSize, decreaseSize } = usePageSize('system');
  // Publish the System page scale as --pz so page content (incl. portalled
  // menus) can size with calc(Npx * var(--pz)).
  usePageScaleVar(sizeScale);

  // Initialise data from cached taskRows when available, otherwise a blank
  // skeleton. On a sync cache hit (the common case after the first visit)
  // the first render already shows real data without a flash. On a cold
  // cache miss the skeleton renders briefly and the hydration effect
  // below swaps in the loaded rows once the async load resolves.
  const [data, setDataRaw] = useState(() => {
    if (Array.isArray(taskRows) && taskRows.length > 0) return ensureDailyTotalRow(taskRows);
    return createInitialData(0, totalDays, startDate);
  });

  // Keep a ref to the latest committed data value, updated synchronously alongside setData.
  // This lets the unmount flush always write the newest data, even if React hasn't re-rendered.
  const latestDataRef = useRef(data);

  // Wrap setData so the ref stays in sync with every enqueued state update.
  const setData = useCallback((updater) => {
    setDataRaw(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      latestDataRef.current = next;
      return next;
    });
  }, []);

  // Hydrate `data` from taskRows once the async storage load completes.
  // On a sync cache hit dataHydrated starts true (initialiser above already
  // used the cached rows). On a cold miss this effect fires when the load
  // resolves and swaps in the real data.
  const dataHydrated = useRef(Array.isArray(taskRows) && taskRows.length > 0);
  useEffect(() => {
    if (!storageLoaded) return;
    if (dataHydrated.current) return;
    dataHydrated.current = true;
    if (Array.isArray(taskRows) && taskRows.length > 0) {
      // Backfills a missing Daily Total row for accounts whose saved data
      // predates that row type -- see ensureDailyTotalRow for why this
      // matters (it silently breaks the "8 pinned rows" sticky-header slice).
      setData(ensureDailyTotalRow(taskRows));
    }
  }, [storageLoaded, taskRows, setData]);

  // Save data to storage when it changes (debounced).
  // Tracks when the last debounced save was initiated. The unmount flush
  // checks this to avoid firing a stale save concurrently with an in-progress
  // one (the serialized queue in saveTaskRows prevents duplicate rows, but the
  // flush would still overwrite the correct save with pre-hydration data if it
  // runs after the debounced save completes).
  const lastSaveInitiatedRef = useRef(0);
  // Set true just before setData() swaps in rows fetched from the server, so
  // the debounced-save effect skips exactly one cycle (see realtime effect).
  const skipNextAutoSaveRef = useRef(false);
  // Always-current mirror of editingCell (set below, after useEditState).
  // Read inside the realtime refresh timer so a refetch never lands while
  // the user is mid-edit — a wholesale rows replacement during typing tears
  // down the input and reverts unsaved rows.
  const editingCellRef = useRef(null);

  // Only after dataHydrated, so the initial blank skeleton doesn't get
  // pushed back to Supabase and wipe the loaded rows.
  useEffect(() => {
    if (!dataHydrated.current) return;
    if (isCurrentYearArchived) return;
    // Cache-hydrated tab that has not yet read the server this session must
    // NOT autosave while online: its rows may be weeks old, and the save's
    // echo-mute window would defer the very mount refetch meant to replace
    // them (2026-08-28 stale-browser overwrite). Offline saves are still
    // allowed so edits stay durable via the pending record, whose replay
    // diffs under its own bookkeeping. Draft years are exempt: they skip the
    // realtime/mount revalidation effect entirely, so freshness would never
    // arrive and the gate would block their saves forever (known gap).
    if (
      !isCurrentYearDraft &&
      (typeof navigator === 'undefined' || navigator.onLine) &&
      !isPlannerYearServerFresh(currentYear)
    ) return;
    // A data swap that came FROM the server (realtime refresh below) must not
    // bounce straight back as a delete-all-then-reinsert save.
    if (skipNextAutoSaveRef.current) {
      skipNextAutoSaveRef.current = false;
      return;
    }
    // Stamp the edit NOW, not when the debounced save fires. The realtime
    // refetch guard used to key only off save initiation, which left a
    // ~500ms (+ fetch latency) hole right after an edit where an already
    // scheduled refetch could land with pre-edit rows and silently revert
    // the change — the "first attempt gets undone" bug.
    lastSaveInitiatedRef.current = Date.now();
    const timeoutId = setTimeout(() => {
      lastSaveInitiatedRef.current = Date.now();
      setTaskRows(data);
    }, 500); // Debounce saves by 500ms to avoid too many writes

    return () => {
      clearTimeout(timeoutId);
    };
  }, [data, setTaskRows, isCurrentYearArchived, isCurrentYearDraft, currentYear]);

  // Flush unsaved data to storage on unmount (bypasses debounce so navigation away doesn't lose edits).
  // Guarded by dataHydrated so React strict-mode's dev double-mount can't
  // wipe loaded data with the initial blank skeleton on first mount.
  // Also skipped if a save was initiated within the last 2 seconds — the
  // useAutoPersist call from setTaskRows is in flight and will commit the
  // correct (hydrated) data; firing a concurrent flush would race it.
  // Also skipped for archived years — reads are allowed, writes are not.
  useEffect(() => {
    return () => {
      if (!dataHydrated.current) return;
      if (isCurrentYearArchived) return;
      // Same stale-session gate as the debounced autosave above: never flush
      // rows the session has not verified against the server while online.
      if (
        !isCurrentYearDraft &&
        (typeof navigator === 'undefined' || navigator.onLine) &&
        !isPlannerYearServerFresh(currentYear)
      ) return;
      if (Date.now() - lastSaveInitiatedRef.current < 2000) return;
      // saveTaskRows is now async (Supabase). Fire-and-forget on unmount —
      // the user is navigating away so there's no caller to await.
      saveTaskRows(latestDataRef.current, DEFAULT_PROJECT_ID, currentYear).catch((err) => {
        console.error('Failed to flush task rows on unmount', err);
      });
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Realtime: refresh the table when another client (the mobile app) writes
  // this user's planner_rows — the mirror of mobile's subscribeToPlannerRows.
  // Guards:
  //   - echo mute: our own saves are delete-all-then-reinsert, which fires a
  //     storm of events; refreshes are DEFERRED until 5s past the last local
  //     save initiation (deferred, not dropped — a dropped event can be a
  //     real mobile write, e.g. an undo re-insert, and losing it leaves web
  //     stale until its next save erases the mobile change). The mute also
  //     protects in-flight local edits from being clobbered by a refresh
  //     (any pending edit implies a save initiated <500ms ago).
  //   - debounce: mobile writes can land in bursts (e.g. a reorder pass);
  //     coalesce into one refetch.
  //   - archived/draft years never refresh (mobile only writes the active year).
  useEffect(() => {
    // TODO(debug): remove after realtime delivery is verified.
    console.log('[realtime] effect run', { currentYear, isCurrentYearArchived, isCurrentYearDraft });
    if (isCurrentYearArchived || isCurrentYearDraft) return undefined;
    let cancelled = false;
    let refreshTimer = null;
    let channel = null;
    const MUTE_MS = 5000;
    // (Re)arm the coalescing refresh timer. When the timer fires inside the
    // echo-mute window of a local save, it re-arms for just past the window
    // instead of dropping the event — see the handler comment below.
    const scheduleRefresh = (delay) => {
      if (cancelled) return;
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(async () => {
        // Never refetch while the user is mid-edit — replacing the rows
        // array tears down the active input and reverts unsaved rows.
        // Defer (not drop) until the edit completes.
        if (editingCellRef.current) {
          scheduleRefresh(1000);
          return;
        }
        // Echo mute measured from save COMPLETION (not just initiation): a
        // queued save can outlive the mute window, and a refetch landing
        // before it finishes reads pre-save DB state and overwrites good
        // in-memory rows. Also defer while any save is queued/in flight.
        const lastSaveActivity = Math.max(lastSaveInitiatedRef.current, getLastTaskRowsSaveCompletedAt());
        const sinceSave = Date.now() - lastSaveActivity;
        // Before the first real server read this session the mute must not
        // apply: any recent "save" was stale-cache normalisation noise, and
        // deferring behind it is exactly how a stale tab kept its rows
        // (2026-08-28). In-flight saves still defer below.
        const muteApplies = isPlannerYearServerFresh(currentYear) && sinceSave < MUTE_MS;
        if (isTaskRowsSaveInFlight() || muteApplies) {
          const delay = isTaskRowsSaveInFlight() ? 1000 : MUTE_MS - sinceSave + 250;
          // TODO(debug): remove after realtime delivery is verified.
          console.log('[realtime] muted, deferring refresh', delay);
          scheduleRefresh(delay);
          return;
        }
        try {
          invalidateTaskRowsCache(currentYear);
          const rows = await readTaskRows(DEFAULT_PROJECT_ID, currentYear);
          if (cancelled) return;
          // A local edit may have landed while the refetch was in flight —
          // its save supersedes what we just read. Try again after ITS
          // mute window rather than discarding the pending refresh.
          if (
            editingCellRef.current ||
            isTaskRowsSaveInFlight() ||
            Date.now() - Math.max(lastSaveInitiatedRef.current, getLastTaskRowsSaveCompletedAt()) < MUTE_MS
          ) {
            scheduleRefresh(1000);
            return;
          }
          // TODO(debug): remove after realtime delivery is verified.
          console.log('[realtime] refetched rows', Array.isArray(rows) ? rows.length : rows);
          if (Array.isArray(rows) && rows.length > 0) {
            skipNextAutoSaveRef.current = true;
            setData(prev => {
              // Keep this page's in-memory Daily Min/Max rows instead of the
              // versions readTaskRows rebuilds from tactics metrics. The
              // rebuilt rows don't know about past-week value preservation
              // (and historically arrived blank due to a payload field
              // mismatch), so swapping them in flashed the rows empty; the
              // min/max refill effect's correction then re-triggered an
              // autosave → realtime echo → refetch loop. This page owns
              // those two rows via its own effect; the server refresh is
              // only about task rows.
              const prevMin = prev.find(r => r._isDailyMinRow);
              const prevMax = prev.find(r => r._isDailyMaxRow);
              return ensureDailyTotalRow(rows).map(r => {
                if (r._isDailyMinRow && prevMin) return prevMin;
                if (r._isDailyMaxRow && prevMax) return prevMax;
                return r;
              });
            });
          }
        } catch (err) {
          console.error('Realtime task-row refresh failed', err);
        }
      }, delay);
    };
    // Revalidate on mount whenever this session has not yet read the server
    // for this year. A cache-hit page load (localStorage mirror) or a year
    // switch back to a year cached earlier can be arbitrarily stale — the
    // 2026-08-27 incident was a machine last used weeks earlier rendering,
    // and then autosaving, its mirror. The refetch goes through the same
    // guarded path as a realtime event (edit/save mute, skipNextAutoSave).
    if (!isPlannerYearServerFresh(currentYear)) scheduleRefresh(0);
    // A tab waking after a long sleep, or regaining connectivity, has its
    // bookkeeping wiped by plannerStorage and must refetch before it can
    // trust (or save) anything.
    const onStale = () => scheduleRefresh(0);
    window.addEventListener(PLANNER_ROWS_STALE_EVENT, onStale);
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData?.user?.id;
      // TODO(debug): remove after realtime delivery is verified.
      console.log('[realtime] auth uid', uid, 'cancelled', cancelled);
      if (!uid || cancelled) return;
      channel = supabase
        .channel(`planner-rows-web-${currentYear}`)
        .on(
          'postgres_changes',
          // No server-side filter: a `user_id=eq.` filter subscribed fine but
          // delivered zero events (verified 2026-07-19), while mobile's
          // `year_id=eq.` filter works. RLS already scopes delivery to this
          // user's rows, so the filter was only an optimization.
          { event: '*', schema: 'public', table: 'planner_rows' },
          (payload) => {
            // TODO(debug): remove after realtime delivery is verified.
            console.log('[realtime] planner_rows event', payload?.eventType, payload?.old?.id ?? payload?.new?.id);
            // Defer — never drop. Events that arrive inside the echo-mute
            // window used to be discarded outright, which lost real mobile
            // writes landing during it (e.g. a delete-undo's re-insert while
            // a local autosave settled): web kept stale in-memory rows and
            // its next delete-all-then-reinsert save erased the mobile
            // change from Supabase. Now a muted event reschedules itself
            // for just past the window's end, so the refetch always happens.
            scheduleRefresh(800);
          }
        )
        .subscribe((status, err) => {
          // TODO(debug): remove after realtime delivery is verified.
          console.log('[realtime] channel status', status, err?.message ?? '');
        });
    })();
    return () => {
      cancelled = true;
      window.removeEventListener(PLANNER_ROWS_STALE_EVENT, onStale);
      if (refreshTimer) clearTimeout(refreshTimer);
      if (channel) supabase.removeChannel(channel);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentYear, isCurrentYearArchived, isCurrentYearDraft]);

  const [selectedCells, setSelectedCells] = useState(new Set()); // Set of "rowId|columnId"
  const [selectedRows, setSelectedRows] = useState(new Set()); // Set of rowIds for row highlight
  const [anchorRow, setAnchorRow] = useState(null); // For shift-click row range selection
  const [anchorCell, setAnchorCell] = useState(null); // For shift-click range selection
  const [isDragging, setIsDragging] = useState(false); // Track if user is dragging to select
  const [dragStartCell, setDragStartCell] = useState(null); // { rowId, columnId }
  const tableBodyRef = useRef(null);
  // Space covered by an open side panel (Gear / System) on the right edge of
  // the viewport. Applied as paddingRight on the table wrapper below so the
  // horizontal scroll range extends past the panel and the last weeks can
  // always be scrolled fully into view. Tracks live resize drags too.
  const { inset: panelInset, isResizing: panelResizing } = usePanelInset();
  // Set to true by the panel archive action so the post-archive effect expands + scrolls
  const expandNextArchiveRef = useRef(false);
  // Always-current mirror of visibleDayColumns used inside the min/max effect and
  // event handler. A ref (not dep-array value) so reading it never triggers rerenders.
  const latestVisibleDayColumnsRef = useRef(null);
  // Always-current mirrors of dailyMinValues/dailyMaxValues so handleArchiveWeek
  // always reads the latest computed bounds even if its useCallback closure is stale.
  const latestDailyMinValuesRef = useRef([]);
  const latestDailyMaxValuesRef = useRef([]);

  // Use the planner filters hook for project, status, recurring, and estimate filters
  const filters = usePlannerFilters();
  const {
    activeFilterColumns,
    toggleFilterColumn,
    selectedProjectFilters,
    selectedSubprojectFilters,
    selectedStatusFilters,
    selectedRecurringFilters,
    selectedEstimateFilters,
    projectFilterMenu,
    projectFilterMenuRef,
    projectFilterButtonRef,
    handleProjectFilterSelect,
    handleProjectFilterButtonClick,
    closeProjectFilterMenu,
    clearProjectFilter,
    subprojectFilterMenu,
    subprojectFilterMenuRef,
    subprojectFilterButtonRef,
    handleSubprojectFilterSelect,
    handleSubprojectFilterButtonClick,
    closeSubprojectFilterMenu,
    clearSubprojectFilter,
    statusFilterMenu,
    statusFilterMenuRef,
    statusFilterButtonRef,
    handleStatusFilterSelect,
    handleStatusFilterButtonClick,
    closeStatusFilterMenu,
    clearStatusFilter,
    recurringFilterMenu,
    recurringFilterMenuRef,
    recurringFilterButtonRef,
    handleRecurringFilterSelect,
    handleRecurringFilterButtonClick,
    closeRecurringFilterMenu,
    clearRecurringFilter,
    estimateFilterMenu,
    estimateFilterMenuRef,
    estimateFilterButtonRef,
    handleEstimateFilterSelect,
    handleEstimateFilterButtonClick,
    closeEstimateFilterMenu,
    clearEstimateFilter,
  } = filters;

  // Day filter state — empty Set means off; populated Set means those days are active
  const [dayFilter, setDayFilter] = useState(new Set());
  // Project filter state — null means off; a project name means only that project's rows are shown
  const [projectFilter, setProjectFilter] = useState(null);
  const handleDayFilterSelect = useCallback((day) => {
    setDayFilter(prev => {
      const next = new Set(prev);
      if (next.has(day)) { next.delete(day); } else { next.add(day); }
      return next;
    });
  }, []);

  // Listical menu state
  const [isListicalMenuOpen, setIsListicalMenuOpen] = useState(false);
  const [addTasksCount, setAddTasksCount] = useState('');

  // Multi-line paste into a single Task cell: pending confirmation payload
  // { lines: string[], anchorRowId: string } or null when no prompt is open.
  const [multiPastePrompt, setMultiPastePrompt] = useState(null);

  // Load projects and subprojects from Staging
  const { projects, subprojects, projectSubprojectsMap, projectNamesMap, projectTaglinesMap, projectIdByNickname, projectInfoById, isProjectsLoaded, hasSystemOrder } = useProjectsData();

  // Import tasks from active year into draft (single action, no wizard)
  //
  // Placement has to happen AFTER the project structure rows exist, but the
  // header-injection effect below is gated on the draft already having tasks.
  // So the handler parks the prepared tasks in pendingImportRef and bumps
  // importTick; the header effect re-runs, opens its gate because a pending
  // import exists, injects headers, then places the pending tasks in the same
  // state update so matched tasks land under their project's Unscheduled row.
  const pendingImportRef = useRef(null);
  // Set by the header effect once it has consumed a pending import, so the
  // chip effect (which runs next in the same pass, before latestDataRef can
  // reflect the queued update) knows to open its gate too.
  const importInFlightRef = useRef(false);
  const [importTick, setImportTick] = useState(0);
  const handleImportTasks = useCallback(async () => {
    if (!activeYear) return;
    try {
      const sourceRows = await readTaskRows(DEFAULT_PROJECT_ID, activeYear.yearNumber);
      const draftNicknames = projects.filter((p) => p !== '-');
      const imported = importTasksForDraftYear(sourceRows, draftNicknames, projectSubprojectsMap, projectIdByNickname);
      pendingImportRef.current = imported;
      setImportTick((t) => t + 1);
    } catch (err) {
      console.error('Failed to import tasks from active year', err);
    }
  }, [activeYear, projects, projectSubprojectsMap, projectIdByNickname]);

  // Load tactics data on mount — Layout's <Outlet key={currentYear}> remounts
  // this page on every year change, so the useState initialisers above (and the
  // sentToSystem initialiser earlier in this component) re-run synchronously
  // with the new year. No year-change effect needed.
  // Sync cache peek for metrics + enriched chips. On a hit, the page
  // renders with project quotas and chips on the very first paint.
  const [{ dailyBounds, projectWeeklyQuotas }, setMetricsData] = useState(
    () => peekMetricsData(currentYear) || { dailyBounds: [], projectWeeklyQuotas: new Map() },
  );
  // True once loadMetricsData has resolved for the current year. Guards
  // handleArchiveWeek so the quota snapshot is never captured from a stale cache.
  const [metricsLoaded, setMetricsLoaded] = useState(false);
  const [tacticsChips, setTacticsChips] = useState(
    () => peekEnrichedChips(currentYear) || [],
  );

  // Async load of metrics + enriched chips. Metrics always re-fetches from
  // Supabase so the System page reflects the latest Send to System even when
  // the in-memory cache is stale (e.g. a Send that happened while this page
  // was unmounted). Chips are still skipped on cache hit to avoid the
  // "page builds in front of me" flash (chip data is larger and slower).
  useEffect(() => {
    let cancelled = false;
    setMetricsLoaded(false);
    // Preload chip notes into the in-memory cache before chip rows are rendered.
    preloadChipTaskNotes();
    loadMetricsData(currentYear).then((data) => {
      if (!cancelled) {
        setMetricsData(data);
        setMetricsLoaded(true);
      }
    });
    if (!peekEnrichedChips(currentYear)) {
      loadEnrichedChips(currentYear).then((chips) => {
        if (!cancelled) setTacticsChips(chips);
      });
    }
    return () => { cancelled = true; };
  }, [currentYear]);

  // Command pattern for undo/redo
  const { undoStack, redoStack, executeCommand, undo, redo } = useCommandPattern();

  // Day column filters hook
  const { dayColumnFilters, toggleDayFilter: handleDayColumnFilterToggle, isDayFiltered, clearAllDayFilters } = useDayColumnFilters();

  // Collapsible groups hook
  const { collapsedGroups, setCollapsedGroups, toggleGroupCollapse, isCollapsed } = useCollapsibleGroups({ projectId: DEFAULT_PROJECT_ID, yearNumber: currentYear });

  // Context menu hook
  const { contextMenu, handleContextMenu, closeContextMenu } = useContextMenu();

  // Compute data with timeValue derived from estimate column (with status sync effect)
  const { computedData } = useComputedDataV2({ data, setData, totalDays });

  // Note: coerceNumber is now imported from valueNormalizers as coerceToNumber
  // We keep this wrapper for backward compatibility with existing code
  const coerceNumber = useCallback((value) => {
    if (value === null || value === undefined) return null;
    if (typeof value === 'string' && value.trim() === '') return null;
    return coerceToNumber(value);
  }, []);

  // Collect unique values for filter dropdowns from the data
  const { projectNames, subprojectNames, statusNames, recurringNames, estimateNames } = useFilterValues(computedData);

  // Wrap filter button click handlers with menu state (using generic hook to reduce duplication)
  const onProjectFilterButtonClick = useFilterButtonHandler(handleProjectFilterButtonClick, projectFilterMenu);
  const onSubprojectFilterButtonClick = useFilterButtonHandler(handleSubprojectFilterButtonClick, subprojectFilterMenu);
  const onStatusFilterButtonClick = useFilterButtonHandler(handleStatusFilterButtonClick, statusFilterMenu);
  const onRecurringFilterButtonClick = useFilterButtonHandler(handleRecurringFilterButtonClick, recurringFilterMenu);
  const onEstimateFilterButtonClick = useFilterButtonHandler(handleEstimateFilterButtonClick, estimateFilterMenu);

  // Filter data based on day column filters AND project/status/recurring/estimate filters AND collapsed groups
  // Only hide regular task rows that don't have numeric values in ALL filtered day columns
  // Also hide rows that belong to collapsed archive groups
  const filteredData = useFilteredData({
    computedData,
    dayColumnFilters,
    selectedProjectFilters,
    selectedSubprojectFilters,
    selectedStatusFilters,
    selectedRecurringFilters,
    selectedEstimateFilters,
    collapsedGroups,
    coerceNumber,
    dayFilter,
    projectFilter,
    totalDays,
  });

  // Sequential number shown in the left gutter column. Skips rows that
  // don't get a gutter number: the 7 pinned header rows (Month/Week/Day/
  // Day-of-week/Daily Min/Daily Max/Filter), the Inbox divider row, and the
  // Archive section divider (legacy `_isArchiveRow`) plus its section-title
  // header row (`_rowType === 'archiveHeader'`) — all structural rows, not
  // real task/project data. The Archive section's per-week divider row
  // (`_rowType === 'archiveRow'`, editable week label + weekly total) DOES
  // get numbered, same as a task row. Every other row (regular tasks,
  // project/subproject rows, archived project/task rows, inbox task rows)
  // gets the next sequential number, so the true first data row (now row 9,
  // after the Filter row split added the Daily Total row) displays "1" and
  // the numbering has no gaps at the skipped rows.
  const numberedData = useMemo(() => {
    let counter = 0;
    // Display-order index of each archive week (green divider) row, used by
    // TableRow to alternate the green shade (ARCHIVE_ROW_STYLE vs
    // ARCHIVE_ROW_ALT_STYLE).
    let archiveWeekCounter = 0;
    return filteredData.map((row) => {
      const archiveAltIndex = row._rowType === 'archiveRow' ? archiveWeekCounter++ : undefined;
      const skipsGutterNumber = (
        row._isMonthRow ||
        row._isWeekRow ||
        row._isDayRow ||
        row._isDayOfWeekRow ||
        row._isDailyMinRow ||
        row._isDailyMaxRow ||
        row._isDailyTotalRow ||
        row._isFilterRow ||
        row._isInboxRow ||
        row._isArchiveRow ||
        row._rowType === 'archiveHeader'
      );
      if (skipsGutterNumber) {
        return row._gutterNumber === undefined ? row : { ...row, _gutterNumber: undefined };
      }
      counter += 1;
      return (row._gutterNumber === counter && row._archiveAltIndex === archiveAltIndex)
        ? row
        : { ...row, _gutterNumber: counter, _archiveAltIndex: archiveAltIndex };
    });
  }, [filteredData]);

  // Sync the task row detail panel when filteredData changes so the status chip
  // always reflects the computed status shown in the table. Also write a task
  // event for computed status changes (chip-task rows whose status is derived
  // from plan data rather than set via the dropdown).
  const { selectedTask: panelTask } = useTaskRowPanel();
  useEffect(() => {
    if (!panelTask?.id) return;
    const updatedRow = filteredData.find(r => r.id === panelTask.id);
    if (!updatedRow) return;
    if (updatedRow.status === panelTask.status) return;
    window.dispatchEvent(new CustomEvent(TASK_ROW_DETAIL_UPDATE_EVENT, {
      detail: { task: updatedRow },
    }));
  }, [filteredData, panelTask?.id, panelTask?.status]);

  // Archive Week detail panel — when the selected panel row is an archive
  // week, derive the read-only panel payload from the table data and publish
  // it to SystemPanel. Pure derivation + event dispatch, no setData.
  useEffect(() => {
    if (panelTask?._rowType !== 'archiveRow') return;
    const week = buildArchiveWeekPanelData(data, panelTask.id, {
      projectInfoById,
      projectIdByNickname,
    });
    if (!week) return;
    window.dispatchEvent(new CustomEvent(SYSTEM_PANEL_ARCHIVE_WEEK_EVENT, {
      detail: { week },
    }));
  }, [panelTask, data, projectInfoById, projectIdByNickname]);

  // Keep latestVisibleDayColumnsRef in sync so the event handler can always read
  // the current pole-position without needing to be in its dep array.
  useEffect(() => {
    latestVisibleDayColumnsRef.current = visibleDayColumns;
  }, [visibleDayColumns]);

  // Calculate dates array from startDate
  const dates = useMemo(() => {
    const start = new Date(startDate);
    return Array.from({ length: totalDays }, (_, i) => {
      const date = new Date(start);
      date.setDate(start.getDate() + i);
      return date;
    });
  }, [startDate, totalDays]);

  // Update month/week spans and day row when totalDays changes
  useEffect(() => {
    setData(prevData => {
      const monthRowIndex = prevData.findIndex(row => row._isMonthRow);
      const weekRowIndex = prevData.findIndex(row => row._isWeekRow);
      const dayRowIndex = prevData.findIndex(row => row._isDayRow);
      const dayOfWeekRowIndex = prevData.findIndex(row => row._isDayOfWeekRow);

      if (monthRowIndex === -1 || weekRowIndex === -1 || dayRowIndex === -1) return prevData;

      // Check if update is needed by comparing current day labels with expected dates
      const currentDayRow = prevData[dayRowIndex];
      const firstExpectedDay = dates[0];
      const firstExpectedLabel = firstExpectedDay
        ? `${firstExpectedDay.getDate().toString().padStart(2, '0')}-${firstExpectedDay.toLocaleDateString('en-US', { month: 'short' })}`
        : null;
      const currentFirstDayLabel = currentDayRow?.[`day-0`];
      const currentMonthRow = prevData[monthRowIndex];
      const currentDaysInSpans = currentMonthRow._monthSpans?.reduce((sum, span) => sum + span.span, 0) || 0;

      // If spans match totalDays AND the first day label matches, no update needed
      if (currentDaysInSpans === totalDays && currentFirstDayLabel === firstExpectedLabel) {
        return prevData;
      }

      const newData = [...prevData];

      // Update month row spans
      const monthRow = { ...newData[monthRowIndex] };
      monthRow._monthSpans = [];
      let currentMonth = null;
      let currentSpan = 0;
      let spanStartDay = 0;

      dates.forEach((date, i) => {
        const monthLabel = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        if (monthLabel !== currentMonth) {
          if (currentMonth !== null) {
            monthRow._monthSpans.push({
              startDay: spanStartDay,
              span: currentSpan,
              label: currentMonth.split(' ')[0].toUpperCase()
            });
          }
          currentMonth = monthLabel;
          currentSpan = 1;
          spanStartDay = i;
        } else {
          currentSpan++;
        }
        if (i === dates.length - 1) {
          monthRow._monthSpans.push({
            startDay: spanStartDay,
            span: currentSpan,
            label: monthLabel.split(' ')[0].toUpperCase()
          });
        }
      });
      newData[monthRowIndex] = monthRow;

      // Update week row spans
      const weekRow = { ...newData[weekRowIndex] };
      weekRow._weekSpans = [];
      let currentWeek = null;
      currentSpan = 0;
      spanStartDay = 0;

      dates.forEach((_, i) => {
        const weekNumber = Math.floor(i / 7) + 1;
        if (weekNumber !== currentWeek) {
          if (currentWeek !== null) {
            weekRow._weekSpans.push({
              startDay: spanStartDay,
              span: currentSpan,
              weekNumber: currentWeek,
              label: `Week ${currentWeek}`
            });
          }
          currentWeek = weekNumber;
          currentSpan = 1;
          spanStartDay = i;
        } else {
          currentSpan++;
        }
        if (i === dates.length - 1) {
          weekRow._weekSpans.push({
            startDay: spanStartDay,
            span: currentSpan,
            weekNumber,
            label: `Week ${weekNumber}`
          });
        }
      });
      newData[weekRowIndex] = weekRow;

      // Update day row to DD-MMM format
      const dayRow = { ...newData[dayRowIndex] };
      dates.forEach((date, i) => {
        const day = date.getDate().toString().padStart(2, '0');
        const month = date.toLocaleDateString('en-US', { month: 'short' });
        dayRow[`day-${i}`] = `${day}-${month}`;
      });
      newData[dayRowIndex] = dayRow;

      // Update day of week row (M, T, W, T, F, S, S)
      if (dayOfWeekRowIndex !== -1) {
        const dayOfWeekRow = { ...newData[dayOfWeekRowIndex] };
        dates.forEach((date, i) => {
          const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
          // Convert to single letter: Mon->M, Tue->T, Wed->W, Thu->T, Fri->F, Sat->S, Sun->S
          dayOfWeekRow[`day-${i}`] = dayName.charAt(0);
        });
        newData[dayOfWeekRowIndex] = dayOfWeekRow;
      }

      return newData;
    });
  }, [dates, totalDays]);

  // Map daily bounds to timeline dates
  // Draft year with no imported tasks: show 0.00 instead of Plan page values
  const draftHasNoImportedTasks = isCurrentYearDraft && !sentToSystem && !hasImportedTasks(data);
  const { dailyMinValues, dailyMaxValues } = useMemo(() => {
    return mapDailyBoundsToTimeline(draftHasNoImportedTasks ? null : dailyBounds, dates);
  }, [dailyBounds, dates, draftHasNoImportedTasks]);

  // Keep dailyMin/MaxValues refs in sync so handleArchiveWeek always reads the
  // latest bounds regardless of when its useCallback closure was last recreated.
  useEffect(() => {
    latestDailyMinValuesRef.current = dailyMinValues;
    latestDailyMaxValuesRef.current = dailyMaxValues;
  }, [dailyMinValues, dailyMaxValues]);

  // Calculate project totals (sum of Scheduled and Done task timeValues per project)
  const projectTotals = useProjectTotals(computedData);

  // Calculate daily totals for each day column (sum of all regular task rows, ignoring filters)
  const dailyTotals = useDailyTotals({ computedData, totalDays });

  // Calculate archive totals (for archived projects and archive weeks)
  const archiveTotals = useArchiveTotals(computedData, totalDays);

  // Coalesced: update filter row totals, archive week totals, and daily min/max rows
  // in a single setData call. Previously three separate effects, each triggering its own
  // render + write-back chain. Combined deps union covers all three.
  useEffect(() => {
    setData(prevData => {
      let result = prevData;
      let changed = false;

      // --- Daily Total row: update daily column totals ---
      if (dailyTotals) {
        const dailyTotalRow = result.find(row => row._isDailyTotalRow);
        if (dailyTotalRow) {
          let filterChanged = false;
          forEachDayColumn(totalDays, (dayColumnId) => {
            if (dailyTotalRow[dayColumnId] !== dailyTotals[dayColumnId]) filterChanged = true;
          });
          if (filterChanged) {
            result = result.map(row => (row._isDailyTotalRow ? { ...row, ...dailyTotals } : row));
            changed = true;
          }
        }
      }

      // --- Archive week rows: update totals ---
      if (archiveTotals?.weekTotals) {
        let archiveChanged = false;
        const withArchive = result.map(row => {
          if (row._rowType === 'archiveRow' && archiveTotals.weekTotals[row.id]) {
            const weekTotal = archiveTotals.weekTotals[row.id];
            if (row.archiveTotalHours !== weekTotal.totalHours) {
              archiveChanged = true;
              return { ...row, archiveTotalHours: weekTotal.totalHours };
            }
          }
          return row;
        });
        if (archiveChanged) { result = withArchive; changed = true; }
      }

      // --- Daily min/max rows: insert or update ---
      if (dailyMinValues && dailyMaxValues) {
        if (!showMaxMinRows) {
          const filtered = result.filter(row => !row._isDailyMinRow && !row._isDailyMaxRow);
          if (filtered.length !== result.length) { result = filtered; changed = true; }
        } else {
          const hasMinRow = result.some(row => row._isDailyMinRow);
          const hasMaxRow = result.some(row => row._isDailyMaxRow);
          if (!hasMinRow || !hasMaxRow) {
            // Insert right before the Daily Total row (not the Filter row —
            // the Filter row split moved the Daily Total row to sit between
            // Daily Max and Filter, so anchoring on Filter here would
            // misorder Daily Min/Max after Daily Total).
            const dailyTotalRowIndex = result.findIndex(row => row._isDailyTotalRow);
            const filterRowIndex = result.findIndex(row => row._isFilterRow);
            const anchorIndex = dailyTotalRowIndex !== -1 ? dailyTotalRowIndex : filterRowIndex;
            if (anchorIndex !== -1) {
              const newData = [...result];
              if (!hasMinRow) {
                newData.splice(anchorIndex, 0, {
                  id: 'daily-min', _isDailyMinRow: true,
                  rowNum: '', checkbox: false, project: 'Daily Min', subproject: '',
                  status: '', task: '', recurring: '', estimate: '', timeValue: '',
                  ...createDayColumnUpdates(totalDays, (i) => dailyMinValues[i]),
                });
              }
              if (!hasMaxRow) {
                const insertIndex = hasMinRow ? anchorIndex : anchorIndex + 1;
                newData.splice(insertIndex, 0, {
                  id: 'daily-max', _isDailyMaxRow: true,
                  rowNum: '', checkbox: false, project: 'Daily Max', subproject: '',
                  status: '', task: '', recurring: '', estimate: '', timeValue: '',
                  ...createDayColumnUpdates(totalDays, (i) => dailyMaxValues[i]),
                });
              }
              result = newData; changed = true;
            }
          } else {
            // "Past" weeks are hidden weeks — visibleDayColumns is persisted to
            // storage, so this boundary survives page loads. Find the first
            // non-hidden day, align to its week boundary, and protect everything
            // before it from being overwritten by the new dailyMinValues/Max.
            const vis = latestVisibleDayColumnsRef.current ?? {};
            const firstVisible = Array.from({ length: totalDays }, (_, i) => i)
              .find(i => vis[`day-${i}`] !== false) ?? 0;
            const poleWeekStart = firstVisible - (firstVisible % 7);
            const isPastDay = (i) => i < poleWeekStart;

            let minMaxChanged = false;
            const withMinMax = result.map(row => {
              if (row._isDailyMinRow) {
                // Preserve past-week values; update current week and future only.
                const updates = createDayColumnUpdates(totalDays, (i) =>
                  isPastDay(i) ? row[`day-${i}`] : dailyMinValues[i]
                );
                // Compare actual values — spread always creates a new reference so
                // `next !== row` would be unconditionally true and trigger an
                // infinite setData → recompute → effect loop.
                const hasChange = Object.keys(updates).some(k => row[k] !== updates[k]);
                if (!hasChange) return row;
                minMaxChanged = true;
                return { ...row, project: 'Daily Min', ...updates };
              }
              if (row._isDailyMaxRow) {
                const updates = createDayColumnUpdates(totalDays, (i) =>
                  isPastDay(i) ? row[`day-${i}`] : dailyMaxValues[i]
                );
                const hasChange = Object.keys(updates).some(k => row[k] !== updates[k]);
                if (!hasChange) return row;
                minMaxChanged = true;
                return { ...row, project: 'Daily Max', ...updates };
              }
              return row;
            });
            if (minMaxChanged) { result = withMinMax; changed = true; }
          }
        }
      }

      return changed ? result : prevData;
    });
  }, [dailyTotals, archiveTotals, dailyMinValues, dailyMaxValues, showMaxMinRows, totalDays]);

  // On-mount structural setup: (1) repair stale parentGroupIds, (2) ensure Inbox and Archive header rows exist.
  // Coalesced into one setData so both passes share a single render instead of two cascaded ones.
  useEffect(() => {
    setData(prevData => {
      // --- Step 1: parentGroupId repair ---
      // Repair rows whose parentGroupId points to a groupId that no longer exists.
      // Chip-linked rows are intentionally skipped — the chip sync effect validates them.
      const validGroupIds = new Set(prevData.map(r => r.groupId).filter(Boolean));
      let needsRepair = false;
      const repaired = prevData.map(row => {
        if (row._chipId) return row;
        if (row.parentGroupId && !validGroupIds.has(row.parentGroupId)) {
          needsRepair = true;
          const { parentGroupId: _removed, ...rest } = row;
          return rest;
        }
        return row;
      });
      const base = needsRepair ? repaired : prevData;

      // --- Step 2: Inbox and Archive header insertion ---
      // Find the filter row index
      const filterRowIndex = base.findIndex(row => row._isFilterRow);
      if (filterRowIndex === -1) return base;

      let newData = [...base];

      // FIRST: Clean up any duplicates or legacy rows

      // Remove legacy archive divider if it exists
      newData = newData.filter(row => !row._isArchiveRow);

      // Remove ALL duplicate archive headers (keep only the first one with id 'archive-header')
      let archiveHeadersFound = 0;
      newData = newData.filter(row => {
        if (row._rowType === 'archiveHeader') {
          archiveHeadersFound++;
          // Keep only the first one. Do NOT rewrite its id: a row read from
          // the server carries its UUID, and replacing that with the
          // synthetic 'archive-header' made every page load mint a new row
          // (delete + re-insert at best, a duplicate header in the save's
          // restricted mode — 2026-08-27). Only a header that never had a
          // real id gets the synthetic one.
          if (archiveHeadersFound === 1) {
            if (!row.id) row.id = 'archive-header';
            return true;
          }
          return false; // Remove all other archive headers
        }
        return true;
      });

      // THEN: Check what we need to create
      const currentHasArchiveHeader = newData.some(row => row._rowType === 'archiveHeader');
      const currentHasInboxRow = newData.some(row => row._isInboxRow);

      // If both exist, nothing more to do
      if (currentHasInboxRow && currentHasArchiveHeader) return newData;

      // Create "Inbox" divider row (if it doesn't exist)
      if (!currentHasInboxRow) {
        // Find where to insert inbox row (after project rows or after filter row)
        let insertIndex = filterRowIndex + 1;

        // Find the last project-related row if any exist
        for (let i = newData.length - 1; i >= 0; i--) {
          if (newData[i]._rowType === 'projectUnscheduled' ||
              newData[i]._rowType === 'projectGeneral' ||
              newData[i]._rowType === 'projectHeader') {
            insertIndex = i + 1;
            break;
          }
        }

        const inboxRow = {
          id: 'inbox-divider',
          _isInboxRow: true,
          rowNum: '',
          checkbox: '',
          project: '',
          subproject: '',
          status: '',
          task: '',
          recurring: '',
          estimate: '',
          timeValue: '',
          ...createEmptyDayColumns(totalDays),
        };
        newData.splice(insertIndex, 0, inboxRow);
      }

      // Create "Archive" header row 20 rows below inbox (if it doesn't exist)
      if (!currentHasArchiveHeader) {
        // Find the inbox row index in newData
        const inboxIndex = newData.findIndex(row => row._isInboxRow);
        if (inboxIndex !== -1) {
          const archiveHeaderRow = {
            id: 'archive-header',
            _rowType: 'archiveHeader',
            rowNum: '',
            checkbox: '',
            project: '',
            subproject: '',
            status: '',
            task: '',
            recurring: '',
            estimate: '',
            timeValue: '',
            ...createEmptyDayColumns(totalDays),
          };
          // Archive is always the final section: append after everything
          // (inbox tasks included) rather than a fixed offset below inbox,
          // which could split the inbox or strand rows under Archive.
          newData.push(archiveHeaderRow);
        }
      }

      return newData;
    });
  }, [totalDays]); // Run once on mount and when totalDays changes

  // Insert project rows into data structure
  useEffect(() => {
    // Early exit conditions - don't modify state if not needed
    if (!projects) return;
    // Draft year starts blank — don't inject project headers until the user imports tasks or presses "Send to System"
    if (isCurrentYearDraft && !sentToSystem && !pendingImportRef.current && !hasImportedTasks(latestDataRef.current)) return;

    // setData uses the functional updater form, so React applies updates in queue order.
    // No setTimeout needed: useEffect already fires after commit, and functional updaters
    // applied in the same flush are sequenced — chip sync's updater sees this effect's
    // inserted headers even when both effects fire in the same passive-effects phase.
    const pendingImport = pendingImportRef.current;
    pendingImportRef.current = null;
    if (pendingImport) importInFlightRef.current = true;
    const injectProjectStructure = (prevData) => {
        // Find the filter row index to insert projects after it
        const filterRowIndex = prevData.findIndex(row => row._isFilterRow);
        if (filterRowIndex === -1) return prevData;

        const existingHeaderIds = new Set(
          prevData
            .filter(row => row._rowType === 'projectHeader')
            .map(row => row.projectNickname)
        );

        const activeProjectKeys = new Set(projects.filter(k => k !== '-'));

        // Remove rows belonging to projects no longer in the plan.
        // Gate on isProjectsLoaded: until the async staging load completes,
        // the projects list may be incomplete (just ['-']). Removing rows
        // based on an incomplete list strips valid project data and the
        // debounced autosave persists the damage to Supabase.
        const removedProjects = [...existingHeaderIds].filter(k => !activeProjectKeys.has(k));
        let filteredData = prevData;
        if (removedProjects.length > 0 && isProjectsLoaded) {
          const removedSet = new Set(removedProjects);
          const removedGroupIds = new Set(removedProjects.map(k => `project-${k}`));
          // Also collect subproject/chip groupIds whose parent is a removed project group —
          // task rows beneath them have parentGroupId pointing to those inner groups, not to project-{key}.
          prevData.forEach(row => {
            if (
              row._rowType === 'subprojectHeader' &&
              row.parentGroupId &&
              removedGroupIds.has(row.parentGroupId) &&
              row.groupId
            ) {
              removedGroupIds.add(row.groupId);
            }
          });
          const isArchived = (row) => {
            const t = row._rowType || '';
            return t.toLowerCase().startsWith('archive') || !!row.archiveWeekLabel;
          };
          filteredData = prevData.filter(row => {
            if (isArchived(row)) return true;
            if (row._rowType === 'projectHeader' && removedProjects.includes(row.projectNickname)) return false;
            if (row.parentGroupId && removedGroupIds.has(row.parentGroupId)) return false;
            if (row.projectNickname && removedSet.has(row.projectNickname)) return false;
            return true;
          });
        }

        // Find the last existing project header to insert new ones after it
        let lastProjectHeaderIndex = filterRowIndex;
        filteredData.forEach((row, i) => {
          if (row._rowType === 'projectHeader' || row._rowType === 'projectGeneral' || row._rowType === 'projectUnscheduled') {
            lastProjectHeaderIndex = i;
          }
        });

        // Do not sync projectName from staging onto existing rows: once a
        // project header row exists in System, the user can edit its name
        // directly and that edit must be preserved. The staging name is only
        // used when first inserting a new header row (below).
        //
        // projectTagline IS synced: projects.project_tagline is the single
        // source of truth (Goal page edits it; a System inline edit writes
        // back through saveProjectTagline), and the copy on the header row
        // is what mobile renders, so keep it current. Only rows whose
        // project has a non-empty staging tagline that differs are touched.
        let taglineSynced = false;
        if (isProjectsLoaded && projectTaglinesMap) {
          const synced = filteredData.map(row => {
            if (row._rowType !== 'projectHeader') return row;
            const staged = projectTaglinesMap[row.projectNickname];
            if (!staged || staged === (row.projectTagline || '')) return row;
            taglineSynced = true;
            return { ...row, projectTagline: staged };
          });
          if (taglineSynced) filteredData = synced;
        }

        const newProjects = projects.filter(k => k !== '-' && !existingHeaderIds.has(k));
        if (newProjects.length === 0 && removedProjects.length === 0 && !taglineSynced) return prevData;
        if (newProjects.length === 0) return filteredData;

        const newData = [...filteredData];
        let insertIndex = lastProjectHeaderIndex + 1;

        // Insert project rows for any project that doesn't have a header yet (skip '-')
        newProjects.forEach(projectKey => {

            // Get full project name from the map (projectKey might be a nickname)
            const fullProjectName = projectNamesMap[projectKey] || projectKey;

            // Create a unique group ID for this project
            const projectGroupId = `project-${projectKey}`;

            // Create project header row with groupId
            const projectHeaderRow = {
              id: `${projectKey}-header`,
              _rowType: 'projectHeader',
              groupId: projectGroupId,
              projectName: fullProjectName,
              projectNickname: projectKey,
              projectId: projectIdByNickname.get(projectKey) ?? null,
              projectTagline: projectTaglinesMap?.[projectKey] || '',
              rowNum: '',
              checkbox: '',
              project: '',
              subproject: '',
              status: '',
              task: '',
              recurring: '',
              estimate: '',
              timeValue: '',
              ...createEmptyDayColumns(totalDays),
            };
            newData.splice(insertIndex++, 0, projectHeaderRow);

            // Create "General" section row with parentGroupId
            const generalRow = {
              id: `${projectKey}-general`,
              _rowType: 'projectGeneral',
              parentGroupId: projectGroupId,
              projectName: fullProjectName,
              projectNickname: projectKey,
              projectId: projectIdByNickname.get(projectKey) ?? null,
              rowNum: '',
              checkbox: '',
              project: '',
              subproject: '',
              status: '',
              task: '',
              recurring: '',
              estimate: '',
              timeValue: '',
              ...createEmptyDayColumns(totalDays),
            };
            newData.splice(insertIndex++, 0, generalRow);

            // Create "Unscheduled" section row with parentGroupId
            const unscheduledRow = {
              id: `${projectKey}-unscheduled`,
              _rowType: 'projectUnscheduled',
              parentGroupId: projectGroupId,
              projectName: fullProjectName,
              projectNickname: projectKey,
              projectId: projectIdByNickname.get(projectKey) ?? null,
              rowNum: '',
              checkbox: '',
              project: '',
              subproject: '',
              status: '',
              task: '',
              recurring: '',
              estimate: '',
              timeValue: '',
              ...createEmptyDayColumns(totalDays),
            };
            newData.splice(insertIndex++, 0, unscheduledRow);
          });

        return newData;
      };
    setData(prevData => {
      const withStructure = injectProjectStructure(prevData);
      return pendingImport ? placeImportedTasks(withStructure, pendingImport) : withStructure;
    });
  }, [projects, projectNamesMap, projectTaglinesMap, totalDays, isCurrentYearDraft, sentToSystem, isProjectsLoaded, importTick, setData]);

  // Keep project blocks in the order given by projects.system_order
  // (`projects` from useProjectsData is already sorted by it). Covers reorders
  // made elsewhere: another tab, the Tacular app, or undo. A local header drag
  // saves the same order first, so this is a no-op for it. Blocks not in
  // `projects` (e.g. projects pending removal) keep their relative position.
  // Until a first reorder has been saved (no system_order anywhere) the
  // persisted row order is left alone, so existing layouts are not reshuffled
  // into Goal order.
  useEffect(() => {
    if (!projects || !isProjectsLoaded || !hasSystemOrder) return;
    setData(prevData => {
      const headerIdxs = [];
      prevData.forEach((row, i) => { if (row._rowType === 'projectHeader') headerIdxs.push(i); });
      if (headerIdxs.length < 2) return prevData;

      const rank = new Map();
      projects.forEach((key, i) => { if (key !== '-') rank.set(key, i); });

      const blocks = headerIdxs.map((hi, bi) => {
        const [start, end] = getProjectBlockRange(prevData, hi);
        const r = rank.get(prevData[hi].projectNickname);
        return { start, end, rank: r ?? Number.POSITIVE_INFINITY, bi };
      });

      // Blocks must be contiguous for a pure reorder; bail out otherwise.
      for (let i = 1; i < blocks.length; i++) {
        if (blocks[i].start !== blocks[i - 1].end) return prevData;
      }

      const sorted = [...blocks].sort((a, b) => (a.rank - b.rank) || (a.bi - b.bi));
      if (sorted.every((b, i) => b.bi === i)) return prevData;

      const regionStart = blocks[0].start;
      const regionEnd = blocks[blocks.length - 1].end;
      return [
        ...prevData.slice(0, regionStart),
        ...sorted.flatMap(b => prevData.slice(b.start, b.end)),
        ...prevData.slice(regionEnd),
      ];
    });
  }, [projects, isProjectsLoaded, hasSystemOrder]);

  // Create subprojectHeader rows from Tactics chips
  useEffect(() => {
    if (!tacticsChips || tacticsChips.length === 0) return;
    // Draft year starts blank — don't inject chip rows until the user imports tasks or presses "Send to System"
    if (isCurrentYearDraft && !sentToSystem && !importInFlightRef.current && !hasImportedTasks(latestDataRef.current)) return;
    importInFlightRef.current = false;

    // No setTimeout: functional updater form means React applies this after project injection's
    // updater in the same flush, so chip rows see project headers already inserted.
    setData(prevData => {
        const currentChipIds = new Set(tacticsChips.map(c => c.id));
        // One header row per group (project + chip name); one task row per chip.
        const groups = groupChips(tacticsChips);
        const groupKeyOfChipId = new Map(tacticsChips.map(c => [c.id, chipGroupKey(c)]));
        const chipShortLabelMap = new Map(tacticsChips.map(chip => [chip.id, chipDisplayName(chip)]));

        let changed = false;

        // --- Step 0: re-link rows orphaned by chip renumbering ---
        // Chip ids encode the schedule item's position in its project's list
        // ("schedule-chip-{projectId}-{itemIdx}"), so deleting or reordering
        // schedule items on the Goal page renumbers every item below the
        // change. A row whose chip id has vanished is therefore not
        // necessarily a deleted chip. Before Step 1 treats it as one, try to
        // match the row to a chip in the same group (project + chip name)
        // that has no task row yet — that is almost always the same chip
        // under a new number. Matching in group day-order keeps multi-day
        // groups aligned with their rows.
        const liveTaskRowChipIds = new Set(
          prevData
            .filter(r => r._rowType === 'projectTask' && r._chipId && currentChipIds.has(r._chipId))
            .map(r => r._chipId)
        );
        const unclaimedChipsByKey = new Map();
        groups.forEach((group, key) => {
          const unclaimed = group.chips.filter(c => !liveTaskRowChipIds.has(c.id));
          if (unclaimed.length > 0) unclaimedChipsByKey.set(key, [...unclaimed]);
        });
        const headerKeyByGroupId = new Map(
          prevData
            .filter(r => r._rowType === 'subprojectHeader' && r._chipGroupKey)
            .map(r => [r.groupId, r._chipGroupKey])
        );
        const relinked = prevData.map(row => {
          if (!row._chipId) return row;
          if (currentChipIds.has(row._chipId)) {
            // Chip came back (e.g. undo on the Plan page) — clear a stale flag.
            if (row._chipOrphaned) {
              changed = true;
              const { _chipOrphaned, ...rest } = row;
              return rest;
            }
            return row;
          }
          if (row._rowType === 'projectTask') {
            const key = headerKeyByGroupId.get(row.parentGroupId)
              ?? `${row.projectNickname ?? ''}::${(row._originalTask || row.task || '').trim().toLowerCase()}`;
            const candidates = unclaimedChipsByKey.get(key);
            if (candidates && candidates.length > 0) {
              const chip = candidates.shift();
              changed = true;
              // Persisted rows carry a DB UUID in row.id — leave that alone
              // (changing it would delete+re-insert the DB row and break
              // task_events FKs); _chipId is the join key everywhere. Only a
              // still-synthetic "chip-task-{oldChipId}" id is renamed, so a
              // NEW schedule item that later reuses the old positional chip
              // id cannot collide with this row's id.
              const { _chipOrphaned, ...rest } = row;
              const nextId = typeof row.id === 'string' && row.id.startsWith('chip-task-')
                ? `chip-task-${chip.id}`
                : row.id;
              return {
                ...rest,
                id: nextId,
                _chipId: chip.id,
                projectId: chip.projectId ?? row.projectId ?? null,
              };
            }
          } else if (row._rowType === 'subprojectHeader') {
            // Header whose lead chip was renumbered but whose group still
            // exists: point it at the group's current first chip so it is
            // never mistaken for a deleted group. groupId stays unchanged —
            // it is only an opaque parent key for the task rows beneath it.
            const group = row._chipGroupKey ? groups.get(row._chipGroupKey) : null;
            if (group) {
              changed = true;
              const { _chipOrphaned, ...rest } = row;
              return { ...rest, _chipId: group.chips[0].id };
            }
          }
          return row;
        });

        // --- Step 1: remove rows for chips that no longer exist ---
        // Safeguard: a row Step 0 could not re-link is only deleted when it
        // holds no user data. Rows with day entries, notes, a status, a
        // ticked checkbox, or edited fields are kept and flagged
        // _chipOrphaned (greyed out in TaskRow) so a renumbering we failed
        // to resolve can never silently destroy work. Blank rows delete as
        // before.
        const rowHasUserData = (row) => {
          if (row.notes && String(row.notes).trim() !== '') return true;
          if (row.status && row.status !== '-' && row.status !== '') return true;
          if (row.checkbox === true || row.checkbox === 'true') return true;
          for (const k in row) {
            if (k.startsWith('day-') && row[k] !== '' && row[k] != null && row[k] !== false) return true;
          }
          if (row._originalTask !== undefined && row.task !== row._originalTask) return true;
          if (row._originalEstimate !== undefined && row.estimate !== row._originalEstimate) return true;
          if (row._originalTimeValue !== undefined && row.timeValue !== row._originalTimeValue) return true;
          if (row._originalRecurring !== undefined && row.recurring !== row._originalRecurring) return true;
          return false;
        };
        // A kept orphan task row also keeps its header, or it would be
        // left dangling with no visible group. Headers precede their task
        // rows in the array, so decide the task rows first.
        const keptOrphanGroupIds = new Set();
        relinked.forEach(row => {
          if (
            row._rowType === 'projectTask' &&
            row._chipId &&
            !currentChipIds.has(row._chipId) &&
            rowHasUserData(row)
          ) keptOrphanGroupIds.add(row.parentGroupId);
        });
        let working = [];
        relinked.forEach(row => {
          if (row._chipId && !currentChipIds.has(row._chipId)) {
            if (row._rowType === 'projectTask') {
              if (rowHasUserData(row)) {
                if (row._chipOrphaned) { working.push(row); return; }
                changed = true;
                working.push({ ...row, _chipOrphaned: true });
                return;
              }
              changed = true;
              return;
            }
            // A header survives as long as any chip in its group still exists
            if (row._rowType === 'subprojectHeader') {
              const key = row._chipGroupKey;
              if (!key || !groups.has(key)) {
                if (keptOrphanGroupIds.has(row.groupId)) {
                  if (row._chipOrphaned) { working.push(row); return; }
                  changed = true;
                  working.push({ ...row, _chipOrphaned: true });
                  return;
                }
                changed = true;
                return;
              }
            }
          }
          working.push(row);
        });

        // --- Step 2: migrate legacy one-header-per-chip rows into group headers ---
        // The first header seen for a group becomes the group header; later
        // duplicates are dropped and their task rows re-parented under the survivor.
        const headerByKey = new Map();
        const dropHeaderGroupIds = new Map(); // old groupId -> surviving groupId
        working = working.filter(row => {
          if (row._rowType !== 'subprojectHeader' || !row._chipId) return true;
          const key = row._chipGroupKey ?? groupKeyOfChipId.get(row._chipId);
          if (!key) return true;
          if (headerByKey.has(key)) {
            dropHeaderGroupIds.set(row.groupId, headerByKey.get(key).groupId);
            changed = true;
            return false;
          }
          headerByKey.set(key, row);
          return true;
        });
        if (dropHeaderGroupIds.size > 0) {
          // Re-parent orphaned task rows, then move them directly after their new header
          const moved = [];
          working = working.filter(row => {
            if (row._rowType === 'projectTask' && dropHeaderGroupIds.has(row.parentGroupId)) {
              moved.push({ ...row, parentGroupId: dropHeaderGroupIds.get(row.parentGroupId) });
              return false;
            }
            return true;
          });
          moved.forEach(taskRow => {
            let idx = working.findIndex(r => r._rowType === 'subprojectHeader' && r.groupId === taskRow.parentGroupId);
            if (idx === -1) { working.push(taskRow); return; }
            // insert after the header and any task rows already under it
            let insertAt = idx + 1;
            while (insertAt < working.length && working[insertAt]._rowType === 'projectTask' && working[insertAt].parentGroupId === taskRow.parentGroupId) insertAt++;
            working.splice(insertAt, 0, taskRow);
          });
        }

        // --- Step 3: refresh header labels (respecting user edits) ---
        working = working.map(row => {
          if (row._rowType !== 'subprojectHeader' || !row._chipId) return row;
          const key = row._chipGroupKey ?? groupKeyOfChipId.get(row._chipId);
          const group = key ? groups.get(key) : null;
          if (!group) return row;
          const newLabel = group.label;
          const userEdited = row._chipLabel !== undefined && row.subprojectName !== row._chipLabel;
          const next = { ...row, _chipGroupKey: key, _chipLabel: newLabel, estimate: '' };
          if (!userEdited) next.subprojectName = newLabel;
          if (
            next._chipGroupKey === row._chipGroupKey &&
            next._chipLabel === row._chipLabel &&
            next.subprojectName === row.subprojectName &&
            next.estimate === row.estimate
          ) return row;
          changed = true;
          return next;
        });

        // --- Step 4: reorder so subprojectHeader rows (with their task rows) precede
        // General/Unscheduled section rows within each project group ---
        const sectionRowTypes = new Set(['projectGeneral', 'projectUnscheduled', 'subprojectGeneral', 'subprojectUnscheduled']);
        const reordered = [...working];
        let i = 0;
        while (i < reordered.length) {
          if (reordered[i]._rowType === 'projectHeader') {
            const projectGroupId = reordered[i].groupId;
            const blockIndices = []; // header + its task rows
            const sectionIndices = [];
            let j = i + 1;
            while (j < reordered.length && reordered[j]._rowType !== 'projectHeader') {
              const r = reordered[j];
              if (r._rowType === 'subprojectHeader' && r.parentGroupId === projectGroupId) {
                blockIndices.push(j);
              } else if (r._rowType === 'projectTask' && r._chipId && r.parentGroupId?.startsWith('chip')) {
                blockIndices.push(j);
              } else if (sectionRowTypes.has(r._rowType)) {
                sectionIndices.push(j);
              }
              j++;
            }
            const firstSection = sectionIndices.length ? sectionIndices[0] : Infinity;
            const misplaced = blockIndices.filter(idx => idx > firstSection);
            if (misplaced.length > 0) {
              changed = true;
              const rows = misplaced.map(idx => reordered[idx]);
              for (let k = misplaced.length - 1; k >= 0; k--) reordered.splice(misplaced[k], 1);
              const newFirstSectionIdx = reordered.findIndex((r, idx) => idx > i && sectionRowTypes.has(r._rowType));
              reordered.splice(newFirstSectionIdx !== -1 ? newFirstSectionIdx : i + 1, 0, ...rows);
            }
          }
          i++;
        }

        // --- Step 5: work out which groups / chips still need rows ---
        const deletedGroupKeys = new Set(
          reordered.filter(r => r._rowType === 'deletedChip' && r._chipGroupKey).map(r => r._chipGroupKey)
        );
        const deletedChipIds = new Set(
          reordered.filter(r => r._rowType === 'deletedChip' && r._chipId && !r._chipGroupKey).map(r => r._chipId)
        );
        const isGroupDeleted = (group) =>
          deletedGroupKeys.has(group.key) || group.chips.every(c => deletedChipIds.has(c.id));
        const existingHeaderByKey = new Map(
          reordered.filter(r => r._rowType === 'subprojectHeader' && r._chipGroupKey).map(r => [r._chipGroupKey, r])
        );
        const existingChipTaskIds = new Set(
          reordered.filter(r => r._rowType === 'projectTask' && r._chipId).map(r => r._chipId)
        );

        const groupsNeedingHeader = [...groups.values()].filter(g => !existingHeaderByKey.has(g.key) && !isGroupDeleted(g));
        const chipsNeedingTaskRow = tacticsChips.filter(chip => {
          if (existingChipTaskIds.has(chip.id) || deletedChipIds.has(chip.id)) return false;
          const group = groups.get(groupKeyOfChipId.get(chip.id));
          return group && !isGroupDeleted(group);
        });

        if (groupsNeedingHeader.length === 0 && chipsNeedingTaskRow.length === 0 && !changed) return prevData;

        const newData = [...reordered];

        const buildChipTaskRow = (chip, chipGroupId, taskLabel) => {
          const estimateLabel = minutesToEstimateLabel(chip.durationMinutes);
          const timeVal = chip.durationMinutes ? formatMinutesToHHmm(chip.durationMinutes) : '';
          const recurringInitial = 'Recurring';
          return {
            id: `chip-task-${chip.id}`,
            _rowType: 'projectTask',
            _chipId: chip.id,
            parentGroupId: chipGroupId,
            projectNickname: chip.projectNickname,
            projectId: chip.projectId ?? null,
            checkbox: false,
            project: chip.projectNickname,
            subproject: '',
            status: '-',
            task: taskLabel,
            recurring: recurringInitial,
            estimate: estimateLabel,
            timeValue: timeVal,
            notes: loadChipTaskNote(chip.id),
            // Stamps of the last canonical values written from Plan.
            // resetSubprojectLabels uses these to detect user edits and preserve them
            // (mirrors the _chipLabel pattern on the subproject header row).
            _originalTask: taskLabel,
            _originalEstimate: estimateLabel,
            _originalTimeValue: timeVal,
            _originalRecurring: recurringInitial,
            ...createEmptyDayColumns(totalDays),
          };
        };

        // Insert new group headers (without task rows — Step 6 adds those)
        groupsNeedingHeader.forEach(group => {
          const projectGroupId = `project-${group.projectNickname}`;
          const projectHeaderIndex = newData.findIndex(
            row => row._rowType === 'projectHeader' && row.projectNickname === group.projectNickname
          );
          if (projectHeaderIndex === -1) return;

          // Insert after the last existing chip header block for this project,
          // but before General/Unscheduled section rows.
          let insertAfterIndex = projectHeaderIndex;
          for (let k = projectHeaderIndex + 1; k < newData.length; k++) {
            const row = newData[k];
            if (row._rowType === 'projectHeader') break;
            if (sectionRowTypes.has(row._rowType)) break;
            if (row._rowType === 'subprojectHeader' && row.parentGroupId === projectGroupId) insertAfterIndex = k;
            if (row._rowType === 'projectTask' && row._chipId) insertAfterIndex = k;
          }

          const firstChip = group.chips[0];
          const chipGroupId = `chip-${firstChip.id}`;
          newData.splice(insertAfterIndex + 1, 0, {
            id: `chip-header-${firstChip.id}`,
            _rowType: 'subprojectHeader',
            _chipId: firstChip.id,
            _chipGroupKey: group.key,
            _chipLabel: group.label,
            groupId: chipGroupId,
            parentGroupId: projectGroupId,
            projectNickname: group.projectNickname,
            projectName: '',
            subprojectName: group.label,
            rowNum: '',
            checkbox: '',
            project: '',
            subproject: '',
            status: '',
            task: '',
            recurring: '',
            estimate: '',
            timeValue: '',
            ...createEmptyDayColumns(totalDays),
          });
        });

        // Step 6: task rows for chips missing one, placed under their group header in day order
        chipsNeedingTaskRow.forEach(chip => {
          const key = groupKeyOfChipId.get(chip.id);
          const headerIndex = newData.findIndex(r => r._rowType === 'subprojectHeader' && r._chipGroupKey === key);
          if (headerIndex === -1) return;
          const header = newData[headerIndex];
          const group = groups.get(key);
          const order = group.chips.findIndex(c => c.id === chip.id);
          let insertAt = headerIndex + 1;
          while (insertAt < newData.length) {
            const r = newData[insertAt];
            if (r._rowType !== 'projectTask' || r.parentGroupId !== header.groupId) break;
            const existingOrder = group.chips.findIndex(c => c.id === r._chipId);
            if (existingOrder > order) break;
            insertAt++;
          }
          newData.splice(insertAt, 0, buildChipTaskRow(chip, header.groupId, chipShortLabelMap.get(chip.id)));
        });

        return newData;
      });
  // `projects` is included so this effect re-fires when staging finishes loading.
  // Without it, chips can be enriched before project headers exist in data, causing every
  // findIndex(projectHeader) lookup to fail silently. Removing only with a replacement signal.
  // (Previously guarded by a 50 ms setTimeout; no longer needed because the functional updater
  // form guarantees project injection's setData is applied before this one in the same flush.)
  }, [tacticsChips, totalDays, isCurrentYearDraft, sentToSystem, projects, importTick]);

  // Reconcile task-row subproject values against the current Goal page subproject
  // lists. When a subproject is deleted on the Goal page, live task rows that still
  // reference it get their `subproject` cleared so TaskRow's red warning indicator
  // shows and the user reassigns manually — instead of the row silently regrouping
  // under the next subproject section. Mirrors the import-time validation in
  // importTasksFromYear.js. Archived rows are never touched (archives are a frozen
  // record of what existed at the time).
  useEffect(() => {
    if (!isProjectsLoaded) return;
    if (!projectSubprojectsMap || Object.keys(projectSubprojectsMap).length === 0) return;
    setData(prevData => {
      let changed = false;
      const next = prevData.map(row => {
        // Editable rows = plain task rows (no _rowType) and chip task rows
        // ('projectTask'); excludes structure, timeline, and archive structure rows.
        if (!isEditableRow(row)) return row;
        // Archived task rows keep their task _rowType but carry _isArchivedTask
        // (set in archiveHelpers.moveTasksToArchive). Never touch archived rows.
        if (row._isArchivedTask || row.archiveWeekLabel) return row;
        const sub = row.subproject;
        if (!sub || sub === '-') return row;
        const projectKey = row.project || row.projectNickname;
        // Only reconcile rows whose project still exists on the Goal page;
        // removed projects are handled by the project-removal cleanup above.
        const subs = projectKey ? projectSubprojectsMap[projectKey] : undefined;
        if (!subs || subs.includes(sub)) return row;
        changed = true;
        return { ...row, subproject: '' };
      });
      return changed ? next : prevData;
    });
  }, [projectSubprojectsMap, isProjectsLoaded, setData]);

  // Track the last send-to-system timestamp we've already acted on
  const lastResetTsRef = useRef(null);

  // Reset subproject row labels to Tactics-derived values.
  // Called both on mount (timestamp check) and when the live event fires.
  const resetSubprojectLabels = useCallback((chips) => {
    if (!chips || chips.length === 0) return;
    // Header labels are per chip GROUP (project + chip name), see utils/planner/chipGroups.
    const groups = groupChips(chips);
    const chipLabelMap = new Map(
      chips.map(chip => [chip.id, groups.get(chipGroupKey(chip))?.label])
    );
    const chipShortLabelMap = new Map(
      chips.map(chip => [chip.id, chipDisplayName(chip)])
    );
    setData(prevData => {
      let changed = false;
      // Update existing subprojectHeader and chip task rows
      const newData = prevData.map(row => {
        if (row._rowType === 'subprojectHeader' && row._chipId) {
          const canonicalLabel = row._chipGroupKey
            ? groups.get(row._chipGroupKey)?.label
            : chipLabelMap.get(row._chipId);
          if (canonicalLabel !== undefined) {
            // Respect user edits: only reset if the user hasn't changed the label
            const userEdited = row._chipLabel !== undefined && row.subprojectName !== row._chipLabel;
            if (!userEdited && (row.subprojectName !== canonicalLabel || row._chipLabel !== canonicalLabel)) {
              changed = true;
              return { ...row, subprojectName: canonicalLabel, _chipLabel: canonicalLabel };
            }
          }
        }
        if (row._rowType === 'projectTask') {
          const chipId = row._chipId || (row.id?.startsWith('chip-task-') ? row.id.slice('chip-task-'.length) : null);
          if (chipId) {
            const shortLabel = chipShortLabelMap.get(chipId);
            const chip = chips.find(c => c.id === chipId);
            if (chip && shortLabel !== undefined) {
              const estimateLabel = minutesToEstimateLabel(chip.durationMinutes);
              const timeVal = chip.durationMinutes ? formatMinutesToHHmm(chip.durationMinutes) : '';
              const canonicalRecurring = 'true';

              // Per-field user-edit detection.
              // A field is considered user-edited when its _original* stamp exists and
              // the current row value has diverged from that stamp. Mirrors the
              // _chipLabel pattern used on the subproject header row above.
              // Rows created before this stamping was added have undefined stamps,
              // which means their first sync behaves like the old unconditional overwrite
              // (one-time migration cost — same behavior as the header row pattern).
              const taskEdited = row._originalTask !== undefined && row.task !== row._originalTask;
              const estimateEdited = row._originalEstimate !== undefined && row.estimate !== row._originalEstimate;
              const timeValueEdited = row._originalTimeValue !== undefined && row.timeValue !== row._originalTimeValue;
              const recurringEdited = row._originalRecurring !== undefined && row.recurring !== row._originalRecurring;

              const nextTask = taskEdited ? row.task : shortLabel;
              const nextEstimate = estimateEdited ? row.estimate : estimateLabel;
              const nextTimeValue = timeValueEdited ? row.timeValue : timeVal;
              const nextRecurring = recurringEdited ? row.recurring : canonicalRecurring;

              // Only restamp _original* for fields the user has NOT edited.
              // Edited fields keep their old stamp so they stay protected on future syncs.
              const nextOriginalTask = taskEdited ? row._originalTask : shortLabel;
              const nextOriginalEstimate = estimateEdited ? row._originalEstimate : estimateLabel;
              const nextOriginalTimeValue = timeValueEdited ? row._originalTimeValue : timeVal;
              const nextOriginalRecurring = recurringEdited ? row._originalRecurring : canonicalRecurring;

              const needsUpdate =
                row._chipId !== chipId ||
                row.task !== nextTask ||
                row.estimate !== nextEstimate ||
                row.timeValue !== nextTimeValue ||
                row.recurring !== nextRecurring ||
                row._originalTask !== nextOriginalTask ||
                row._originalEstimate !== nextOriginalEstimate ||
                row._originalTimeValue !== nextOriginalTimeValue ||
                row._originalRecurring !== nextOriginalRecurring;

              if (needsUpdate) {
                changed = true;
                return {
                  ...row,
                  _chipId: chipId,
                  task: nextTask,
                  estimate: nextEstimate,
                  timeValue: nextTimeValue,
                  recurring: nextRecurring,
                  _originalTask: nextOriginalTask,
                  _originalEstimate: nextOriginalEstimate,
                  _originalTimeValue: nextOriginalTimeValue,
                  _originalRecurring: nextOriginalRecurring,
                };
              }
            }
          }
        }
        return row;
      });
      // Insert task rows for any chip headers that are still missing one
      const existingChipTaskIds = new Set(
        newData
          .filter(r => r._rowType === 'projectTask' && (r._chipId || r.id?.startsWith('chip-task-')))
          .map(r => r._chipId || r.id.slice('chip-task-'.length))
      );
      chips.forEach(chip => {
        if (!chip.projectNickname || existingChipTaskIds.has(chip.id)) return;
        const key = chipGroupKey(chip);
        const headerIndex = newData.findIndex(r => r._rowType === 'subprojectHeader' && (r._chipGroupKey === key || r._chipId === chip.id));
        if (headerIndex === -1) return;
        const chipGroupId = newData[headerIndex].groupId;
        const shortLabel = chipShortLabelMap.get(chip.id);
        const estimateLabel = minutesToEstimateLabel(chip.durationMinutes);
        const timeVal = chip.durationMinutes ? formatMinutesToHHmm(chip.durationMinutes) : '';
        const recurringInitial = 'true';
        const taskRow = {
          id: `chip-task-${chip.id}`,
          _rowType: 'projectTask',
          _chipId: chip.id,
          parentGroupId: chipGroupId,
          projectNickname: chip.projectNickname,
          projectId: chip.projectId ?? null,
          checkbox: false,
          project: chip.projectNickname,
          subproject: '',
          status: '-',
          task: shortLabel,
          recurring: recurringInitial,
          estimate: estimateLabel,
          timeValue: timeVal,
          notes: loadChipTaskNote(chip.id),
          // Stamps of the last canonical values written from Plan.
          // Mirrors the _chipLabel pattern on the subproject header row.
          _originalTask: shortLabel,
          _originalEstimate: estimateLabel,
          _originalTimeValue: timeVal,
          _originalRecurring: recurringInitial,
          ...createEmptyDayColumns(totalDays),
        };
        newData.splice(headerIndex + 1, 0, taskRow);
        changed = true;
      });
      return changed ? newData : prevData;
    });
  }, [totalDays]);

  // Catch-up reset: when the System page mounts and the async chip load
  // resolves, check whether a Send to System happened since the last reset
  // and, if so, place the chip task rows. Pre-Supabase this could run on
  // mount with empty deps because chips were loaded synchronously; now we
  // have to wait for tacticsChips to populate, so the dep tracks chip
  // identity. lastResetTsRef de-dupes so we don't reset on every chip-state
  // change.
  useEffect(() => {
    if (!tacticsChips || tacticsChips.length === 0) return undefined;
    let cancelled = false;
    getSendToSystemTimestamp(currentYear).then((ts) => {
      if (cancelled) return;
      if (ts && ts !== lastResetTsRef.current) {
        lastResetTsRef.current = ts;
        setSentToSystem(true);
        resetSubprojectLabels(tacticsChips);
      }
    }).catch((err) => {
      console.error('Failed to read send-to-system timestamp', err);
    });
    return () => {
      cancelled = true;
    };
  }, [tacticsChips, currentYear, resetSubprojectLabels]);

  // Handle the live "Send to System" event — reload all tactics data from storage
  useEffect(() => {
    const handler = (event) => {
      // H3: if the event is tagged with a year, only react when it matches
      // the System page's current year. Untagged events pass through for
      // backwards compatibility.
      const eventYear = event?.detail?.__eventYear;
      if (eventYear != null && eventYear !== currentYear) return;
      // The timestamp read is async post helper #4 port. Fire-and-forget
      // (no await) is acceptable here because event handlers can't be
      // awaited by their dispatchers anyway, and the lastResetTsRef
      // update + setSentToSystem just need to happen before the user
      // notices anything missing.
      setSentToSystem(true);
      getSendToSystemTimestamp(currentYear).then((ts) => {
        lastResetTsRef.current = ts;
      }).catch((err) => {
        console.error('Failed to read send-to-system timestamp in event handler', err);
      });
      // Reload tactics data from storage so System reflects what was just sent.
      // The async load returns the freshly loaded chips; we both set state
      // AND pass them to resetSubprojectLabels (which is what places the
      // chip task rows under their headers — skipping it leaves tasks
      // invisible on the page).
      loadEnrichedChips(currentYear).then((freshChips) => {
        setTacticsChips(freshChips);
        resetSubprojectLabels(freshChips);
      });
      setMetricsLoaded(false);
      loadMetricsData(currentYear).then((freshMetrics) => {
        setMetricsData(freshMetrics);
        setMetricsLoaded(true);
      });
    };
    window.addEventListener(TACTICS_SEND_TO_SYSTEM_EVENT, handler);
    return () => window.removeEventListener(TACTICS_SEND_TO_SYSTEM_EVENT, handler);
  }, [currentYear, resetSubprojectLabels]);

  // Calculate month spans for header
  const monthSpans = useMemo(() => {
    const spans = [];
    let currentMonth = null;
    let currentSpan = 0;

    dates.forEach((date, index) => {
      const monthLabel = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

      if (monthLabel !== currentMonth) {
        if (currentMonth !== null) {
          spans.push({ label: currentMonth, span: currentSpan });
        }
        currentMonth = monthLabel;
        currentSpan = 1;
      } else {
        currentSpan++;
      }

      // Push final span
      if (index === dates.length - 1) {
        spans.push({ label: currentMonth, span: currentSpan });
      }
    });

    return spans;
  }, [dates]);

  // Calculate number of weeks
  const weeksCount = Math.ceil(totalDays / 7);

  // Calculate sizes based on scale. Base cell size matches the design
  // handover (reference/SystemView.jsx: ROW_H 24 + task-cell fontSize 12.5)
  // -- was 14px, which read noticeably larger than the compact editorial
  // density the design calls for at the same 24px row height.
  const rowHeight = Math.round(24 * sizeScale);
  const cellFontSize = Math.round(12.5 * sizeScale);
  const headerFontSize = Math.round(12 * sizeScale);
  const gripIconSize = Math.round(16 * sizeScale);

  // All column IDs in order (used throughout the component)
  // Fixed columns (A-H) + day columns (starting from I)
  const allColumnIds = useMemo(() => {
    const fixed = ['checkbox', 'project', 'subproject', 'status', 'task', 'recurring', 'estimate', 'timeValue'];
    const days = Array.from({ length: totalDays }, (_, i) => `day-${i}`);
    return [...fixed, ...days];
  }, [totalDays]);

  // IMPORTANT: Edit state hook must be called BEFORE useSpreadsheetSelection
  // because useSpreadsheetSelection needs setEditingCell and setEditValue
  const {
    editingCell,
    editValue,
    setEditingCell,
    setEditValue,
    handleEditComplete,
    handleEditCancel,
    handleEditKeyDown,
  } = useEditState({
    data,
    setData,
    totalDays,
    executeCommand,
    // getCellKey is defined below, but we need to pass it somehow
    // For now, create a temporary function that will be replaced
    getCellKey: (rowId, columnId) => `${rowId}|${columnId}`,
    setSelectedCells,
    setAnchorCell,
  });

  // Inline tagline edits on a project header row also write back to
  // projects.project_tagline (the source of truth the Goal page shows and
  // the header-row sync above reads), so the edit survives the next sync
  // instead of being reverted to the Goal page's value.
  const handleEditCompleteWithTaglineSync = useCallback((rowId, columnId, newValue, options) => {
    handleEditComplete(rowId, columnId, newValue, options);
    if (columnId !== 'projectTagline') return;
    const row = latestDataRef.current.find(r => r.id === rowId);
    if (row?._rowType === 'projectHeader' && row.projectId) {
      saveProjectTagline(row.projectId, newValue, currentYear);
    }
  }, [handleEditComplete, currentYear]);

  // Mirror editingCell into the ref read by the realtime refresh timer
  // (declared above, before the realtime effect).
  useEffect(() => {
    editingCellRef.current = editingCell;
  }, [editingCell]);

  // Cell and row selection handlers
  const selection = useSpreadsheetSelection({
    data,
    allColumnIds,
    selectedCells,
    setSelectedCells,
    selectedRows,
    setSelectedRows,
    anchorCell,
    setAnchorCell,
    anchorRow,
    setAnchorRow,
    isDragging,
    setIsDragging,
    dragStartCell,
    setDragStartCell,
    editingCell,
    setEditingCell,
    setEditValue,
  });

  const {
    getCellKey,
    isCellSelected,
    getCellSelectionEdges,
    hasMultiCellSelection,
    getRowRange,
    getCellRange,
    handleRowNumberClick,
    handleCellMouseDown,
    handleCellMouseEnter,
    handleMouseUp,
    handleCellDoubleClick,
  } = selection;

  // Programmatic single-cell select — used by the multi-status dropdown so
  // the focused instance's day cell IS the table selection (one focus ring
  // on screen), and paging the panel's chevrons moves it.
  const selectCell = useCallback((rowId, columnId) => {
    setSelectedCells(new Set([getCellKey(rowId, columnId)]));
    setAnchorCell({ rowId, columnId });
  }, [getCellKey]);

  const ROW_SELECTOR_COLUMNS = new Set(['rowNum', 'checkbox']);

  // Open the context menu for a right-click. One focus at a time: opening a
  // row menu on a row that is NOT part of the current row selection clears
  // that selection, so only the menu's target gutter stays highlighted.
  // Right-clicking within a selected block keeps it (the menu acts on the
  // whole block).
  const openContextMenu = useCallback((e, rowId, columnId) => {
    const isRowMenu = ROW_SELECTOR_COLUMNS.has(columnId);
    let effectiveSelectedRows = selectedRows;
    if (isRowMenu && !selectedRows.has(rowId)) {
      effectiveSelectedRows = new Set();
      if (selectedRows.size > 0) setSelectedRows(effectiveSelectedRows);
    }
    handleContextMenu(e, {
      rowId,
      columnId,
      cellKey: getCellKey(rowId, columnId),
      selectedCells,
      selectedRows: effectiveSelectedRows,
      contextType: isRowMenu ? 'row' : 'cell',
    });
  }, [handleContextMenu, getCellKey, selectedCells, selectedRows, setSelectedRows]);

  // Wrap cell mouse down to handle right-click for context menu
  const handleCellMouseDownWithContext = useCallback((e, rowId, columnId) => {
    if (e.button === 2) { // Right-click
      e.preventDefault();
      openContextMenu(e, rowId, columnId);
      return;
    }
    // Commit any active edit before moving to another cell
    if (editingCell && (editingCell.rowId !== rowId || editingCell.columnId !== columnId)) {
      handleEditComplete(editingCell.rowId, editingCell.columnId, editValue);
    }
    handleCellMouseDown(e, rowId, columnId);
  }, [handleCellMouseDown, openContextMenu, editingCell, editValue, handleEditComplete]);

  // Handle context menu event (right-click) to prevent default browser menu
  const handleCellContextMenu = useCallback((e, rowId, columnId) => {
    e.preventDefault();
    openContextMenu(e, rowId, columnId);
  }, [openContextMenu]);

  // Row whose gutter opened the row context menu — used to keep that gutter
  // cell visually highlighted while the menu is up.
  const contextMenuTargetRowId = (contextMenu.isOpen && contextMenu.contextType === 'row')
    ? contextMenu.rowId
    : null;

  // Persist System project block order (projects.system_order) after a
  // project header drag or its undo. Shared with Tacular; see stagingStorage.
  const handleProjectOrderChange = useCallback((orderedProjectIds) => {
    if (isCurrentYearArchived) return;
    saveSystemOrder(orderedProjectIds, currentYear);
  }, [currentYear, isCurrentYearArchived]);

  // Drag and drop hook
  const {
    draggedRowId,
    dropTargetRowId,
    setDraggedRowId,
    setDropTargetRowId,
    handleDragStart,
    handleDragOver,
    handleDrop,
    handleDragEnd,
  } = useDragAndDropRows({
    data,
    setData,
    selectedRows,
    executeCommand,
    onProjectOrderChange: handleProjectOrderChange,
  });

  // Note: Old drag and drop handlers removed - now using useDragAndDropRows hook

  const {
    handleCellDragStart,
    handleCellDragOver,
    handleCellDragLeave,
    handleCellDrop,
    handleCellDragEnd,
    isCellBeingDragged,
    isCellDropTarget,
    getDropTargetEdges,
  } = useDragAndDropCells({ data, setData, executeCommand, setSelectedCells, setAnchorCell, selectedCells, allColumnIds });

  // Note: Old edit handlers removed - now using useEditState hook

  // Track the last copied columns (to detect if copying from timeValue)
  const lastCopiedColumnsRef = useRef([]);

  // Copy/Paste functionality
  const handleCopy = useCallback((e) => {
    // Don't intercept copy while editing a cell — let the native input handle it
    if (editingCell) return;

    // Don't intercept copy if focus is inside an input/textarea (e.g. a modal)
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;

    e.preventDefault();

    const tsvData = handleCopyOperation({
      selectedRows,
      selectedCells,
      data,
      allColumnIds,
      editingCell,
      lastCopiedColumnsRef,
    });

    if (tsvData) {
      navigator.clipboard.writeText(tsvData);
    }
  }, [selectedCells, selectedRows, data, editingCell, allColumnIds]);

  const handlePaste = useCallback((e) => {
    // Don't intercept paste while editing a cell — let the native input handle it
    if (editingCell) return;

    // Don't intercept paste if focus is inside an input/textarea (e.g. a modal)
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;

    // Nothing selected — let the browser handle it normally
    if (selectedCells.size === 0 && selectedRows.size === 0) return;

    // Shared paste logic for both the keyboard (⌘V event) and the context
    // menu Paste button (no event — clipboard read via navigator.clipboard).
    // Returns true when the paste was handled here.
    const performPaste = (pastedText) => {
      if (!pastedText) return false;

      // MULTI-PASTE: multi-line text pasted into a single Task cell offers to
      // create one task per line instead of flattening into the cell. Only
      // plain task cells qualify; subheader names, custom section labels and
      // general/unscheduled section rows keep the flatten behaviour.
      if (selectedRows.size === 0 && selectedCells.size === 1) {
        const [anchorRowId, anchorColumnId] = Array.from(selectedCells)[0].split('|');
        if (anchorColumnId === 'task') {
          const lines = pastedText
            .split(/\r\n|\r|\n/)
            .map(line => line.trim())
            .filter(line => line !== '');
          if (lines.length > 1) {
            const row = data.find(r => r.id === anchorRowId);
            const generalUnscheduledTypes = ['projectGeneral', 'projectUnscheduled', 'subprojectGeneral', 'subprojectUnscheduled',
              'archivedProjectGeneral', 'archivedProjectUnscheduled'];
            const isPlainTaskCell = !!row
              && row._rowType !== 'subprojectHeader'
              && !row.subprojectLabel
              && !generalUnscheduledTypes.includes(row._rowType ?? '');
            if (isPlainTaskCell) {
              setMultiPastePrompt({ lines, anchorRowId });
              return true;
            }
          }
        }
      }

      const command = handlePasteOperation({
        pastedText,
        selectedRows,
        selectedCells,
        data,
        allColumnIds,
        editingCell,
        lastCopiedColumns: lastCopiedColumnsRef.current,
        setData,
      });

      if (command) {
        executeCommand(command);
        return true;
      }
      return false;
    };

    if (e?.clipboardData) {
      const pastedText = e.clipboardData.getData('text');
      if (performPaste(pastedText)) {
        e.preventDefault();
      }
    } else {
      // Context menu path: no clipboard event, read the clipboard directly.
      navigator.clipboard.readText().then(performPaste).catch(() => {});
    }
  }, [selectedCells, selectedRows, data, editingCell, executeCommand, allColumnIds]);

  // Handle global mouse up to end drag selection
  useEffect(() => {
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseUp]);

  // Delete rows entirely (remove from data array)
  const handleDeleteRows = useCallback(() => {
    if (selectedRows.size === 0) return;

    // Expand selection to include all child rows of any selected project/subproject headers
    const expandedRowIds = new Set(selectedRows);

    selectedRows.forEach(rowId => {
      const row = data.find(r => r.id === rowId);
      if (!row) return;

      if (row._rowType === 'projectHeader') {
        // For project headers, collect all child rows recursively
        const groupsToExpand = [row.groupId];
        while (groupsToExpand.length > 0) {
          const groupId = groupsToExpand.pop();
          data.forEach(r => {
            if (r.parentGroupId === groupId && !expandedRowIds.has(r.id)) {
              expandedRowIds.add(r.id);
              if (r.groupId) groupsToExpand.push(r.groupId);
            }
          });
        }
      }
    });

    // Store deleted rows and their positions for undo
    const deletedRows = [];
    const rowIndices = [];

    expandedRowIds.forEach(rowId => {
      const rowIndex = data.findIndex(r => r.id === rowId);
      if (rowIndex !== -1) {
        deletedRows.push({ ...data[rowIndex] });
        rowIndices.push(rowIndex);
      }
    });

    // Sort by index (descending) for proper restoration
    const sortedDeletions = deletedRows
      .map((row, i) => ({ row, index: rowIndices[i] }))
      .sort((a, b) => a.index - b.index);

    // For chip-linked subproject headers being deleted, create tombstone rows
    // so the sync effect doesn't re-insert them on next mount.
    const tombstones = sortedDeletions
      .filter(({ row }) => row._rowType === 'subprojectHeader' && row._chipId)
      .map(({ row }) => ({
        id: `deleted-chip-${row._chipId}`,
        _rowType: 'deletedChip',
        _chipId: row._chipId,
        // Group key suppresses every chip in the group (one header per group)
        _chipGroupKey: row._chipGroupKey,
      }));

    // Create command for row deletion
    const command = {
      execute: () => {
        setData(prev => {
          const newData = [...prev];
          // Remove in reverse order to maintain indices
          [...sortedDeletions].reverse().forEach(({ index }) => {
            newData.splice(index, 1);
          });
          // Add tombstones so the sync won't re-insert these chips
          tombstones.forEach(t => {
            if (!newData.some(r => r.id === t.id)) {
              newData.push(t);
            }
          });
          return newData;
        });
        // Clear selection after deletion
        setSelectedRows(new Set());
        setSelectedCells(new Set());
      },
      undo: () => {
        setData(prev => {
          const newData = prev.filter(r => !tombstones.some(t => t.id === r.id));
          // Restore in original order
          sortedDeletions.forEach(({ row, index }) => {
            newData.splice(index, 0, row);
          });
          return newData;
        });
      },
    };

    executeCommand(command);
  }, [selectedRows, data, executeCommand]);

  // Keyboard event handlers (undo/redo, delete, edit mode)
  useKeyboardHandlers({
    selectedCells,
    selectedRows,
    editingCell,
    data,
    allColumnIds,
    totalDays,
    undo,
    redo,
    executeCommand,
    setData,
    setEditingCell,
    setEditValue,
    handleDeleteRows,
    handleCopy,
    handlePaste,
  });

  // Listical menu handlers
  const toggleSortStatus = useCallback((status) => {
    setSelectedSortStatuses(prev => {
      const next = new Set(prev);
      if (next.has(status)) {
        next.delete(status);
      } else {
        next.add(status);
      }
      return next;
    });
  }, []);

  const toggleSortPlannerStatus = useCallback((status) => {
    setSelectedSortPlannerStatuses(prev => {
      const next = new Set(prev);
      if (next.has(status)) {
        next.delete(status);
      } else {
        next.add(status);
      }
      return next;
    });
  }, []);

  const handleAddTasks = useCallback(() => {
    setIsListicalMenuOpen(false);
    const count = parseInt(addTasksCount, 10);
    if (!Number.isFinite(count) || count <= 0) return;

    // Create new empty rows using the task row generator utility
    const newRows = createEmptyTaskRows(count, totalDays);

    // Determine insertion position
    // If a row is selected, insert after the last selected row
    // Otherwise, insert at the end
    let insertIndex = data.length;

    if (selectedRows.size > 0) {
      // Find the index of the last selected row
      const selectedRowIds = Array.from(selectedRows);
      const selectedIndices = selectedRowIds
        .map(rowId => data.findIndex(r => r.id === rowId))
        .filter(idx => idx !== -1)
        .sort((a, b) => b - a); // Sort descending to get the last selected row

      if (selectedIndices.length > 0) {
        insertIndex = selectedIndices[0] + 1; // Insert after the last selected row
      }
    }


    // If the insertion point is inside the Archive section, stamp the new
    // rows as archived tasks so they persist inside the archive block,
    // count toward the week's total, and show in the Archive Week panel.
    const archiveCtx = getArchiveInsertContext(data, insertIndex);
    const stampedRows = archiveCtx
      ? newRows.map(r => ({
          ...r,
          _rowType: 'projectTask',
          _isArchivedTask: true,
          parentGroupId: archiveCtx.parentGroupId,
          project: r.project || archiveCtx.project,
          projectNickname: archiveCtx.projectNickname,
        }))
      : newRows;

    // Store the insertion index for undo
    const savedInsertIndex = insertIndex;

    // Add new rows at the determined position
    const command = {
      execute: () => {
        setData(prev => {
          const newData = [...prev];
          newData.splice(savedInsertIndex, 0, ...stampedRows);
          return newData;
        });
      },
      undo: () => {
        setData(prev => {
          const newData = [...prev];
          newData.splice(savedInsertIndex, count);
          return newData;
        });
      },
    };

    executeCommand(command);
    setAddTasksCount('');
  }, [addTasksCount, totalDays, executeCommand, selectedRows, data]);

  const handleSortInbox = useCallback(() => {
    setIsListicalMenuOpen(false);

    const command = createSortInboxCommand({
      data,
      selectedSortStatuses,
      setData,
    });

    if (command) {
      executeCommand(command);
    }
  }, [data, selectedSortStatuses, executeCommand]);

  const handleSortPlanner = useCallback(() => {
    setIsListicalMenuOpen(false);

    const command = createSortPlannerCommand({
      data,
      selectedSortStatuses: selectedSortPlannerStatuses,
      setData,
    });

    if (command) {
      executeCommand(command);
    }
  }, [data, selectedSortPlannerStatuses, executeCommand]);

  const handleArchiveWeek = useCallback(() => {
    setIsListicalMenuOpen(false);

    // Guard: don't archive if the fresh metrics fetch hasn't resolved yet.
    // Without this, latestDailyMinValuesRef may hold stale cached bounds from
    // the previous session, freezing wrong quota values into the archive row.
    if (!metricsLoaded) return;

    // Get the week number from the first VISIBLE week
    // Find the first visible day column
    let firstVisibleDayIndex = 0;
    for (let i = 0; i < totalDays; i++) {
      if (visibleDayColumns[`day-${i}`] !== false) {
        firstVisibleDayIndex = i;
        break;
      }
    }

    // Calculate which week the first visible day belongs to (weeks are 0-indexed internally, but displayed as 1-indexed)
    const displayedWeekNumber = Math.floor(firstVisibleDayIndex / 7) + 1;

    // Step 1: Calculate week metadata
    // Use dates starting from the first visible day index to get the correct date range
    const visibleDates = dates.slice(firstVisibleDayIndex);
    const weekRange = calculateWeekRange(visibleDates);

    const weekNumber = calculateWeekNumber(startDate, new Date(), displayedWeekNumber, currentYear);

    // Step 2: Create archive week row with grouping.
    // Use closure values (dailyMinValues, dailyMaxValues) which are guaranteed
    // fresh because they are in the useCallback dep array — the callback is
    // recreated whenever either value changes. The refs lag by one frame (they
    // are updated in a useEffect that runs after paint), so using them here
    // would capture stale bounds right after a metrics reload.
    const archiveWeekRow = createArchiveWeekRow({
      weekRange,
      weekNumber,
      dailyMinValues,
      dailyMaxValues,
      totalDays,
      startDayIndex: firstVisibleDayIndex,
    });

    // If the user has given this week a custom name, use it in the archive label
    const customWeekName = weekNames[displayedWeekNumber];
    if (customWeekName) {
      archiveWeekRow.archiveWeekLabel = `Year ${weekNumber.year}, ${customWeekName}`;
    }

    // Freeze the calendar week's user-given name (week_names map) onto the
    // archive row at archive time. Later renames in planner_settings must not
    // change what this archive week shows — the panel reads only this copy.
    // Persists automatically via the archived_weeks snapshot round-trip.
    archiveWeekRow.archiveCalendarWeekName = customWeekName || null;

    // Step 3: Copy project structure as archived (including subproject sections)
    const projectRows = data.filter(row =>
      row._rowType === 'projectHeader' ||
      row._rowType === 'projectGeneral' ||
      row._rowType === 'projectUnscheduled'
    );
    const subprojectRows = data.filter(row =>
      row._rowType === 'subprojectGeneral' ||
      row._rowType === 'subprojectUnscheduled'
    );
    // Area assignments resolve by projectId from staging, exactly like the
    // weekly quotas — frozen onto each archived project header as archivedArea.
    const projectAreaById = new Map();
    projectInfoById.forEach((info, id) => projectAreaById.set(id, info?.area ?? null));
    const archivedProjects = createArchivedProjectStructure(projectRows, subprojectRows, archiveWeekRow.id, totalDays, projectWeeklyQuotas, projectIdByNickname, projectAreaById);

    // Step 4: Collect non-recurring Done/Abandoned tasks
    // Scoped to the week being archived: a task scheduled in a different
    // week (e.g. Done work sitting in week two) must not be swept into this
    // week's archive just because its status matches. Genuinely unscheduled
    // tasks (no day value at all) have no week of their own and still
    // archive with whichever week is being archived, as before.
    // Tasks that also have day values in OTHER weeks are snapshotted (below)
    // instead of moved whole, so their other-week values stay in the plan.
    const nonRecurringTasks = collectTasksForArchive(data, task =>
      ARCHIVE_SWEEP_STATUSES.includes(task.status) && !task.recurring &&
      isTaskInArchivedWeek(task, firstVisibleDayIndex, totalDays) &&
      !taskHasDayOutsideRange(task, firstVisibleDayIndex, totalDays)
    );

    // Step 5: Snapshot recurring Done/Abandoned tasks
    // Recurring tasks, plus non-recurring tasks spanning multiple weeks:
    // both are copied into the archive (this week's values only) while the
    // live row keeps its other weeks and gets this week cleared by
    // resetRecurringTasks.
    const recurringTasks = collectTasksForArchive(data, task =>
      ARCHIVE_SWEEP_STATUSES.includes(task.status) &&
      (task.recurring || taskHasDayOutsideRange(task, firstVisibleDayIndex, totalDays)) &&
      isTaskInArchivedWeek(task, firstVisibleDayIndex, totalDays)
    );
    const recurringSnapshots = recurringTasks.map(task =>
      snapshotRecurringTask(task, firstVisibleDayIndex, totalDays));

    // Step 6: Store original data for undo
    const originalData = data;
    const originalCollapsedGroups = collapsedGroups;

    // Step 7: Create command for undo/redo support
    const archiveCommand = {
      execute: () => {
        setData(prevData => {
          // Insert archive week row
          let newData = insertArchiveRow(prevData, archiveWeekRow);

          // Insert archived project structure
          newData = insertArchivedProjects(newData, archivedProjects, archiveWeekRow.id);

          // IMPORTANT: Reset recurring tasks BEFORE inserting snapshots
          // This ensures the original recurring tasks are reset but snapshots keep their status
          newData = resetRecurringTasks(newData, totalDays, firstVisibleDayIndex);

          // Move non-recurring tasks to archive (already removed from original positions)
          newData = moveTasksToArchive(newData, nonRecurringTasks, archiveWeekRow.id);

          // Insert recurring task snapshots (these preserve their original status)
          newData = insertRecurringSnapshots(newData, recurringSnapshots, archiveWeekRow.id);

          return newData;
        });

        // Archived weeks start fully unfurled: make sure neither the new week
        // nor any of its archived project groups are in the collapsed set.
        setCollapsedGroups(prev => {
          const next = new Set(prev);
          next.delete(archiveWeekRow.id);
          archivedProjects.forEach(row => {
            if (row.groupId) next.delete(row.groupId);
          });
          return next;
        });
      },
      undo: () => {
        setData(originalData);
        setCollapsedGroups(originalCollapsedGroups);
      }
    };

    executeCommand(archiveCommand);
  }, [data, dates, startDate, dailyMinValues, dailyMaxValues, totalDays, executeCommand, collapsedGroups, visibleDayColumns, projectWeeklyQuotas, projectIdByNickname, projectInfoById, metricsLoaded, weekNames]);

  const handleHideWeek = useCallback(() => {
    setIsListicalMenuOpen(false);

    // Hide the leftmost 7 visible day columns (closest to columns A-H).
    // Uses index-based scanning so that days absent from the object are
    // treated as visible (consistent with TanStack column visibility).
    setVisibleDayColumns(prev => {
      const newVisible = { ...prev };

      const visibleDays = [];
      for (let i = 0; i < totalDays; i++) {
        if (newVisible[`day-${i}`] !== false) visibleDays.push(i);
      }

      // Ensure at least 7 days remain visible
      const daysToHide = Math.min(7, visibleDays.length - 7);
      for (let i = 0; i < daysToHide; i++) {
        newVisible[`day-${visibleDays[i]}`] = false;
      }

      return newVisible;
    });
  }, [totalDays]);

  const handleShowWeek = useCallback(() => {
    setIsListicalMenuOpen(false);

    // Reveal the week immediately before the current visible window.
    // This is the exact inverse of handleHideWeek, which always hides the
    // leftmost visible 7 days — so show week finds the first visible day and
    // restores the 7 days just before it.
    setVisibleDayColumns(prev => {
      const newVisible = { ...prev };

      const firstVisibleDay = Array.from({ length: totalDays }, (_, i) => i)
        .find(i => newVisible[`day-${i}`] !== false);

      if (firstVisibleDay == null || firstVisibleDay === 0) return newVisible; // Nothing to reveal

      const groupEnd = firstVisibleDay - 1;
      const groupStart = groupEnd - (groupEnd % 7);
      for (let i = groupStart; i <= groupEnd; i++) {
        newVisible[`day-${i}`] = true;
      }

      return newVisible;
    });
  }, [totalDays]);


  // Insert N label (subprojectGeneral) rows — used by SystemPanel
  const addLabelsWithCount = useCallback((count) => {
    // Determine insertion position and project context from selected row
    let insertIndex = data.length;
    let projectGroupId = null;
    let projectNickname = null;
    let fullProjectName = null;

    if (selectedRows.size > 0) {
      const selectedRowIds = Array.from(selectedRows);
      const selectedIndices = selectedRowIds
        .map(rowId => data.findIndex(r => r.id === rowId))
        .filter(idx => idx !== -1)
        .sort((a, b) => b - a);

      if (selectedIndices.length > 0) {
        insertIndex = selectedIndices[0] + 1;
        const selectedRow = data[selectedIndices[selectedIndices.length - 1]]; // first selected row
        if (selectedRow._rowType === 'projectHeader') {
          projectGroupId = selectedRow.groupId;
          projectNickname = selectedRow.projectNickname;
          fullProjectName = selectedRow.projectName;
        } else if (selectedRow.parentGroupId) {
          projectGroupId = selectedRow.parentGroupId;
          projectNickname = selectedRow.parentGroupId.replace('project-', '');
          const projectHeader = data.find(r => r.groupId === projectGroupId && r._rowType === 'projectHeader');
          fullProjectName = projectHeader?.projectName || projectNickname;
        }
      }
    } else if (contextMenu.rowId) {
      // Insert after the right-clicked row (mirrors addTasksWithCount), and
      // inherit the same project context so labels land in the right group.
      const rowIndex = data.findIndex(r => r.id === contextMenu.rowId);
      if (rowIndex !== -1) {
        insertIndex = rowIndex + 1;
        const clickedRow = data[rowIndex];
        if (clickedRow._rowType === 'projectHeader') {
          projectGroupId = clickedRow.groupId;
          projectNickname = clickedRow.projectNickname;
          fullProjectName = clickedRow.projectName;
        } else if (clickedRow.parentGroupId) {
          projectGroupId = clickedRow.parentGroupId;
          projectNickname = clickedRow.parentGroupId.replace('project-', '');
          const projectHeader = data.find(r => r.groupId === projectGroupId && r._rowType === 'projectHeader');
          fullProjectName = projectHeader?.projectName || projectNickname;
        }
      }
    }

    const newRows = Array.from({ length: count }, (_, i) => ({
      id: `subproject-${Date.now()}-${i}`,
      _rowType: 'subprojectGeneral',
      parentGroupId: projectGroupId,
      projectNickname: projectNickname || '',
      projectName: fullProjectName || '',
      subprojectLabel: 'New',
      rowNum: '',
      checkbox: '',
      project: '',
      subproject: '',
      status: '',
      task: '',
      recurring: '',
      estimate: '',
      timeValue: '',
      ...createEmptyDayColumns(totalDays),
    }));

    const command = {
      execute: () => {
        setData(prev => {
          const newData = [...prev];
          newData.splice(insertIndex, 0, ...newRows);
          return newData;
        });
      },
      undo: () => {
        setData(prev => {
          const newData = [...prev];
          newData.splice(insertIndex, count);
          return newData;
        });
      },
    };

    executeCommand(command);
    setSelectedRows(new Set(newRows.map(r => r.id)));
  }, [selectedRows, contextMenu.rowId, data, totalDays, executeCommand, setSelectedRows]);

  // Duplicate all currently selected rows, inserting copies after the last selected row
  const duplicateSelectedRows = useCallback(() => {
    if (selectedRows.size === 0) return;

    // Get selected rows sorted by their position in data
    const selectedEntries = Array.from(selectedRows)
      .map(rowId => ({ rowId, index: data.findIndex(r => r.id === rowId) }))
      .filter(e => e.index !== -1)
      .sort((a, b) => a.index - b.index);

    if (selectedEntries.length === 0) return;

    const SKIP_TYPES = new Set([
      '_isMonthRow', '_isWeekRow', '_isDayRow', '_isDayOfWeekRow',
      '_isDailyMinRow', '_isDailyMaxRow', '_isDailyTotalRow', '_isFilterRow', '_isInboxRow', '_isArchiveRow',
    ]);

    const duplicatedRows = selectedEntries
      .map(({ index }) => {
        const row = data[index];
        // Skip structural rows
        if (Object.keys(row).some(k => SKIP_TYPES.has(k) && row[k]) || row._rowType === 'archiveHeader') return null;

        const nameField =
          row._rowType === 'projectHeader' ? 'projectName' :
          row._rowType === 'subprojectHeader' ? 'subprojectName' :
          (row._rowType === 'subprojectGeneral' || row._rowType === 'subprojectUnscheduled') ? 'subprojectLabel' :
          (row._rowType === 'projectGeneral' || row._rowType === 'projectUnscheduled') ? 'sectionLabel' :
          'task';

        const fallbackLabel =
          row._rowType === 'projectGeneral' || row._rowType === 'subprojectGeneral' ? 'General' :
          row._rowType === 'projectUnscheduled' || row._rowType === 'subprojectUnscheduled' ? 'Unscheduled' : '';

        const currentName = row[nameField] || fallbackLabel;
        const trailingNumber = currentName.match(/\s(\d+)$/);
        const nextName = trailingNumber
          ? `${currentName.slice(0, -trailingNumber[0].length)} ${parseInt(trailingNumber[1], 10) + 1}`
          : `${currentName} 1`.trimStart();

        return {
          ...row,
          id: `row-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
          _chipId: undefined,
          groupId: row._rowType === 'subprojectHeader'
            ? `group-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
            : row.groupId,
          [nameField]: nextName,
        };
      })
      .filter(Boolean);

    if (duplicatedRows.length === 0) return;

    // Insert after the last selected row
    const insertIndex = selectedEntries[selectedEntries.length - 1].index + 1;
    const count = duplicatedRows.length;

    const command = {
      execute: () => {
        setData(prev => {
          const newData = [...prev];
          newData.splice(insertIndex, 0, ...duplicatedRows);
          return newData;
        });
      },
      undo: () => {
        setData(prev => {
          const newData = [...prev];
          newData.splice(insertIndex, count);
          return newData;
        });
      },
    };

    executeCommand(command);
    setSelectedRows(new Set(duplicatedRows.map(r => r.id)));
  }, [selectedRows, data, executeCommand, setSelectedRows]);

  const handleDuplicateRow = useCallback(() => {
    setIsListicalMenuOpen(false);

    // Determine which row to duplicate: prefer selected rows, fall back to context menu row
    const targetRowId = selectedRows.size > 0
      ? Array.from(selectedRows)[0]
      : contextMenu.rowId;

    if (!targetRowId) return;

    const selectedRowIndex = data.findIndex(r => r.id === targetRowId);

    if (selectedRowIndex === -1) return;

    const selectedRow = data[selectedRowIndex];

    // Don't duplicate auto-generated structural rows (calendar rows, filters, archive)
    if (selectedRow._isMonthRow || selectedRow._isWeekRow || selectedRow._isDayRow ||
        selectedRow._isDayOfWeekRow || selectedRow._isDailyMinRow || selectedRow._isDailyMaxRow ||
        selectedRow._isDailyTotalRow || selectedRow._isFilterRow || selectedRow._isInboxRow || selectedRow._isArchiveRow ||
        selectedRow._rowType === 'archiveHeader') {
      return;
    }

    // Determine which field holds the row's display name
    const nameField =
      selectedRow._rowType === 'projectHeader' ? 'projectName' :
      selectedRow._rowType === 'subprojectHeader' ? 'subprojectName' :
      (selectedRow._rowType === 'subprojectGeneral' || selectedRow._rowType === 'subprojectUnscheduled') ? 'subprojectLabel' :
      (selectedRow._rowType === 'projectGeneral' || selectedRow._rowType === 'projectUnscheduled') ? 'sectionLabel' :
      'task';

    // Increment the name Google-Sheets-style: "Foo" → "Foo 1", "Foo 1" → "Foo 2"
    // Fall back to the rendered label for rows whose name field is typically empty
    const fallbackLabel =
      selectedRow._rowType === 'projectGeneral' || selectedRow._rowType === 'subprojectGeneral' ? 'General' :
      selectedRow._rowType === 'projectUnscheduled' || selectedRow._rowType === 'subprojectUnscheduled' ? 'Unscheduled' :
      '';
    const currentName = selectedRow[nameField] || fallbackLabel;
    const trailingNumber = currentName.match(/\s(\d+)$/);
    const nextName = trailingNumber
      ? `${currentName.slice(0, -trailingNumber[0].length)} ${parseInt(trailingNumber[1], 10) + 1}`
      : `${currentName} 1`.trimStart();

    const duplicatedRow = {
      ...selectedRow,
      id: `row-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
      // Clear chip linkage so the duplicate is independent of Tactics sync
      _chipId: undefined,
      groupId: selectedRow._rowType === 'subprojectHeader'
        ? `group-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
        : selectedRow.groupId,
      [nameField]: nextName,
    };

    // Store the insertion index for undo (insert right after the selected row)
    const insertIndex = selectedRowIndex + 1;

    // Create command for undo/redo support
    const command = {
      execute: () => {
        setData(prev => {
          const newData = [...prev];
          newData.splice(insertIndex, 0, duplicatedRow);
          return newData;
        });
      },
      undo: () => {
        setData(prev => {
          const newData = [...prev];
          newData.splice(insertIndex, 1);
          return newData;
        });
      },
    };

    executeCommand(command);
  }, [selectedRows, contextMenu.rowId, data, executeCommand]);

  const handleAddWeek = useCallback(() => {
    setIsListicalMenuOpen(false);

    // Add 7 days to totalDays
    setTotalDays(prev => prev + 7);
  }, [setTotalDays]);

  const addWeeksWithCount = useCallback((count) => {
    setTotalDays(prev => prev + 7 * count);
    // Scroll to reveal the newly added week after the DOM updates
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (tableBodyRef.current) {
          tableBodyRef.current.scrollTo({ left: tableBodyRef.current.scrollWidth, behavior: 'smooth' });
        }
      });
    });
  }, [setTotalDays, tableBodyRef]);

  const removeWeek = useCallback(() => {
    setTotalDays(prev => Math.max(7, prev - 7));
  }, [setTotalDays]);

  // Add tasks logic (separated from UI)
  const addTasksWithCount = useCallback((count) => {
    // Determine insertion position
    let insertIndex = data.length;

    if (selectedRows.size > 0) {
      // Find the index of the last selected row
      const selectedRowIds = Array.from(selectedRows);
      const selectedIndices = selectedRowIds
        .map(rowId => data.findIndex(r => r.id === rowId))
        .filter(idx => idx !== -1)
        .sort((a, b) => b - a);

      if (selectedIndices.length > 0) {
        insertIndex = selectedIndices[0] + 1;
      }
    } else if (contextMenu.rowId) {
      // Insert after the right-clicked row
      const rowIndex = data.findIndex(r => r.id === contextMenu.rowId);
      if (rowIndex !== -1) {
        insertIndex = rowIndex + 1;
      }
    }

    // Create the new empty rows
    const newRows = createEmptyTaskRows(count, totalDays);

    // If the insertion point is inside the Archive section, stamp the new
    // rows as archived tasks so they persist inside the archive block,
    // count toward the week's total, and show in the Archive Week panel.
    const archiveCtx = getArchiveInsertContext(data, insertIndex);
    const stampedRows = archiveCtx
      ? newRows.map(r => ({
          ...r,
          _rowType: 'projectTask',
          _isArchivedTask: true,
          parentGroupId: archiveCtx.parentGroupId,
          project: r.project || archiveCtx.project,
          projectNickname: archiveCtx.projectNickname,
        }))
      : newRows;

    const command = {
      execute: () => {
        setData(prev => {
          const newData = [...prev];
          newData.splice(insertIndex, 0, ...stampedRows);
          return newData;
        });
      },
      undo: () => {
        setData(prev => {
          const newData = [...prev];
          newData.splice(insertIndex, count);
          return newData;
        });
      },
    };

    executeCommand(command);
    setSelectedRows(new Set(stampedRows.map(r => r.id)));
  }, [selectedRows, contextMenu.rowId, data, totalDays, executeCommand, setSelectedRows]);

  // Multi-line paste confirmed: line 1 fills the anchor Task cell and each
  // remaining line becomes a new task row inserted directly below it. Status
  // stays the default ('-') so the usual auto-status logic applies; every
  // other column starts blank. One command, one undo step.
  const handleMultiPasteConfirm = useCallback(() => {
    if (!multiPastePrompt) return;
    const { lines, anchorRowId } = multiPastePrompt;
    setMultiPastePrompt(null);

    const anchorIndex = data.findIndex(r => r.id === anchorRowId);
    if (anchorIndex === -1) return;
    const anchorRow = data[anchorIndex];

    const cappedLines = lines.slice(0, MULTI_PASTE_MAX_TASKS);
    const [firstLine, ...restLines] = cappedLines;

    const oldTask = anchorRow.task || '';
    const nowIso = new Date().toISOString();
    const stampAnchorCreatedAt = !anchorRow.taskCreatedAt && !oldTask && !!firstLine;
    const oldAnchorCreatedAt = anchorRow.taskCreatedAt ?? null;

    const insertIndex = anchorIndex + 1;
    const emptyRows = createEmptyTaskRows(restLines.length, totalDays);

    // Mirror addTasksWithCount: rows inserted inside the Archive section are
    // stamped as archived tasks so they persist inside the archive block.
    const archiveCtx = getArchiveInsertContext(data, insertIndex);
    const newRows = emptyRows.map((r, i) => ({
      ...r,
      task: restLines[i],
      taskCreatedAt: nowIso,
      ...(archiveCtx ? {
        _rowType: 'projectTask',
        _isArchivedTask: true,
        parentGroupId: archiveCtx.parentGroupId,
        project: r.project || archiveCtx.project,
        projectNickname: archiveCtx.projectNickname,
      } : {}),
    }));

    const command = {
      execute: () => {
        setData(prev => {
          const next = prev.map(r => r.id === anchorRowId
            ? { ...r, task: firstLine, ...(stampAnchorCreatedAt ? { taskCreatedAt: nowIso } : {}) }
            : r);
          const idx = next.findIndex(r => r.id === anchorRowId);
          next.splice(idx === -1 ? insertIndex : idx + 1, 0, ...newRows);
          return next;
        });
      },
      undo: () => {
        setData(prev => {
          const newIds = new Set(newRows.map(r => r.id));
          return prev
            .filter(r => !newIds.has(r.id))
            .map(r => r.id === anchorRowId
              ? { ...r, task: oldTask, ...(stampAnchorCreatedAt ? { taskCreatedAt: oldAnchorCreatedAt } : {}) }
              : r);
        });
      },
    };

    executeCommand(command);

    // Log the anchor row's name change like a normal Task cell edit. The new
    // rows are not yet persisted, so no events are written for them —
    // taskCreatedAt is stamped locally and persisted with the debounced save.
    if (firstLine !== oldTask) {
      writeTaskEvent(anchorRowId, { field: 'task_name', oldValue: oldTask || null, newValue: firstLine });
    }

    if (newRows.length > 0) {
      setSelectedRows(new Set(newRows.map(r => r.id)));
    }
  }, [multiPastePrompt, data, totalDays, executeCommand, setSelectedRows]);

  // System panel action events
  useEffect(() => {
    const handler = (e) => {
      const { action, count } = e.detail ?? {};
      if (action === 'removeWeek') { removeWeek(); return; }
      if (action === 'duplicateRow') { duplicateSelectedRows(); return; }
      if (action === 'hideWeek') { handleHideWeek(); return; }
      if (action === 'showWeek') { handleShowWeek(); return; }
      if (action === 'archiveWeek') { expandNextArchiveRef.current = true; handleArchiveWeek(); return; }
      if (action === 'undo') { undo(); return; }
      if (action === 'redo') { redo(); return; }
      if (action === 'zoomIn') { increaseSize(); return; }
      if (action === 'zoomOut') { decreaseSize(); return; }
      if (action === 'updateTaskField') {
        const { rowId, field, value } = e.detail;
        if (rowId && field) handleEditComplete(rowId, field, value);
        return;
      }
      if (action === 'setDayTag') {
        const { rowId, dayTag: newDay, dayTagLocked: locked } = e.detail;
        if (rowId) {
          setData(prev => prev.map(r =>
            r.id === rowId ? { ...r, dayTag: newDay ?? null, dayTagLocked: locked === true } : r
          ));
        }
        return;
      }
      if (action === 'setDayFilter') {
        setDayFilter(new Set(Array.isArray(e.detail.days) ? e.detail.days : []));
        return;
      }
      if (action === 'setProjectFilter') {
        setProjectFilter(e.detail.project ?? null);
        return;
      }
      if (action === 'sortInbox' && e.detail.statuses?.length > 0) {
        const command = createSortInboxCommand({
          data,
          selectedSortStatuses: new Set(e.detail.statuses),
          setData,
        });
        if (command) executeCommand(command);
        return;
      }
      if (!count || count < 1) return;
      if (action === 'insertTasks') addTasksWithCount(count);
      if (action === 'insertLabels') addLabelsWithCount(count);
      if (action === 'addWeeks') addWeeksWithCount(count);
    };
    window.addEventListener(SYSTEM_PANEL_ACTION_EVENT, handler);
    return () => window.removeEventListener(SYSTEM_PANEL_ACTION_EVENT, handler);
  }, [addTasksWithCount, addLabelsWithCount, addWeeksWithCount, removeWeek, duplicateSelectedRows, handleHideWeek, handleShowWeek, handleArchiveWeek, undo, redo, increaseSize, decreaseSize, data, setData, executeCommand, handleEditComplete]);

  // After a panel-triggered archive, expand the archive row and all of its
  // project groups (archived weeks always start unfurled), then scroll to
  // the bottom
  useEffect(() => {
    if (!expandNextArchiveRef.current) return;
    const latestArchive = [...data].reverse().find(r => r.archiveWeekLabel);
    if (!latestArchive) return;
    expandNextArchiveRef.current = false;

    // Find the groupIds of all archivedProjectHeader rows inside this archive week
    const archivedProjectGroupIds = data
      .filter(r => r._rowType === 'archivedProjectHeader' && r.parentGroupId === latestArchive.id)
      .map(r => r.groupId)
      .filter(Boolean);

    setCollapsedGroups(prev => {
      const next = new Set(prev);
      next.delete(latestArchive.id);                       // expand the archive week
      archivedProjectGroupIds.forEach(id => next.delete(id)); // expand project groups inside
      return next;
    });

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (tableBodyRef.current) {
          tableBodyRef.current.scrollTo({ top: tableBodyRef.current.scrollHeight, behavior: 'smooth' });
        }
      });
    });
  }, [data, setCollapsedGroups]);

  // Broadcast row selection state to SystemPanel
  useEffect(() => {
    window.dispatchEvent(new CustomEvent(SYSTEM_PANEL_SELECTION_EVENT, {
      detail: { hasSelection: selectedRows.size > 0 },
    }));
  }, [selectedRows]);

  // Broadcast page scale to SystemPanel
  useEffect(() => {
    window.dispatchEvent(new CustomEvent(SYSTEM_PANEL_SCALE_EVENT, { detail: { scale: sizeScale } }));
  }, [sizeScale]);

  // Broadcast day filter state to SystemPanel
  useEffect(() => {
    window.dispatchEvent(new CustomEvent(SYSTEM_PANEL_DAY_FILTER_EVENT, { detail: { dayFilter: Array.from(dayFilter) } }));
  }, [dayFilter]);

  // Broadcast project filter state to SystemPanel
  useEffect(() => {
    window.dispatchEvent(new CustomEvent(SYSTEM_PANEL_PROJECT_FILTER_EVENT, { detail: { projectFilter } }));
  }, [projectFilter]);

  // Broadcast available projects to SystemPanel from projectHeader rows (which carry projectNickname + projectName)
  useEffect(() => {
    const projects = [];
    for (const row of data) {
      if (row._rowType === 'projectHeader' && row.projectNickname) {
        projects.push({ nickname: row.projectNickname, displayName: row.projectName || row.projectNickname });
      }
    }
    window.dispatchEvent(new CustomEvent(SYSTEM_PANEL_PROJECT_NAMES_EVENT, { detail: { projects } }));
  }, [data]);

  // Checkbox input class for menu
  const checkboxInputClass = 'h-4 w-4 cursor-pointer rounded border-gray-300 text-emerald-700 focus:ring-emerald-600';

  // Column definitions
  const columns = usePlannerColumns({ totalDays, scale: sizeScale });

  const scaledColumnSizing = useMemo(() => (
    Object.fromEntries(
      Object.entries(columnSizing || {}).map(([id, w]) => [id, w * sizeScale])
    )
  ), [columnSizing, sizeScale]);

  // Resize handlers work in screen pixels (scaled space); convert back to
  // base (100%) pixels before persisting.
  const handleColumnSizingChange = useCallback((updater) => {
    setColumnSizing((prevBase) => {
      const prevScaled = Object.fromEntries(
        Object.entries(prevBase || {}).map(([id, w]) => [id, w * sizeScale])
      );
      const nextScaled = typeof updater === 'function' ? updater(prevScaled) : updater;
      return Object.fromEntries(
        Object.entries(nextScaled || {}).map(([id, w]) => [id, w / sizeScale])
      );
    });
  }, [setColumnSizing, sizeScale]);

  const table = useReactTable({
    data: numberedData,
    columns,
    getCoreRowModel: getCoreRowModel(),
    enableColumnResizing: true,
    columnResizeMode: 'onChange',
    state: {
      // Column widths are STORED unscaled (base px at 100%) and scaled here
      // at render time, so zooming widens columns and a resize done while
      // zoomed persists correctly when the zoom changes back.
      columnSizing: scaledColumnSizing,
      columnPinning: {
        left: ['rowNum'], // Pin the row number column to the left
      },
      columnVisibility: {
        recurring: showRecurring,
        subproject: showSubprojects,
        ...visibleDayColumns,
      },
    },
    onColumnSizingChange: handleColumnSizingChange,
  });

  // Helper to get column width
  const getColumnWidth = useCallback((columnId) => {
    const column = table.getColumn(columnId);
    return column ? column.getSize() : 60;
  }, [table]);

  // Set up row virtualizer
  const rowVirtualizer = useVirtualizer({
    count: table.getRowModel().rows.length,
    getScrollElement: () => tableBodyRef.current,
    estimateSize: () => rowHeight, // Estimated row height in pixels
    overscan: 10, // Render 10 extra rows above and below viewport
  });

  // Force virtualizer to recalculate when rowHeight changes
  useEffect(() => {
    rowVirtualizer.measure();
  }, [rowHeight, rowVirtualizer]);

  // Expanding a collapsed archive week near the bottom of the table used to
  // reveal its rows below the current scroll position with no view change —
  // the group looked like it hadn't opened. Track the group being expanded
  // and, once its rows are back in the display list, scroll the end of the
  // revealed block into view (align 'auto' = no-op when already visible).
  const pendingExpandGroupRef = useRef(null);
  const handleToggleGroupCollapse = useCallback((groupId) => {
    if (collapsedGroups.has(groupId)) pendingExpandGroupRef.current = groupId;
    toggleGroupCollapse(groupId);
  }, [collapsedGroups, toggleGroupCollapse]);

  useEffect(() => {
    const groupId = pendingExpandGroupRef.current;
    if (!groupId || collapsedGroups.has(groupId)) return;
    pendingExpandGroupRef.current = null;
    // Only archive week groups get the scroll assist. The revealed block runs
    // from the week row to just before the next week row (or the list end) —
    // archive weeks are sequential in display order.
    const startIdx = numberedData.findIndex(
      (r) => r._rowType === 'archiveRow' && r.groupId === groupId,
    );
    if (startIdx === -1) return;
    let endIdx = numberedData.length - 1;
    for (let i = startIdx + 1; i < numberedData.length; i++) {
      if (numberedData[i]._rowType === 'archiveRow') { endIdx = i - 1; break; }
    }
    // Wait one frame so the virtualizer has picked up the new row count.
    requestAnimationFrame(() => {
      rowVirtualizer.scrollToIndex(endIdx, { align: 'auto', behavior: 'smooth' });
    });
  }, [collapsedGroups, numberedData, rowVirtualizer]);

  return (
    <div className="w-full h-screen flex flex-col overflow-hidden" style={{
      backgroundColor: '#ffffff',
      backgroundImage: [
        // Grid lines as an SVG tile rather than 1px gradient hard-stops:
        // gradient hairlines round to zero device pixels and vanish when the
        // effective DPR drops below 1 (browser zoom < 100% on a 1x monitor).
        // The SVG stroke antialiases instead, so the grid survives any zoom.
        gridSvgLayer(0.15),
      ].join(','),
      backgroundSize: '32px 32px',
      backgroundPosition: '-1px -1px',
      backgroundAttachment: 'fixed',
    }}>
      {/* Nav bar — always visible at top */}
      <div className="sticky top-0 z-20 px-4 pt-4 pb-4 shrink-0" style={{ background: 'transparent' }}>
        <NavigationBar
        onRevertArchive={!draftYear && allYears.some(y => y.status === 'archived') ? handleRevertArchive : null}
      />
      </div>

      {/* Task import panel — draft year only, disappears once non-chip tasks exist */}
      {isCurrentYearDraft && activeYear && !hasImportedTasks(data) && (
        <div className="mx-4 mb-2 shrink-0 rounded-lg border border-violet-200 bg-violet-50 px-5 py-4 flex items-center justify-between gap-6">
          <div>
            <p className="text-sm font-semibold text-violet-900">Import tasks from Year {activeYear.yearNumber}</p>
            <p className="text-xs text-violet-700">Tasks with matching projects are placed under their project. Unmatched tasks go to the inbox.</p>
          </div>
          <button
            type="button"
            onClick={handleImportTasks}
            className="shrink-0 px-4 py-2 text-sm font-semibold text-white bg-violet-600 rounded-lg hover:bg-violet-700 transition-colors"
          >
            Import
          </button>
        </div>
      )}

      <div
        className="flex-1 flex flex-col min-h-0 overflow-hidden pl-4"
        style={{
          // Reserve space for the open side panel (matches its current width,
          // including mid-drag) so the table's scroll viewport ends at the
          // panel's left edge instead of running underneath it. Falls back to
          // the page's own 16px gutter when no panel is open.
          paddingRight: panelInset > 0 ? panelInset + 8 : 16,
          // Keep the table clear of the fixed snapshot button pinned to the
          // bottom-left of the viewport (Layout's DebugSnapshotButton: 40px
          // tall + 24px bottom offset + 8px breathing room), so the last
          // visible rows are never hidden underneath it.
          paddingBottom: 72,
          transition: panelResizing ? 'none' : 'padding-right 0.25s cubic-bezier(0.4,0,0.2,1)',
        }}
      >
        <PlannerTable
          tableBodyRef={tableBodyRef}
        table={table}
        rowHeight={rowHeight}
        headerFontSize={headerFontSize}
        selectedRows={selectedRows}
        rowVirtualizer={rowVirtualizer}
        isCellSelected={isCellSelected}
        getCellSelectionEdges={getCellSelectionEdges}
        hasMultiCellSelection={hasMultiCellSelection}
        editingCell={editingCell}
        editValue={editValue}
        setEditValue={setEditValue}
        handleRowNumberClick={handleRowNumberClick}
        handleCellMouseDown={handleCellMouseDownWithContext}
        handleCellMouseEnter={handleCellMouseEnter}
        handleCellDoubleClick={handleCellDoubleClick}
        handleCellContextMenu={handleCellContextMenu}
        contextMenuTargetRowId={contextMenuTargetRowId}
        handleEditComplete={handleEditCompleteWithTaglineSync}
        handleEditCancel={handleEditCancel}
        handleEditKeyDown={handleEditKeyDown}
        draggedRowId={draggedRowId}
        dropTargetRowId={dropTargetRowId}
        handleDragStart={handleDragStart}
        handleDragOver={handleDragOver}
        handleDrop={handleDrop}
        handleDragEnd={handleDragEnd}
        handleCellDragStart={handleCellDragStart}
        handleCellDragOver={handleCellDragOver}
        handleCellDragLeave={handleCellDragLeave}
        handleCellDrop={handleCellDrop}
        handleCellDragEnd={handleCellDragEnd}
        isCellBeingDragged={isCellBeingDragged}
        isCellDropTarget={isCellDropTarget}
        getDropTargetEdges={getDropTargetEdges}
        cellFontSize={cellFontSize}
        gripIconSize={gripIconSize}
        dates={dates}
        selectCell={selectCell}
        data={data}
        selectedCells={selectedCells}
        undoStack={undoStack}
        redoStack={redoStack}
        projects={projects}
        subprojects={subprojects}
        projectSubprojectsMap={projectSubprojectsMap}
        totalDays={totalDays}
        projectWeeklyQuotas={projectWeeklyQuotas}
        projectIdByNickname={projectIdByNickname}
        projectTotals={projectTotals}
        dayColumnFilters={dayColumnFilters}
        handleDayColumnFilterToggle={handleDayColumnFilterToggle}
        filters={filters}
        onProjectFilterButtonClick={onProjectFilterButtonClick}
        onSubprojectFilterButtonClick={onSubprojectFilterButtonClick}
        onStatusFilterButtonClick={onStatusFilterButtonClick}
        onRecurringFilterButtonClick={onRecurringFilterButtonClick}
        onEstimateFilterButtonClick={onEstimateFilterButtonClick}
        collapsedGroups={collapsedGroups}
        toggleGroupCollapse={handleToggleGroupCollapse}
        archiveTotals={archiveTotals}
        weekNames={weekNames}
        onWeekNameChange={(weekNumber, name) =>
          setWeekNames(prev => ({ ...prev, [weekNumber]: name }))
        }
      />
      <FilterPanel
        projectFilterMenu={projectFilterMenu}
        projectFilterMenuRef={projectFilterMenuRef}
        projectFilterButtonRef={projectFilterButtonRef}
        projectNames={projectNames}
        selectedProjectFilters={selectedProjectFilters}
        handleProjectFilterSelect={handleProjectFilterSelect}
        closeProjectFilterMenu={closeProjectFilterMenu}
        clearProjectFilter={clearProjectFilter}
        subprojectFilterMenu={subprojectFilterMenu}
        subprojectFilterMenuRef={subprojectFilterMenuRef}
        subprojectFilterButtonRef={subprojectFilterButtonRef}
        subprojectNames={subprojectNames}
        selectedSubprojectFilters={selectedSubprojectFilters}
        handleSubprojectFilterSelect={handleSubprojectFilterSelect}
        closeSubprojectFilterMenu={closeSubprojectFilterMenu}
        clearSubprojectFilter={clearSubprojectFilter}
        statusFilterMenu={statusFilterMenu}
        statusFilterMenuRef={statusFilterMenuRef}
        statusFilterButtonRef={statusFilterButtonRef}
        statusNames={statusNames}
        selectedStatusFilters={selectedStatusFilters}
        handleStatusFilterSelect={handleStatusFilterSelect}
        closeStatusFilterMenu={closeStatusFilterMenu}
        clearStatusFilter={clearStatusFilter}
        recurringFilterMenu={recurringFilterMenu}
        recurringFilterMenuRef={recurringFilterMenuRef}
        recurringFilterButtonRef={recurringFilterButtonRef}
        recurringNames={recurringNames}
        selectedRecurringFilters={selectedRecurringFilters}
        handleRecurringFilterSelect={handleRecurringFilterSelect}
        closeRecurringFilterMenu={closeRecurringFilterMenu}
        clearRecurringFilter={clearRecurringFilter}
        estimateFilterMenu={estimateFilterMenu}
        estimateFilterMenuRef={estimateFilterMenuRef}
        estimateFilterButtonRef={estimateFilterButtonRef}
        estimateNames={estimateNames}
        selectedEstimateFilters={selectedEstimateFilters}
        handleEstimateFilterSelect={handleEstimateFilterSelect}
        closeEstimateFilterMenu={closeEstimateFilterMenu}
        clearEstimateFilter={clearEstimateFilter}
      />
      </div>

      {/* Multi-line paste confirmation */}
      <MultiPasteModal
        isOpen={!!multiPastePrompt}
        taskCount={multiPastePrompt?.lines.length ?? 0}
        maxTasks={MULTI_PASTE_MAX_TASKS}
        onClose={() => setMultiPastePrompt(null)}
        onConfirm={handleMultiPasteConfirm}
      />

      {/* Archive Year Modal */}
      <ArchiveYearModal
        isOpen={isArchiveModalOpen}
        onClose={() => setIsArchiveModalOpen(false)}
        yearNumber={activeYear?.yearNumber ?? currentYear}
      />

      {/* Context Menu */}
      <ContextMenu
        contextMenu={contextMenu}
        onClose={closeContextMenu}
        onDeleteRows={handleDeleteRows}
        onDuplicateRow={handleDuplicateRow}
        onInsertTaskRows={addTasksWithCount}
        onInsertLabelRows={addLabelsWithCount}
        onCopy={handleCopy}
        onPaste={handlePaste}
      />
    </div>
  );
}
