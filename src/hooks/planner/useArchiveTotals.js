/**
 * Archive Totals Calculation Hook
 * Calculates totals for archived projects and archive weeks (memoized for performance)
 */

import { useMemo } from 'react';
import { sumDayColumns } from '../../utils/planner/dayColumnHelpers';

/**
 * Calculate totals for each archived project
 * Sums up all tasks under each archived project header
 *
 * @param {object[]} data - Data array
 * @param {number} totalDays - Total number of days
 * @returns {object} Map of archived project ID to total hours
 */
export const useArchivedProjectTotals = (data, totalDays = 84) => {
  return useMemo(() => {
    const totals = {};

    let currentArchivedProject = null;
    let currentProjectTasks = [];

    data.forEach((row, index) => {
      // Track when we enter an archived project header
      if (row._rowType === 'archivedProjectHeader') {
        // Save totals for previous project if any
        if (currentArchivedProject) {
          const total = currentProjectTasks.reduce((sum, task) => {
            // Only count Scheduled and Done tasks (exclude Abandoned)
            const status = task.status || '';
            if (status === 'Scheduled' || status === 'Done') {
              const timeValue = parseFloat(task.timeValue) || 0;
              return sum + timeValue;
            }
            return sum;
          }, 0);
          totals[currentArchivedProject.id] = total.toFixed(2);
        }

        // Start tracking new project
        currentArchivedProject = row;
        currentProjectTasks = [];
      }
      // Collect tasks that belong to current archived project
      // Tasks have parentGroupId = archived project's groupId
      else if (currentArchivedProject && row.parentGroupId === currentArchivedProject.groupId) {
        // Only count regular task rows (not project general/unscheduled section rows)
        if (!row._rowType && row.task) {
          currentProjectTasks.push(row);
        }
      }
      // We've moved past archived projects (hit another archived project or end of archive)
      else if (currentArchivedProject && (row._rowType === 'archivedProjectHeader' || !row._rowType?.startsWith('archived'))) {
        // Save totals for last project
        const total = currentProjectTasks.reduce((sum, task) => {
          // Only count Scheduled and Done tasks (exclude Abandoned)
          const status = task.status || '';
          if (status === 'Scheduled' || status === 'Done') {
            const timeValue = parseFloat(task.timeValue) || 0;
            return sum + timeValue;
          }
          return sum;
        }, 0);
        totals[currentArchivedProject.id] = total.toFixed(2);
        currentArchivedProject = null;
        currentProjectTasks = [];
      }
    });

    // Save totals for last project if we ended while still in an archived project
    if (currentArchivedProject) {
      const total = currentProjectTasks.reduce((sum, task) => {
        // Only count Scheduled and Done tasks (exclude Abandoned)
        const status = task.status || '';
        if (status === 'Scheduled' || status === 'Done') {
          const timeValue = parseFloat(task.timeValue) || 0;
          return sum + timeValue;
        }
        return sum;
      }, 0);
      totals[currentArchivedProject.id] = total.toFixed(2);
    }

    return totals;
  }, [data, totalDays]);
};

/**
 * Calculate totals for each archive week
 * Sums up all archived projects and tasks under each archive week
 *
 * @param {object[]} data - Data array
 * @param {number} totalDays - Total number of days
 * @returns {object} Map of archive week ID to { totalHours, dayTotals }
 */
export const useArchivedWeekTotals = (data, totalDays = 84) => {
  return useMemo(() => {
    const totals = {};

    let currentArchiveWeek = null;
    let currentWeekTasks = [];

    data.forEach((row, index) => {
      // Track when we enter an archive week
      if (row._rowType === 'archiveRow') {
        // Save totals for previous week if any
        if (currentArchiveWeek) {
          const totalHours = currentWeekTasks.reduce((sum, task) => {
            // Only count Scheduled and Done tasks (exclude Abandoned)
            const status = task.status || '';
            if (status === 'Scheduled' || status === 'Done') {
              const timeValue = parseFloat(task.timeValue) || 0;
              return sum + timeValue;
            }
            return sum;
          }, 0);

          // Filter tasks for day totals - only Scheduled and Done
          const tasksForDayTotals = currentWeekTasks.filter(task => {
            const status = task.status || '';
            return status === 'Scheduled' || status === 'Done';
          });
          const dayTotals = sumDayColumns(tasksForDayTotals, totalDays);

          totals[currentArchiveWeek.id] = {
            totalHours: totalHours.toFixed(2),
            dayTotals,
          };
        }

        // Start tracking new archive week
        currentArchiveWeek = row;
        currentWeekTasks = [];
      }
      // Collect tasks that belong to current archive week
      else if (currentArchiveWeek && row.parentGroupId === currentArchiveWeek.id) {
        // Only count regular task rows (not archived project structure rows)
        if (!row._rowType && row.task) {
          currentWeekTasks.push(row);
        }
      }
      // We've moved past this archive week
      else if (currentArchiveWeek && row._rowType === 'archiveRow') {
        // Save totals for previous week
        const totalHours = currentWeekTasks.reduce((sum, task) => {
          // Only count Scheduled and Done tasks (exclude Abandoned)
          const status = task.status || '';
          if (status === 'Scheduled' || status === 'Done') {
            const timeValue = parseFloat(task.timeValue) || 0;
            return sum + timeValue;
          }
          return sum;
        }, 0);

        // Filter tasks for day totals - only Scheduled and Done
        const tasksForDayTotals = currentWeekTasks.filter(task => {
          const status = task.status || '';
          return status === 'Scheduled' || status === 'Done';
        });
        const dayTotals = sumDayColumns(tasksForDayTotals, totalDays);

        totals[currentArchiveWeek.id] = {
          totalHours: totalHours.toFixed(2),
          dayTotals,
        };

        // Start new week
        currentArchiveWeek = row;
        currentWeekTasks = [];
      }
    });

    // Save totals for last archive week if we ended while still in one
    if (currentArchiveWeek) {
      const totalHours = currentWeekTasks.reduce((sum, task) => {
        // Only count Scheduled and Done tasks (exclude Abandoned)
        const status = task.status || '';
        if (status === 'Scheduled' || status === 'Done') {
          const timeValue = parseFloat(task.timeValue) || 0;
          return sum + timeValue;
        }
        return sum;
      }, 0);

      // Filter tasks for day totals - only Scheduled and Done
      const tasksForDayTotals = currentWeekTasks.filter(task => {
        const status = task.status || '';
        return status === 'Scheduled' || status === 'Done';
      });
      const dayTotals = sumDayColumns(tasksForDayTotals, totalDays);

      totals[currentArchiveWeek.id] = {
        totalHours: totalHours.toFixed(2),
        dayTotals,
      };
    }

    return totals;
  }, [data, totalDays]);
};

/**
 * Combined hook for both archived project and week totals
 *
 * @param {object[]} data - Data array
 * @param {number} totalDays - Total number of days
 * @returns {object} { projectTotals, weekTotals }
 */
export const useArchiveTotals = (data, totalDays = 84) => {
  const projectTotals = useArchivedProjectTotals(data, totalDays);
  const weekTotals = useArchivedWeekTotals(data, totalDays);

  return {
    projectTotals,
    weekTotals,
  };
};
