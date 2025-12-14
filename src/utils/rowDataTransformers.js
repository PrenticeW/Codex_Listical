/**
 * Row Data Transformation Utilities
 * Functions for validating, transforming, and checking row data
 */

import { PROTECTED_STATUSES, TASK_ROW_TYPES } from '../constants/plannerConstants';

/**
 * Coerces a value to a number, handling strings with commas and nulls
 */
export const coerceNumber = (value) => {
  if (value == null) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const normalized = value.trim().replace(',', '.');
    if (!normalized) return null;
    const parsed = parseFloat(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

/**
 * Normalizes a time entry value (trims strings)
 */
export const normalizeTimeEntryValue = (value) => (typeof value === 'string' ? value.trim() : '');

/**
 * Syncs day entries when timeValue changes (replaces old value with new)
 */
export const syncDayEntriesWithTimeValue = (dayEntries, nextTimeValue, prevTimeValue) => {
  if (!Array.isArray(dayEntries)) return dayEntries;
  const prev = normalizeTimeEntryValue(prevTimeValue);
  if (!prev) return dayEntries;
  const nextRaw = nextTimeValue ?? '';
  const next = normalizeTimeEntryValue(nextRaw);
  if (next === prev) return dayEntries;

  let changed = false;
  const updatedEntries = dayEntries.map((entry) => {
    if (normalizeTimeEntryValue(entry) === prev) {
      changed = true;
      return nextRaw;
    }
    return entry;
  });

  return changed ? updatedEntries : dayEntries;
};

/**
 * Checks if a status is protected (cannot be easily changed)
 */
export const isProtectedStatus = (status) => {
  if (!status || status === '-') return false;
  return PROTECTED_STATUSES.has(status);
};

/**
 * Checks if a row has scheduled time entries (non-empty day entries)
 */
export const hasScheduledTimeEntries = (row) => {
  if (!Array.isArray(row.dayEntries)) return false;
  return row.dayEntries.some((value) => (value ?? '').trim() !== '');
};

/**
 * Checks if a task column is empty
 */
export const isTaskColumnEmpty = (row) => !(row.taskName ?? '').trim();

/**
 * Creates an array of empty day entries
 */
export const createEmptyDayEntries = (count) => Array.from({ length: count }, () => '');

/**
 * Creates an array of zero day entries ("0.00")
 */
export const createZeroDayEntries = (count) => Array.from({ length: count }, () => '0.00');

/**
 * Checks if a row type is a task row
 */
export const isTaskRow = (rowType) => TASK_ROW_TYPES.has(rowType);
