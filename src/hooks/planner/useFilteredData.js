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
  isTimelineRow,
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

    // Build the set of groupIds hidden by the day filter.
    // Uses the stored dayTag if available; falls back to text detection on the row's label.
    // Rules:
    //  - A tagged subheader whose day is not in the active set is hidden.
    //  - A project with NO subheader matching any active day is hidden entirely
    //    (its header, all of its subheaders — tagged or not — and their rows).
    //  - Within a matching project, untagged subheaders stay visible.
    const hiddenByDayFilter = new Set();
    if (dayFilter && dayFilter.size > 0) {
      // groupId -> row lookup so we can walk parent chains up to the project header
      const rowByGroupId = new Map();
      for (const row of visibleData) {
        if (row.groupId) rowByGroupId.set(row.groupId, row);
      }
      const findProjectGroupId = (row) => {
        let current = row;
        const seen = new Set();
        while (current && current.parentGroupId && !seen.has(current.parentGroupId)) {
          seen.add(current.parentGroupId);
          const parent = rowByGroupId.get(current.parentGroupId);
          if (!parent) return current.parentGroupId;
          if (parent._rowType === 'projectHeader') return parent.groupId;
          current = parent;
        }
        return null;
      };

      // Pass 1 — classify subheaders and record which projects have a matching day
      const projectsWithMatchingDay = new Set();
      for (const row of visibleData) {
        if (row._rowType !== 'subprojectHeader') continue;
        // Stored dayTag takes precedence; fall back to scanning the subheader text
        const effectiveDay = row.dayTag
          ?? detectDayTagFromText(row.subprojectName || row.subproject || row.task || '');
        if (!effectiveDay) continue; // untagged — resolved by its project's fate
        if (dayFilter.has(effectiveDay)) {
          const projectGroupId = findProjectGroupId(row);
          if (projectGroupId) projectsWithMatchingDay.add(projectGroupId);
        } else if (row.groupId) {
          hiddenByDayFilter.add(row.groupId);
        }
      }

      // Pass 2 — hide project headers with no matching subheader
      for (const row of visibleData) {
        if (row._rowType === 'projectHeader' && row.groupId && !projectsWithMatchingDay.has(row.groupId)) {
          hiddenByDayFilter.add(row.groupId);
        }
      }

      // Pass 3 — propagate hiding down the parent chain until stable
      // (project header -> subheaders/sections -> task rows)
      let changed = true;
      while (changed) {
        changed = false;
        for (const row of visibleData) {
          if (row.parentGroupId && hiddenByDayFilter.has(row.parentGroupId)
              && row.groupId && !hiddenByDayFilter.has(row.groupId)) {
            hiddenByDayFilter.add(row.groupId);
            changed = true;
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

    // --- Cascade-hide setup ---
    // Header/divider/group rows (project headers, subproject headers, the
    // Inbox and Archive dividers, archive week rows, archived project
    // structure) carry no day-column values of their own, so they can't be
    // matched by the numeric day-column check directly. Instead, each of
    // these should disappear once none of its descendant content rows
    // survive the currently active filters -- an empty header shouldn't
    // linger after all of its children get filtered out.

    const dayFilterActive = dayColumnFilters.size > 0;

    // Whether a single leaf/content row's own values satisfy every
    // currently active filter (project/subproject/status/recurring/estimate
    // plus the day-column numeric filter). Used only to decide whether a
    // row counts as "visible content" for its ancestor header/divider rows.
    const leafMatchesActiveFilters = (row) => {
      if (!matchesProjectFilter(row)) return false;
      if (!matchesSubprojectFilter(row)) return false;
      if (!matchesStatusFilter(row)) return false;
      if (!matchesRecurringFilter(row)) return false;
      if (!matchesEstimateFilter(row)) return false;
      if (!dayFilterActive) return true;
      return Array.from(dayColumnFilters).every(dayColumnId => {
        return coerceNumber(row[dayColumnId]) !== null;
      });
    };

    // Map of groupId -> direct children (rows whose parentGroupId points at it)
    const childrenByParentGroupId = new Map();
    for (const row of visibleData) {
      if (row.parentGroupId) {
        if (!childrenByParentGroupId.has(row.parentGroupId)) {
          childrenByParentGroupId.set(row.parentGroupId, []);
        }
        childrenByParentGroupId.get(row.parentGroupId).push(row);
      }
    }

    // Recursively determine whether a container row (identified by its
    // groupId) has at least one descendant that survives the active
    // filters -- either a leaf content row that matches directly, or a
    // nested container (e.g. a subproject header) that itself has
    // surviving content.
    const groupSurvivalCache = new Map();
    const groupHasVisibleContent = (groupId) => {
      if (!groupId) return false;
      if (groupSurvivalCache.has(groupId)) return groupSurvivalCache.get(groupId);
      groupSurvivalCache.set(groupId, false); // cycle guard
      const children = childrenByParentGroupId.get(groupId) || [];
      const result = children.some(child => {
        if (child.groupId) {
          return groupHasVisibleContent(child.groupId);
        }
        return leafMatchesActiveFilters(child);
      });
      groupSurvivalCache.set(groupId, result);
      return result;
    };

    // Inbox and Archive dividers aren't linked to their members via
    // groupId/parentGroupId -- membership is purely positional (the rows
    // between the divider and the next section). Resolve visibility by
    // scanning that range directly.
    const inboxDividerIndex = visibleData.findIndex(r => r._isInboxRow);
    const archiveHeaderIndex = visibleData.findIndex(r => r._rowType === 'archiveHeader');

    let inboxHasVisibleContent = true;
    if (inboxDividerIndex !== -1) {
      const endIndex = archiveHeaderIndex !== -1 ? archiveHeaderIndex : visibleData.length;
      inboxHasVisibleContent = visibleData
        .slice(inboxDividerIndex + 1, endIndex)
        .some(row => leafMatchesActiveFilters(row));
    }

    let archiveHasVisibleContent = true;
    if (archiveHeaderIndex !== -1) {
      const archiveWeekRows = visibleData.filter(r => r._rowType === 'archiveRow');
      archiveHasVisibleContent = archiveWeekRows.some(r => groupHasVisibleContent(r.groupId));
    }

    const filtered = visibleData.filter(row => {
      // Filter out rows that belong to collapsed groups (archive weeks and projects)
      // Use recursive check to handle nested groups (e.g., archive week > project > sections)
      if (isInCollapsedGroup(row)) {
        return false;
      }

      // Day filter: hide non-matching subheaders, whole projects with no
      // activity on the selected days, and all of their child rows.
      if (dayFilter && dayFilter.size > 0) {
        // Hide the container itself (project header or subheader)
        if (row.groupId && hiddenByDayFilter.has(row.groupId)) {
          return false;
        }
        // Hide rows that live under a hidden container (tasks, section labels)
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
        // Hide task rows with no parentGroupId (inbox / outside any project section)
        // that don't belong to the selected project. assignParentGroupIds clears parentGroupId
        // for these rows, so fall back to row.project (the dropdown value for user-created rows)
        // or row.projectNickname (set on chip/projectTask rows) as the membership signal.
        // isSpecialRow lets timeline rows, dividers, and structural rows through unconditionally.
        const rowProject = row.project || row.projectNickname;
        // Only hide if the row has a project explicitly set that doesn't match.
        // Rows with no project (empty / '-') are kept visible so blank inbox rows show through.
        if (!row.parentGroupId && !isSpecialRow(row) && rowProject && rowProject !== '-' && rowProject !== projectFilter) return false;
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

      if (shouldBypassFilters(row)) {
        // Timeline/metrics rows (month, week, day headers, daily min/max,
        // daily total, filter row) carry no filterable content of their
        // own -- always show these regardless of filter state.
        if (isTimelineRow(row) || row._isDailyTotalRow || row._isFilterRow) {
          return true;
        }

        // Everything else in this bucket is a header/divider/group row
        // (project headers, subproject headers, the Inbox/Archive dividers,
        // archive week rows, archived project structure). When the day
        // column filter is active these always disappear -- unconditionally,
        // even if one of their child rows happens to match the filter.
        if (dayFilterActive) {
          return false;
        }

        // No day-column filter active: fall back to cascade-hiding based on
        // whether any descendant content row survives the other active
        // filters (project/status/recurring/estimate).
        if (row._isInboxRow) {
          return inboxHasVisibleContent;
        }
        if (row._rowType === 'archiveHeader') {
          return archiveHasVisibleContent;
        }
        if (row.groupId) {
          // projectHeader, subprojectHeader, archiveRow (week), archivedProjectHeader
          return groupHasVisibleContent(row.groupId);
        }
        if (row.parentGroupId) {
          // projectGeneral / projectUnscheduled / archived General / Unscheduled
          // section-label rows -- tied to their parent container's visibility.
          return groupHasVisibleContent(row.parentGroupId);
        }

        // Fallback for any structural row type not covered above.
        return true;
      }

      // For all other rows (regular tasks, project rows), apply day column filtering
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
