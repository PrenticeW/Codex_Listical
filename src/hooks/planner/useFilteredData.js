import { useMemo } from 'react';
import {
  shouldBypassFilters,
  isSectionDivider,
  isProjectStructureRow,
  isSpecialRow,
} from '../../utils/planner/rowTypeChecks';
import { getNormalizedColumnValue } from '../../utils/planner/valueNormalizers';

/**
 * Custom hook for filtering planner data
 * Handles both column filters (project, status, etc.), day column filters, and collapsed groups
 *
 * @param {Object} params - Configuration object
 * @param {Array} params.computedData - The computed data to filter
 * @param {Set} params.dayColumnFilters - Set of day column IDs to filter by
 * @param {Set} params.selectedProjectFilters - Selected project filters
 * @param {Set} params.selectedSubprojectFilters - Selected subproject filters
 * @param {Set} params.selectedStatusFilters - Selected status filters
 * @param {Set} params.selectedRecurringFilters - Selected recurring filters
 * @param {Set} params.selectedEstimateFilters - Selected estimate filters
 * @param {Set} params.collapsedGroups - Set of groupIds that are collapsed (optional)
 * @param {Function} params.coerceNumber - Function to coerce values to numbers
 * @returns {Array} Filtered data
 */
export const useFilteredData = ({
  computedData,
  dayColumnFilters,
  selectedProjectFilters,
  selectedSubprojectFilters,
  selectedStatusFilters,
  selectedRecurringFilters,
  selectedEstimateFilters,
  collapsedGroups = new Set(),
  coerceNumber,
}) => {
  return useMemo(() => {
    // If no filters and no collapsed groups, return all data
    if (dayColumnFilters.size === 0 &&
        !selectedProjectFilters.size &&
        !selectedSubprojectFilters.size &&
        !selectedStatusFilters.size &&
        !selectedRecurringFilters.size &&
        !selectedEstimateFilters.size &&
        collapsedGroups.size === 0) {
      return computedData;
    }

    // Helper functions to match filters
    const matchesProjectFilter = (row) => {
      if (!selectedProjectFilters.size) return true;
      if (shouldBypassFilters(row)) {
        return !isSectionDivider(row) && !isProjectStructureRow(row);
      }
      return selectedProjectFilters.has(getNormalizedColumnValue(row, 'project'));
    };

    const matchesSubprojectFilter = (row) => {
      if (!selectedSubprojectFilters.size) return true;
      if (shouldBypassFilters(row)) {
        return !isSectionDivider(row) && !isProjectStructureRow(row);
      }
      return selectedSubprojectFilters.has(getNormalizedColumnValue(row, 'subproject'));
    };

    const matchesStatusFilter = (row) => {
      if (!selectedStatusFilters.size) return true;
      if (shouldBypassFilters(row)) {
        return !isSectionDivider(row) && !isProjectStructureRow(row);
      }
      return selectedStatusFilters.has(getNormalizedColumnValue(row, 'status'));
    };

    const matchesRecurringFilter = (row) => {
      if (!selectedRecurringFilters.size) return true;
      if (shouldBypassFilters(row)) {
        return !isSectionDivider(row) && !isProjectStructureRow(row);
      }
      const value = row.recurring === 'Recurring' ? 'Recurring' : 'Not Recurring';
      return selectedRecurringFilters.has(value);
    };

    const matchesEstimateFilter = (row) => {
      if (!selectedEstimateFilters.size) return true;
      if (shouldBypassFilters(row)) {
        return !isSectionDivider(row) && !isProjectStructureRow(row);
      }
      return selectedEstimateFilters.has(getNormalizedColumnValue(row, 'estimate'));
    };

    const filtered = computedData.filter(row => {
      // Filter out rows that belong to collapsed groups (archive weeks)
      if (row.parentGroupId && collapsedGroups.has(row.parentGroupId)) {
        return false;
      }

      // If no other filters are active and no collapsed groups, include all rows
      if (dayColumnFilters.size === 0 &&
          !selectedProjectFilters.size &&
          !selectedSubprojectFilters.size &&
          !selectedStatusFilters.size &&
          !selectedRecurringFilters.size &&
          !selectedEstimateFilters.size) {
        return true;
      }

      // Continue with regular filtering...
      // Apply project/status/recurring/estimate filters first
      if (!matchesProjectFilter(row)) return false;
      if (!matchesSubprojectFilter(row)) return false;
      if (!matchesStatusFilter(row)) return false;
      if (!matchesRecurringFilter(row)) return false;
      if (!matchesEstimateFilter(row)) return false;

      // Always show timeline header rows (month, week, day headers, filter row, daily min/max)
      // These are NOT filterable by day columns - they should always be visible
      if (shouldBypassFilters(row)) {
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
  }, [
    computedData,
    dayColumnFilters,
    selectedProjectFilters,
    selectedSubprojectFilters,
    selectedStatusFilters,
    selectedRecurringFilters,
    selectedEstimateFilters,
    collapsedGroups,
    coerceNumber,
  ]);
};

/**
 * Custom hook for collecting available filter values from data
 *
 * @param {Array} computedData - The computed data to collect values from
 * @returns {Object} Object containing arrays of available filter values
 */
export const useFilterValues = (computedData) => {
  return useMemo(() => {
    const projects = new Set();
    const subprojects = new Set();
    const statuses = new Set();
    const recurring = new Set(['Recurring', 'Not Recurring']); // Fixed options
    const estimates = new Set();

    computedData.forEach(row => {
      // Skip special rows - only collect from regular task rows
      if (isSpecialRow(row)) {
        return;
      }

      // Collect values using normalized helpers
      projects.add(getNormalizedColumnValue(row, 'project'));
      subprojects.add(getNormalizedColumnValue(row, 'subproject'));
      statuses.add(getNormalizedColumnValue(row, 'status'));
      estimates.add(getNormalizedColumnValue(row, 'estimate'));
    });

    return {
      projectNames: Array.from(projects).sort(),
      subprojectNames: Array.from(subprojects).sort(),
      statusNames: Array.from(statuses).sort(),
      recurringNames: Array.from(recurring).sort(),
      estimateNames: Array.from(estimates).sort(),
    };
  }, [computedData]);
};

export default useFilteredData;
