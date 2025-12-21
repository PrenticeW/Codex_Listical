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
        id: 'project',
        header: 'Project',
        accessorKey: 'project',
        size: 120,
        minSize: 30,
        enableResizing: true,
      },
      {
        id: 'status',
        header: 'Status',
        accessorKey: 'status',
        size: 120,
        minSize: 30,
        enableResizing: true,
      },
      {
        id: 'task',
        header: 'Task',
        accessorKey: 'task',
        size: 240,
        minSize: 50,
        enableResizing: true,
      },
      {
        id: 'estimate',
        header: 'Estimate',
        accessorKey: 'estimate',
        size: 100,
        minSize: 30,
        enableResizing: true,
      },
      {
        id: 'timeValue',
        header: 'Time',
        accessorKey: 'timeValue',
        size: 80,
        minSize: 30,
        enableResizing: true,
      },
      {
        id: 'col_f',
        header: 'F',
        accessorKey: 'col_f',
        size: 80,
        minSize: 30,
        enableResizing: true,
      },
      {
        id: 'col_g',
        header: 'G',
        accessorKey: 'col_g',
        size: 80,
        minSize: 30,
        enableResizing: true,
      },
      {
        id: 'col_h',
        header: 'H',
        accessorKey: 'col_h',
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
