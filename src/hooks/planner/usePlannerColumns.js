/**
 * Planner Columns Hook
 * Defines table column structure
 */

import { useMemo } from 'react';

/**
 * Hook to generate column definitions for the planner table
 * @param {Object} options - Hook options
 * @param {number} options.totalDays - Total number of day columns to create
 * @param {number} [options.scale] - Page zoom scale; default column widths
 *   are defined at 100% and multiplied by this so zoom widens columns too
 * @returns {Array} Column definitions array
 */
export default function usePlannerColumns({ totalDays, scale = 1 }) {
  const columns = useMemo(() => {
    const sz = (base) => Math.round(base * scale);
    const cols = [
      {
        id: 'rowNum',
        header: '#',
        size: sz(36),
        enableResizing: false,
      },
      {
        id: 'checkbox',
        header: 'Checkbox',
        accessorKey: 'checkbox',
        size: sz(120),
        minSize: sz(30),
        enableResizing: true,
      },
      {
        id: 'project',
        header: 'Project',
        accessorKey: 'project',
        size: sz(120),
        minSize: sz(30),
        enableResizing: true,
      },
      {
        id: 'subproject',
        header: 'Subproject',
        accessorKey: 'subproject',
        size: sz(240),
        minSize: sz(50),
        enableResizing: true,
      },
      {
        id: 'status',
        header: 'Status',
        accessorKey: 'status',
        size: sz(100),
        minSize: sz(30),
        enableResizing: true,
      },
      {
        id: 'task',
        header: 'Task',
        accessorKey: 'task',
        size: sz(80),
        minSize: sz(30),
        enableResizing: true,
      },
      {
        id: 'recurring',
        header: 'Recurring',
        accessorKey: 'recurring',
        size: sz(80),
        minSize: sz(30),
        enableResizing: true,
      },
      {
        id: 'estimate',
        header: 'Estimate',
        accessorKey: 'estimate',
        size: sz(80),
        minSize: sz(30),
        enableResizing: true,
      },
      {
        id: 'timeValue',
        header: 'Time Value',
        accessorKey: 'timeValue',
        size: sz(80),
        minSize: sz(30),
        enableResizing: true,
      },
    ];

    // Add day columns (84 columns for 12 weeks) - starting from column I
    for (let i = 0; i < totalDays; i++) {
      cols.push({
        id: `day-${i}`,
        header: `Day ${i + 1}`,
        accessorKey: `day-${i}`,
        size: sz(60),
        minSize: sz(40),
        // Day columns don't need per-column resizing -- there are too many
        // of them (84) for it to be a useful affordance, and it added a
        // resize handle in the Daily Total row that wasn't needed.
        enableResizing: false,
      });
    }

    return cols;
  }, [totalDays, scale]);

  return columns;
}
