import { useState, useCallback } from 'react';
import type { UseDayColumnFiltersReturn } from '../../types/planner';

/**
 * Hook to manage day column filters
 *
 * This hook manages which day columns are used for filtering rows.
 * NOTE: This is different from visibleDayColumns (which controls column visibility).
 * Day column filters determine which rows should be filtered based on having values in specific day columns.
 *
 * @returns Object with dayColumnFilters state and helper functions
 */
export default function useDayColumnFilters(): UseDayColumnFiltersReturn {
  const [dayColumnFilters, setDayColumnFilters] = useState<Set<string>>(new Set());

  // Toggle a day column filter on/off
  const toggleDayFilter = useCallback((dayColumnId: string) => {
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

  // Check if a day column is being used for filtering
  const isDayFiltered = useCallback((dayColumnId: string) => {
    return dayColumnFilters.has(dayColumnId);
  }, [dayColumnFilters]);

  // Clear all day column filters
  const clearAllDayFilters = useCallback(() => {
    setDayColumnFilters(new Set());
  }, []);

  return {
    dayColumnFilters,
    toggleDayFilter,
    isDayFiltered,
    clearAllDayFilters,
  };
}
