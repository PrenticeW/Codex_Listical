import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useLocation } from 'react-router-dom';
import { Archive } from 'lucide-react';
import { useYear } from '../contexts/YearContext';
import usePlannerStorage from '../hooks/planner/usePlannerStorage';
import usePlannerColumns from '../hooks/planner/usePlannerColumns';
import useCommandPattern from '../hooks/planner/useCommandPattern';
import useProjectsData from '../hooks/planner/useProjectsData';
import useTacticsMetrics from '../hooks/planner/useTacticsMetrics';
import usePlannerFilters from '../hooks/planner/usePlannerFilters';
import { useFilteredData, useFilterValues } from '../hooks/planner/useFilteredData';
import { useProjectTotals, useDailyTotals } from '../hooks/planner/useTotalsCalculation';
import useSpreadsheetSelection from '../hooks/planner/useSpreadsheetSelection';
import useKeyboardHandlers from '../hooks/planner/useKeyboardHandlers';
import useEditState from '../hooks/planner/useEditState';
import useDragAndDropRows from '../hooks/planner/useDragAndDropRows';
import useComputedDataV2 from '../hooks/planner/useComputedDataV2';
import useCollapsibleGroups from '../hooks/planner/useCollapsibleGroups';
import useDayColumnFilters from '../hooks/planner/useDayColumnFilters';
import useFilterButtonHandler from '../hooks/planner/useFilterButtonHandler';
import { MonthRow, WeekRow } from '../components/planner/rows';
import TableRow from '../components/planner/TableRow';
import NavigationBar from '../components/planner/NavigationBar';
import ProjectListicalMenu from '../components/planner/ProjectListicalMenu';
import PlannerTable from '../components/planner/PlannerTable';
import FilterPanel from '../components/planner/FilterPanel';
import ArchiveYearModal from '../components/ArchiveYearModal';
import { AddTasksModal } from '../components/AddTasksModal';
import ContextMenu from '../components/planner/ContextMenu';
import useContextMenu from '../hooks/planner/useContextMenu';
import { createInitialData } from '../utils/planner/dataCreators';
import { parseEstimateLabelToMinutes, formatMinutesToHHmm } from '../constants/planner/rowTypes';
import { mapDailyBoundsToTimeline } from '../utils/planner/dailyBoundsMapper';
import { createEmptyTaskRows } from '../utils/planner/taskRowGenerator';
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
import {
  calculateWeekRange,
  calculateWeekNumber,
  createArchiveWeekRow,
  createArchivedProjectStructure,
  collectTasksForArchive,
  snapshotRecurringTask,
  insertArchiveRow,
  insertArchivedProjects,
  moveTasksToArchive,
  insertRecurringSnapshots,
  resetRecurringTasks,
} from '../utils/planner/archiveHelpers';
import { useArchiveTotals } from '../hooks/planner/useArchiveTotals';

// Sortable status values for the "Sort Inbox" feature
const SORTABLE_STATUSES = ['Done', 'Scheduled', 'Not Scheduled', 'Blocked', 'On Hold', 'Abandoned'];

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
  const location = useLocation();
  const currentPath = location.pathname;

  // Year context for year-based storage
  const { currentYear, isCurrentYearArchived, activeYear, switchToActiveYear } = useYear();

  // Archive modal state
  const [isArchiveModalOpen, setIsArchiveModalOpen] = useState(false);

  // Add tasks modal state
  const [isAddTasksModalOpen, setIsAddTasksModalOpen] = useState(false);

  // Storage management (all persistent settings) - now year-aware
  const {
    columnSizing,
    setColumnSizing,
    sizeScale,
    setSizeScale,
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
  } = usePlannerStorage({ yearNumber: currentYear });

  // Initialize data from storage or create new
  const [data, setData] = useState(() => {
    // Try to load from storage first
    if (taskRows && taskRows.length > 0) {
      return taskRows;
    }
    // Otherwise create initial data with just 20 task rows (users can add more as needed)
    return createInitialData(20, totalDays, startDate);
  });

  // Save data to storage when it changes
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setTaskRows(data);
    }, 500); // Debounce saves by 500ms to avoid too many writes

    return () => clearTimeout(timeoutId);
  }, [data, setTaskRows]);

  const [selectedCells, setSelectedCells] = useState(new Set()); // Set of "rowId|columnId"
  const [selectedRows, setSelectedRows] = useState(new Set()); // Set of rowIds for row highlight
  const [anchorRow, setAnchorRow] = useState(null); // For shift-click row range selection
  const [anchorCell, setAnchorCell] = useState(null); // For shift-click range selection
  const [isDragging, setIsDragging] = useState(false); // Track if user is dragging to select
  const [dragStartCell, setDragStartCell] = useState(null); // { rowId, columnId }
  const tableBodyRef = useRef(null);

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
    subprojectFilterMenu,
    subprojectFilterMenuRef,
    subprojectFilterButtonRef,
    handleSubprojectFilterSelect,
    handleSubprojectFilterButtonClick,
    closeSubprojectFilterMenu,
    statusFilterMenu,
    statusFilterMenuRef,
    statusFilterButtonRef,
    handleStatusFilterSelect,
    handleStatusFilterButtonClick,
    closeStatusFilterMenu,
    recurringFilterMenu,
    recurringFilterMenuRef,
    recurringFilterButtonRef,
    handleRecurringFilterSelect,
    handleRecurringFilterButtonClick,
    closeRecurringFilterMenu,
    estimateFilterMenu,
    estimateFilterMenuRef,
    estimateFilterButtonRef,
    handleEstimateFilterSelect,
    handleEstimateFilterButtonClick,
    closeEstimateFilterMenu,
  } = filters;

  // Listical menu state
  const [isListicalMenuOpen, setIsListicalMenuOpen] = useState(false);
  const [addTasksCount, setAddTasksCount] = useState('');

  // Load projects and subprojects from Staging
  const { projects, subprojects, projectSubprojectsMap, projectNamesMap } = useProjectsData();

  // Load daily bounds and project weekly quotas from Tactics page
  const { dailyBounds, projectWeeklyQuotas } = useTacticsMetrics();

  // Command pattern for undo/redo
  const { undoStack, redoStack, executeCommand, undo, redo } = useCommandPattern();

  // Day column filters hook
  const { dayColumnFilters, toggleDayFilter: handleDayColumnFilterToggle, isDayFiltered, clearAllDayFilters } = useDayColumnFilters();

  // Collapsible groups hook
  const { collapsedGroups, setCollapsedGroups, toggleGroupCollapse, isCollapsed } = useCollapsibleGroups();

  // Context menu hook
  const { contextMenu, handleContextMenu, closeContextMenu } = useContextMenu();

  // Compute data with timeValue derived from estimate column (with status sync effect)
  const { computedData } = useComputedDataV2({ data, setData, totalDays });

  // Note: coerceNumber is now imported from valueNormalizers as coerceToNumber
  // We keep this wrapper for backward compatibility with existing code
  const coerceNumber = useCallback((value) => {
    const result = coerceToNumber(value);
    return result === 0 && value == null ? null : result;
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
  });

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

      // Check if update is needed by comparing current spans length with totalDays
      const currentMonthRow = prevData[monthRowIndex];

      // Calculate expected number of days from current spans
      const currentDaysInSpans = currentMonthRow._monthSpans?.reduce((sum, span) => sum + span.span, 0) || 0;

      // If the spans already match totalDays, no update needed
      if (currentDaysInSpans === totalDays) {
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
  const { dailyMinValues, dailyMaxValues } = useMemo(() => {
    return mapDailyBoundsToTimeline(dailyBounds, dates);
  }, [dailyBounds, dates]);

  // Calculate project totals (sum of Scheduled and Done task timeValues per project)
  const projectTotals = useProjectTotals(computedData);

  // Calculate daily totals for each day column (sum of all regular task rows, ignoring filters)
  const dailyTotals = useDailyTotals({ computedData, totalDays });

  // Calculate archive totals (for archived projects and archive weeks)
  const archiveTotals = useArchiveTotals(computedData, totalDays);

  // Update filter row (row 7) with daily totals
  useEffect(() => {
    if (!dailyTotals) return;

    setData(prevData => {
      // Check if filter row needs updating
      const filterRow = prevData.find(row => row._isFilterRow);
      if (!filterRow) return prevData;

      // Check if any daily totals have changed
      let hasChanges = false;
      forEachDayColumn(totalDays, (dayColumnId) => {
        if (filterRow[dayColumnId] !== dailyTotals[dayColumnId]) {
          hasChanges = true;
        }
      });

      // Only update if there are actual changes
      if (!hasChanges) return prevData;

      return prevData.map(row => {
        // Update filter row with daily totals
        if (row._isFilterRow) {
          return { ...row, ...dailyTotals };
        }
        return row;
      });
    });
  }, [dailyTotals, totalDays]);

  // Update archive week rows with calculated totals
  useEffect(() => {
    if (!archiveTotals || !archiveTotals.weekTotals) return;

    setData(prevData => {
      let hasChanges = false;
      const updatedData = prevData.map(row => {
        // Update archive week rows with totals
        if (row._rowType === 'archiveRow' && archiveTotals.weekTotals[row.id]) {
          const weekTotal = archiveTotals.weekTotals[row.id];
          if (row.archiveTotalHours !== weekTotal.totalHours) {
            hasChanges = true;
            return { ...row, archiveTotalHours: weekTotal.totalHours };
          }
        }
        return row;
      });

      // Only return new data if there were actual changes
      return hasChanges ? updatedData : prevData;
    });
  }, [archiveTotals]);

  // Update daily min/max rows when bounds change or toggle changes
  useEffect(() => {
    if (!dailyMinValues || !dailyMaxValues) return;

    setData(prevData => {
      // If toggle is off, filter out daily min/max rows
      if (!showMaxMinRows) {
        return prevData.filter(row => !row._isDailyMinRow && !row._isDailyMaxRow);
      }

      // Check if rows already exist
      const hasMinRow = prevData.some(row => row._isDailyMinRow);
      const hasMaxRow = prevData.some(row => row._isDailyMaxRow);

      // If toggle is on and rows don't exist, add them
      if (!hasMinRow || !hasMaxRow) {
        const filterRowIndex = prevData.findIndex(row => row._isFilterRow);
        if (filterRowIndex === -1) return prevData;

        const newData = [...prevData];

        if (!hasMinRow) {
          const minRow = {
            id: 'daily-min',
            _isDailyMinRow: true,
            rowNum: '',
            checkbox: false,
            project: 'Daily Min',
            subproject: '',
            status: '',
            task: '',
            recurring: '',
            estimate: '',
            timeValue: '',
            ...createDayColumnUpdates(totalDays, (i) => dailyMinValues[i]),
          };
          newData.splice(filterRowIndex, 0, minRow);
        }

        if (!hasMaxRow) {
          const maxRow = {
            id: 'daily-max',
            _isDailyMaxRow: true,
            rowNum: '',
            checkbox: false,
            project: 'Daily Max',
            subproject: '',
            status: '',
            task: '',
            recurring: '',
            estimate: '',
            timeValue: '',
            ...createDayColumnUpdates(totalDays, (i) => dailyMaxValues[i]),
          };
          // Insert after daily min (if it was just added) or at filter row index
          const insertIndex = hasMinRow ? filterRowIndex : filterRowIndex + 1;
          newData.splice(insertIndex, 0, maxRow);
        }

        return newData;
      }

      // Otherwise, just update existing rows with new values
      return prevData.map(row => {
        // Update daily min row
        if (row._isDailyMinRow) {
          return {
            ...row,
            project: 'Daily Min',
            ...createDayColumnUpdates(totalDays, (i) => dailyMinValues[i]),
          };
        }

        // Update daily max row
        if (row._isDailyMaxRow) {
          return {
            ...row,
            project: 'Daily Max',
            ...createDayColumnUpdates(totalDays, (i) => dailyMaxValues[i]),
          };
        }

        return row;
      });
    });
  }, [dailyMinValues, dailyMaxValues, showMaxMinRows, totalDays]);

  // Insert Inbox and Archive header rows
  useEffect(() => {
    setData(prevData => {
      // Find the filter row index
      const filterRowIndex = prevData.findIndex(row => row._isFilterRow);
      if (filterRowIndex === -1) return prevData;

      let newData = [...prevData];

      // FIRST: Clean up any duplicates or legacy rows

      // Remove legacy archive divider if it exists
      newData = newData.filter(row => !row._isArchiveRow);

      // Remove ALL duplicate archive headers (keep only the first one with id 'archive-header')
      let archiveHeadersFound = 0;
      newData = newData.filter(row => {
        if (row._rowType === 'archiveHeader') {
          archiveHeadersFound++;
          // Keep only the first one AND ensure it has the correct ID
          if (archiveHeadersFound === 1) {
            row.id = 'archive-header'; // Ensure correct ID
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
          // Insert 20 rows after inbox
          const archiveInsertIndex = Math.min(inboxIndex + 21, newData.length);
          newData.splice(archiveInsertIndex, 0, archiveHeaderRow);
        }
      }

      return newData;
    });
  }, [totalDays]); // Run once on mount and when totalDays changes

  // Insert project rows into data structure
  useEffect(() => {
    // Early exit conditions - don't modify state if not needed
    if (!projects || projects.length <= 1) return; // Only '-' means no projects

    // Use a flag to prevent updating during mount
    let isMounted = true;

    // Schedule the update for after the current render cycle
    const timeoutId = setTimeout(() => {
      if (!isMounted) return;

      setData(prevData => {
        // Find the filter row index to insert projects after it
        const filterRowIndex = prevData.findIndex(row => row._isFilterRow);
        if (filterRowIndex === -1) return prevData;

        // Check if project rows already exist
        const hasProjectRows = prevData.some(row => row._rowType === 'projectHeader');

        // If project rows exist, nothing to do
        if (hasProjectRows) return prevData;

        const newData = [...prevData];
        let insertIndex = filterRowIndex + 1;

        // Insert project rows for each project (skip '-')
        projects.forEach(projectKey => {
            if (projectKey === '-') return;

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
      });
    }, 0);

    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
    };
  }, [projects, projectNamesMap, totalDays]);

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

  // Build timeline header rows - just column letters
  const timelineHeaderRows = useMemo(() => {
    const headerRows = [];

    // Column letters row (A, B, C, etc.)
    const mainHeaderRow = {
      id: 'main-header',
      cells: [
        { id: 'header-rowNum', columnKey: 'rowNum', content: '#' },
        { id: 'header-checkbox', columnKey: 'checkbox', content: 'A' },
        { id: 'header-project', columnKey: 'project', content: 'B' },
        { id: 'header-subproject', columnKey: 'subproject', content: 'C' },
        { id: 'header-status', columnKey: 'status', content: 'D' },
        { id: 'header-task', columnKey: 'task', content: 'E' },
        { id: 'header-recurring', columnKey: 'recurring', content: 'F' },
        { id: 'header-estimate', columnKey: 'estimate', content: 'G' },
        { id: 'header-timeValue', columnKey: 'timeValue', content: 'H' },
        ...dates.map((_, i) => {
          // Day columns start from I (index 8)
          const letterIndex = i + 8; // Start after H (8 columns before day columns)
          let columnLetter = '';
          let index = letterIndex;

          // Convert number to Excel-style column letters
          while (index >= 0) {
            columnLetter = String.fromCharCode(65 + (index % 26)) + columnLetter;
            index = Math.floor(index / 26) - 1;
          }

          return {
            id: `header-day-${i}`,
            columnKey: `day-${i}`,
            content: columnLetter,
          };
        }),
      ],
    };
    headerRows.push(mainHeaderRow);

    return headerRows;
  }, [dates]);

  // Calculate sizes based on scale
  const rowHeight = Math.round(21 * sizeScale);
  const cellFontSize = Math.round(10 * sizeScale);
  const headerFontSize = Math.round(9 * sizeScale);
  const gripIconSize = Math.round(12 * sizeScale);

  // Size adjustment functions
  const increaseSize = () => setSizeScale(prev => Math.min(prev + 0.1, 3.0));
  const decreaseSize = () => setSizeScale(prev => Math.max(prev - 0.1, 0.5));
  const resetSize = () => setSizeScale(1.0);

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
    setEditingCell,
    setEditValue,
  });

  const {
    getCellKey,
    isCellSelected,
    getRowRange,
    getCellRange,
    handleRowNumberClick,
    handleCellMouseDown,
    handleCellMouseEnter,
    handleMouseUp,
    handleCellDoubleClick,
  } = selection;

  // Wrap cell mouse down to handle right-click for context menu
  const handleCellMouseDownWithContext = useCallback((e, rowId, columnId) => {
    if (e.button === 2) { // Right-click
      e.preventDefault();
      handleContextMenu(e, {
        rowId,
        columnId,
        cellKey: getCellKey(rowId, columnId),
        selectedCells,
        selectedRows,
      });
      return;
    }
    handleCellMouseDown(e, rowId, columnId);
  }, [handleCellMouseDown, handleContextMenu, getCellKey, selectedCells, selectedRows]);

  // Handle context menu event (right-click) to prevent default browser menu
  const handleCellContextMenu = useCallback((e, rowId, columnId) => {
    e.preventDefault();
    handleContextMenu(e, {
      rowId,
      columnId,
      cellKey: getCellKey(rowId, columnId),
      selectedCells,
      selectedRows,
    });
  }, [handleContextMenu, getCellKey, selectedCells, selectedRows]);

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
  });

  // Note: Old drag and drop handlers removed - now using useDragAndDropRows hook

  // Note: Old edit handlers removed - now using useEditState hook

  // Track the last copied columns (to detect if copying from timeValue)
  const lastCopiedColumnsRef = useRef([]);

  // Copy/Paste functionality
  const handleCopy = useCallback((e) => {
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
    e.preventDefault();

    // Get clipboard data
    const pastedText = e.clipboardData.getData('text');

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

    // Store deleted rows and their positions for undo
    const deletedRows = [];
    const rowIndices = [];

    selectedRows.forEach(rowId => {
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

    // Create command for row deletion
    const command = {
      execute: () => {
        setData(prev => {
          const newData = [...prev];
          // Remove in reverse order to maintain indices
          [...sortedDeletions].reverse().forEach(({ index }) => {
            newData.splice(index, 1);
          });
          return newData;
        });
        // Clear selection after deletion
        setSelectedRows(new Set());
        setSelectedCells(new Set());
      },
      undo: () => {
        setData(prev => {
          const newData = [...prev];
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

    // Store the insertion index for undo
    const savedInsertIndex = insertIndex;

    // Add new rows at the determined position
    const command = {
      execute: () => {
        setData(prev => {
          const newData = [...prev];
          newData.splice(savedInsertIndex, 0, ...newRows);
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

    // Step 2: Create archive week row with grouping
    const archiveWeekRow = createArchiveWeekRow({
      weekRange,
      weekNumber,
      dailyMinValues,
      dailyMaxValues,
      totalDays,
    });

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
    const archivedProjects = createArchivedProjectStructure(projectRows, subprojectRows, archiveWeekRow.id, totalDays);

    // Step 4: Collect non-recurring Done/Abandoned tasks
    const nonRecurringTasks = collectTasksForArchive(data, task =>
      ['Done', 'Abandoned'].includes(task.status) && !task.recurring
    );

    // Step 5: Snapshot recurring Done/Abandoned tasks
    const recurringTasks = collectTasksForArchive(data, task =>
      ['Done', 'Abandoned'].includes(task.status) && task.recurring
    );
    const recurringSnapshots = recurringTasks.map(snapshotRecurringTask);

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
          newData = resetRecurringTasks(newData, totalDays);

          // Move non-recurring tasks to archive (already removed from original positions)
          newData = moveTasksToArchive(newData, nonRecurringTasks, archiveWeekRow.id);

          // Insert recurring task snapshots (these preserve their original status)
          newData = insertRecurringSnapshots(newData, recurringSnapshots, archiveWeekRow.id);

          return newData;
        });

        // Collapse archive week group by default
        setCollapsedGroups(prev => new Set([...prev, archiveWeekRow.id]));
      },
      undo: () => {
        setData(originalData);
        setCollapsedGroups(originalCollapsedGroups);
      }
    };

    executeCommand(archiveCommand);
  }, [data, dates, startDate, dailyMinValues, dailyMaxValues, totalDays, executeCommand, collapsedGroups, visibleDayColumns]);

  const handleHideWeek = useCallback(() => {
    setIsListicalMenuOpen(false);

    // Hide the leftmost 7 visible day columns (closest to columns A-H)
    setVisibleDayColumns(prev => {
      const newVisible = { ...prev };
      const visibleDays = Object.entries(newVisible)
        .filter(([_, isVisible]) => isVisible)
        .map(([colId]) => parseInt(colId.replace('day-', '')))
        .sort((a, b) => a - b); // Sort ascending to get leftmost first

      // Hide up to 7 days, but ensure at least 7 days remain visible
      const daysToHide = Math.min(7, visibleDays.length - 7);
      if (daysToHide > 0) {
        for (let i = 0; i < daysToHide; i++) {
          newVisible[`day-${visibleDays[i]}`] = false;
        }
      }

      return newVisible;
    });
  }, []);

  const handleShowWeek = useCallback(() => {
    setIsListicalMenuOpen(false);

    // Show the leftmost 7 hidden day columns
    setVisibleDayColumns(prev => {
      const newVisible = { ...prev };
      const hiddenDays = Object.entries(newVisible)
        .filter(([_, isVisible]) => !isVisible)
        .map(([colId]) => parseInt(colId.replace('day-', '')))
        .sort((a, b) => a - b); // Sort ascending to get leftmost first

      // Show up to 7 hidden days
      const daysToShow = Math.min(7, hiddenDays.length);
      for (let i = 0; i < daysToShow; i++) {
        newVisible[`day-${hiddenDays[i]}`] = true;
      }

      return newVisible;
    });
  }, []);

  const handleNewSubproject = useCallback(() => {
    setIsListicalMenuOpen(false);

    // Find the selected row
    if (selectedRows.size === 0) {
      // No row selected, do nothing
      return;
    }

    // Get the first (or only) selected row
    const selectedRowId = Array.from(selectedRows)[0];
    const selectedRowIndex = data.findIndex(r => r.id === selectedRowId);

    if (selectedRowIndex === -1) return;

    const selectedRow = data[selectedRowIndex];

    // Determine the parent project group ID
    // If the selected row is a project header, use its groupId
    // Otherwise, use the row's parentGroupId
    let projectGroupId = null;
    let projectNickname = null;
    let fullProjectName = null;

    if (selectedRow._rowType === 'projectHeader') {
      projectGroupId = selectedRow.groupId;
      projectNickname = selectedRow.projectNickname;
      fullProjectName = selectedRow.projectName;
    } else if (selectedRow.parentGroupId) {
      projectGroupId = selectedRow.parentGroupId;
      // Extract project nickname from parentGroupId (format: "project-{nickname}")
      projectNickname = selectedRow.parentGroupId.replace('project-', '');
      // Try to find the project name from the project header
      const projectHeader = data.find(r => r.groupId === projectGroupId && r._rowType === 'projectHeader');
      fullProjectName = projectHeader?.projectName || projectNickname;
    }

    // Create unique ID for this subproject
    const subprojectId = `subproject-${Date.now()}`;

    // Create new subproject section row (light pink row like General/Unscheduled, with "New" label)
    const newSubprojectRow = {
      id: subprojectId,
      _rowType: 'subprojectGeneral', // Use subproject section row type
      parentGroupId: projectGroupId, // Associate with the project
      projectNickname: projectNickname || '',
      projectName: fullProjectName || '',
      subprojectLabel: 'New', // Custom label that will be editable
      rowNum: '',
      checkbox: '',
      project: '',
      subproject: '',
      status: '',
      task: '', // Will show "New" label
      recurring: '',
      estimate: '',
      timeValue: '',
      ...createEmptyDayColumns(totalDays),
    };

    // Store the insertion index for undo
    const insertIndex = selectedRowIndex + 1;

    // Create command for undo/redo support
    const command = {
      execute: () => {
        setData(prev => {
          const newData = [...prev];
          newData.splice(insertIndex, 0, newSubprojectRow);
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
  }, [selectedRows, data, totalDays, executeCommand]);

  const handleDuplicateRow = useCallback(() => {
    setIsListicalMenuOpen(false);

    // Find the selected row
    if (selectedRows.size === 0) {
      // No row selected, do nothing
      return;
    }

    // Get the first (or only) selected row
    const selectedRowId = Array.from(selectedRows)[0];
    const selectedRowIndex = data.findIndex(r => r.id === selectedRowId);

    if (selectedRowIndex === -1) return;

    const selectedRow = data[selectedRowIndex];

    // Don't duplicate special rows (headers, filters, etc.)
    if (selectedRow._isMonthRow || selectedRow._isWeekRow || selectedRow._isDayRow ||
        selectedRow._isDayOfWeekRow || selectedRow._isDailyMinRow || selectedRow._isDailyMaxRow ||
        selectedRow._isFilterRow || selectedRow._isInboxRow || selectedRow._isArchiveRow ||
        selectedRow._rowType === 'projectHeader' || selectedRow._rowType === 'projectGeneral' ||
        selectedRow._rowType === 'projectUnscheduled' || selectedRow._rowType === 'archiveHeader' ||
        selectedRow._rowType === 'subprojectHeader' || selectedRow._rowType === 'subprojectGeneral' ||
        selectedRow._rowType === 'subprojectUnscheduled') {
      // Can't duplicate special rows
      return;
    }

    // Create a duplicate of the row with a new unique ID
    const duplicatedRow = {
      ...selectedRow,
      id: `row-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
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
  }, [selectedRows, data, executeCommand]);

  const handleAddWeek = useCallback(() => {
    setIsListicalMenuOpen(false);

    // Add 7 days to totalDays
    setTotalDays(prev => prev + 7);
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
  }, [selectedRows, contextMenu.rowId, data, totalDays, executeCommand]);

  // Context menu action handlers
  const handleContextMenuAddTasks = useCallback(() => {
    setIsAddTasksModalOpen(true);
  }, []);

  const handleInsertRowAbove = useCallback(() => {
    if (!contextMenu.rowId) return;

    const rowIndex = data.findIndex(r => r.id === contextMenu.rowId);
    if (rowIndex === -1) return;

    const newRow = createEmptyTaskRows(1, totalDays)[0];

    const command = {
      execute: () => {
        setData(prev => {
          const newData = [...prev];
          newData.splice(rowIndex, 0, newRow);
          return newData;
        });
      },
      undo: () => {
        setData(prev => {
          const newData = [...prev];
          newData.splice(rowIndex, 1);
          return newData;
        });
      },
    };

    executeCommand(command);
  }, [contextMenu.rowId, data, totalDays, executeCommand]);

  const handleInsertRowBelow = useCallback(() => {
    if (!contextMenu.rowId) return;

    const rowIndex = data.findIndex(r => r.id === contextMenu.rowId);
    if (rowIndex === -1) return;

    const newRow = createEmptyTaskRows(1, totalDays)[0];

    const command = {
      execute: () => {
        setData(prev => {
          const newData = [...prev];
          newData.splice(rowIndex + 1, 0, newRow);
          return newData;
        });
      },
      undo: () => {
        setData(prev => {
          const newData = [...prev];
          newData.splice(rowIndex + 1, 1);
          return newData;
        });
      },
    };

    executeCommand(command);
  }, [contextMenu.rowId, data, totalDays, executeCommand]);

  // Checkbox input class for menu
  const checkboxInputClass = 'h-4 w-4 cursor-pointer rounded border-gray-300 text-emerald-700 focus:ring-emerald-600';

  // Column definitions
  const columns = usePlannerColumns({ totalDays });

  const table = useReactTable({
    data: filteredData,
    columns,
    getCoreRowModel: getCoreRowModel(),
    enableColumnResizing: true,
    columnResizeMode: 'onChange',
    state: {
      columnSizing,
      columnPinning: {
        left: ['rowNum'], // Pin the row number column to the left
      },
      columnVisibility: {
        recurring: showRecurring,
        ...visibleDayColumns,
      },
    },
    onColumnSizingChange: setColumnSizing,
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

  return (
    <div className="w-full h-screen flex flex-col bg-slate-50 overflow-hidden">
      {/* Modern professional styling */}
      <div className="flex-1 flex flex-col p-6 gap-4 min-h-0 overflow-hidden">

      {/* Archived Year Banner */}
      {isCurrentYearArchived && (
        <div className="flex items-center justify-between px-6 py-4 bg-linear-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-xl shadow-sm">
          <div className="flex items-center gap-4">
            <div className="p-2 bg-white rounded-lg shadow-sm">
              <Archive className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-amber-900">
                Viewing Year {currentYear} (Archived - Read Only)
              </p>
              <p className="text-xs text-amber-700 mt-1">
                This year has been archived and cannot be modified.
              </p>
            </div>
          </div>
          <button
            onClick={switchToActiveYear}
            className="px-5 py-2.5 text-sm font-semibold text-amber-700 bg-white border border-amber-300 rounded-lg hover:bg-amber-50 hover:border-amber-400 transition-all duration-200 shadow-sm"
          >
            Return to Year {activeYear?.yearNumber}
          </button>
        </div>
      )}

      <NavigationBar
        archiveButton={
          !isCurrentYearArchived && currentPath === '/' && (
            <button
              onClick={() => setIsArchiveModalOpen(true)}
              className="px-4 py-2.5 text-sm font-semibold text-amber-700 bg-amber-50 border border-amber-300 rounded-lg hover:bg-amber-100 hover:border-amber-400 transition-all duration-200 flex items-center gap-2 shadow-sm"
            >
              <Archive className="w-4 h-4" />
              Archive Year {currentYear}
            </button>
          )
        }
        listicalButton={
          <ProjectListicalMenu
            isOpen={isListicalMenuOpen}
            onToggle={() => setIsListicalMenuOpen(prev => !prev)}
            onClose={() => setIsListicalMenuOpen(false)}
            showRecurring={showRecurring}
            onToggleShowRecurring={() => setShowRecurring(prev => !prev)}
            showSubprojects={showSubprojects}
            onToggleShowSubprojects={() => setShowSubprojects(prev => !prev)}
            showMaxMinRows={showMaxMinRows}
            onToggleShowMaxMinRows={() => setShowMaxMinRows(prev => !prev)}
            addTasksCount={addTasksCount}
            onAddTasksCountChange={(value) => setAddTasksCount(value)}
            handleAddTasks={handleAddTasks}
            handleNewSubproject={handleNewSubproject}
            handleDuplicateRow={handleDuplicateRow}
            handleAddWeek={handleAddWeek}
            startDate={startDate}
            onStartDateChange={(value) => {
              setStartDate(value);
              setData(createInitialData(20, totalDays, value));
            }}
            selectedSortStatuses={selectedSortStatuses}
            onToggleSortStatus={toggleSortStatus}
            selectedSortPlannerStatuses={selectedSortPlannerStatuses}
            onToggleSortPlannerStatus={toggleSortPlannerStatus}
            handleSortInbox={handleSortInbox}
            handleSortPlanner={handleSortPlanner}
            handleArchiveWeek={handleArchiveWeek}
            handleHideWeek={handleHideWeek}
            handleShowWeek={handleShowWeek}
            checkboxInputClass={checkboxInputClass}
            sortableStatuses={SORTABLE_STATUSES}
            sizeScale={sizeScale}
            decreaseSize={decreaseSize}
            increaseSize={increaseSize}
            resetSize={resetSize}
            undoStack={undoStack}
            redoStack={redoStack}
            undo={undo}
            redo={redo}
            onOpenArchiveModal={() => setIsArchiveModalOpen(true)}
          />
        }
      />

      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <PlannerTable
          tableBodyRef={tableBodyRef}
        timelineHeaderRows={timelineHeaderRows}
        table={table}
        rowHeight={rowHeight}
        headerFontSize={headerFontSize}
        selectedRows={selectedRows}
        rowVirtualizer={rowVirtualizer}
        isCellSelected={isCellSelected}
        editingCell={editingCell}
        editValue={editValue}
        setEditValue={setEditValue}
        handleRowNumberClick={handleRowNumberClick}
        handleCellMouseDown={handleCellMouseDownWithContext}
        handleCellMouseEnter={handleCellMouseEnter}
        handleCellDoubleClick={handleCellDoubleClick}
        handleCellContextMenu={handleCellContextMenu}
        handleEditComplete={handleEditComplete}
        handleEditCancel={handleEditCancel}
        handleEditKeyDown={handleEditKeyDown}
        draggedRowId={draggedRowId}
        dropTargetRowId={dropTargetRowId}
        handleDragStart={handleDragStart}
        handleDragOver={handleDragOver}
        handleDrop={handleDrop}
        handleDragEnd={handleDragEnd}
        cellFontSize={cellFontSize}
        gripIconSize={gripIconSize}
        dates={dates}
        data={data}
        selectedCells={selectedCells}
        undoStack={undoStack}
        redoStack={redoStack}
        projects={projects}
        subprojects={subprojects}
        projectSubprojectsMap={projectSubprojectsMap}
        totalDays={totalDays}
        projectWeeklyQuotas={projectWeeklyQuotas}
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
        toggleGroupCollapse={toggleGroupCollapse}
        archiveTotals={archiveTotals}
      />
      </div>
      <FilterPanel
        projectFilterMenu={projectFilterMenu}
        projectFilterMenuRef={projectFilterMenuRef}
        projectFilterButtonRef={projectFilterButtonRef}
        projectNames={projectNames}
        selectedProjectFilters={selectedProjectFilters}
        handleProjectFilterSelect={handleProjectFilterSelect}
        closeProjectFilterMenu={closeProjectFilterMenu}
        subprojectFilterMenu={subprojectFilterMenu}
        subprojectFilterMenuRef={subprojectFilterMenuRef}
        subprojectFilterButtonRef={subprojectFilterButtonRef}
        subprojectNames={subprojectNames}
        selectedSubprojectFilters={selectedSubprojectFilters}
        handleSubprojectFilterSelect={handleSubprojectFilterSelect}
        closeSubprojectFilterMenu={closeSubprojectFilterMenu}
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

      {/* Archive Year Modal */}
      <ArchiveYearModal
        isOpen={isArchiveModalOpen}
        onClose={() => setIsArchiveModalOpen(false)}
        yearNumber={currentYear}
      />

      {/* Add Tasks Modal */}
      <AddTasksModal
        isOpen={isAddTasksModalOpen}
        onClose={() => setIsAddTasksModalOpen(false)}
        onConfirm={addTasksWithCount}
      />

      {/* Context Menu */}
      <ContextMenu
        contextMenu={contextMenu}
        onClose={closeContextMenu}
        onDeleteRows={handleDeleteRows}
        onDuplicateRow={handleDuplicateRow}
        onInsertRowAbove={handleInsertRowAbove}
        onInsertRowBelow={handleInsertRowBelow}
        onAddTasks={handleContextMenuAddTasks}
        onAddSubproject={handleNewSubproject}
      />
    </div>  
  );
}
