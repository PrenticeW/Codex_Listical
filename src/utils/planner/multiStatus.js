/**
 * Multi-instance status helpers
 *
 * A "Multi" row (estimate auto-set to 'Multi' by habit-pattern detection) is
 * scheduled on more than one date. Each scheduled date ("instance") carries
 * its own status, stored on the row as flat `multiStatus-<dayIndex>` keys so
 * it persists through planner_rows' day_entries.__extra blob with no schema
 * change (see storage.js plannerRowPayloadToDb).
 *
 * The row's own `status` field stays the aggregate shown elsewhere (filters,
 * sorting, task panel): it is re-derived from the instances on every
 * per-instance edit — first non-terminal instance's status, else the last.
 *
 * Design spec: design_handoff_listical_production/06_MULTI_STATUS_DROPDOWN.md
 */

export const MULTI_STATUS_KEY_RE = /^multiStatus-(\d+)$/;

export const multiStatusKey = (dayIndex) => `multiStatus-${dayIndex}`;

import { isSweepStatus } from '../../lib/statusesStorage';

/**
 * "Finished" check when picking the current instance. Data-driven: a status
 * counts as terminal when its archive_sweep flag is on (the merged
 * finished/sweep flag — docs/STATUS_MANAGER_SPEC.md decision 5). Falls back
 * to the legacy set (Done, Abandoned, Skipped, Accounted) via
 * DEFAULT_STATUSES before the statuses table has loaded.
 */
const isTerminalStatus = (status) => isSweepStatus(status);

/**
 * Mirror of the habit-pattern day-cell check (useHabitPatternDetection):
 * a day column counts as a scheduled instance when it holds a positive
 * HH:mm / decimal-hours value or the =timeValue placeholder.
 */
export function isScheduledDayValue(value) {
  if (!value || typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (trimmed === '') return false;
  if (trimmed === '=timeValue') return true;
  if (trimmed.includes(':')) {
    const [hours, minutes] = trimmed.split(':').map((part) => parseInt(part, 10));
    return !isNaN(hours) && !isNaN(minutes) && (hours > 0 || minutes > 0);
  }
  const num = parseFloat(trimmed);
  return !isNaN(num) && num > 0;
}

/**
 * Ordered scheduled instances for a row.
 * @returns Array<{ dayIndex: number, status: string }>
 * Unset instance statuses default to 'Scheduled' — an instance exists
 * precisely because its date carries a time value, and the system's rule
 * (useComputedData) is that a task with scheduled time is 'Scheduled'.
 * ('-' would render the trigger pill white-on-white and look like the
 * status chip vanished.)
 */
export function getMultiInstances(row, totalDays) {
  const instances = [];
  if (!row) return instances;
  for (let i = 0; i < totalDays; i++) {
    if (isScheduledDayValue(row[`day-${i}`])) {
      const stored = row[multiStatusKey(i)];
      // '-' is meaningless for an instance (it has scheduled time by
      // definition) — normalise it back to 'Scheduled' as well.
      instances.push({ dayIndex: i, status: stored && stored !== '-' ? stored : 'Scheduled' });
    }
  }
  return instances;
}

/** First instance whose status is not terminal; if all terminal, the last. */
export function getCurrentInstanceIndex(instances) {
  const i = instances.findIndex((inst) => !isTerminalStatus(inst.status));
  return i === -1 ? instances.length - 1 : i;
}

/**
 * Aggregate row status derived from per-instance statuses.
 * Returns null when the row has fewer than 2 instances (not a Multi row).
 */
export function deriveMultiRowStatus(row, totalDays) {
  const instances = getMultiInstances(row, totalDays);
  if (instances.length < 2) return null;
  return instances[getCurrentInstanceIndex(instances)].status;
}

/** True when the status cell should render the multi-instance dropdown */
export function isMultiStatusRow(row, totalDays) {
  if (!row || row.estimate !== 'Multi') return false;
  return getMultiInstances(row, totalDays).length > 1;
}
