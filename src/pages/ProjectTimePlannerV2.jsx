import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { GripVertical, ListFilter } from 'lucide-react';
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
import { MonthRow, WeekRow } from '../components/planner/rows';
import TableRow from '../components/planner/TableRow';
import NavigationBar from '../components/planner/NavigationBar';
import ProjectListicalMenu from '../components/planner/ProjectListicalMenu';
import PlannerTable from '../components/planner/PlannerTable';
import FilterPanel from '../components/planner/FilterPanel';
import { createInitialData } from '../utils/planner/dataCreators';
import { parseEstimateLabelToMinutes, formatMinutesToHHmm } from '../constants/planner/rowTypes';
import { mapDailyBoundsToTimeline } from '../utils/planner/dailyBoundsMapper';
import { createEmptyTaskRows } from '../utils/planner/taskRowGenerator';
import {
  isDraggableRow,
  isValidDropTarget,
} from '../utils/planner/rowTypeChecks';
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

export default function ProjectTimePlannerV2({ currentPath = '/', onNavigate = () => {} }) {
  // Storage management (all persistent settings)
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
    taskRows,
    setTaskRows,
    totalDays,
    setTotalDays,
    visibleDayColumns,
    setVisibleDayColumns,
  } = usePlannerStorage();

  // Initialize data from storage or create new
  const [data, setData] = useState(() => {
    // Try to load from storage first
    if (taskRows && taskRows.length > 0) {
      return taskRows;
    }
    // Otherwise create initial data
    return createInitialData(100, totalDays, startDate);
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
  const [editingCell, setEditingCell] = useState(null); // { rowId, columnId }
  const [editValue, setEditValue] = useState('');
  const [isDragging, setIsDragging] = useState(false); // Track if user is dragging to select
  const [dragStartCell, setDragStartCell] = useState(null); // { rowId, columnId }
  const [draggedRowId, setDraggedRowId] = useState(null); // Track which row is being dragged
  const [dropTargetRowId, setDropTargetRowId] = useState(null); // Track drop target
  const [collapsedGroups, setCollapsedGroups] = useState(new Set()); // Set of groupIds that are collapsed
  const tableBodyRef = useRef(null);

  // Filter state for day columns - tracks which day columns should filter out rows without values
  const [dayColumnFilters, setDayColumnFilters] = useState(new Set()); // Set of day column IDs that are active

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

  // Compute data with timeValue derived from estimate column
  // This ensures timeValue is always in sync with estimate without manual updates
  // Also computes day column values that are linked to timeValue
  // Also auto-updates status based on task and time values
  // Also assigns parentGroupId to tasks based on their position under project sections
  const computedData = useMemo(() => {
    let currentProjectGroupId = null;

    const result = data.map(row => {
      // Track current project group as we iterate
      if (row._rowType === 'projectHeader') {
        currentProjectGroupId = row.groupId || null;
      }

      // When we hit Inbox or Archive, clear the project group
      if (row._isInboxRow || row._rowType === 'archiveHeader') {
        currentProjectGroupId = null;
      }

      // Skip special rows (first 7 rows) and project rows - they don't need computation
      // BUT: preserve their existing parentGroupId if they have one
      if (row._isMonthRow || row._isWeekRow || row._isDayRow ||
          row._isDayOfWeekRow || row._isDailyMinRow || row._isDailyMaxRow || row._isFilterRow ||
          row._isInboxRow || row._isArchiveRow ||
          row._rowType === 'projectHeader' || row._rowType === 'projectGeneral' || row._rowType === 'projectUnscheduled') {
        return row;
      }

      // For regular task rows, compute timeValue from estimate
      const estimate = row.estimate;
      let timeValue;

      // If estimate is "Custom", preserve the manually entered timeValue
      if (estimate === 'Custom') {
        timeValue = row.timeValue;
      } else {
        // Otherwise, compute timeValue from estimate
        const minutes = parseEstimateLabelToMinutes(estimate);
        timeValue = formatMinutesToHHmm(minutes);
      }

      // Auto-update status based on task column content and day columns
      const taskContent = row.task || '';
      let status = row.status;

      // Check if any day column has a time value (including '0.00')
      let hasScheduledTime = false;
      for (let i = 0; i < totalDays; i++) {
        const dayColumnId = `day-${i}`;
        const dayValue = row[dayColumnId];

        // Check if day has any time value
        // Consider '=timeValue' as scheduled (it will be computed to actual value)
        // Consider any non-empty value (including '0.00') as scheduled
        if (dayValue && dayValue !== '') {
          hasScheduledTime = true;
          break;
        }
      }

      // If task is empty or only whitespace, set status to '-'
      // If task has content and day columns have time values, set status to 'Scheduled'
      // If task has content but no time values, set status to 'Not Scheduled' (always)
      if (taskContent.trim() === '') {
        if (status !== '-') {
          status = '-';
        }
      } else {
        // Task has content
        if (hasScheduledTime) {
          // Auto-update to Scheduled if status is '-', 'Not Scheduled', or 'Abandoned'
          // Don't override 'Done', 'Blocked', or 'On Hold'
          if (status === '-' || status === 'Not Scheduled' || status === 'Abandoned') {
            status = 'Scheduled';
          }
        } else {
          // No scheduled time - set to 'Not Scheduled', unless status is 'Abandoned'
          // Abandoned tasks can exist without scheduled time
          if (status !== 'Abandoned') {
            status = 'Not Scheduled';
          }
        }
      }

      // Now compute day columns that are marked as linked to timeValue
      // A day column is marked as linked by storing "=timeValue" as the value
      const updatedRow = { ...row, timeValue, status };

      // Process all day columns
      for (let i = 0; i < totalDays; i++) {
        const dayColumnId = `day-${i}`;
        const dayValue = row[dayColumnId];

        // If the day column has "=timeValue", replace it with the computed timeValue
        if (dayValue === '=timeValue') {
          updatedRow[dayColumnId] = timeValue;
        }
      }

      // Assign parentGroupId if we're under a project group
      if (currentProjectGroupId) {
        updatedRow.parentGroupId = currentProjectGroupId;
      }

      return updatedRow;
    });

    return result;
  }, [data, totalDays]);

  // Sync computed status changes back to actual data
  // This ensures that auto-computed status changes persist
  useEffect(() => {
    setData(prevData => {
      let hasChanges = false;
      const updatedData = prevData.map((row, index) => {
        const computedRow = computedData[index];

        // Only update if status has changed and it's not a special row or project row
        if (computedRow && row.status !== computedRow.status && !row._isMonthRow &&
            !row._isWeekRow && !row._isDayRow && !row._isDayOfWeekRow &&
            !row._isDailyMinRow && !row._isDailyMaxRow && !row._isFilterRow &&
            !row._rowType) {
          hasChanges = true;
          return { ...row, status: computedRow.status };
        }
        return row;
      });

      // Only return new data if there were actual changes
      return hasChanges ? updatedData : prevData;
    });
  }, [computedData]);

  // Note: coerceNumber is now imported from valueNormalizers as coerceToNumber
  // We keep this wrapper for backward compatibility with existing code
  const coerceNumber = useCallback((value) => {
    const result = coerceToNumber(value);
    return result === 0 && value == null ? null : result;
  }, []);

  // Collect unique values for filter dropdowns from the data
  const { projectNames, subprojectNames, statusNames, recurringNames, estimateNames } = useFilterValues(computedData);

  // Wrap filter button click handlers with menu state
  const onProjectFilterButtonClick = useCallback(
    (event) => handleProjectFilterButtonClick(event, projectFilterMenu),
    [handleProjectFilterButtonClick, projectFilterMenu]
  );

  const onSubprojectFilterButtonClick = useCallback(
    (event) => handleSubprojectFilterButtonClick(event, subprojectFilterMenu),
    [handleSubprojectFilterButtonClick, subprojectFilterMenu]
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

  // Command pattern for undo/redo
  const { undoStack, redoStack, executeCommand, undo, redo } = useCommandPattern();

  // All column IDs in order (used throughout the component)
  // Fixed columns (A-H) + day columns (starting from I)
  const allColumnIds = useMemo(() => {
    const fixed = ['checkbox', 'project', 'subproject', 'status', 'task', 'recurring', 'estimate', 'timeValue'];
    const days = Array.from({ length: totalDays }, (_, i) => `day-${i}`);
    return [...fixed, ...days];
  }, [totalDays]);

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

  // Handler to toggle day column filters
  const handleDayColumnFilterToggle = useCallback((dayColumnId) => {
    setDayColumnFilters(prev => {
      const next = new Set(prev);
      if (next.has(dayColumnId)) {
        next.delete(dayColumnId);
      } else {
        next.add(dayColumnId);
      }
      return next;
    });
  }, []);

  // Debug: Log archive structure once on mount
  useEffect(() => {
    const archiveRows = data.filter(row =>
      row._rowType === 'archiveHeader' ||
      row._rowType === 'archiveRow' ||
      row._rowType === 'archivedProjectHeader' ||
      row._rowType === 'archivedProjectGeneral' ||
      row._rowType === 'archivedProjectUnscheduled'
    );
    if (archiveRows.length > 0) {
      console.log('=== ARCHIVE STRUCTURE ===');
      archiveRows.forEach((row, i) => {
        console.log(`${i}: ${row._rowType}`, {
          id: row.id,
          projectNickname: row.projectNickname,
          groupId: row.groupId,
          parentGroupId: row.parentGroupId,
        });
      });
      console.log('=== END ARCHIVE STRUCTURE ===');
    }
  }, []);

  // Handler to toggle collapsed groups (for archive weeks and projects)
  const toggleGroupCollapse = useCallback((groupId) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  }, []);

  // Drag and drop handlers
  const handleDragStart = useCallback((e, rowId) => {
    // If the dragged row is part of selected rows, drag all selected rows
    // Otherwise, just drag the single row
    if (selectedRows.has(rowId)) {
      // Dragging multiple selected rows
      setDraggedRowId(Array.from(selectedRows));
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', JSON.stringify(Array.from(selectedRows)));
    } else {
      // Dragging a single row
      setDraggedRowId([rowId]);
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', JSON.stringify([rowId]));
    }
  }, [selectedRows]);

  const handleDragOver = useCallback((e, rowId) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    if (draggedRowId && Array.isArray(draggedRowId) && !draggedRowId.includes(rowId)) {
      // Check if target row is a special header row (but allow project rows for organization)
      const targetRow = data.find(r => r.id === rowId);
      if (targetRow && (
        targetRow._isMonthRow || targetRow._isWeekRow || targetRow._isDayRow ||
        targetRow._isDayOfWeekRow || targetRow._isDailyMinRow ||
        targetRow._isDailyMaxRow || targetRow._isFilterRow
      )) {
        // Don't allow dropping on header rows (but project rows are OK)
        setDropTargetRowId(null);
        return;
      }

      setDropTargetRowId(rowId);
    }
  }, [draggedRowId, data]);

  const handleDrop = useCallback((e, targetRowId) => {
    e.preventDefault();

    if (!draggedRowId || !Array.isArray(draggedRowId) || draggedRowId.includes(targetRowId)) {
      setDraggedRowId(null);
      setDropTargetRowId(null);
      return;
    }

    const draggedRowIds = draggedRowId;

    // Find target index
    const targetIndex = data.findIndex(r => r.id === targetRowId);
    if (targetIndex === -1) {
      setDraggedRowId(null);
      setDropTargetRowId(null);
      return;
    }

    // Prevent dropping on special header rows (but allow project rows)
    const targetRow = data[targetIndex];
    if (targetRow && (
      targetRow._isMonthRow || targetRow._isWeekRow || targetRow._isDayRow ||
      targetRow._isDayOfWeekRow || targetRow._isDailyMinRow ||
      targetRow._isDailyMaxRow || targetRow._isFilterRow
    )) {
      setDraggedRowId(null);
      setDropTargetRowId(null);
      return;
    }

    // Get the indices of all dragged rows in their current positions
    const draggedIndices = draggedRowIds
      .map(id => data.findIndex(r => r.id === id))
      .filter(idx => idx !== -1)
      .sort((a, b) => a - b);

    if (draggedIndices.length === 0) {
      setDraggedRowId(null);
      setDropTargetRowId(null);
      return;
    }

    // Store original positions for undo
    const originalPositions = draggedRowIds.map(id => {
      const index = data.findIndex(r => r.id === id);
      return { id, index };
    });

    // Create reorder command
    const reorderCommand = {
      execute: () => {
        setData(prevData => {
          const newData = [...prevData];

          // Extract the dragged rows
          const draggedRows = draggedIndices.map(idx => newData[idx]);

          // Remove dragged rows (in reverse order to maintain indices)
          for (let i = draggedIndices.length - 1; i >= 0; i--) {
            newData.splice(draggedIndices[i], 1);
          }

          // Calculate new insert position
          // Count how many dragged rows were before the target
          const rowsBeforeTarget = draggedIndices.filter(idx => idx < targetIndex).length;
          const adjustedTargetIndex = targetIndex - rowsBeforeTarget;

          // Insert all dragged rows at the target position
          newData.splice(adjustedTargetIndex, 0, ...draggedRows);

          return newData;
        });
      },
      undo: () => {
        setData(prevData => {
          const newData = [...prevData];

          // Remove the moved rows from their current positions
          draggedRowIds.forEach(id => {
            const idx = newData.findIndex(r => r.id === id);
            if (idx !== -1) {
              newData.splice(idx, 1);
            }
          });

          // Restore rows to their original positions (in order)
          originalPositions
            .sort((a, b) => a.index - b.index)
            .forEach(({ id, index }) => {
              const row = prevData.find(r => r.id === id);
              if (row) {
                newData.splice(index, 0, row);
              }
            });

          return newData;
        });
      }
    };

    executeCommand(reorderCommand);

    // Clear drag state
    setDraggedRowId(null);
    setDropTargetRowId(null);
  }, [draggedRowId, data, executeCommand]);

  const handleDragEnd = useCallback(() => {
    setDraggedRowId(null);
    setDropTargetRowId(null);
  }, []);

  // Edit handlers
  const handleEditComplete = useCallback((rowId, columnId, newValue) => {
    // Get the old value before updating
    const row = data.find(r => r.id === rowId);
    const oldValue = row?.[columnId] || '';

    // Don't create command if value hasn't changed
    if (oldValue === newValue) {
      setEditingCell(null);
      setEditValue('');
      return;
    }

    // Special handling for status column when set to "Abandoned"
    if (columnId === 'status' && newValue === 'Abandoned') {
      // Store old day column values for undo
      const oldDayValues = {};
      for (let i = 0; i < totalDays; i++) {
        const dayColumnId = `day-${i}`;
        oldDayValues[dayColumnId] = row?.[dayColumnId] || '';
      }

      // Create command that updates status and clears day columns with values
      const command = {
        execute: () => {
          setData(prev => prev.map(row => {
            if (row.id === rowId) {
              const updates = { status: newValue };
              // Clear day columns that have time values
              for (let i = 0; i < totalDays; i++) {
                const dayColumnId = `day-${i}`;
                const currentValue = row[dayColumnId];
                // Only clear if there's a value present
                if (currentValue && currentValue !== '') {
                  updates[dayColumnId] = '';
                }
              }
              return { ...row, ...updates };
            }
            return row;
          }));
        },
        undo: () => {
          setData(prev => prev.map(row => {
            if (row.id === rowId) {
              const updates = { status: oldValue };
              // Restore all day columns
              for (let i = 0; i < totalDays; i++) {
                updates[`day-${i}`] = oldDayValues[`day-${i}`];
              }
              return { ...row, ...updates };
            }
            return row;
          }));
        },
      };

      executeCommand(command);
      setEditingCell(null);
      setEditValue('');
      return;
    }

    // Special handling for timeValue column
    if (columnId === 'timeValue') {
      const currentEstimate = row?.estimate || '';
      const oldEstimate = currentEstimate;

      // Calculate what the timeValue should be based on current estimate
      const minutes = parseEstimateLabelToMinutes(currentEstimate);
      const computedTimeValue = formatMinutesToHHmm(minutes);

      // If the new value doesn't match the computed value, set estimate to "Custom"
      const shouldSetToCustom = newValue !== computedTimeValue && currentEstimate !== 'Custom';

      // Create command that updates both timeValue and potentially estimate
      const command = {
        execute: () => {
          setData(prev => prev.map(row => {
            if (row.id === rowId) {
              if (shouldSetToCustom) {
                return { ...row, timeValue: newValue, estimate: 'Custom' };
              } else {
                return { ...row, timeValue: newValue };
              }
            }
            return row;
          }));
        },
        undo: () => {
          setData(prev => prev.map(row => {
            if (row.id === rowId) {
              if (shouldSetToCustom) {
                return { ...row, timeValue: oldValue, estimate: oldEstimate };
              } else {
                return { ...row, timeValue: oldValue };
              }
            }
            return row;
          }));
        },
      };

      executeCommand(command);
      setEditingCell(null);
      setEditValue('');
      return;
    }

    // Create command for regular edits
    const command = {
      execute: () => {
        setData(prev => prev.map(row => {
          if (row.id === rowId) {
            return { ...row, [columnId]: newValue };
          }
          return row;
        }));
      },
      undo: () => {
        setData(prev => prev.map(row => {
          if (row.id === rowId) {
            return { ...row, [columnId]: oldValue };
          }
          return row;
        }));
      },
    };

    executeCommand(command);

    setEditingCell(null);
    setEditValue('');
  }, [data, executeCommand]);

  const handleEditCancel = useCallback((rowId, columnId) => {
    // Exit edit mode and keep cell selected
    setEditingCell(null);
    setEditValue('');
    // Ensure the cell remains selected
    const cellKey = getCellKey(rowId, columnId);
    setSelectedCells(new Set([cellKey]));
    setAnchorCell({ rowId, columnId });
  }, []);

  const handleEditKeyDown = useCallback((e, rowId, columnId, currentValue) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleEditComplete(rowId, columnId, currentValue);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setEditingCell(null);
      setEditValue('');
    }
  }, [handleEditComplete]);

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

  const handleArchiveWeek = useCallback(() => {
    setIsListicalMenuOpen(false);

    // Step 1: Calculate week metadata
    const weekRange = calculateWeekRange(dates);
    const weekNumber = calculateWeekNumber(startDate, new Date());

    // Step 2: Create archive week row with grouping
    const archiveWeekRow = createArchiveWeekRow({
      weekRange,
      weekNumber,
      dailyMinValues,
      dailyMaxValues,
      totalDays,
    });

    // Step 3: Copy project structure as archived
    const projectRows = data.filter(row =>
      row._rowType === 'projectHeader' ||
      row._rowType === 'projectGeneral' ||
      row._rowType === 'projectUnscheduled'
    );
    const archivedProjects = createArchivedProjectStructure(projectRows, archiveWeekRow.id, totalDays);

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
  }, [data, dates, startDate, dailyMinValues, dailyMaxValues, totalDays, executeCommand, collapsedGroups]);

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
    <div className="w-full h-screen flex flex-col bg-gray-50 overflow-hidden">
      <div className="flex-1 flex flex-col p-4 gap-4 min-h-0 overflow-hidden">
      <NavigationBar
        currentPath={currentPath}
        onNavigate={onNavigate}
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
            startDate={startDate}
            onStartDateChange={(value) => {
              setStartDate(value);
              setData(createInitialData(100, totalDays, value));
            }}
            selectedSortStatuses={selectedSortStatuses}
            onToggleSortStatus={toggleSortStatus}
            handleSortInbox={handleSortInbox}
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
        handleCellMouseDown={handleCellMouseDown}
        handleCellMouseEnter={handleCellMouseEnter}
        handleCellDoubleClick={handleCellDoubleClick}
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
    </div>
  );
}
