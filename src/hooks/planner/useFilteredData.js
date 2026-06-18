import { useMemo } from 'react';

// Day-of-week patterns used as a fallback when a subheader row has no stored dayTag.
// Matches full names and common abbreviations, word-boundary aware.
const DAY_TAG_PATTERNS = [
  [/\b(monday|mon)\b/i, 'Mon'],
  [/\b(tuesday|tue|tues)\b/i, 'Tue'],
  [/\b(wednesday|wed)\b/i, 'Wed'],
  [/\b(thursday|thu|thur|thurs)\b/i, 'Thu'],
  [/\b(friday|fri)\b/i, 'Fri'],
  [/\b(saturday|sat)\b/i, 'Sat'],
  [/\b(sunday|sun)\b/i, 'Sun'],
];

function detectDayTagFromText(text) {
  if (!text) return null;
  for (const [pattern, tag] of DAY_TAG_PATTERNS) {
    if (pattern.test(text)) return tag;
  }
  return null;
}
import {
  shouldBypassFilters,
  isSectionDivider,
  isProjectStructureRow,
  isSpecialRow,
} from '../../utils/planner/rowTypeChecks';
import { getNormalizedColumnValue } from '../../utils/planner/valueNormalizers';

/**
 * Custom hook for filtering planner data
 * Handles both column filters (project, status, etc.), day column filters, collapsed groups,
 * and the day-tag view filter (dayFilter).
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
 * @param {string|null} params.dayFilter - Day abbreviation to filter subheaders by (e.g. 'Mon'), or null for no filter
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
  dayFilter = null,
  projectFilter = null,
}) => {
  return useMemo(() => {
    // Strip tombstone rows — these are internal bookkeeping only and must never render
    const visibleData = computedData.filter(row => row._rowType !== 'deletedChip');

    // If no filters and no collapsed groups, return all data
    if (dayColumnFilters.size === 0 &&
        !selectedProjectFilters.size &&
        !selectedSubprojectFilters.size &&
        !selectedStatusFilters.size &&
        !selectedRecurringFilters.size &&
        !selectedEstimateFilters.size &&
        collapsedGroups.size === 0 &&
        (!dayFilter || dayFilter.size === 0) &&
        !projectFilter) {
      return visibleData;
    }

    // Build the set of groupIds hidden by the project filter.
    // Pass 1: collect groupIds of projectHeader rows for OTHER projects.
    // Pass 2: propagate to their children (subprojectHeaders, sections) so task rows get caught too.
    const hiddenByProjectFilter = new Set();
    if (projectFilter) {
      const selectedGroupId = `project-${projectFilter}`;
      // Pass 1 — project headers for other projects
      for (const row of visibleData) {
        if (row._rowType === 'projectHeader' && row.groupId && row.groupId !== selectedGroupId) {
          hiddenByProjectFilter.add(row.groupId);
        }
      }
      // Pass 2 — propagate: any row whose parentGroupId is already hidden → hide its groupId too
      // (catches subprojectHeader rows, which are parents of chip task rows)
      for (const row of visibleData) {
        if (row.parentGroupId && hiddenByProjectFilter.has(row.parentGroupId) && row.groupId) {
          hiddenByProjectFilter.add(row.groupId);
        }
      }
    }

    // Build the set of subheader groupIds hidden by the day filter.
    // Uses the stored dayTag if available; falls back to text detection on the row's label.
    // A subheader with no detectable day (neither stored nor in text) is always kept visible.
    const hiddenByDayFilter = new Set();
    if (dayFilter && dayFilter.size > 0) {
      for (const row of visibleData) {
        if (row._rowType === 'subprojectHeader') {
          // Stored dayTag takes precedence; fall back to scanning the subheader text
          const effectiveDay = row.dayTag
            ?? detectDayTagFromText(row.subprojectName || row.subproject || row.task || '');
          // Only hide if a day was detected AND it's not in the active filter set
          if (effectiveDay && !dayFilter.has(effectiveDay)) {
            if (row.groupId) hiddenByDayFilter.add(row.groupId);
          }
        }
      }
    }

    // Helper: Check if a row or any of its ancestors are collapsed
    // This handles nested grouping (e.g., archive week > archived project > sections)
    const isInCollapsedGroup = (row) => {
      if (!row.parentGroupId) return false;

      // Check if this row's direct parent is collapsed
      if (collapsedGroups.has(row.parentGroupId)) return true;

      // Check if any ancestor is collapsed by finding the parent row
      const parentRow = computedData.find(r => r.groupId === row.parentGroupId);
      if (parentRow) {
        return isInCollapsedGroup(parentRow);
      }

      return false;
    };

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

    const filtered = visibleData.filter(row => {
      // Filter out rows that belong to collapsed groups (archive weeks and projects)
      // Use recursive check to handle nested groups (e.g., archive week > project > sections)
      if (isInCollapsedGroup(row)) {
        return false;
      }

      // Day filter: hide subheader rows whose dayTag doesn't match, and hide their child rows.
      if (dayFilter && dayFilter.size > 0) {
        // Hide the subheader itself
        if (row._rowType === 'subprojectHeader' && row.groupId && hiddenByDayFilter.has(row.groupId)) {
          return false;
        }
        // Hide task rows that live under a hidden subheader
        if (row.parentGroupId && hiddenByDayFilter.has(row.parentGroupId)) {
          return false;
        }
      }

      // Project filter: hide rows that belong to a different project.
      // Uses the groupId/parentGroupId chain so it correctly reaches all row types.
      // isSpecialRow guards timeline rows, section dividers, and structural rows from being hidden.
      if (projectFilter) {
        // Hide project header rows for other projects (caught by their groupId)
        if (row.groupId && hiddenByProjectFilter.has(row.groupId)) return false;
        // Hide rows whose parent traces to another project
        if (row.parentGroupId && hiddenByProjectFilter.has(row.parentGroupId)) return false;
        // Hide task rows with no parentGroupId (inbox / outside any project section).
        // assignParentGroupIds clears parentGroupId for these rows. isSpecialRow lets
        // timeline rows, dividers, and structural rows through unconditionally.
        if (!row.parentGroupId && !isSpecialRow(row)) return false;
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
    dayFilter,
    projectFilter,
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
