/**
 * Archive Operations Hook
 * Handles all archive-related operations: archiving weeks, hiding/showing weeks
 *
 * Extracted from ProjectTimePlannerV2 to reduce component size
 */

import { useCallback } from 'react';
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
} from '../../utils/planner/archiveHelpers';
import { createDayColumnUpdates } from '../../utils/planner/dayColumnHelpers';

/**
 * Hook for archive operations
 */
export default function useArchiveOperations({
  data,
  setData,
  dates,
  startDate,
  dailyMinValues,
  dailyMaxValues,
  totalDays,
  currentYear,
  executeCommand,
  collapsedGroups,
  setCollapsedGroups,
  visibleDayColumns,
  setVisibleDayColumns,
  setIsListicalMenuOpen,
}) {
  /**
   * Archive the current week
   * Moves Done/Abandoned tasks to archive and creates archive week row
   */
  const handleArchiveWeek = useCallback(() => {
    setIsListicalMenuOpen(false);

    // Get the week number from the first VISIBLE week
    let firstVisibleDayIndex = 0;
    for (let i = 0; i < totalDays; i++) {
      if (visibleDayColumns[`day-${i}`] !== false) {
        firstVisibleDayIndex = i;
        break;
      }
    }

    const displayedWeekNumber = Math.floor(firstVisibleDayIndex / 7) + 1;

    // Step 1: Calculate week metadata
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

    // Step 3: Copy project structure as archived
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
    const recurringSnapshots = recurringTasks.map(task => snapshotRecurringTask(task, totalDays));

    // Step 6: Build new data array
    const archiveCommand = {
      execute: () => {
        let newData = insertArchiveRow(data, archiveWeekRow);
        newData = insertArchivedProjects(newData, archiveWeekRow.id, archivedProjects);
        newData = moveTasksToArchive(newData, nonRecurringTasks, archiveWeekRow.id);
        newData = insertRecurringSnapshots(newData, recurringSnapshots, archiveWeekRow.id);
        newData = resetRecurringTasks(newData, recurringTasks);

        // Track collapsed state for the new archive week group
        setCollapsedGroups(prev => new Set([...prev, archiveWeekRow.groupId]));

        return newData;
      },
      undo: (prevData) => prevData,
    };

    executeCommand(archiveCommand);
  }, [
    data,
    dates,
    startDate,
    dailyMinValues,
    dailyMaxValues,
    totalDays,
    currentYear,
    executeCommand,
    collapsedGroups,
    setCollapsedGroups,
    visibleDayColumns,
    setIsListicalMenuOpen,
  ]);

  /**
   * Hide the leftmost visible week
   */
  const handleHideWeek = useCallback(() => {
    setIsListicalMenuOpen(false);

    setVisibleDayColumns(prev => {
      const newVisible = { ...prev };
      const visibleDays = Object.entries(newVisible)
        .filter(([_, isVisible]) => isVisible)
        .map(([colId]) => parseInt(colId.replace('day-', '')))
        .sort((a, b) => a - b);

      // Hide up to 7 days, but ensure at least 7 days remain visible
      const daysToHide = Math.min(7, visibleDays.length - 7);
      if (daysToHide > 0) {
        for (let i = 0; i < daysToHide; i++) {
          newVisible[`day-${visibleDays[i]}`] = false;
        }
      }

      return newVisible;
    });
  }, [setVisibleDayColumns, setIsListicalMenuOpen]);

  /**
   * Show the leftmost hidden week
   */
  const handleShowWeek = useCallback(() => {
    setIsListicalMenuOpen(false);

    setVisibleDayColumns(prev => {
      const newVisible = { ...prev };
      const hiddenDays = Object.entries(newVisible)
        .filter(([_, isVisible]) => !isVisible)
        .map(([colId]) => parseInt(colId.replace('day-', '')))
        .sort((a, b) => a - b);

      // Show up to 7 hidden days
      const daysToShow = Math.min(7, hiddenDays.length);
      for (let i = 0; i < daysToShow; i++) {
        newVisible[`day-${hiddenDays[i]}`] = true;
      }

      return newVisible;
    });
  }, [setVisibleDayColumns, setIsListicalMenuOpen]);

  /**
   * Add an additional week of columns
   */
  const handleAddWeek = useCallback(() => {
    setIsListicalMenuOpen(false);

    setData(prevData => {
      return prevData.map(row => {
        // For special rows (month, week, day, etc.), add empty day columns
        if (row._isMonthRow || row._isWeekRow || row._isDayRow ||
            row._isDayOfWeekRow || row._isDailyMinRow || row._isDailyMaxRow || row._isFilterRow) {
          const newRow = { ...row };
          for (let i = totalDays; i < totalDays + 7; i++) {
            newRow[`day-${i}`] = '';
          }
          return newRow;
        }
        // For regular rows, add empty day columns
        const newRow = { ...row };
        for (let i = totalDays; i < totalDays + 7; i++) {
          newRow[`day-${i}`] = '';
        }
        return newRow;
      });
    });

    // Update total days in storage
    // Note: This assumes setTotalDays is available in the parent
    // You might need to pass this as a parameter
  }, [data, setData, totalDays, setIsListicalMenuOpen]);

  return {
    handleArchiveWeek,
    handleHideWeek,
    handleShowWeek,
    handleAddWeek,
  };
}
