/**
 * Planner Columns Hook
 * Defines table column structure
 */

import { useMemo } from 'react';

/**
 * Hook to generate column definitions for the planner table
 * @param {Object} options - Hook options
 * @param {number} options.totalDays - Total number of day columns to create
 * @returns {Array} Column definitions array
 */
export default function usePlannerColumns({ totalDays }) {
  const columns = useMemo(() => {
    const cols = [
      {
        id: 'rowNum',
        header: '#',
        size: 36,
        enableResizing: false,
      },
      {
        id: 'checkbox',
        header: 'Checkbox',
        accessorKey: 'checkbox',
        size: 120,
        minSize: 30,
        enableResizing: true,
      },
      {
        id: 'project',
        header: 'Project',
        accessorKey: 'project',
        size: 120,
        minSize: 30,
        enableResizing: true,
      },
      {
        id: 'subproject',
        header: 'Subproject',
        accessorKey: 'subproject',
        size: 240,
        minSize: 50,
        enableResizing: true,
      },
      {
        id: 'status',
        header: 'Status',
        accessorKey: 'status',
        size: 100,
        minSize: 30,
        enableResizing: true,
      },
      {
        id: 'task',
        header: 'Task',
        accessorKey: 'task',
        size: 80,
        minSize: 30,
        enableResizing: true,
      },
      {
        id: 'recurring',
        header: 'Recurring',
        accessorKey: 'recurring',
        size: 80,
        minSize: 30,
        enableResizing: true,
      },
      {
        id: 'estimate',
        header: 'Estimate',
        accessorKey: 'estimate',
        size: 80,
        minSize: 30,
        enableResizing: true,
      },
      {
        id: 'timeValue',
        header: 'Time Value',
        accessorKey: 'timeValue',
        size: 80,
        minSize: 30,
        enableResizing: true,
      },
    ];

    // Add day columns (84 columns for 12 weeks) - starting from column I
    for (let i = 0; i < totalDays; i++) {
      cols.push({
        id: `day-${i}`,
        header: `Day ${i + 1}`,
        accessorKey: `day-${i}`,
        size: 60,
        minSize: 40,
        enableResizing: true,
      });
    }

    return cols;
  }, [totalDays]);

  return columns;
}
