/**
 * Archive Totals Calculation Hook
 * Calculates totals for archived projects and archive weeks (memoized for performance)
 *
 * Rewritten 2026-08-30. The previous positional-scan version had three bugs:
 *  1. It summed timeValue with parseFloat, but timeValue is HH.mm encoded
 *     ("2.30" = 2h30m). parseFloat reads that as 2.3 hours, so every total
 *     drifted; the live table's useProjectTotals converts via minutes.
 *  2. Its scan closed a project's task run at the first row whose _rowType
 *     didn't start with "archived" — which is every archived task row
 *     (they keep _rowType 'projectTask'), so most tasks were never counted.
 *  3. It called sumDayColumns(tasksArray, ...) but sumDayColumns takes a
 *     single row, so week day totals were always zero.
 * This version groups by the parentGroupId chain (the same linkage the
 * Supabase load path uses) instead of relying on row order.
 */

import { useMemo } from 'react';
import {
  ARCHIVE_ROW_TYPES,
  formatMinutesToHHmm,
} from '../../constants/planner/rowTypes';

/** Parse HH.mm format (e.g. "2.30" = 2h 30m) to total minutes */
const parseHHmmToMinutes = (value) => {
  if (!value || value === '0.00') return 0;
  const parsed = parseFloat(value);
  if (isNaN(parsed)) return 0;
  const hours = Math.floor(parsed);
  const mins = Math.round((parsed - hours) * 100);
  return hours * 60 + mins;
};

/** Structure rows that hang under an archived project but are never tasks */
const STRUCTURE_ROW_TYPES = new Set([
  'projectHeader', 'projectGeneral', 'projectUnscheduled',
  'subprojectHeader', 'subprojectGeneral', 'subprojectUnscheduled',
  'archiveHeader', 'archiveRow',
  'archivedProjectHeader', 'archivedProjectGeneral', 'archivedProjectUnscheduled',
]);

/** A row counts as an archived task when it isn't a structure row.
 *  Archived tasks keep their original _rowType ('projectTask'), and legacy
 *  rows may carry no _rowType at all — both count. */
const isTaskLikeRow = (row) =>
  !row._rowType || !STRUCTURE_ROW_TYPES.has(row._rowType);

/** Only Scheduled and Done contribute to totals (matches useProjectTotals) */
const countsTowardTotals = (row) =>
  row.status === 'Scheduled' || row.status === 'Done';

/**
 * Pure computation for both archived project and week totals.
 * Exported for direct unit testing; the hooks below just memoize it.
 *
 * @param {object[]} data - Data array
 * @param {number} totalDays - Total number of day columns
 * @returns {{ projectTotals: object, weekTotals: object }}
 *   projectTotals: archived project header id → "H.mm" string
 *   weekTotals: archive week id → { totalHours: "H.mm", dayTotals: object }
 */
export const computeArchiveTotals = (data, totalDays = 84) => {
  // Archive weeks and archived project headers, by their linkage ids
  const weekIds = new Set();
  const headersByGroupId = new Map(); // header.groupId → header
  data.forEach((row) => {
    if (row._rowType === ARCHIVE_ROW_TYPES.ARCHIVE_WEEK) weekIds.add(row.id);
    if (row._rowType === ARCHIVE_ROW_TYPES.ARCHIVED_PROJECT_HEADER && row.groupId) {
      headersByGroupId.set(row.groupId, row);
    }
  });

  const projectMinutes = new Map(); // header.id → minutes
  const weekMinutes = new Map();    // week.id → minutes
  const weekDayMinutes = new Map(); // week.id → { 'day-i': minutes }

  const addDayMinutes = (weekId, row) => {
    if (!weekDayMinutes.has(weekId)) weekDayMinutes.set(weekId, {});
    const dayMap = weekDayMinutes.get(weekId);
    for (let i = 0; i < totalDays; i++) {
      const key = `day-${i}`;
      const mins = parseHHmmToMinutes(row[key]);
      if (mins) dayMap[key] = (dayMap[key] || 0) + mins;
    }
  };

  data.forEach((row) => {
    if (!row.parentGroupId || !isTaskLikeRow(row) || !countsTowardTotals(row)) return;

    // Task under an archived project → counts for that project and its week
    const header = headersByGroupId.get(row.parentGroupId);
    if (header) {
      const mins = parseHHmmToMinutes(row.timeValue);
      projectMinutes.set(header.id, (projectMinutes.get(header.id) || 0) + mins);
      const weekId = header.parentGroupId;
      if (weekIds.has(weekId)) {
        weekMinutes.set(weekId, (weekMinutes.get(weekId) || 0) + mins);
        addDayMinutes(weekId, row);
      }
      return;
    }

    // Task parented directly to an archive week (snapshot with no matching
    // archived project header) → counts for the week only
    if (weekIds.has(row.parentGroupId)) {
      const mins = parseHHmmToMinutes(row.timeValue);
      weekMinutes.set(row.parentGroupId, (weekMinutes.get(row.parentGroupId) || 0) + mins);
      addDayMinutes(row.parentGroupId, row);
    }
  });

  const projectTotals = {};
  headersByGroupId.forEach((header) => {
    projectTotals[header.id] = formatMinutesToHHmm(projectMinutes.get(header.id) || 0);
  });

  const weekTotals = {};
  weekIds.forEach((weekId) => {
    const dayMap = weekDayMinutes.get(weekId) || {};
    const dayTotals = {};
    Object.entries(dayMap).forEach(([key, mins]) => {
      dayTotals[key] = formatMinutesToHHmm(mins);
    });
    weekTotals[weekId] = {
      totalHours: formatMinutesToHHmm(weekMinutes.get(weekId) || 0),
      dayTotals,
    };
  });

  return { projectTotals, weekTotals };
};

/**
 * Calculate totals for each archived project
 * @param {object[]} data - Data array
 * @param {number} totalDays - Total number of days
 * @returns {object} Map of archived project header id to total hours (H.mm)
 */
export const useArchivedProjectTotals = (data, totalDays = 84) => {
  return useMemo(() => computeArchiveTotals(data, totalDays).projectTotals, [data, totalDays]);
};

/**
 * Calculate totals for each archive week
 * @param {object[]} data - Data array
 * @param {object} archivedProjectTotals - Unused (kept for call compatibility)
 * @param {number} totalDays - Total number of days
 * @returns {object} Map of archive week id to { totalHours, dayTotals }
 */
export const useArchivedWeekTotals = (data, archivedProjectTotals, totalDays = 84) => {
  return useMemo(() => computeArchiveTotals(data, totalDays).weekTotals, [data, totalDays]);
};

/**
 * Combined hook for both archived project and week totals
 * @param {object[]} data - Data array
 * @param {number} totalDays - Total number of days
 * @returns {object} { projectTotals, weekTotals }
 */
export const useArchiveTotals = (data, totalDays = 84) => {
  const totals = useMemo(() => computeArchiveTotals(data, totalDays), [data, totalDays]);
  return totals;
};
