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
import DragBadge from '../components/DragBadge';
import isBrowserEnvironment from '../utils/isBrowserEnvironment';
import { loadTacticsMetrics } from '../lib/tacticsMetricsStorage';
import { loadStagingState, STAGING_STORAGE_EVENT } from '../lib/stagingStorage';
import storage from '../lib/storageService';
import {
  DAYS_OF_WEEK,
  TASK_ROW_TYPES,
  FILTERABLE_ROW_TYPES,
  STATUS_VALUES,
  RECURRING_VALUES,
  ESTIMATE_VALUES,
  SORTABLE_STATUSES,
  SORT_INBOX_TARGET_MAP,
  COL_W,
  ROW_H,
  MIN_COLUMN_WIDTH,
  COLUMN_RESIZE_HANDLE_WIDTH,
  DARK_HEADER_STYLE,
  ARCHIVE_ROW_STYLE,
} from '../constants/plannerConstants';
import {
  formatHoursValue,
  formatTotalValue,
  formatMinutesToHHmm,
  formatDateForInput,
  parseEstimateLabelToMinutes,
} from '../utils/plannerFormatters';
import {
  coerceNumber,
  syncDayEntriesWithTimeValue,
  isProtectedStatus,
  hasScheduledTimeEntries,
  isTaskColumnEmpty,
  createEmptyDayEntries,
  createZeroDayEntries,
} from '../utils/rowDataTransformers';
import { readStoredSettings, readStoredTaskRows, saveSettings, saveTaskRows } from '../utils/plannerStorage';
import {
  getStatusColorStyle,
  getProjectSelectStyle,
  applyRowLabelStyle,
  normalizeProjectKey,
} from '../utils/plannerStyles';

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
  const [collapsedGroups, setCollapsedGroups] = useState(() => {
    // Load from storage if available
    try {
      const stored = storage.getJSON('planner-collapsed-groups', null);
      if (stored && Array.isArray(stored)) {
        return new Set(stored);
      }
    } catch (e) {
      console.error('Failed to load collapsed groups:', e);
    }
    return new Set();
  });
  const totalDays = 84;

  // Persist collapsed groups to storage
  useEffect(() => {
    try {
      storage.setJSON('planner-collapsed-groups', Array.from(collapsedGroups));
    } catch (e) {
      console.error('Failed to save collapsed groups:', e);
    }
  }, [collapsedGroups]);

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

  // Prevent unwanted scroll-to-top on focus
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    let scrollPositionBeforeFocus = { top: 0, left: 0 };

    const captureScrollPosition = () => {
      const scrollContainer = document.querySelector('[style*="overflow: auto"]');
      if (scrollContainer) {
        scrollPositionBeforeFocus = {
          top: scrollContainer.scrollTop,
          left: scrollContainer.scrollLeft,
        };
      }
    };

    const preventScrollToTop = (event) => {
      const scrollContainer = document.querySelector('[style*="overflow: auto"]');
      if (!scrollContainer) return;

      // Check if the focused element is within our table
      const isTableElement = event.target?.closest('table');
      if (!isTableElement) return;

      // Only restore scroll if it changed significantly
      requestAnimationFrame(() => {
        const currentScrollTop = scrollContainer.scrollTop;
        const scrollDiff = Math.abs(currentScrollTop - scrollPositionBeforeFocus.top);

        // If scroll changed by more than 50px, restore it
        if (scrollDiff > 50) {
          scrollContainer.scrollTop = scrollPositionBeforeFocus.top;
          scrollContainer.scrollLeft = scrollPositionBeforeFocus.left;
        }
      });
    };

    // Capture position before focus happens
    document.addEventListener('mousedown', captureScrollPosition, true);
    document.addEventListener('dblclick', captureScrollPosition, true);
    // Prevent scroll-to-top after focus
    document.addEventListener('focusin', preventScrollToTop, true);

    return () => {
      document.removeEventListener('mousedown', captureScrollPosition, true);
      document.removeEventListener('dblclick', captureScrollPosition, true);
      document.removeEventListener('focusin', preventScrollToTop, true);
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

  // Prevent select elements from scrolling when clicked
  useEffect(() => {
    if (!isBrowserEnvironment()) return;

    const container = scrollContainerRef.current;
    if (!container) return;

    // Track scroll position and prevent unwanted scrolling
    let savedScrollTop = container.scrollTop;
    let isSelectInteraction = false;

    // Listen for mousedown on select elements
    const handleSelectMouseDown = (e) => {
      if (e.target.tagName === 'SELECT') {
        isSelectInteraction = true;
        savedScrollTop = container.scrollTop;
      }
    };

    // Listen for scroll events and restore position if it's a select interaction
    const handleScroll = (e) => {
      if (isSelectInteraction) {
        e.preventDefault();
        e.stopPropagation();
        container.scrollTop = savedScrollTop;
      }
    };

    // Clear the lock after a short delay
    const handleSelectChange = () => {
      setTimeout(() => {
        isSelectInteraction = false;
      }, 50);
    };

    // Add event listeners
    container.addEventListener('mousedown', handleSelectMouseDown, true);
    container.addEventListener('scroll', handleScroll, true);
    container.addEventListener('change', handleSelectChange, true);

    return () => {
      container.removeEventListener('mousedown', handleSelectMouseDown, true);
      container.removeEventListener('scroll', handleScroll, true);
      container.removeEventListener('change', handleSelectChange, true);
    };
  }, []);

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
    const payload = {
      columnWidths,
      startDate,
      showRecurring,
      showSubprojects,
    };
    saveSettings(payload);
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

    // Apply grouping/collapsing filter with two-level hierarchy support
    const applyGroupingFilter = (rows) => {
      const result = [];
      const collapsedGroupsSet = collapsedGroups;
      let currentWeekGroupId = null;
      let isWeekCollapsed = false;

      for (const row of rows) {
        // Track the current week group (archive week rows)
        if (row.type === 'archiveRow' && row.groupId) {
          currentWeekGroupId = row.groupId;
          isWeekCollapsed = collapsedGroupsSet.has(row.groupId);
          result.push(row); // Always show week header
          continue;
        }

        // If we're inside a collapsed week, skip all rows except the week header itself
        if (currentWeekGroupId && isWeekCollapsed) {
          // Reset when we exit the archive section
          if (row.type !== 'archivedProjectHeader' &&
              row.type !== 'archivedProjectGeneral' &&
              row.type !== 'archivedProjectUnscheduled' &&
              row.type !== 'projectTask') {
            currentWeekGroupId = null;
            isWeekCollapsed = false;
            result.push(row);
          }
          continue;
        }

        // Reset week tracking when exiting archive
        if (row.type !== 'archiveRow' &&
            row.type !== 'archivedProjectHeader' &&
            row.type !== 'archivedProjectGeneral' &&
            row.type !== 'archivedProjectUnscheduled' &&
            !row.parentGroupId) {
          currentWeekGroupId = null;
          isWeekCollapsed = false;
        }

        // Handle project-level grouping (inside an expanded week)
        if (row.isGroupHeader && row.groupId) {
          // This is a project header - always show it
          result.push(row);
          continue;
        }

        // If row has a groupId (it's a project header child), check if project is collapsed
        if (row.parentGroupId && collapsedGroupsSet.has(row.parentGroupId)) {
          continue; // Skip this row, its project is collapsed
        }

        result.push(row);
      }

      return result;
    };

    if (
      !activeDayFilters.length &&
      !selectedProjectFilters.size &&
      !selectedStatusFilters.size &&
      !selectedRecurringFilters.size &&
      !selectedEstimateFilters.size &&
      showMaxMinRows
    ) {
      return applyGroupingFilter(rowsWithNumbers);
    }
    const filtered = rowsWithNumbers.filter((row) => {
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

    return applyGroupingFilter(filtered);
  }, [rowsWithNumbers, activeFilterColumns, selectedProjectFilters, selectedStatusFilters, selectedRecurringFilters, selectedEstimateFilters, collapsedGroups]);

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
    mousePosition,
    isDragging,
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

  const foremostWeekTotals = useMemo(() => {
    // Sum the first 7 days (first week) from dailyMinEntries and dailyMaxEntries
    let minTotal = 0;
    let maxTotal = 0;
    for (let i = 0; i < 7 && i < dailyMinEntries.length; i++) {
      minTotal += parseFloat(dailyMinEntries[i] || 0);
      maxTotal += parseFloat(dailyMaxEntries[i] || 0);
    }
    return {
      min: minTotal.toFixed(2),
      max: maxTotal.toFixed(2),
    };
  }, [dailyMinEntries, dailyMaxEntries]);

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

  // Combined calculation: columnTotals and projectHeaderTotals in a single pass
  const { columnTotals, projectHeaderTotals } = useMemo(() => {
    // Initialize column totals for all days
    const colTotals = {};
    for (let i = 0; i < totalDays; i += 1) {
      colTotals[`day-${i}`] = 0;
    }

    // Initialize project header totals tracking
    const projTotals = {};
    let activeHeaderId = null;

    // Single pass through all rows
    debouncedRows.forEach((row) => {
      // Track which project header we're under
      if (row.type === 'projectHeader') {
        activeHeaderId = row.id;
        projTotals[activeHeaderId] = 0;
        return;
      }
      if (row.type === 'inboxHeader' || row.type === 'archiveHeader') {
        activeHeaderId = null;
        return;
      }

      // Calculate column totals (sum of all day entries)
      if (Array.isArray(row.dayEntries)) {
        row.dayEntries.forEach((value, idx) => {
          if (idx < 0 || idx >= totalDays) return;
          const normalizedValue = coerceNumber(value);
          if (normalizedValue == null) return;
          const key = `day-${idx}`;
          colTotals[key] = (colTotals[key] ?? 0) + normalizedValue;
        });
      }

      // Calculate project header totals (sum of timeValue for scheduled/done tasks)
      if (activeHeaderId && TASK_ROW_TYPES.has(row.type)) {
        const status = row.status ?? '';
        if (status === 'Scheduled' || status === 'Done') {
          const value = coerceNumber(row.timeValue);
          if (value != null) {
            projTotals[activeHeaderId] += value;
          }
        }
      }
    });

    // Format project totals
    const formattedProjTotals = {};
    Object.entries(projTotals).forEach(([key, total]) => {
      formattedProjTotals[key] = formatTotalValue(total ?? 0);
    });

    return {
      columnTotals: colTotals,
      projectHeaderTotals: formattedProjTotals,
    };
  }, [debouncedRows, totalDays]);

  // Calculate archived totals dynamically based on archived tasks
  const { archivedProjectTotals, archivedWeekTotals } = useMemo(() => {
    const projectTotals = {};
    const weekTotals = {};
    let activeArchivedHeaderId = null;
    let activeArchiveWeekId = null;

    debouncedRows.forEach((row) => {
      // Track which archive week we're in
      if (row.type === 'archiveRow') {
        activeArchiveWeekId = row.id;
        weekTotals[activeArchiveWeekId] = 0;
        activeArchivedHeaderId = null;
        return;
      }

      // Track which archived project header we're under
      if (row.type === 'archivedProjectHeader') {
        activeArchivedHeaderId = row.id;
        projectTotals[activeArchivedHeaderId] = 0;
        return;
      }

      // Reset when we exit an archived section
      if (row.type === 'inboxHeader' || row.type === 'projectHeader') {
        activeArchivedHeaderId = null;
        activeArchiveWeekId = null;
        return;
      }

      // Calculate totals for archived tasks
      if (row.type === 'projectTask' && activeArchivedHeaderId) {
        const value = coerceNumber(row.timeValue);
        if (value != null) {
          projectTotals[activeArchivedHeaderId] += value;
          if (activeArchiveWeekId) {
            weekTotals[activeArchiveWeekId] += value;
          }
        }
      }
    });

    // Format totals
    const formattedProjectTotals = {};
    Object.entries(projectTotals).forEach(([key, total]) => {
      formattedProjectTotals[key] = formatTotalValue(total ?? 0);
    });

    const formattedWeekTotals = {};
    Object.entries(weekTotals).forEach(([key, total]) => {
      formattedWeekTotals[key] = formatTotalValue(total ?? 0);
    });

    return {
      archivedProjectTotals: formattedProjectTotals,
      archivedWeekTotals: formattedWeekTotals,
    };
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
    selectedCellKeys,
    setSelectedCellKeys,
    setSelectionAnchor,
    setSelectionFocus,
    clearSelection,
    cellSelectionAnchorRef,
  } = useCellSelection({ columnStructure, tableRows });

  clearSelectionRef.current = clearSelection;

  const clearCellValue = useCallback((rowId, cellId) => {
    const rowIndex = rowIndexById.get(rowId);
    if (rowIndex == null) return;

    // Determine what to clear based on cellId
    if (cellId === 'task') {
      updateRowValues(rowIndex, { taskName: '' }, { markInteraction: true });
    } else if (cellId === 'recurring') {
      updateRowValues(rowIndex, { recurring: 'One-Time' }, { markInteraction: true });
    } else if (cellId === 'estimate') {
      updateRowValues(rowIndex, { estimate: 'Small' }, { markInteraction: true });
    } else if (cellId === 'status') {
      updateRowValues(rowIndex, { status: 'Not Scheduled' }, { markInteraction: true });
    } else if (cellId === 'project') {
      updateRowValues(rowIndex, { project: '' }, { markInteraction: true });
    } else if (cellId === 'subproject') {
      updateRowValues(rowIndex, { subproject: '' }, { markInteraction: true });
    } else if (cellId.startsWith('day-')) {
      const dayIndex = parseInt(cellId.replace('day-', ''), 10);
      if (!isNaN(dayIndex)) {
        updateRowValues(
          rowIndex,
          (currentRow) => {
            const existingEntries = Array.isArray(currentRow.dayEntries)
              ? [...currentRow.dayEntries]
              : createEmptyDayEntries(totalDays);
            existingEntries[dayIndex] = '';
            return { dayEntries: existingEntries };
          },
          { markInteraction: true }
        );
      }
    }
  }, [rowIndexById, updateRowValues, totalDays]);

  const interactions = usePlannerInteractions({
    columnWidths,
    setColumnWidths,
    minColumnWidth: MIN_COLUMN_WIDTH,
    rowIndexById,
    columnIndexByKey,
    getCellDescriptorKey,
    getRangeSelectionKeys,
    cellSelectionAnchorRef,
    selectedCellKeys,
    setSelectedCellKeys,
    setSelectionAnchor,
    setSelectionFocus,
    isCellInSelection,
    selectedRowIds,
    setSelectedRowIds,
    setLastSelectedRowIndex,
    highlightedRowId,
    setHighlightedRowId,
    shouldPreserveSelection,
    blockClickRef,
    pointerModifierRef,
    updatePointerModifierState,
    table,
    clearCellValue,
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

  const toggleGroupCollapse = useCallback((groupId) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  }, []);

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
      archivedProjectTotals,
      archivedWeekTotals,
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
      collapsedGroups,
      toggleGroupCollapse,
    }),
    [
      totalDays,
      showRecurring,
      showSubprojects,
      ROW_H,
      projectHeaderTotals,
      archivedProjectTotals,
      archivedWeekTotals,
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
      collapsedGroups,
      toggleGroupCollapse,
    ]
  );

  const { renderDataRow } = usePlannerRowRendering({
    rowRenderersConfig,
    rowIndexMap,
    columnIndexByKey,
    handleCellClick,
    handleCellMouseDown,
    updateRowValues,
    isCellActive,
    isCellInSelection,
    selectedRowIdSet,
    selectedCellKeys,
    dragIndex,
    hoverIndex,
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
    (prevRows, projectTotals = {}, archiveWeekId = null) => {
      const headerIndex = prevRows.findIndex((row) => row.type === 'archiveHeader');
      if (headerIndex === -1) return prevRows;

      // Find insertion point (at the bottom of existing archive rows)
      let insertIndex = headerIndex + 1;
      while (insertIndex < prevRows.length && prevRows[insertIndex].type === 'archiveRow') {
        insertIndex += 1;
      }

      // Calculate total hours across all projects
      let totalHours = 0;
      Object.values(projectTotals).forEach((total) => {
        const numericValue = parseFloat(total);
        if (!isNaN(numericValue)) {
          totalHours += numericValue;
        }
      });

      const newRow = {
        id: `archive-row-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        type: 'archiveRow',
        dayEntries: createEmptyDayEntries(totalDays),
        archiveLabel: foremostWeekRange,
        archiveWeekLabel: foremostWeekNumber
          ? `Year 1, Week ${foremostWeekNumber}`
          : 'Year 1, Week -',
        archiveWeeklyMin: foremostWeekTotals.min,
        archiveWeeklyMax: foremostWeekTotals.max,
        archiveTotalHours: totalHours.toFixed(2),
        groupId: archiveWeekId,
        isGroupHeader: true,
      };
      const nextRows = [...prevRows];
      nextRows.splice(insertIndex, 0, newRow);
      return nextRows;
    },
    [createEmptyDayEntries, foremostWeekNumber, foremostWeekRange, foremostWeekTotals, totalDays]
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

    // Create a unique ID for this archive week
    const archiveWeekId = `archive-week-${Date.now()}`;

    // Track project group IDs to collapse them by default
    const projectGroupIds = [];

    setRows((prevRows) => {
      // Step 1: Insert archive week row (totals will be calculated dynamically)
      let nextRows = insertArchiveRow(prevRows, {}, archiveWeekId);

      // Step 2: Copy project structure (headers, general, unscheduled)
      const archiveHeaderIndex = nextRows.findIndex((row) => row.type === 'archiveHeader');
      if (archiveHeaderIndex === -1) return nextRows;

      // Find the newly created archive row (it's right after the archive header)
      let archiveWeekRowIndex = archiveHeaderIndex + 1;
      while (archiveWeekRowIndex < nextRows.length && nextRows[archiveWeekRowIndex].type === 'archiveRow') {
        // Find the last archive row (we want to insert after it)
        if (archiveWeekRowIndex + 1 >= nextRows.length || nextRows[archiveWeekRowIndex + 1].type !== 'archiveRow') {
          break;
        }
        archiveWeekRowIndex++;
      }

      // Collect project structure rows to copy
      const projectStructureRows = [];
      let projectGroupIdForHeaders = null;

      nextRows.forEach((row) => {
        if (row.type === 'projectHeader' || row.type === 'projectGeneral' || row.type === 'projectUnscheduled') {
          // Create a unique group ID for each project
          if (row.type === 'projectHeader') {
            projectGroupIdForHeaders = `${archiveWeekId}-project-${row.id}`;
            projectGroupIds.push(projectGroupIdForHeaders);
          }

          // Create archived version of this row
          const archivedRow = {
            ...row,
            id: `archived-${row.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            type: row.type === 'projectHeader' ? 'archivedProjectHeader' :
                  row.type === 'projectGeneral' ? 'archivedProjectGeneral' :
                  'archivedProjectUnscheduled',
            // Note: Project totals are calculated dynamically via archivedProjectTotals memo
            // Add grouping metadata
            // Project headers belong to the week, subproject rows belong to the project
            parentGroupId: row.type === 'projectHeader' ? archiveWeekId : projectGroupIdForHeaders,
            groupId: row.type === 'projectHeader' ? projectGroupIdForHeaders : undefined,
            isGroupHeader: row.type === 'projectHeader',
          };
          projectStructureRows.push(archivedRow);
        }
      });

      // Insert archived project structure right after the archive week row
      nextRows.splice(archiveWeekRowIndex + 1, 0, ...projectStructureRows);

      // Step 3: Move non-recurring Done/Abandoned tasks from projects to archive
      // Step 4a: Create snapshots of recurring Done/Abandoned tasks

      // Group tasks by their project and target subheader (general vs unscheduled)
      const generalTasksByProject = new Map(); // Map of projectName -> general tasks array
      const unscheduledTasksByProject = new Map(); // Map of projectName -> unscheduled tasks array
      const recurringTasksToReset = [];
      let currentProjectName = null;

      // First pass: collect tasks to archive grouped by project and status
      nextRows.forEach((row) => {
        // Track which project we're in (based on original project headers, not archived ones)
        if (row.type === 'projectHeader') {
          currentProjectName = row.projectName;
        }

        if (row.type === 'projectTask' && currentProjectName && (row.status === 'Done' || row.status === 'Abandoned')) {
          // Determine target based on status (Done/Scheduled go to general, others to unscheduled)
          const target = row.status === 'Done' ? 'general' : 'unscheduled';
          const targetMap = target === 'general' ? generalTasksByProject : unscheduledTasksByProject;

          if (!targetMap.has(currentProjectName)) {
            targetMap.set(currentProjectName, []);
          }

          if (row.recurring === 'Recurring') {
            // Step 4a: Create a deep copy snapshot for recurring tasks
            const snapshot = {
              ...row,
              id: `archived-${row.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              dayEntries: Array.isArray(row.dayEntries) ? [...row.dayEntries] : createEmptyDayEntries(totalDays),
            };
            targetMap.get(currentProjectName).push(snapshot);
            recurringTasksToReset.push(row.id);
          } else {
            // Step 3: Move non-recurring tasks to archive
            targetMap.get(currentProjectName).push(row);
          }
        }
      });

      // Second pass: rebuild rows and insert tasks in the proper locations
      const remainingRows = [];
      let currentArchivedProjectGroupId = null;

      nextRows.forEach((row) => {
        // Track archived project headers to get their groupId
        if (row.type === 'archivedProjectHeader') {
          currentArchivedProjectGroupId = row.groupId;
          remainingRows.push(row);
        } else if (row.type === 'archivedProjectGeneral' || row.type === 'archivedProjectUnscheduled') {
          remainingRows.push(row);

          const projectName = row.projectName;

          // After archivedProjectGeneral, insert general tasks (Done)
          if (row.type === 'archivedProjectGeneral') {
            const generalTasks = generalTasksByProject.get(projectName);
            if (generalTasks && generalTasks.length > 0) {
              generalTasks.forEach(task => {
                task.parentGroupId = currentArchivedProjectGroupId;
                remainingRows.push(task);
              });
            }
          }

          // After archivedProjectUnscheduled, insert unscheduled tasks (Abandoned)
          if (row.type === 'archivedProjectUnscheduled') {
            const unscheduledTasks = unscheduledTasksByProject.get(projectName);
            if (unscheduledTasks && unscheduledTasks.length > 0) {
              unscheduledTasks.forEach(task => {
                task.parentGroupId = currentArchivedProjectGroupId;
                remainingRows.push(task);
              });
            }
          }
        } else if (row.type === 'projectTask' && (row.status === 'Done' || row.status === 'Abandoned') && row.recurring !== 'Recurring') {
          // Skip non-recurring done/abandoned tasks (they're being moved to archive)
          // Don't add them to remainingRows
        } else {
          remainingRows.push(row);
        }
      });

      // Step 4b: Reset the original recurring tasks
      const finalRows = remainingRows.map((row) => {
        if (recurringTasksToReset.includes(row.id)) {
          return {
            ...row,
            dayEntries: createEmptyDayEntries(totalDays),
            status: 'Not Scheduled',
            // Keep estimate and timeValue (they remain linked)
          };
        }
        return row;
      });

      return finalRows;
    });

    // Collapse the archive week and all project groups by default
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      next.add(archiveWeekId);
      projectGroupIds.forEach((groupId) => next.add(groupId));
      return next;
    });
  }, [insertArchiveRow, projectHeaderTotals]);

  const handleSortInbox = useCallback(() => {
    setIsListicalMenuOpen(false);
    // Move done/scheduled inbox items into General; move abandoned/blocked/on-hold into Unscheduled.
    setRows((prevRows) => {
      if (!selectedSortStatuses.size) return prevRows;

      // Build a map: normalized nickname -> full projectName
      // This allows inbox items (which use nicknames) to match with projectGeneral rows
      const nicknameToFullNameMap = new Map();
      prevRows.forEach((row) => {
        if (row.type === 'projectGeneral') {
          const nickname = normalizeProjectKey(row.projectNickname || row.projectName);
          nicknameToFullNameMap.set(nickname, row.projectName);
          console.log('[SORT INBOX] Found projectGeneral:', row.projectName, 'nickname:', row.projectNickname, '-> key:', nickname);
        }
      });
      console.log('[SORT INBOX] Nickname map keys:', Array.from(nicknameToFullNameMap.keys()));

      const tasksByProject = new Map();
      const unscheduledTasksByProject = new Map();
      const remainingRows = [];

      prevRows.forEach((row) => {
        if (
          row.type === 'inboxItem' &&
          selectedSortStatuses.has(row.status ?? '')
        ) {
          const target = SORT_INBOX_TARGET_MAP[row.status ?? ''];
          console.log('[SORT INBOX] Processing inbox item:', {
            id: row.id,
            status: row.status,
            projectSelection: row.projectSelection,
            target,
          });
          if (!target) {
            remainingRows.push(row);
            return;
          }
          // Match by nickname (inbox items use nicknames)
          const nicknameKey = normalizeProjectKey(row.projectSelection);
          const fullProjectName = nicknameToFullNameMap.get(nicknameKey);
          console.log('[SORT INBOX] Nickname:', row.projectSelection, '-> normalized:', nicknameKey, '-> fullName:', fullProjectName);

          if (nicknameKey && fullProjectName) {
            // Use full project name as the map key for consistency
            const projectKey = normalizeProjectKey(fullProjectName);
            if (target === 'general') {
              if (!tasksByProject.has(projectKey)) tasksByProject.set(projectKey, []);
              tasksByProject.get(projectKey).push(row);
              console.log('[SORT INBOX] Adding to general for project:', fullProjectName);
              return;
            }
            if (target === 'unscheduled') {
              if (!unscheduledTasksByProject.has(projectKey)) {
                unscheduledTasksByProject.set(projectKey, []);
              }
              unscheduledTasksByProject.get(projectKey).push(row);
              console.log('[SORT INBOX] Adding to unscheduled for project:', fullProjectName);
              return;
            }
            return;
          } else {
            console.log('[SORT INBOX] No match found - keeping as inbox item');
          }
        }
        remainingRows.push(row);
      });

      if (tasksByProject.size === 0 && unscheduledTasksByProject.size === 0) {
        console.log('[SORT INBOX] No tasks to move');
        return prevRows;
      }

      console.log('[SORT INBOX] Tasks by project:', Array.from(tasksByProject.keys()));
      console.log('[SORT INBOX] Unscheduled tasks by project:', Array.from(unscheduledTasksByProject.keys()));

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
                projectNickname: row.projectNickname,
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
                projectNickname: row.projectNickname,
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
      <DragBadge isDragging={isDragging} count={selectedRowIds.length} mousePosition={mousePosition} />
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

      <div style={{ maxHeight: 'calc(100vh - 250px)', overflow: 'auto' }} ref={scrollContainerRef} data-virtual-scroll-container>
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
                ref: (el) => {
                  if (el) {
                    rowRefs.current.set(originalRow.id, el);
                  } else {
                    rowRefs.current.delete(originalRow.id);
                  }
                },
                'data-index': index,
              };
              const renderedRow = renderDataRow(tableRow, {
                previousRowOriginal: previousRow,
                rowProps,
                isActive:
                  activeRowId === originalRow.id || highlightedRowId === originalRow.id,
                handleRowMouseDown: (event) => handleRowMouseDown(event, index, originalRow.id),
              });
              if (!renderedRow) return null;
              // Merge existing props with new ones to preserve drag state attributes
              const mergedProps = {
                ...renderedRow.props,
                key: originalRow.id,
                'data-index': index,
              };
              return React.cloneElement(renderedRow, mergedProps);
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
