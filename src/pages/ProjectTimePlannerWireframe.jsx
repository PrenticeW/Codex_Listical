// Im ready to work
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useReactTable, getCoreRowModel } from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import NavigationBar from '../components/planner/NavigationBar';
import useTimelineRows from '../timeline/useTimelineRows';
import useCellSelection from '../hooks/planner/useCellSelection';
import useRowDragSelection from '../hooks/planner/useRowDragSelection';
import usePlannerFilters from '../hooks/planner/usePlannerFilters';
import usePlannerInteractions from '../hooks/planner/usePlannerInteractions';
import usePlannerRowRendering from '../hooks/planner/usePlannerRowRendering';
import FilterPanel from '../components/planner/FilterPanel';
import ProjectListicalMenu from '../components/planner/ProjectListicalMenu';
import TimelineHeader from '../components/planner/TimelineHeader';
import isBrowserEnvironment from '../utils/isBrowserEnvironment';
import { loadTacticsMetrics } from '../lib/tacticsMetricsStorage';
import { loadStagingState, STAGING_STORAGE_EVENT } from '../lib/stagingStorage';
const DAYS_OF_WEEK = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

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
const createZeroDayEntries = (count) => Array.from({ length: count }, () => '0.00');
const formatHoursValue = (value) => {
  if (!Number.isFinite(value)) return '0.00';
  return value.toFixed(2);
};
const isTaskColumnEmpty = (row) => !(row.taskName ?? '').trim();
const ROW_LABEL_BASE_STYLE = { backgroundColor: '#d9f6e0', color: '#065f46' };
const applyRowLabelStyle = (style = {}) => ({ ...style, ...ROW_LABEL_BASE_STYLE });
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
const COL_W = {
  rowLabel: 36,
  check: 24,
  project: 120,
  subprojects: 150,
  status: 120,
  task: 240,
  recurring: 80,
  estimate: 100,
  timeValue: 80,
  day: 60,
};
const ROW_H = 26;
const SORTABLE_STATUSES = ['Done', 'Scheduled', 'Not Scheduled', 'Abandoned', 'Blocked', 'On Hold'];
const SORT_INBOX_TARGET_MAP = {
  Done: 'general',
  Scheduled: 'general',
  'Not Scheduled': 'unscheduled',
  Abandoned: 'unscheduled',
  Blocked: 'unscheduled',
  'On Hold': 'unscheduled',
};
const normalizeProjectKey = (name) => (name ?? '').trim().toLowerCase();

const STATUS_COLOR_MAP = {
  'Not Scheduled': { bg: '#e5e5e5', text: '#000000' },
  Scheduled: { bg: '#ffe5a0', text: '#473821' },
  Done: { bg: '#c9e9c0', text: '#276436' },
  Abandoned: { bg: '#e8d9f3', text: '#5a3b74' },
  Blocked: { bg: '#f3c4c4', text: '#9c2f2f' },
  'On Hold': { bg: '#505050', text: '#ffffff' },
  Special: { bg: '#cce3ff', text: '#3a70b7' },
};

const getStatusColorStyle = (status) => {
  const colors = STATUS_COLOR_MAP[status] || { bg: '#ffffff', text: '#000000' };
  return { backgroundColor: colors.bg, color: colors.text };
};

const getProjectSelectStyle = (value) => {
  const isDash = !value || value === '-';
  return {
    backgroundColor: isDash ? '#ffffff' : '#e5e5e5',
    color: '#000000',
  };
};

const DARK_HEADER_STYLE = { backgroundColor: '#000000', color: '#ffffff' };
const ARCHIVE_ROW_STYLE = { backgroundColor: '#d9f6e0', color: '#000000' };
const formatDateForInput = (date) => {
  const year = date.getFullYear().toString().padStart(4, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const SETTINGS_STORAGE_KEY = 'listical-settings';
const TASK_ROWS_STORAGE_KEY = 'listical-task-rows';

const readStoredSettings = () => {
  if (!isBrowserEnvironment()) return null;
  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      columnWidths: typeof parsed.columnWidths === 'object' && parsed.columnWidths ? parsed.columnWidths : {},
      startDate: typeof parsed.startDate === 'string' ? parsed.startDate : '',
      showRecurring: typeof parsed.showRecurring === 'boolean' ? parsed.showRecurring : true,
      showSubprojects: typeof parsed.showSubprojects === 'boolean' ? parsed.showSubprojects : true,
    };
  } catch (error) {
    console.error('Failed to read Listical settings', error);
    return null;
  }
};

const readStoredTaskRows = () => {
  if (!isBrowserEnvironment()) return {};
  try {
    const raw = window.localStorage.getItem(TASK_ROWS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed;
  } catch (error) {
    console.error('Failed to read task rows', error);
    return {};
  }
};

const saveTaskRows = (rows) => {
  if (!isBrowserEnvironment()) return;
  try {
    // Only save task rows with user interaction
    const taskRowsData = {};
    rows.forEach((row) => {
      if (TASK_ROW_TYPES.has(row.type) && row.hasUserInteraction) {
        taskRowsData[row.id] = {
          taskName: row.taskName,
          projectSelection: row.projectSelection,
          subprojectSelection: row.subprojectSelection,
          status: row.status,
          estimate: row.estimate,
          timeValue: row.timeValue,
          recurring: row.recurring,
          dayEntries: row.dayEntries,
        };
      }
    });
    window.localStorage.setItem(TASK_ROWS_STORAGE_KEY, JSON.stringify(taskRowsData));
  } catch (error) {
    console.error('Failed to save task rows', error);
  }
};

export default function ProjectTimePlannerWireframe({ currentPath = '/', onNavigate = () => {} }) {
  const storedSettings = readStoredSettings();
  const defaultStartDate = useMemo(() => formatDateForInput(new Date()), []);
  const [showRecurring, setShowRecurring] = useState(storedSettings?.showRecurring ?? true);
  const [showSubprojects, setShowSubprojects] = useState(storedSettings?.showSubprojects ?? true);
  const [startDate, setStartDate] = useState(storedSettings?.startDate ?? defaultStartDate);
  const [showMaxMinRows, setShowMaxMinRows] = useState(true);
  const [isListicalMenuOpen, setIsListicalMenuOpen] = useState(false);
  const [addTasksCount, setAddTasksCount] = useState('');
  const [selectedSortStatuses, setSelectedSortStatuses] = useState(
    () => new Set(SORTABLE_STATUSES)
  );
  const [dailyBoundsMap, setDailyBoundsMap] = useState(() => new Map());
  const [officialProjects, setOfficialProjects] = useState(() => {
    const stagingState = loadStagingState();
    return stagingState?.shortlist ?? [];
  });
  const [projectWeeklyQuotas, setProjectWeeklyQuotas] = useState(() => new Map());
  const totalDays = 84;

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const readMetrics = () => {
      const metrics = loadTacticsMetrics();
      const nextBoundsMap = new Map();
      if (metrics?.dailyBounds) {
        metrics.dailyBounds.forEach((entry) => {
          const dayName = entry?.day;
          if (typeof dayName !== 'string' || !dayName) return;
          const minHours =
            typeof entry.dailyMinHours === 'number' && Number.isFinite(entry.dailyMinHours)
              ? entry.dailyMinHours
              : 0;
          const maxHours =
            typeof entry.dailyMaxHours === 'number' && Number.isFinite(entry.dailyMaxHours)
              ? entry.dailyMaxHours
              : 0;
          nextBoundsMap.set(dayName, { minHours, maxHours });
        });
      }
      setDailyBoundsMap(nextBoundsMap);

      const nextQuotasMap = new Map();
      if (metrics?.projectWeeklyQuotas && Array.isArray(metrics.projectWeeklyQuotas)) {
        metrics.projectWeeklyQuotas.forEach((quota) => {
          if (quota?.label && quota?.weeklyHours) {
            nextQuotasMap.set(quota.label, quota.weeklyHours);
          }
        });
      }
      setProjectWeeklyQuotas(nextQuotasMap);
    };
    readMetrics();
    const handleStorage = (event) => {
      if (event?.key && event.key !== 'tactics-metrics-state') return;
      readMetrics();
    };
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const handleStagingUpdate = () => {
      const stagingState = loadStagingState();
      setOfficialProjects(stagingState?.shortlist ?? []);
    };
    window.addEventListener(STAGING_STORAGE_EVENT, handleStagingUpdate);
    window.addEventListener('storage', (event) => {
      if (event?.key === 'staging-shortlist') {
        handleStagingUpdate();
      }
    });
    return () => {
      window.removeEventListener(STAGING_STORAGE_EVENT, handleStagingUpdate);
    };
  }, []);

  const createTaskRow = (base) => ({
    ...base,
    dayEntries: createEmptyDayEntries(totalDays),
    taskName: '',
    estimate: '-',
    timeValue: '0.00',
    recurring: 'Not Recurring',
    hasUserInteraction: false,
  });

  const buildInitialRows = useCallback(() => {
    const rowsConfig = [];
    const savedTaskRows = readStoredTaskRows();

    // Use official projects from staging storage - only show colored projects
    officialProjects
      .filter((project) => project.color && project.color !== null)
      .forEach((project) => {
        const projectName = project.projectName || project.text;
        const projectNickname = project.projectNickname;
        const slug = projectName.replace(/\s+/g, '-').toLowerCase();
        rowsConfig.push({ id: `${slug}-header`, type: 'projectHeader', projectName, projectNickname });
        rowsConfig.push({ id: `${slug}-general`, type: 'projectGeneral', projectName, projectNickname });

        const taskId = `${slug}-task`;
        const baseTaskRow = createTaskRow({ id: taskId, type: 'projectTask', projectName, projectNickname });
        // Merge with saved data if it exists
        const savedData = savedTaskRows[taskId];
        rowsConfig.push(savedData ? { ...baseTaskRow, ...savedData, hasUserInteraction: true } : baseTaskRow);

        rowsConfig.push({ id: `${slug}-unscheduled`, type: 'projectUnscheduled', projectName, projectNickname });
      });

    rowsConfig.push({ id: 'inbox-header', type: 'inboxHeader' });
    Array.from({ length: 20 }).forEach((_, index) => {
      const inboxId = `inbox-item-${index}`;
      const baseInboxRow = createTaskRow({ id: inboxId, type: 'inboxItem', index });
      // Merge with saved data if it exists
      const savedData = savedTaskRows[inboxId];
      rowsConfig.push(savedData ? { ...baseInboxRow, ...savedData, hasUserInteraction: true } : baseInboxRow);
    });
    rowsConfig.push({ id: 'archive-header', type: 'archiveHeader' });

    return rowsConfig;
  }, [officialProjects, totalDays]);

  // Rows are stateful so their order can be updated (e.g., by drag-and-drop).
  // A simulated mouse drag updates this array directly so TanStack Table sees the new ordering.
  const [rows, setRows] = useState(buildInitialRows);
  const [highlightedRowId, setHighlightedRowId] = useState(null);
  const [selectedRowIds, setSelectedRowIds] = useState([]);
  const [lastSelectedRowIndex, setLastSelectedRowIndex] = useState(null);
  const clearSelectionRef = useRef(() => {});
  const clearActiveCellRef = useRef(() => {});
  const selectedRowIdSet = useMemo(() => new Set(selectedRowIds), [selectedRowIds]);

  // Rebuild rows when official projects change
  useEffect(() => {
    setRows(buildInitialRows());
  }, [buildInitialRows]);

  // Save task rows to localStorage when they change
  useEffect(() => {
    if (!isBrowserEnvironment()) return;
    // Use a debounce to avoid saving on every keystroke
    const timeoutId = setTimeout(() => {
      saveTaskRows(rows);
    }, 500);
    return () => clearTimeout(timeoutId);
  }, [rows]);

  const rowIndexMap = useMemo(() => {
    const map = new Map();
    rows.forEach((row, index) => {
      if (row && row.id) {
        map.set(row.id, index);
      }
    });
    return map;
  }, [rows]);

  const handleCellClear = useCallback(
    ({ clearRowSelection = true } = {}) => {
      clearActiveCellRef.current();
      clearSelectionRef.current();
      if (clearRowSelection) {
        setSelectedRowIds([]);
        setLastSelectedRowIndex(null);
      }
    },
    [setLastSelectedRowIndex, setSelectedRowIds]
  );

  const filters = usePlannerFilters();
  const {
    activeFilterColumns,
    toggleFilterColumn,
    projectFilterMenu,
    projectFilterMenuRef,
    projectFilterButtonRef,
    selectedProjectFilters,
    handleProjectFilterSelect,
    handleProjectFilterButtonClick,
    closeProjectFilterMenu,
    statusFilterMenu,
    statusFilterMenuRef,
    statusFilterButtonRef,
    selectedStatusFilters,
    handleStatusFilterSelect,
    handleStatusFilterButtonClick,
    closeStatusFilterMenu,
    recurringFilterMenu,
    recurringFilterMenuRef,
    recurringFilterButtonRef,
    selectedRecurringFilters,
    handleRecurringFilterSelect,
    handleRecurringFilterButtonClick,
    closeRecurringFilterMenu,
    estimateFilterMenu,
    estimateFilterMenuRef,
    estimateFilterButtonRef,
    selectedEstimateFilters,
    handleEstimateFilterSelect,
    handleEstimateFilterButtonClick,
    closeEstimateFilterMenu,
  } = filters;
  const [columnWidths, setColumnWidths] = useState(storedSettings?.columnWidths ?? {});
  const [settingsLoaded, setSettingsLoaded] = useState(Boolean(storedSettings));

  useEffect(() => {
    if (settingsLoaded) return;
    const parsed = readStoredSettings();
    if (parsed) {
      setColumnWidths(parsed.columnWidths ?? {});
      if (parsed.startDate) {
        setStartDate(parsed.startDate);
      }
      setShowRecurring(parsed.showRecurring ?? true);
      setShowSubprojects(parsed.showSubprojects ?? true);
    }
    setSettingsLoaded(true);
  }, [settingsLoaded]);

  useEffect(() => {
    if (!isBrowserEnvironment()) return;
    if (!settingsLoaded) return;
    try {
      const payload = {
        columnWidths,
        startDate,
        showRecurring,
        showSubprojects,
      };
      window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(payload));
    } catch (error) {
      console.error('Failed to save Listical settings', error);
    }
  }, [columnWidths, settingsLoaded, startDate, showRecurring, showSubprojects]);
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

  // Add originalRowNumber to each row to preserve numbering when filters are applied
  // For now use a fixed offset of 7 for timeline rows (will be calculated dynamically later)
  const rowsWithNumbers = useMemo(() => {
    // Estimate timeline rows: header, month row, week row, day row, filter row, max/min rows = ~7 rows
    const estimatedTimelineOffset = 7;
    return rows.map((row, index) => ({
      ...row,
      originalRowNumber: estimatedTimelineOffset + index + 1,
    }));
  }, [rows]);

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
      !selectedEstimateFilters.size &&
      showMaxMinRows
    ) {
      return rowsWithNumbers;
    }
    return rowsWithNumbers.filter((row) => {
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
  }, [rowsWithNumbers, activeFilterColumns, selectedProjectFilters, selectedStatusFilters, selectedRecurringFilters, selectedEstimateFilters]);

  const table = useReactTable({
    data: filteredRows,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });
  const tableRows = table.getRowModel().rows;

  // Set up row virtualization
  const scrollContainerRef = useRef(null);
  const rowVirtualizer = useVirtualizer({
    count: tableRows.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => ROW_H,
    overscan: 25, // Render 25 extra rows above/below viewport for smooth scrolling
  });

  const {
    rowRefs,
    dragIndex,
    hoverIndex,
    activeRowId,
    blockClickRef,
    handleRowMouseDown,
    handleRowClick,
    updatePointerModifierState,
    shouldPreserveSelection,
    pointerModifierRef,
  } = useRowDragSelection({
    table,
    setRows,
    selectedRowIds,
    setSelectedRowIds,
    lastSelectedRowIndex,
    setLastSelectedRowIndex,
    handleCellClear,
    highlightedRowId,
    setHighlightedRowId,
  });

  const blackDividerStyle = { borderRight: '4px solid #000000' };
  const sharedInputStyle = 'w-full h-full text-[12px] px-2 border-none focus:outline-none focus:ring-0 bg-transparent';
  const checkboxInputClass = 'accent-black h-4 w-4 cursor-pointer focus:outline-none focus:ring-0';

  const fixedColumnConfig = useMemo(() => {
    const config = [
      { key: 'check', label: '✓', width: COL_W.check, className: 'text-center' },
      { key: 'project', label: 'Project', width: COL_W.project },
    ];

    if (showSubprojects) {
      config.push({ key: 'subprojects', label: 'Subprojects', width: COL_W.subprojects });
    }

    config.push({ key: 'status', label: 'Status', width: COL_W.status });
    config.push({ key: 'task', label: 'Task', width: COL_W.task });

    if (showRecurring) {
      config.push({ key: 'recurring', label: 'Recurring', width: COL_W.recurring, className: 'text-center' });
    }

    config.push({ key: 'estimate', label: 'Estimate', width: COL_W.estimate });
    config.push({ key: 'timeValue', label: 'Time Value', width: COL_W.timeValue });

    return config;
  }, [showRecurring, showSubprojects]);

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

  const fixedCols = fixedColumnConfig.length + 1;
  const weeksCount = totalDays / 7;
  const hasStartDate = Boolean(startDate);

  const parseDateInput = useCallback((value) => {
    if (!value) return null;
    const [year, month, day] = value.split('-').map((part) => Number.parseInt(part, 10));
    if (!year || !month || !day) return null;
    return new Date(year, month - 1, day);
  }, []);

  const dates = useMemo(() => {
    const base = parseDateInput(startDate);
    return Array.from({ length: totalDays }, (_, i) => {
      if (!base) return null;
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      return d;
    });
  }, [parseDateInput, startDate, totalDays]);

  const { dailyMinEntries, dailyMaxEntries } = useMemo(() => {
    const minEntries = createZeroDayEntries(totalDays);
    const maxEntries = createZeroDayEntries(totalDays);
    if (!dates.length || !dailyBoundsMap.size) {
      return { dailyMinEntries: minEntries, dailyMaxEntries: maxEntries };
    }
    dates.forEach((date, idx) => {
      if (!(date instanceof Date)) return;
      const dayName = DAYS_OF_WEEK[date.getDay()];
      const bounds = dailyBoundsMap.get(dayName);
      if (!bounds) return;
      minEntries[idx] = formatHoursValue(bounds.minHours);
      maxEntries[idx] = formatHoursValue(bounds.maxHours);
    });
    return { dailyMinEntries: minEntries, dailyMaxEntries: maxEntries };
  }, [dates, dailyBoundsMap, totalDays]);

  const foremostWeekRange = useMemo(() => {
    if (!dates.length) return '';
    const start = dates[0];
    const end = dates[6];
    if (!start || !end) return '';
    const format = (date) =>
      date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).replace(',', '');
    return `${format(start)} - ${format(end)}`;
  }, [dates]);

  const foremostWeekNumber = useMemo(() => {
    if (!dates.length || !dates[0]) return null;
    return 1; // The foremost week in the 12-week view is the first block of 7 days.
  }, [dates]);

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

  // Debounce expensive calculations to prevent lag accumulation
  const [debouncedRows, setDebouncedRows] = useState(rows);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setDebouncedRows(rows);
    }, 150);
    return () => clearTimeout(timeoutId);
  }, [rows]);

  const columnTotals = useMemo(() => {
    const totals = {};
    for (let i = 0; i < totalDays; i += 1) {
      totals[`day-${i}`] = 0;
    }
    debouncedRows.forEach((row) => {
      if (!Array.isArray(row.dayEntries)) return;
      row.dayEntries.forEach((value, idx) => {
        if (idx < 0 || idx >= totalDays) return;
        const normalizedValue = coerceNumber(value);
        if (normalizedValue == null) return;
        const key = `day-${idx}`;
        totals[key] = (totals[key] ?? 0) + normalizedValue;
      });
    });
    return totals;
  }, [debouncedRows, totalDays]);

  const projectHeaderTotals = useMemo(() => {
    const totals = {};
    let activeHeaderId = null;

    debouncedRows.forEach((row) => {
      if (row.type === 'projectHeader') {
        activeHeaderId = row.id;
        totals[activeHeaderId] = 0;
        return;
      }
      if (row.type === 'inboxHeader' || row.type === 'archiveHeader') {
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
  }, [debouncedRows]);

  const { timelineRows } = useTimelineRows({
    dates,
    monthSpans,
    weeksCount,
    showMaxMinRows,
    columnTotals,
    fixedColumnConfig,
    applyWeekBorderStyles,
    getWeekBorderClass,
    blackDividerStyle,
    formatTotalValue,
    dailyMinValues: dailyMinEntries,
    dailyMaxValues: dailyMaxEntries,
  });

  const timelineRowCount = timelineRows.length;

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

  const {
    columnIndexByKey,
    rowIndexById,
    getCellDescriptorKey,
    getRangeSelectionKeys,
    isCellInSelection,
    setSelectedCellKeys,
    setSelectionAnchor,
    setSelectionFocus,
    clearSelection,
    cellSelectionAnchorRef,
  } = useCellSelection({ columnStructure, tableRows });

  clearSelectionRef.current = clearSelection;

  const interactions = usePlannerInteractions({
    columnWidths,
    setColumnWidths,
    minColumnWidth: MIN_COLUMN_WIDTH,
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
  });

  const {
    tableContainerRef,
    handleCellActivate,
    handleCellMouseDown,
    handleCellClick,
    getCellHighlightStyle,
    handleOverwritePaste,
    handleColumnResizeMouseDown,
    clearActiveCell,
    isCellActive,
  } = interactions;

  const projectNames = useMemo(() => {
    // Use official projects from staging - only colored projects
    // Use nickname if available, otherwise fall back to projectName or text
    return officialProjects
      .filter((project) => project.color && project.color !== null)
      .map((project) => project.projectNickname || project.projectName || project.text)
      .sort((a, b) => a.localeCompare(b));
  }, [officialProjects]);

  const rowRenderersConfig = useMemo(
    () => ({
      totalDays,
      showRecurring,
      showSubprojects,
      ROW_H,
      projectHeaderTotals,
      projectWeeklyQuotas,
      fixedColumnConfig,
      fixedCols,
      sharedInputStyle,
      checkboxInputClass,
      blackDividerStyle,
      applyRowLabelStyle,
      applyWeekBorderStyles,
      getWeekBorderClass,
      getWidthStyle,
      getCellHighlightStyle,
      handleCellMouseDown,
      handleCellActivate,
      handleRowClick,
      handleOverwritePaste,
      createEmptyDayEntries,
      parseEstimateLabelToMinutes,
      formatMinutesToHHmm,
      syncDayEntriesWithTimeValue,
      getProjectSelectStyle,
      getStatusColorStyle,
      statusNames: STATUS_VALUES,
      projectNames,
      DARK_HEADER_STYLE,
      ARCHIVE_ROW_STYLE,
      officialProjects,
    }),
    [
      totalDays,
      showRecurring,
      showSubprojects,
      ROW_H,
      projectHeaderTotals,
      projectWeeklyQuotas,
      fixedColumnConfig,
      fixedCols,
      sharedInputStyle,
      checkboxInputClass,
      blackDividerStyle,
      applyRowLabelStyle,
      applyWeekBorderStyles,
      getWeekBorderClass,
      getWidthStyle,
      getCellHighlightStyle,
      handleCellMouseDown,
      handleCellActivate,
      handleRowClick,
      handleOverwritePaste,
      createEmptyDayEntries,
      parseEstimateLabelToMinutes,
      formatMinutesToHHmm,
      syncDayEntriesWithTimeValue,
      getProjectSelectStyle,
      getStatusColorStyle,
      STATUS_VALUES,
      projectNames,
      DARK_HEADER_STYLE,
      ARCHIVE_ROW_STYLE,
      officialProjects,
    ]
  );

  const { renderDataRow } = usePlannerRowRendering({
    rowRenderersConfig,
    rowIndexMap,
    columnIndexByKey,
    handleCellClick,
    updateRowValues,
    isCellActive,
    isCellInSelection,
    selectedRowIdSet,
  });

  const onProjectFilterButtonClick = useCallback(
    (event) => handleProjectFilterButtonClick(event, projectFilterMenu),
    [handleProjectFilterButtonClick, projectFilterMenu]
  );
  const onStatusFilterButtonClick = useCallback(
    (event) => handleStatusFilterButtonClick(event, statusFilterMenu),
    [handleStatusFilterButtonClick, statusFilterMenu]
  );
  const onRecurringFilterButtonClick = useCallback(
    (event) => handleRecurringFilterButtonClick(event, recurringFilterMenu),
    [handleRecurringFilterButtonClick, recurringFilterMenu]
  );
  const onEstimateFilterButtonClick = useCallback(
    (event) => handleEstimateFilterButtonClick(event, estimateFilterMenu),
    [handleEstimateFilterButtonClick, estimateFilterMenu]
  );

  useEffect(() => {
    clearActiveCellRef.current = clearActiveCell;
  }, [clearActiveCell]);

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
  }, [handleCellClear, tableContainerRef]);

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

  const filterBlockedLetters = useMemo(() => {
    // Always block 'check' column (always at position A)
    const blocked = new Set([columnLetterByKey.check]);

    // Block 'task' column (position varies based on showSubprojects)
    if (columnLetterByKey.task) {
      blocked.add(columnLetterByKey.task);
    }

    // Block 'estimate' column (position varies based on both showSubprojects and showRecurring)
    if (columnLetterByKey.estimate) {
      blocked.add(columnLetterByKey.estimate);
    }

    return blocked;
  }, [columnLetterByKey]);

  const statusNames = useMemo(() => STATUS_VALUES, []);
  const recurringNames = useMemo(() => RECURRING_VALUES, []);
  const estimateNames = useMemo(() => ESTIMATE_VALUES, []);
  const insertArchiveRow = useCallback(
    (prevRows) => {
      const headerIndex = prevRows.findIndex((row) => row.type === 'archiveHeader');
      if (headerIndex === -1) return prevRows;
      let insertIndex = headerIndex + 1;
      while (insertIndex < prevRows.length && prevRows[insertIndex].type === 'archiveRow') {
        insertIndex += 1;
      }
      const newRow = {
        id: `archive-row-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        type: 'archiveRow',
        dayEntries: createEmptyDayEntries(totalDays),
        archiveLabel: foremostWeekRange,
        archiveWeekLabel: foremostWeekNumber
          ? `Year 1, Week ${foremostWeekNumber}`
          : 'Year 1, Week -',
      };
      const nextRows = [...prevRows];
      nextRows.splice(insertIndex, 0, newRow);
      return nextRows;
    },
    [foremostWeekNumber, foremostWeekRange, totalDays]
  );
  const toggleSortStatus = useCallback((status) => {
    setSelectedSortStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(status)) {
        next.delete(status);
      } else {
        next.add(status);
      }
      return next;
    });
  }, []);
  const handleArchiveWeek = useCallback(() => {
    setIsListicalMenuOpen(false);
    setRows((prevRows) => insertArchiveRow(prevRows));
  }, [insertArchiveRow]);

  const handleSortInbox = useCallback(() => {
    setIsListicalMenuOpen(false);
    // Move done/scheduled inbox items into General; move abandoned/blocked/on-hold into Unscheduled.
    setRows((prevRows) => {
      if (!selectedSortStatuses.size) return prevRows;

      const projectKeys = new Set();
      prevRows.forEach((row) => {
        if (row.type === 'projectGeneral') {
          projectKeys.add(normalizeProjectKey(row.projectName));
        }
      });

      const tasksByProject = new Map();
      const unscheduledTasksByProject = new Map();
      const remainingRows = [];

      prevRows.forEach((row) => {
        if (
          row.type === 'inboxItem' &&
          selectedSortStatuses.has(row.status ?? '')
        ) {
          const target = SORT_INBOX_TARGET_MAP[row.status ?? ''];
          if (!target) {
            remainingRows.push(row);
            return;
          }
          const projectKey = normalizeProjectKey(row.projectSelection);
          if (projectKey && projectKeys.has(projectKey)) {
            if (target === 'general') {
              if (!tasksByProject.has(projectKey)) tasksByProject.set(projectKey, []);
              tasksByProject.get(projectKey).push(row);
              return;
            }
            if (target === 'unscheduled') {
              if (!unscheduledTasksByProject.has(projectKey)) {
                unscheduledTasksByProject.set(projectKey, []);
              }
              unscheduledTasksByProject.get(projectKey).push(row);
              return;
            }
            return;
          }
        }
        remainingRows.push(row);
      });

      if (tasksByProject.size === 0 && unscheduledTasksByProject.size === 0) {
        return prevRows;
      }

      const nextRows = [];
      remainingRows.forEach((row) => {
        nextRows.push(row);
        if (row.type === 'projectGeneral') {
          const projectKey = normalizeProjectKey(row.projectName);
          const tasksToInsert = tasksByProject.get(projectKey);
          if (tasksToInsert?.length) {
            tasksToInsert.forEach((task) => {
              nextRows.push({
                ...task,
                type: 'projectTask',
                projectName: row.projectName,
              });
            });
            tasksByProject.delete(projectKey);
          }
        }
        if (row.type === 'projectUnscheduled') {
          const projectKey = normalizeProjectKey(row.projectName);
          const tasksToInsert = unscheduledTasksByProject.get(projectKey);
          if (tasksToInsert?.length) {
            tasksToInsert.forEach((task) => {
              nextRows.push({
                ...task,
                type: 'projectTask',
                projectName: row.projectName,
              });
            });
            unscheduledTasksByProject.delete(projectKey);
          }
        }
      });

      return nextRows;
    });
  }, [setIsListicalMenuOpen, selectedSortStatuses, setRows]);

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
        targetRow.type === 'inboxItem' || targetRow.type === 'inboxHeader' || targetRow.type === 'archiveHeader'
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

  return (
    <div ref={tableContainerRef} className="relative overflow-x-auto p-4 text-[12px] bg-gray-100">
      <NavigationBar
        currentPath={currentPath}
        onNavigate={onNavigate}
        listicalButton={
          <ProjectListicalMenu
            isOpen={isListicalMenuOpen}
            onToggle={() => setIsListicalMenuOpen((prev) => !prev)}
            onClose={() => setIsListicalMenuOpen(false)}
            showRecurring={showRecurring}
            onToggleShowRecurring={() => setShowRecurring((prev) => !prev)}
            showSubprojects={showSubprojects}
            onToggleShowSubprojects={() => setShowSubprojects((prev) => !prev)}
            showMaxMinRows={showMaxMinRows}
            onToggleShowMaxMinRows={() => setShowMaxMinRows((prev) => !prev)}
            addTasksCount={addTasksCount}
            onAddTasksCountChange={(value) => setAddTasksCount(value)}
            handleAddTasks={handleAddTasks}
            startDate={startDate}
            onStartDateChange={(value) => setStartDate(value)}
            selectedSortStatuses={selectedSortStatuses}
            onToggleSortStatus={toggleSortStatus}
            handleSortInbox={handleSortInbox}
            handleArchiveWeek={handleArchiveWeek}
            checkboxInputClass={checkboxInputClass}
            sortableStatuses={SORTABLE_STATUSES}
          />
        }
      />

      <div style={{ maxHeight: 'calc(100vh - 250px)', overflow: 'auto' }} ref={scrollContainerRef}>
        <table className="table-fixed border-collapse w-full text-[12px] border border-[#ced3d0] shadow-sm bg-white">
          <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
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
            <TimelineHeader
              timelineRows={timelineRows}
              columnStructure={columnStructure}
              columnLetters={columnLetters}
              columnLetterByKey={columnLetterByKey}
              filterBlockedLetters={filterBlockedLetters}
              getWidthStyle={getWidthStyle}
              fixedCols={fixedCols}
              ROW_H={ROW_H}
              activeFilterColumns={activeFilterColumns}
              projectFilterMenu={projectFilterMenu}
              projectFilterButtonRef={projectFilterButtonRef}
              handleProjectFilterButtonClick={onProjectFilterButtonClick}
              selectedProjectFilters={selectedProjectFilters}
              statusFilterMenu={statusFilterMenu}
              statusFilterButtonRef={statusFilterButtonRef}
              handleStatusFilterButtonClick={onStatusFilterButtonClick}
              selectedStatusFilters={selectedStatusFilters}
              recurringFilterMenu={recurringFilterMenu}
              recurringFilterButtonRef={recurringFilterButtonRef}
              handleRecurringFilterButtonClick={onRecurringFilterButtonClick}
              selectedRecurringFilters={selectedRecurringFilters}
              estimateFilterMenu={estimateFilterMenu}
              estimateFilterButtonRef={estimateFilterButtonRef}
              handleEstimateFilterButtonClick={onEstimateFilterButtonClick}
              selectedEstimateFilters={selectedEstimateFilters}
              toggleFilterColumn={toggleFilterColumn}
              applyRowLabelStyle={applyRowLabelStyle}
            />
          </thead>

          <tbody>
            {/* Spacer row before visible items */}
            {rowVirtualizer.getVirtualItems().length > 0 && rowVirtualizer.getVirtualItems()[0].index > 0 && (
              <tr style={{ height: `${rowVirtualizer.getVirtualItems()[0].start}px` }}>
                <td colSpan={columnStructure.length} style={{ padding: 0, border: 'none' }} />
              </tr>
            )}

            {/* Render only visible rows */}
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const index = virtualRow.index;
              const tableRow = tableRows[index];
              if (!tableRow) return null;

              const originalRow = tableRow.original;
              const previousRow = index > 0 ? tableRows[index - 1].original : null;
              const rowProps = {
                onMouseDown: (event) => handleRowMouseDown(event, index, originalRow.id),
                'data-index': index,
              };
              const renderedRow = renderDataRow(tableRow, {
                previousRowOriginal: previousRow,
                rowProps,
                isActive:
                  activeRowId === originalRow.id || highlightedRowId === originalRow.id,
              });
              if (!renderedRow) return null;
              return React.cloneElement(renderedRow, {
                key: originalRow.id,
                'data-index': index,
              });
            })}

            {/* Spacer row after visible items */}
            {rowVirtualizer.getVirtualItems().length > 0 && (
              <tr style={{
                height: `${
                  rowVirtualizer.getTotalSize() -
                  (rowVirtualizer.getVirtualItems()[rowVirtualizer.getVirtualItems().length - 1]?.end || 0)
                }px`
              }}>
                <td colSpan={columnStructure.length} style={{ padding: 0, border: 'none' }} />
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <FilterPanel
        projectFilterMenu={projectFilterMenu}
        projectFilterMenuRef={projectFilterMenuRef}
        projectFilterButtonRef={projectFilterButtonRef}
        projectNames={projectNames}
        selectedProjectFilters={selectedProjectFilters}
        handleProjectFilterSelect={handleProjectFilterSelect}
        closeProjectFilterMenu={closeProjectFilterMenu}
        statusFilterMenu={statusFilterMenu}
        statusFilterMenuRef={statusFilterMenuRef}
        statusFilterButtonRef={statusFilterButtonRef}
        statusNames={statusNames}
        selectedStatusFilters={selectedStatusFilters}
        handleStatusFilterSelect={handleStatusFilterSelect}
        closeStatusFilterMenu={closeStatusFilterMenu}
        recurringFilterMenu={recurringFilterMenu}
        recurringFilterMenuRef={recurringFilterMenuRef}
        recurringFilterButtonRef={recurringFilterButtonRef}
        recurringNames={recurringNames}
        selectedRecurringFilters={selectedRecurringFilters}
        handleRecurringFilterSelect={handleRecurringFilterSelect}
        closeRecurringFilterMenu={closeRecurringFilterMenu}
        estimateFilterMenu={estimateFilterMenu}
        estimateFilterMenuRef={estimateFilterMenuRef}
        estimateFilterButtonRef={estimateFilterButtonRef}
        estimateNames={estimateNames}
        selectedEstimateFilters={selectedEstimateFilters}
        handleEstimateFilterSelect={handleEstimateFilterSelect}
        closeEstimateFilterMenu={closeEstimateFilterMenu}
      />
    </div>
  );
}
