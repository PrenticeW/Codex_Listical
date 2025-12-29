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
import { MonthRow, WeekRow } from '../components/planner/rows';
import TableRow from '../components/planner/TableRow';
import NavigationBar from '../components/planner/NavigationBar';
import ProjectListicalMenu from '../components/planner/ProjectListicalMenu';
import PlannerTable from '../components/planner/PlannerTable';
import { createInitialData } from '../utils/planner/dataCreators';
import { parseEstimateLabelToMinutes, formatMinutesToHHmm } from '../constants/planner/rowTypes';
import { mapDailyBoundsToTimeline } from '../utils/planner/dailyBoundsMapper';
import { createEmptyTaskRows } from '../utils/planner/taskRowGenerator';

// Sortable status values for the "Sort Inbox" feature
const SORTABLE_STATUSES = ['Done', 'Scheduled', 'Not Scheduled', 'Blocked', 'On Hold', 'Abandoned'];

// Map status values to their target sections for Sort Inbox
const SORT_INBOX_TARGET_MAP = {
  'Done': 'general',
  'Scheduled': 'general',
  'Not Scheduled': 'unscheduled',
  'Abandoned': 'unscheduled',
  'Blocked': 'unscheduled',
  'On Hold': 'unscheduled',
};

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
  // Timeline configuration
  const totalDays = 84; // 12 weeks

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
  const tableBodyRef = useRef(null);

  // Filter state for day columns - tracks which day columns should filter out rows without values
  const [dayColumnFilters, setDayColumnFilters] = useState(new Set()); // Set of day column IDs that are active

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
  const computedData = useMemo(() => {
    return data.map(row => {
      // Skip special rows (first 7 rows) and project rows - they don't need computation
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

      return updatedRow;
    });
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

  // Helper function to check if a value is a valid number (matches main branch coerceNumber)
  const coerceNumber = useCallback((value) => {
    if (value == null) return null;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value === 'string') {
      const normalized = value.trim().replace(',', '.');
      if (!normalized) return null;
      const parsed = parseFloat(normalized);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  }, []);

  // Filter data based on day column filters
  // Only hide regular task rows that don't have numeric values in ALL filtered day columns
  const filteredData = useMemo(() => {
    // If no filters are active, return all data
    if (dayColumnFilters.size === 0) {
      return computedData;
    }

    const filtered = computedData.filter(row => {
      // Always show timeline header rows (month, week, day headers, filter row, daily min/max)
      // These are NOT filterable - they should always be visible
      if (row._isMonthRow || row._isWeekRow || row._isDayRow ||
          row._isDayOfWeekRow || row._isDailyMinRow || row._isDailyMaxRow ||
          row._isFilterRow) {
        return true;
      }

      // For all other rows (regular tasks, project rows, inbox/archive dividers), apply day column filtering
      // In main branch, FILTERABLE_ROW_TYPES includes: projectTask, inboxItem, projectHeader, projectGeneral, projectUnscheduled
      // Inbox and Archive rows should be filtered just like project rows
      const hasAllFilteredValues = Array.from(dayColumnFilters).every(dayColumnId => {
        const value = row[dayColumnId];
        const numericValue = coerceNumber(value);
        // Check if this column has a valid numeric value
        return numericValue !== null;
      });

      return hasAllFilteredValues;
    });

    return filtered;
  }, [computedData, dayColumnFilters, coerceNumber]);

  // Calculate dates array from startDate
  const dates = useMemo(() => {
    const start = new Date(startDate);
    return Array.from({ length: totalDays }, (_, i) => {
      const date = new Date(start);
      date.setDate(start.getDate() + i);
      return date;
    });
  }, [startDate, totalDays]);

  // Map daily bounds to timeline dates
  const { dailyMinValues, dailyMaxValues } = useMemo(() => {
    return mapDailyBoundsToTimeline(dailyBounds, dates);
  }, [dailyBounds, dates]);

  // Calculate project totals (sum of Scheduled and Done task timeValues per project)
  const projectTotals = useMemo(() => {
    const totals = {};
    let currentProjectHeaderId = null;

    computedData.forEach((row) => {
      // Track which project header we're under
      if (row._rowType === 'projectHeader') {
        currentProjectHeaderId = row.id;
        totals[currentProjectHeaderId] = 0;
        return;
      }

      // Reset when we exit a project section (encounter another special row type)
      if (row._rowType === 'projectGeneral' || row._rowType === 'projectUnscheduled') {
        // Still within the project, don't reset
        return;
      }

      // For regular task rows under a project header
      if (currentProjectHeaderId && !row._isMonthRow && !row._isWeekRow &&
          !row._isDayRow && !row._isDayOfWeekRow && !row._isDailyMinRow &&
          !row._isDailyMaxRow && !row._isFilterRow && !row._rowType) {
        const status = row.status || '';

        // Only count Scheduled and Done tasks
        if (status === 'Scheduled' || status === 'Done') {
          const timeValue = row.timeValue || '0.00';

          // Parse timeValue (format: "HH.mm" or "H.mm")
          const parsed = parseFloat(timeValue);
          if (!isNaN(parsed)) {
            totals[currentProjectHeaderId] += parsed;
          }
        }
      }
    });

    // Format totals to 2 decimal places
    const formattedTotals = {};
    Object.entries(totals).forEach(([key, total]) => {
      formattedTotals[key] = total.toFixed(2);
    });

    return formattedTotals;
  }, [computedData]);

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
          };
          dailyMinValues.forEach((value, i) => {
            minRow[`day-${i}`] = value;
          });
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
          };
          dailyMaxValues.forEach((value, i) => {
            maxRow[`day-${i}`] = value;
          });
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
          const updates = { project: 'Daily Min' };
          dailyMinValues.forEach((value, i) => {
            updates[`day-${i}`] = value;
          });
          return { ...row, ...updates };
        }

        // Update daily max row
        if (row._isDailyMaxRow) {
          const updates = { project: 'Daily Max' };
          dailyMaxValues.forEach((value, i) => {
            updates[`day-${i}`] = value;
          });
          return { ...row, ...updates };
        }

        return row;
      });
    });
  }, [dailyMinValues, dailyMaxValues, showMaxMinRows, totalDays]);

  // Insert Inbox and Archive divider rows
  useEffect(() => {
    setData(prevData => {
      // Find the filter row index
      const filterRowIndex = prevData.findIndex(row => row._isFilterRow);
      if (filterRowIndex === -1) return prevData;

      // Check if inbox row already exists
      const hasInboxRow = prevData.some(row => row._isInboxRow);
      // Check if archive row already exists
      const hasArchiveRow = prevData.some(row => row._isArchiveRow);

      // If both exist, nothing to do
      if (hasInboxRow && hasArchiveRow) return prevData;

      const newData = [...prevData];

      // Create "Inbox" divider row (if it doesn't exist)
      if (!hasInboxRow) {
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
        };
        // Add empty day columns
        for (let i = 0; i < totalDays; i++) {
          inboxRow[`day-${i}`] = '';
        }
        newData.splice(insertIndex, 0, inboxRow);
      }

      // Create "Archive" divider row 20 rows below inbox (if it doesn't exist)
      if (!hasArchiveRow) {
        // Find the inbox row index in newData
        const inboxIndex = newData.findIndex(row => row._isInboxRow);
        console.log('Archive row creation - inboxIndex:', inboxIndex, 'hasArchiveRow:', hasArchiveRow);
        if (inboxIndex !== -1) {
          const archiveRow = {
            id: 'archive-divider',
            _isArchiveRow: true,
            rowNum: '',
            checkbox: '',
            project: '',
            subproject: '',
            status: '',
            task: '',
            recurring: '',
            estimate: '',
            timeValue: '',
          };
          // Add empty day columns
          for (let i = 0; i < totalDays; i++) {
            archiveRow[`day-${i}`] = '';
          }
          // Insert 20 rows after inbox
          const archiveInsertIndex = Math.min(inboxIndex + 21, newData.length);
          console.log('Inserting archive row at index:', archiveInsertIndex, 'newData.length:', newData.length);
          newData.splice(archiveInsertIndex, 0, archiveRow);
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

            // Create project header row
            const projectHeaderRow = {
              id: `${projectKey}-header`,
              _rowType: 'projectHeader',
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
            };
            // Add empty day columns
            for (let i = 0; i < totalDays; i++) {
              projectHeaderRow[`day-${i}`] = '';
            }
            newData.splice(insertIndex++, 0, projectHeaderRow);

            // Create "General" section row
            const generalRow = {
              id: `${projectKey}-general`,
              _rowType: 'projectGeneral',
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
            };
            for (let i = 0; i < totalDays; i++) {
              generalRow[`day-${i}`] = '';
            }
            newData.splice(insertIndex++, 0, generalRow);

            // Create "Unscheduled" section row
            const unscheduledRow = {
              id: `${projectKey}-unscheduled`,
              _rowType: 'projectUnscheduled',
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
            };
            for (let i = 0; i < totalDays; i++) {
              unscheduledRow[`day-${i}`] = '';
            }
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

  // Helper to create cell key
  const getCellKey = (rowId, columnId) => `${rowId}|${columnId}`;

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

  // Helper to check if cell is selected
  const isCellSelected = useCallback((rowId, columnId) => {
    return selectedCells.has(getCellKey(rowId, columnId));
  }, [selectedCells]);

  // Helper to get range of rows between two rowIds
  const getRowRange = useCallback((startRowId, endRowId) => {
    const startIndex = data.findIndex(r => r.id === startRowId);
    const endIndex = data.findIndex(r => r.id === endRowId);

    if (startIndex === -1 || endIndex === -1) return new Set();

    const minIndex = Math.min(startIndex, endIndex);
    const maxIndex = Math.max(startIndex, endIndex);

    const range = new Set();
    for (let i = minIndex; i <= maxIndex; i++) {
      range.add(data[i].id);
    }

    return range;
  }, [data]);

  // Helper to get rectangular range of cells between two cells
  const getCellRange = useCallback((startCell, endCell) => {
    if (!startCell || !endCell) return new Set();

    // Get row indices
    const startRowIndex = data.findIndex(r => r.id === startCell.rowId);
    const endRowIndex = data.findIndex(r => r.id === endCell.rowId);

    // Get column indices
    const startColIndex = allColumnIds.indexOf(startCell.columnId);
    const endColIndex = allColumnIds.indexOf(endCell.columnId);

    if (startRowIndex === -1 || endRowIndex === -1 || startColIndex === -1 || endColIndex === -1) {
      return new Set();
    }

    // Calculate min/max for the range
    const minRow = Math.min(startRowIndex, endRowIndex);
    const maxRow = Math.max(startRowIndex, endRowIndex);
    const minCol = Math.min(startColIndex, endColIndex);
    const maxCol = Math.max(startColIndex, endColIndex);

    // Generate all cells in the range
    const range = new Set();
    for (let r = minRow; r <= maxRow; r++) {
      for (let c = minCol; c <= maxCol; c++) {
        const rowId = data[r].id;
        const columnId = allColumnIds[c];
        range.add(getCellKey(rowId, columnId));
      }
    }

    return range;
  }, [data, allColumnIds]);

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

  // Row number click handler - selects entire row
  const handleRowNumberClick = useCallback((e, rowId) => {
    e.preventDefault();
    e.stopPropagation();

    if (e.shiftKey && anchorRow) {
      // Shift-click: select range of rows from anchor to current
      const range = getRowRange(anchorRow, rowId);
      setSelectedRows(range);
      setSelectedCells(new Set()); // Clear cell selections
      // Don't update anchor - keep it for next shift-click
    } else if (e.metaKey || e.ctrlKey) {
      // Cmd/Ctrl-click: toggle row selection
      setSelectedRows(prev => {
        const next = new Set(prev);
        if (next.has(rowId)) {
          next.delete(rowId);
        } else {
          next.add(rowId);
        }
        return next;
      });
      setSelectedCells(new Set()); // Clear cell selections
      setAnchorRow(rowId); // Update anchor for next shift-click
    } else {
      // Normal click: select single row
      setSelectedRows(new Set([rowId]));
      setSelectedCells(new Set()); // Clear cell selections
      setAnchorRow(rowId); // Set as anchor for shift-click
    }
    setEditingCell(null);
  }, [anchorRow, getRowRange]);

  // Cell interaction handlers
  const handleCellMouseDown = useCallback((e, rowId, columnId) => {
    if (columnId === 'rowNum') return; // Don't select row number column

    // Prevent default to avoid text selection
    e.preventDefault();

    const cellKey = getCellKey(rowId, columnId);

    // Clear row selections when selecting cells
    setSelectedRows(new Set());

    if (e.shiftKey && anchorCell) {
      // Shift-click: range selection from anchor
      const range = getCellRange(anchorCell, { rowId, columnId });
      setSelectedCells(range);
      setEditingCell(null);
    } else if (e.metaKey || e.ctrlKey) {
      // Cmd/Ctrl-click: toggle selection
      setSelectedCells(prev => {
        const next = new Set(prev);
        if (next.has(cellKey)) {
          next.delete(cellKey);
        } else {
          next.add(cellKey);
        }
        return next;
      });
      setAnchorCell({ rowId, columnId });
      setEditingCell(null);
    } else {
      // Normal mouse down: start drag selection
      setSelectedCells(new Set([cellKey]));
      setAnchorCell({ rowId, columnId });
      setDragStartCell({ rowId, columnId });
      setIsDragging(true);
      setEditingCell(null);
    }
  }, [anchorCell, getCellRange]);

  const handleCellMouseEnter = useCallback((e, rowId, columnId) => {
    if (!isDragging || !dragStartCell || columnId === 'rowNum') return;

    // Update selection to include range from drag start to current cell
    const range = getCellRange(dragStartCell, { rowId, columnId });
    setSelectedCells(range);
  }, [isDragging, dragStartCell, getCellRange]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    setDragStartCell(null);
  }, []);

  const handleCellDoubleClick = useCallback((rowId, columnId, value) => {
    if (columnId === 'rowNum') return;

    setEditingCell({ rowId, columnId });
    setEditValue(value);
  }, []);

  // Track the last copied columns (to detect if copying from timeValue)
  const lastCopiedColumnsRef = useRef([]);

  // Copy/Paste functionality
  const handleCopy = useCallback((e) => {
    if (editingCell) return; // Don't copy while editing
    if (selectedCells.size === 0 && selectedRows.size === 0) return;

    e.preventDefault();

    // ROW COPY MODE: If rows are selected, copy entire rows
    if (selectedRows.size > 0) {
      // Get selected rows in order (use original data to preserve =timeValue formulas)
      const selectedRowIds = Array.from(selectedRows);
      const rowsInOrder = data.filter(row => selectedRowIds.includes(row.id));

      // Convert each row to TSV
      const tsvData = rowsInOrder.map(row => {
        return allColumnIds.map(colId => row[colId] || '').join('\t');
      }).join('\n');

      // Track that we copied all columns
      lastCopiedColumnsRef.current = allColumnIds;

      // Copy to clipboard
      navigator.clipboard.writeText(tsvData);
      return;
    }

    // CELL COPY MODE: Copy selected cells
    // Get all selected cells and organize by row/column
    const cellsByRow = new Map();
    const copiedColumns = new Set();

    selectedCells.forEach(cellKey => {
      const [rowId, columnId] = cellKey.split('|');
      if (columnId === 'rowNum') return; // Skip row number column

      copiedColumns.add(columnId);

      if (!cellsByRow.has(rowId)) {
        cellsByRow.set(rowId, new Map());
      }

      // Use original data to preserve =timeValue formulas
      const row = data.find(r => r.id === rowId);
      if (row) {
        cellsByRow.get(rowId).set(columnId, row[columnId] || '');
      }
    });

    // Track which columns were copied (to detect timeValue copy)
    lastCopiedColumnsRef.current = Array.from(copiedColumns);

    // Convert to TSV (Tab-Separated Values) format for clipboard
    const rows = Array.from(cellsByRow.values());
    const tsvData = rows.map(cellMap => {
      return Array.from(cellMap.values()).join('\t');
    }).join('\n');

    // Copy to clipboard
    navigator.clipboard.writeText(tsvData);
  }, [selectedCells, selectedRows, computedData, editingCell, allColumnIds]);

  const handlePaste = useCallback((e) => {
    if (editingCell) return; // Don't paste while editing
    if (selectedCells.size === 0 && selectedRows.size === 0) return;

    e.preventDefault();

    // Get clipboard data
    const pastedText = e.clipboardData.getData('text');
    if (!pastedText) return;

    // ROW PASTE MODE: If rows are selected, paste into entire rows
    if (selectedRows.size > 0) {
      // Parse TSV data
      const pastedRows = pastedText.split('\n').map(row => row.split('\t'));

      // Get selected rows in order (by their index in data array)
      const selectedRowIds = Array.from(selectedRows);
      const selectedRowIndices = selectedRowIds
        .map(rowId => data.findIndex(r => r.id === rowId))
        .filter(idx => idx !== -1)
        .sort((a, b) => a - b);

      if (selectedRowIndices.length === 0) return;

      // Check if pasting a single row to multiple selected rows (FILL MODE)
      const isSingleRowPaste = pastedRows.length === 1 && selectedRowIndices.length > 1;

      // Store old values for undo
      const oldValues = new Map(); // Map<rowId, Map<columnId, value>>

      if (isSingleRowPaste) {
        // FILL MODE: Paste single row to all selected rows
        const pastedRowValues = pastedRows[0];

        selectedRowIndices.forEach(dataRowIndex => {
          const rowId = data[dataRowIndex].id;
          const rowOldValues = new Map();

          pastedRowValues.forEach((value, colIndex) => {
            if (colIndex < allColumnIds.length) {
              const columnId = allColumnIds[colIndex];
              rowOldValues.set(columnId, data[dataRowIndex][columnId] || '');
            }
          });

          if (rowOldValues.size > 0) {
            oldValues.set(rowId, rowOldValues);
          }
        });

        // Create command for fill operation
        const command = {
          execute: () => {
            setData(prev => {
              const newData = [...prev];

              selectedRowIndices.forEach(dataRowIndex => {
                const rowUpdates = {};
                pastedRowValues.forEach((value, colIndex) => {
                  if (colIndex < allColumnIds.length) {
                    const columnId = allColumnIds[colIndex];
                    rowUpdates[columnId] = value;
                  }
                });

                newData[dataRowIndex] = { ...newData[dataRowIndex], ...rowUpdates };
              });

              return newData;
            });
          },
          undo: () => {
            setData(prev => {
              const newData = [...prev];

              oldValues.forEach((rowOldValues, rowId) => {
                const rowIndex = newData.findIndex(r => r.id === rowId);
                if (rowIndex === -1) return;

                const rowUpdates = {};
                rowOldValues.forEach((value, columnId) => {
                  rowUpdates[columnId] = value;
                });

                newData[rowIndex] = { ...newData[rowIndex], ...rowUpdates };
              });

              return newData;
            });
          },
        };

        executeCommand(command);
        return;
      }

      // RANGE MODE: Paste multiple rows starting from first selected row
      // Calculate how many rows to paste
      const targetRowIndex = selectedRowIndices[0]; // Start pasting at first selected row
      const rowsToPaste = Math.min(pastedRows.length, data.length - targetRowIndex);

      for (let i = 0; i < rowsToPaste; i++) {
        const dataRowIndex = targetRowIndex + i;
        const rowId = data[dataRowIndex].id;
        const pastedRowValues = pastedRows[i];

        const rowOldValues = new Map();
        pastedRowValues.forEach((value, colIndex) => {
          if (colIndex < allColumnIds.length) {
            const columnId = allColumnIds[colIndex];
            rowOldValues.set(columnId, data[dataRowIndex][columnId] || '');
          }
        });

        if (rowOldValues.size > 0) {
          oldValues.set(rowId, rowOldValues);
        }
      }

      // Create command for row paste operation
      const command = {
        execute: () => {
          setData(prev => {
            const newData = [...prev];

            for (let i = 0; i < rowsToPaste; i++) {
              const dataRowIndex = targetRowIndex + i;
              const pastedRowValues = pastedRows[i];

              const rowUpdates = {};
              pastedRowValues.forEach((value, colIndex) => {
                if (colIndex < allColumnIds.length) {
                  const columnId = allColumnIds[colIndex];
                  rowUpdates[columnId] = value;
                }
              });

              newData[dataRowIndex] = { ...newData[dataRowIndex], ...rowUpdates };
            }

            return newData;
          });
        },
        undo: () => {
          setData(prev => {
            const newData = [...prev];

            oldValues.forEach((rowOldValues, rowId) => {
              const rowIndex = newData.findIndex(r => r.id === rowId);
              if (rowIndex === -1) return;

              const rowUpdates = {};
              rowOldValues.forEach((value, columnId) => {
                rowUpdates[columnId] = value;
              });

              newData[rowIndex] = { ...newData[rowIndex], ...rowUpdates };
            });

            return newData;
          });
        },
      };

      executeCommand(command);
      return;
    }

    // CELL PASTE MODE: Continue with existing cell paste logic
    // Check if it's a single cell value (no tabs or newlines)
    const isSingleCell = !pastedText.includes('\t') && !pastedText.includes('\n');

    // Get the anchor cell (first selected cell)
    const firstCellKey = Array.from(selectedCells)[0];
    const [anchorRowId, anchorColumnId] = firstCellKey.split('|');

    if (anchorColumnId === 'rowNum') return; // Don't paste into row number column

    // FILL MODE: Copy one value to all selected cells
    if (isSingleCell && selectedCells.size > 1) {
      // Check if the copied data came from timeValue column
      const copiedFromTimeValue = lastCopiedColumnsRef.current.length === 1 &&
                                   lastCopiedColumnsRef.current[0] === 'timeValue';

      // Store old values for undo
      const oldValues = new Map(); // Map<rowId, Map<columnId, value>>

      selectedCells.forEach(cellKey => {
        const [rowId, columnId] = cellKey.split('|');
        if (columnId === 'rowNum') return;

        const row = data.find(r => r.id === rowId);
        if (!row) return;

        if (!oldValues.has(rowId)) {
          oldValues.set(rowId, new Map());
        }
        oldValues.get(rowId).set(columnId, row[columnId] || '');
      });

      // Create command for fill operation
      const command = {
        execute: () => {
          setData(prev => prev.map(row => {
            const rowUpdates = {};
            let hasUpdates = false;

            selectedCells.forEach(cellKey => {
              const [rowId, columnId] = cellKey.split('|');
              if (row.id === rowId && columnId !== 'rowNum') {
                // If copying from timeValue to a day column, create a link
                const isDayColumn = columnId.startsWith('day-');
                if (copiedFromTimeValue && isDayColumn) {
                  rowUpdates[columnId] = '=timeValue';
                } else {
                  rowUpdates[columnId] = pastedText;
                }
                hasUpdates = true;
              }
            });

            return hasUpdates ? { ...row, ...rowUpdates } : row;
          }));
        },
        undo: () => {
          setData(prev => {
            const newData = [...prev];

            oldValues.forEach((rowOldValues, rowId) => {
              const rowIndex = newData.findIndex(r => r.id === rowId);
              if (rowIndex === -1) return;

              const rowUpdates = {};
              rowOldValues.forEach((value, columnId) => {
                rowUpdates[columnId] = value;
              });

              newData[rowIndex] = { ...newData[rowIndex], ...rowUpdates };
            });

            return newData;
          });
        },
      };

      executeCommand(command);
      return;
    }

    // RANGE MODE: Paste TSV grid starting from anchor cell
    // Parse TSV data
    const rows = pastedText.split('\n').map(row => row.split('\t'));

    // Find the anchor row index and column index
    const anchorRowIndex = data.findIndex(r => r.id === anchorRowId);

    // Get column index from allColumnIds
    const anchorColIndex = allColumnIds.indexOf(anchorColumnId);

    if (anchorRowIndex === -1 || anchorColIndex === -1) return;

    // Check if we're pasting from timeValue column(s)
    // For range paste, check if the source columns include timeValue
    const copiedFromTimeValue = lastCopiedColumnsRef.current.includes('timeValue');

    // Store old values for undo
    const oldValues = new Map(); // Map<rowId, Map<columnId, value>>

    rows.forEach((rowValues, rowOffset) => {
      const targetRowIndex = anchorRowIndex + rowOffset;
      if (targetRowIndex >= data.length) return;

      const rowId = data[targetRowIndex].id;
      const rowOldValues = new Map();

      rowValues.forEach((value, colOffset) => {
        const targetColIndex = anchorColIndex + colOffset;
        if (targetColIndex >= allColumnIds.length) return;

        const columnId = allColumnIds[targetColIndex];
        rowOldValues.set(columnId, data[targetRowIndex][columnId] || '');
      });

      if (rowOldValues.size > 0) {
        oldValues.set(rowId, rowOldValues);
      }
    });

    // Create command for paste operation
    const command = {
      execute: () => {
        setData(prev => {
          const newData = [...prev];

          rows.forEach((rowValues, rowOffset) => {
            const targetRowIndex = anchorRowIndex + rowOffset;
            if (targetRowIndex >= newData.length) return;

            const rowUpdates = {};
            rowValues.forEach((value, colOffset) => {
              const targetColIndex = anchorColIndex + colOffset;
              if (targetColIndex >= allColumnIds.length) return;

              const columnId = allColumnIds[targetColIndex];
              const sourceColIndex = lastCopiedColumnsRef.current[colOffset];

              // If pasting from timeValue to a day column, create a link
              const isDayColumn = columnId.startsWith('day-');
              if (copiedFromTimeValue && sourceColIndex === 'timeValue' && isDayColumn) {
                rowUpdates[columnId] = '=timeValue';
              } else {
                rowUpdates[columnId] = value;
              }
            });

            newData[targetRowIndex] = { ...newData[targetRowIndex], ...rowUpdates };
          });

          return newData;
        });
      },
      undo: () => {
        setData(prev => {
          const newData = [...prev];

          oldValues.forEach((rowOldValues, rowId) => {
            const rowIndex = newData.findIndex(r => r.id === rowId);
            if (rowIndex === -1) return;

            const rowUpdates = {};
            rowOldValues.forEach((value, columnId) => {
              rowUpdates[columnId] = value;
            });

            newData[rowIndex] = { ...newData[rowIndex], ...rowUpdates };
          });

          return newData;
        });
      },
    };

    executeCommand(command);
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

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Undo: Cmd/Ctrl+Z (not while editing)
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey && !editingCell) {
        e.preventDefault();
        undo();
        return;
      }

      // Redo: Cmd/Ctrl+Shift+Z (not while editing)
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && e.shiftKey && !editingCell) {
        e.preventDefault();
        redo();
        return;
      }

      // Don't interfere if we're editing
      if (editingCell) return;

      // Copy: Cmd/Ctrl+C (handled by copy event listener)
      // Paste: Cmd/Ctrl+V (handled by paste event listener)

      // Cmd/Ctrl+Backspace to delete rows entirely
      if ((e.metaKey || e.ctrlKey) && e.key === 'Backspace') {
        e.preventDefault();
        if (selectedRows.size > 0) {
          handleDeleteRows();
        }
        return;
      }

      // Delete/Backspace to clear cells or rows
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();

        // ROW CLEAR MODE: If rows are selected, clear all cells in those rows
        if (selectedRows.size > 0) {
          // Store old values for undo
          const oldValues = new Map(); // Map<rowId, Map<columnId, value>>

          selectedRows.forEach(rowId => {
            const row = data.find(r => r.id === rowId);
            if (!row) return;

            const rowOldValues = new Map();
            allColumnIds.forEach(columnId => {
              rowOldValues.set(columnId, row[columnId] || '');
            });

            oldValues.set(rowId, rowOldValues);
          });

          // Create command for row clear operation
          const command = {
            execute: () => {
              setData(prev => prev.map(row => {
                if (selectedRows.has(row.id)) {
                  // Clear all columns in this row
                  const rowUpdates = {};
                  allColumnIds.forEach(columnId => {
                    rowUpdates[columnId] = '';
                  });
                  return { ...row, ...rowUpdates };
                }
                return row;
              }));
            },
            undo: () => {
              setData(prev => {
                const newData = [...prev];

                oldValues.forEach((rowOldValues, rowId) => {
                  const rowIndex = newData.findIndex(r => r.id === rowId);
                  if (rowIndex === -1) return;

                  const rowUpdates = {};
                  rowOldValues.forEach((value, columnId) => {
                    rowUpdates[columnId] = value;
                  });

                  newData[rowIndex] = { ...newData[rowIndex], ...rowUpdates };
                });

                return newData;
              });
            },
          };

          executeCommand(command);
          return;
        }

        // CELL DELETE MODE: Clear selected cells
        // Store old values for undo
        const oldValues = new Map(); // Map<rowId, Map<columnId, value>>

        selectedCells.forEach(cellKey => {
          const [rowId, columnId] = cellKey.split('|');
          if (columnId === 'rowNum') return;

          const row = data.find(r => r.id === rowId);
          if (!row) return;

          if (!oldValues.has(rowId)) {
            oldValues.set(rowId, new Map());
          }
          oldValues.get(rowId).set(columnId, row[columnId] || '');
        });

        // Create command for delete operation
        const command = {
          execute: () => {
            setData(prev => prev.map(row => {
              const rowUpdates = {};
              let hasUpdates = false;

              selectedCells.forEach(cellKey => {
                const [rowId, columnId] = cellKey.split('|');
                if (row.id === rowId && columnId !== 'rowNum') {
                  rowUpdates[columnId] = '';
                  hasUpdates = true;
                }
              });

              return hasUpdates ? { ...row, ...rowUpdates } : row;
            }));
          },
          undo: () => {
            setData(prev => {
              const newData = [...prev];

              oldValues.forEach((rowOldValues, rowId) => {
                const rowIndex = newData.findIndex(r => r.id === rowId);
                if (rowIndex === -1) return;

                const rowUpdates = {};
                rowOldValues.forEach((value, columnId) => {
                  rowUpdates[columnId] = value;
                });

                newData[rowIndex] = { ...newData[rowIndex], ...rowUpdates };
              });

              return newData;
            });
          },
        };

        executeCommand(command);
      }

      // Arrow key navigation and typing to edit only work with cell selection
      if (selectedCells.size > 0) {
        const firstCellKey = Array.from(selectedCells)[0];
        const [currentRowId, currentColumnId] = firstCellKey.split('|');

        // Arrow key navigation (TODO: implement navigation logic)
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
          e.preventDefault();
          console.log('Arrow key pressed:', e.key, 'Current cell:', currentRowId, currentColumnId);
        }

        // Start typing to edit (if alphanumeric) - only if not already editing
        if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !editingCell) {
          e.preventDefault();
          const row = data.find(r => r.id === currentRowId);
          const currentValue = row ? row[currentColumnId] || '' : '';

          // For dropdown columns (project, subproject, status, estimate), start editing with current value
          if (currentColumnId === 'project' || currentColumnId === 'subproject' || currentColumnId === 'status' || currentColumnId === 'estimate') {
            setEditingCell({ rowId: currentRowId, columnId: currentColumnId });
            setEditValue(currentValue);
          } else {
            // For regular columns, start editing with the typed character
            setEditingCell({ rowId: currentRowId, columnId: currentColumnId });
            setEditValue(e.key);
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('copy', handleCopy);
    window.addEventListener('paste', handlePaste);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('copy', handleCopy);
      window.removeEventListener('paste', handlePaste);
    };
  }, [selectedCells, selectedRows, editingCell, handleCopy, handlePaste, undo, redo, data, executeCommand, allColumnIds, handleDeleteRows]);

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

    // Early exit if no statuses are selected
    if (selectedSortStatuses.size === 0) {
      return;
    }

    // Helper to normalize project keys for matching (lowercase, trim)
    const normalizeProjectKey = (key) => {
      if (!key) return '';
      return key.trim().toLowerCase();
    };

    // Build a map: normalized nickname -> projectNickname for matching
    // Project section rows have both projectName (full) and projectNickname (short)
    // Task rows have project field which contains the nickname from dropdown
    const nicknameMap = new Map();
    data.forEach((row) => {
      if (row._rowType === 'projectGeneral' || row._rowType === 'projectUnscheduled') {
        // The project section rows store the nickname, use that as our key
        const nickname = normalizeProjectKey(row.projectNickname);
        nicknameMap.set(nickname, row.projectNickname);
      }
    });

    // Find inbox section boundaries
    const inboxStartIndex = data.findIndex(row => row._isInboxRow);
    const archiveStartIndex = data.findIndex(row => row._isArchiveRow);

    if (inboxStartIndex === -1) {
      return;
    }

    // Determine inbox section end (either at archive row or end of data)
    const inboxEndIndex = archiveStartIndex !== -1 ? archiveStartIndex : data.length;

    // Collect inbox tasks that match the selected statuses
    const generalTasksByProject = new Map(); // Map<projectKey, task[]>
    const unscheduledTasksByProject = new Map(); // Map<projectKey, task[]>
    const inboxTasksToMove = new Set(); // Track which task IDs are being moved

    for (let i = inboxStartIndex + 1; i < inboxEndIndex; i++) {
      const row = data[i];

      // Skip special rows - only process regular task rows
      if (row._isMonthRow || row._isWeekRow || row._isDayRow ||
          row._isDayOfWeekRow || row._isDailyMinRow || row._isDailyMaxRow ||
          row._isFilterRow || row._isInboxRow || row._isArchiveRow || row._rowType) {
        continue;
      }

      // Check if this task should be sorted
      const status = row.status || '';
      if (!selectedSortStatuses.has(status)) {
        continue;
      }

      // Determine target section
      const target = SORT_INBOX_TARGET_MAP[status];
      if (!target) {
        continue;
      }

      // Match project by nickname
      // Task row.project contains the nickname from the dropdown
      const taskProjectNickname = normalizeProjectKey(row.project);

      // Check if this nickname exists in our project sections
      if (!nicknameMap.has(taskProjectNickname)) {
        continue;
      }

      // Use the normalized nickname as the map key
      const projectKey = taskProjectNickname;

      // Add to appropriate collection
      if (target === 'general') {
        if (!generalTasksByProject.has(projectKey)) {
          generalTasksByProject.set(projectKey, []);
        }
        generalTasksByProject.get(projectKey).push(row);
        inboxTasksToMove.add(row.id);
      } else if (target === 'unscheduled') {
        if (!unscheduledTasksByProject.has(projectKey)) {
          unscheduledTasksByProject.set(projectKey, []);
        }
        unscheduledTasksByProject.get(projectKey).push(row);
        inboxTasksToMove.add(row.id);
      }
    }

    // If no tasks to move, exit early
    if (inboxTasksToMove.size === 0) {
      return;
    }

    // Store old data for undo
    const oldData = [...data];

    // Copy the set for closure capture
    const tasksToMove = new Set(inboxTasksToMove);

    // Create command for sort inbox operation
    const command = {
      execute: () => {
        setData(prevData => {
          const newData = [];
          // Create fresh copies of the maps for this execution to avoid mutation issues
          const generalTasksCopy = new Map(generalTasksByProject);
          const unscheduledTasksCopy = new Map(unscheduledTasksByProject);

          prevData.forEach((row) => {
            // Skip tasks that are being moved from inbox
            if (tasksToMove.has(row.id)) {
              return;
            }

            // Add the current row
            newData.push(row);

            // If this is a projectGeneral row, insert general tasks for this project
            if (row._rowType === 'projectGeneral') {
              const projectKey = normalizeProjectKey(row.projectNickname);
              const tasksToInsert = generalTasksCopy.get(projectKey);

              if (tasksToInsert && tasksToInsert.length > 0) {
                tasksToInsert.forEach(task => {
                  newData.push(task);
                });
                generalTasksCopy.delete(projectKey);
              }
            }

            // If this is a projectUnscheduled row, insert unscheduled tasks for this project
            if (row._rowType === 'projectUnscheduled') {
              const projectKey = normalizeProjectKey(row.projectNickname);
              const tasksToInsert = unscheduledTasksCopy.get(projectKey);

              if (tasksToInsert && tasksToInsert.length > 0) {
                tasksToInsert.forEach(task => {
                  newData.push(task);
                });
                unscheduledTasksCopy.delete(projectKey);
              }
            }
          });

          return newData;
        });
      },
      undo: () => {
        setData(oldData);
      },
    };

    executeCommand(command);
  }, [data, selectedSortStatuses, executeCommand]);

  const handleArchiveWeek = useCallback(() => {
    setIsListicalMenuOpen(false);
    // Placeholder for Archive Week functionality
    // In V2, this feature may not be applicable yet
    console.log('Archive Week clicked - not yet implemented in V2');
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
      />
      </div>
      </div>
    </div>
  );
}
