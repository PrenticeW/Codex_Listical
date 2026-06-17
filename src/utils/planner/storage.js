/**
 * Planner Storage (System page task rows, UI settings, archive snapshots)
 *
 * Storage backend: Supabase. Three tables back this module:
 *   planner_settings   one row per (user_id, year_id), holds the nine System
 *                      page UI settings (column sizing, size scale, the three
 *                      show toggles, two sort status arrays, visible day
 *                      columns, collapsed groups). Shared with helper #4,
 *                      which owns send_to_system_at on the same row.
 *   planner_rows       many rows per (user_id, year_id), one per task. The
 *                      seven calendar header rows are NOT persisted; they are
 *                      reconstructed on read from years.start_date,
 *                      years.total_days, and the daily bounds.
 *   archived_weeks     many rows per (user_id, year_id), one per Archive
 *                      Week press. Stores the week snapshot as JSONB. On
 *                      read these are interleaved back into the flat row
 *                      array so the consuming code does not have to change.
 *   years              start_date and total_days live here (not on
 *                      planner_settings). Read and written through the two
 *                      year-table helpers below.
 *
 * Public API stays the same as the localStorage version. Every public
 * function now returns a Promise. Function names and argument order are
 * unchanged so existing call sites only need `await` plus the gate pattern.
 *
 * Calendar header row reconstruction: readTaskRows returns the flat array
 * the consuming code expects, which starts with the seven calendar header
 * rows (month, week, day, dayofweek, daily-min, daily-max, filter) followed
 * by the user's task rows and any archive-week snapshots interleaved by
 * display_order. saveTaskRows strips the calendar headers before writing,
 * splits archive-week rows out to archived_weeks, and writes the rest as
 * planner_rows.
 *
 * Project scoping: the current code base hard-codes DEFAULT_PROJECT_ID
 * ('project-1') everywhere. The Supabase schema has no project_id column on
 * planner_settings, so the projectId argument is accepted for API parity
 * but currently ignored. If multi-project ever ships, a project_id column
 * can be added to planner_settings without changing this helper's external
 * signature.
 */

import { supabase } from '../../lib/supabase';
import { createInitialData } from './dataCreators';
import { loadTacticsMetrics } from '../../lib/tacticsMetricsStorage';
import { saveSiteSnapshot } from '../../lib/snapshotStorage';
import { DEFAULT_PROJECT_ID } from '../../constants/plannerStorageKeys';
import {
  getCached,
  hasCached,
  setCached,
} from '../../lib/storageCache';

export { DEFAULT_PROJECT_ID };

// --- cache namespacing -------------------------------------------------
//
// Keys are scoped by yearNumber only (no userId). The cache is cleared
// on sign-out (see storageCache.js auth listener), so it's implicitly
// per-user. Dropping userId from the key lets hooks do a sync cache
// lookup without awaiting supabase.auth.getUser().

const CACHE_NS = 'plannerStorage';
const yearKey = (yearNumber) => `years:${yearNumber}`;
const settingsKey = (yearNumber) => `planner_settings:${yearNumber}`;
const taskRowsKey = (yearNumber) => `task_rows:${yearNumber}`;

/**
 * Synchronous peek into the planner cache for a year. Returns the raw
 * cached rows (or null when missing). Hooks use this in useState lazy
 * initialisers so the very first render shows the cached values rather
 * than defaults that get replaced a tick later by the async load.
 */
export function peekPlannerCache(yearNumber) {
  if (yearNumber == null) return { plannerSettings: null, yearRow: null, taskRows: null };
  const sk = settingsKey(yearNumber);
  const yk = yearKey(yearNumber);
  const tk = taskRowsKey(yearNumber);
  return {
    plannerSettings: hasCached(CACHE_NS, sk) ? getCached(CACHE_NS, sk) : null,
    yearRow: hasCached(CACHE_NS, yk) ? getCached(CACHE_NS, yk) : null,
    taskRows: hasCached(CACHE_NS, tk) ? getCached(CACHE_NS, tk) : null,
  };
}

// --- exported event names (unchanged) ---------------------------------

export const PLANNER_START_DATE_EVENT = 'planner-start-date-update';

// --- defaults ---------------------------------------------------------

const DEFAULT_TOTAL_DAYS = 84;
const DEFAULT_SIZE_SCALE = 1.0;
const DEFAULT_SHOW_RECURRING = true;
const DEFAULT_SHOW_SUBPROJECTS = true;
const DEFAULT_SHOW_MAX_MIN_ROWS = true;
const DEFAULT_SORT_STATUSES = [
  'Done',
  'Scheduled',
  'Not Scheduled',
  'Blocked',
  'On Hold',
  'Abandoned',
  'Skipped',
  'Accounted',
];

const todayIso = () => new Date().toISOString().split('T')[0];

// --- internal helpers -------------------------------------------------

async function requireUserId() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error('No authenticated user');
  return user.id;
}

async function findYearRow(userId, yearNumber) {
  // Callers can race ahead of YearContext and pass null (e.g. GearPanel
  // settings reads on first mount). year_number is an integer column, so
  // querying eq.null is a guaranteed 400 — short-circuit instead.
  if (yearNumber == null) return null;
  const key = yearKey(yearNumber);
  if (hasCached(CACHE_NS, key)) return getCached(CACHE_NS, key);
  const { data, error } = await supabase
    .from('years')
    .select('id, start_date, total_days')
    .eq('user_id', userId)
    .eq('year_number', yearNumber)
    .maybeSingle();
  if (error) throw error;
  const row = data ?? null;
  setCached(CACHE_NS, key, row);
  return row;
}

async function findYearId(userId, yearNumber) {
  const row = await findYearRow(userId, yearNumber);
  return row?.id ?? null;
}

function dispatchPlannerStartDateEvent({ startDate, projectId, yearNumber }) {
  if (typeof window === 'undefined') return;
  const detail = { startDate, projectId, yearNumber, __eventYear: yearNumber };
  const event = typeof CustomEvent === 'function'
    ? new CustomEvent(PLANNER_START_DATE_EVENT, { detail })
    : new Event(PLANNER_START_DATE_EVENT);
  window.dispatchEvent(event);
}

// --- planner_settings row read/write ---------------------------------

async function readPlannerSettingsRow({ userId, yearId, yearNumber }) {
  // yearNumber drives the cache key so two helpers reading the same row
  // share a cache slot. yearId is still needed for the actual DB query.
  if (yearNumber != null) {
    const key = settingsKey(yearNumber);
    if (hasCached(CACHE_NS, key)) return getCached(CACHE_NS, key);
  }
  const { data, error } = await supabase
    .from('planner_settings')
    .select('*')
    .eq('user_id', userId)
    .eq('year_id', yearId)
    .maybeSingle();
  if (error) throw error;
  const row = data ?? null;
  if (yearNumber != null) {
    setCached(CACHE_NS, settingsKey(yearNumber), row);
  }
  return row;
}

/**
 * Write a partial column set to planner_settings without clobbering columns
 * this caller does not own. Mirrors the writeYearSettingsRow pattern from
 * helper #4 so each save function only touches its own columns.
 *
 * Refreshes the cache with the freshly-written row so the next read returns
 * the new value without a round-trip.
 */
async function writePlannerSettingsColumns({ userId, yearId, yearNumber, columns }) {
  const existing = await readPlannerSettingsRow({ userId, yearId, yearNumber });
  let updatedRow;
  if (existing) {
    const { data, error } = await supabase
      .from('planner_settings')
      .update(columns)
      .eq('id', existing.id)
      .select()
      .single();
    if (error) throw error;
    updatedRow = data;
  } else {
    const { data, error } = await supabase
      .from('planner_settings')
      .insert({ user_id: userId, year_id: yearId, ...columns })
      .select()
      .single();
    if (error) throw error;
    updatedRow = data;
  }
  if (yearNumber != null) {
    setCached(CACHE_NS, settingsKey(yearNumber), updatedRow);
  }
}

// --- years table updates (start_date, total_days live here) -----------

async function updateYearColumns({ userId, yearId, yearNumber, columns }) {
  const { data, error } = await supabase
    .from('years')
    .update(columns)
    .eq('id', yearId)
    .select('id, start_date, total_days')
    .single();
  if (error) throw error;
  if (userId != null && yearNumber != null) {
    setCached(CACHE_NS, yearKey(yearNumber), data ?? null);
  }
}

// ============================================================
// COLUMN SIZING (planner_settings.column_sizing)
// ============================================================

export const readColumnSizing = async (
  projectId = DEFAULT_PROJECT_ID,  // eslint-disable-line no-unused-vars
  yearNumber = null,
) => {
  try {
    const userId = await requireUserId();
    const yearId = await findYearId(userId, yearNumber);
    if (!yearId) return {};
    const row = await readPlannerSettingsRow({ userId, yearId, yearNumber });
    const value = row?.column_sizing;
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch (error) {
    console.error('Failed to read column sizing', error);
    return {};
  }
};

export const saveColumnSizing = async (
  columnSizing,
  projectId = DEFAULT_PROJECT_ID,  // eslint-disable-line no-unused-vars
  yearNumber = null,
) => {
  try {
    const userId = await requireUserId();
    const yearId = await findYearId(userId, yearNumber);
    if (!yearId) return;
    await writePlannerSettingsColumns({
      userId,
      yearId,
      yearNumber,
      columns: {
        column_sizing:
          columnSizing && typeof columnSizing === 'object' && !Array.isArray(columnSizing)
            ? columnSizing
            : {},
      },
    });
  } catch (error) {
    console.error('Failed to save column sizing', error);
  }
};

// ============================================================
// SIZE SCALE (planner_settings.size_scale)
// ============================================================

export const readSizeScale = async (
  projectId = DEFAULT_PROJECT_ID,  // eslint-disable-line no-unused-vars
  yearNumber = null,
) => {
  try {
    const userId = await requireUserId();
    const yearId = await findYearId(userId, yearNumber);
    if (!yearId) return DEFAULT_SIZE_SCALE;
    const row = await readPlannerSettingsRow({ userId, yearId, yearNumber });
    const value = typeof row?.size_scale === 'number' ? row.size_scale : Number(row?.size_scale);
    return Number.isFinite(value) ? value : DEFAULT_SIZE_SCALE;
  } catch (error) {
    console.error('Failed to read size scale', error);
    return DEFAULT_SIZE_SCALE;
  }
};

export const saveSizeScale = async (
  sizeScale,
  projectId = DEFAULT_PROJECT_ID,  // eslint-disable-line no-unused-vars
  yearNumber = null,
) => {
  try {
    const userId = await requireUserId();
    const yearId = await findYearId(userId, yearNumber);
    if (!yearId) return;
    const value = Number(sizeScale);
    await writePlannerSettingsColumns({
      userId,
      yearId,
      yearNumber,
      columns: { size_scale: Number.isFinite(value) ? value : DEFAULT_SIZE_SCALE },
    });
  } catch (error) {
    console.error('Failed to save size scale', error);
  }
};

// ============================================================
// START DATE (years.start_date)
// ============================================================

export const readStartDate = async (
  projectId = DEFAULT_PROJECT_ID,  // eslint-disable-line no-unused-vars
  yearNumber = null,
) => {
  const today = todayIso();
  try {
    const userId = await requireUserId();
    const yearRow = await findYearRow(userId, yearNumber);
    return yearRow?.start_date || today;
  } catch (error) {
    console.error('Failed to read start date', error);
    return today;
  }
};

export const saveStartDate = async (
  startDate,
  projectId = DEFAULT_PROJECT_ID,
  yearNumber = null,
) => {
  try {
    const userId = await requireUserId();
    const yearId = await findYearId(userId, yearNumber);
    if (!yearId) return;
    await updateYearColumns({
      userId,
      yearId,
      yearNumber,
      columns: { start_date: startDate },
    });
    dispatchPlannerStartDateEvent({ startDate, projectId, yearNumber });
  } catch (error) {
    console.error('Failed to save start date', error);
  }
};

// ============================================================
// UI TOGGLES (planner_settings.show_*)
// ============================================================

export const readShowRecurring = async (
  projectId = DEFAULT_PROJECT_ID,  // eslint-disable-line no-unused-vars
  yearNumber = null,
) => {
  try {
    const userId = await requireUserId();
    const yearId = await findYearId(userId, yearNumber);
    if (!yearId) return DEFAULT_SHOW_RECURRING;
    const row = await readPlannerSettingsRow({ userId, yearId, yearNumber });
    return row ? row.show_recurring !== false : DEFAULT_SHOW_RECURRING;
  } catch (error) {
    console.error('Failed to read show recurring', error);
    return DEFAULT_SHOW_RECURRING;
  }
};

export const saveShowRecurring = async (
  showRecurring,
  projectId = DEFAULT_PROJECT_ID,  // eslint-disable-line no-unused-vars
  yearNumber = null,
) => {
  try {
    const userId = await requireUserId();
    const yearId = await findYearId(userId, yearNumber);
    if (!yearId) return;
    await writePlannerSettingsColumns({
      userId,
      yearId,
      yearNumber,
      columns: { show_recurring: showRecurring === true || showRecurring === 'true' },
    });
  } catch (error) {
    console.error('Failed to save show recurring', error);
  }
};

export const readShowSubprojects = async (
  projectId = DEFAULT_PROJECT_ID,  // eslint-disable-line no-unused-vars
  yearNumber = null,
) => {
  try {
    const userId = await requireUserId();
    const yearId = await findYearId(userId, yearNumber);
    if (!yearId) return DEFAULT_SHOW_SUBPROJECTS;
    const row = await readPlannerSettingsRow({ userId, yearId, yearNumber });
    return row ? row.show_subprojects !== false : DEFAULT_SHOW_SUBPROJECTS;
  } catch (error) {
    console.error('Failed to read show subprojects', error);
    return DEFAULT_SHOW_SUBPROJECTS;
  }
};

export const saveShowSubprojects = async (
  showSubprojects,
  projectId = DEFAULT_PROJECT_ID,  // eslint-disable-line no-unused-vars
  yearNumber = null,
) => {
  try {
    const userId = await requireUserId();
    const yearId = await findYearId(userId, yearNumber);
    if (!yearId) return;
    await writePlannerSettingsColumns({
      userId,
      yearId,
      yearNumber,
      columns: { show_subprojects: showSubprojects === true || showSubprojects === 'true' },
    });
  } catch (error) {
    console.error('Failed to save show subprojects', error);
  }
};

export const readShowMaxMinRows = async (
  projectId = DEFAULT_PROJECT_ID,  // eslint-disable-line no-unused-vars
  yearNumber = null,
) => {
  try {
    const userId = await requireUserId();
    const yearId = await findYearId(userId, yearNumber);
    if (!yearId) return DEFAULT_SHOW_MAX_MIN_ROWS;
    const row = await readPlannerSettingsRow({ userId, yearId, yearNumber });
    return row ? row.show_max_min_rows !== false : DEFAULT_SHOW_MAX_MIN_ROWS;
  } catch (error) {
    console.error('Failed to read show max/min rows', error);
    return DEFAULT_SHOW_MAX_MIN_ROWS;
  }
};

export const saveShowMaxMinRows = async (
  showMaxMinRows,
  projectId = DEFAULT_PROJECT_ID,  // eslint-disable-line no-unused-vars
  yearNumber = null,
) => {
  try {
    const userId = await requireUserId();
    const yearId = await findYearId(userId, yearNumber);
    if (!yearId) return;
    await writePlannerSettingsColumns({
      userId,
      yearId,
      yearNumber,
      columns: { show_max_min_rows: showMaxMinRows === true || showMaxMinRows === 'true' },
    });
  } catch (error) {
    console.error('Failed to save show max/min rows', error);
  }
};

// ============================================================
// SORT STATUSES (planner_settings.sort_statuses, returns Set)
// ============================================================

export const readSortStatuses = async (
  projectId = DEFAULT_PROJECT_ID,  // eslint-disable-line no-unused-vars
  yearNumber = null,
) => {
  try {
    const userId = await requireUserId();
    const yearId = await findYearId(userId, yearNumber);
    if (!yearId) return new Set(DEFAULT_SORT_STATUSES);
    const row = await readPlannerSettingsRow({ userId, yearId, yearNumber });
    const arr = Array.isArray(row?.sort_statuses) ? row.sort_statuses : DEFAULT_SORT_STATUSES;
    return new Set(arr);
  } catch (error) {
    console.error('Failed to read sort statuses', error);
    return new Set(DEFAULT_SORT_STATUSES);
  }
};

export const saveSortStatuses = async (
  sortStatuses,
  projectId = DEFAULT_PROJECT_ID,  // eslint-disable-line no-unused-vars
  yearNumber = null,
) => {
  try {
    const userId = await requireUserId();
    const yearId = await findYearId(userId, yearNumber);
    if (!yearId) return;
    const arr = Array.from(sortStatuses || []);
    await writePlannerSettingsColumns({
      userId,
      yearId,
      yearNumber,
      columns: { sort_statuses: arr },
    });
  } catch (error) {
    console.error('Failed to save sort statuses', error);
  }
};

// ============================================================
// SORT PLANNER STATUSES (planner_settings.sort_planner_statuses, returns Set)
// ============================================================

export const readSortPlannerStatuses = async (
  projectId = DEFAULT_PROJECT_ID,  // eslint-disable-line no-unused-vars
  yearNumber = null,
) => {
  try {
    const userId = await requireUserId();
    const yearId = await findYearId(userId, yearNumber);
    if (!yearId) return new Set(DEFAULT_SORT_STATUSES);
    const row = await readPlannerSettingsRow({ userId, yearId, yearNumber });
    const arr = Array.isArray(row?.sort_planner_statuses)
      ? row.sort_planner_statuses
      : DEFAULT_SORT_STATUSES;
    return new Set(arr);
  } catch (error) {
    console.error('Failed to read sort planner statuses', error);
    return new Set(DEFAULT_SORT_STATUSES);
  }
};

export const saveSortPlannerStatuses = async (
  sortPlannerStatuses,
  projectId = DEFAULT_PROJECT_ID,  // eslint-disable-line no-unused-vars
  yearNumber = null,
) => {
  try {
    const userId = await requireUserId();
    const yearId = await findYearId(userId, yearNumber);
    if (!yearId) return;
    const arr = Array.from(sortPlannerStatuses || []);
    await writePlannerSettingsColumns({
      userId,
      yearId,
      yearNumber,
      columns: { sort_planner_statuses: arr },
    });
  } catch (error) {
    console.error('Failed to save sort planner statuses', error);
  }
};

// ============================================================
// TOTAL DAYS (years.total_days)
// ============================================================

export const readTotalDays = async (
  projectId = DEFAULT_PROJECT_ID,  // eslint-disable-line no-unused-vars
  yearNumber = null,
) => {
  try {
    const userId = await requireUserId();
    const yearRow = await findYearRow(userId, yearNumber);
    const value =
      typeof yearRow?.total_days === 'number' ? yearRow.total_days : Number(yearRow?.total_days);
    return Number.isFinite(value) && value > 0 ? value : DEFAULT_TOTAL_DAYS;
  } catch (error) {
    console.error('Failed to read total days', error);
    return DEFAULT_TOTAL_DAYS;
  }
};

export const saveTotalDays = async (
  totalDays,
  projectId = DEFAULT_PROJECT_ID,  // eslint-disable-line no-unused-vars
  yearNumber = null,
) => {
  try {
    const userId = await requireUserId();
    const yearId = await findYearId(userId, yearNumber);
    if (!yearId) return;
    const value = Number(totalDays);
    await updateYearColumns({
      userId,
      yearId,
      yearNumber,
      columns: { total_days: Number.isFinite(value) && value > 0 ? value : DEFAULT_TOTAL_DAYS },
    });
  } catch (error) {
    console.error('Failed to save total days', error);
  }
};

// ============================================================
// VISIBLE DAY COLUMNS (planner_settings.visible_day_columns)
// ============================================================

const defaultVisibleDayColumns = (totalDays) => {
  const visible = {};
  for (let i = 0; i < totalDays; i++) {
    visible[`day-${i}`] = true;
  }
  return visible;
};

export const readVisibleDayColumns = async (
  projectId = DEFAULT_PROJECT_ID,  // eslint-disable-line no-unused-vars
  totalDays = DEFAULT_TOTAL_DAYS,
  yearNumber = null,
) => {
  try {
    const userId = await requireUserId();
    const yearId = await findYearId(userId, yearNumber);
    if (!yearId) return defaultVisibleDayColumns(totalDays);
    const row = await readPlannerSettingsRow({ userId, yearId, yearNumber });
    const value = row?.visible_day_columns;
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length === 0) {
      return defaultVisibleDayColumns(totalDays);
    }
    return value;
  } catch (error) {
    console.error('Failed to read visible day columns', error);
    return defaultVisibleDayColumns(totalDays);
  }
};

export const saveVisibleDayColumns = async (
  visibleDayColumns,
  projectId = DEFAULT_PROJECT_ID,  // eslint-disable-line no-unused-vars
  yearNumber = null,
) => {
  try {
    const userId = await requireUserId();
    const yearId = await findYearId(userId, yearNumber);
    if (!yearId) return;
    await writePlannerSettingsColumns({
      userId,
      yearId,
      yearNumber,
      columns: {
        visible_day_columns:
          visibleDayColumns && typeof visibleDayColumns === 'object' && !Array.isArray(visibleDayColumns)
            ? visibleDayColumns
            : {},
      },
    });
  } catch (error) {
    console.error('Failed to save visible day columns', error);
  }
};

// ============================================================
// COLLAPSED GROUPS (planner_settings.collapsed_groups, returns Set)
// ============================================================

export const readCollapsedGroups = async (
  projectId = DEFAULT_PROJECT_ID,  // eslint-disable-line no-unused-vars
  yearNumber = null,
) => {
  try {
    const userId = await requireUserId();
    const yearId = await findYearId(userId, yearNumber);
    if (!yearId) return new Set();
    const row = await readPlannerSettingsRow({ userId, yearId, yearNumber });
    return new Set(Array.isArray(row?.collapsed_groups) ? row.collapsed_groups : []);
  } catch (error) {
    console.error('Failed to read collapsed groups', error);
    return new Set();
  }
};

export const saveCollapsedGroups = async (
  collapsedGroups,
  projectId = DEFAULT_PROJECT_ID,  // eslint-disable-line no-unused-vars
  yearNumber = null,
) => {
  try {
    const userId = await requireUserId();
    const yearId = await findYearId(userId, yearNumber);
    if (!yearId) return;
    const arr = Array.from(collapsedGroups || []);
    await writePlannerSettingsColumns({
      userId,
      yearId,
      yearNumber,
      columns: { collapsed_groups: arr },
    });
  } catch (error) {
    console.error('Failed to save collapsed groups', error);
  }
};

// ============================================================
// WEEK NAMES (planner_settings.week_names)
// ============================================================

export const readWeekNames = async (
  projectId = DEFAULT_PROJECT_ID,  // eslint-disable-line no-unused-vars
  yearNumber = null,
) => {
  try {
    const userId = await requireUserId();
    const yearId = await findYearId(userId, yearNumber);
    if (!yearId) return {};
    const row = await readPlannerSettingsRow({ userId, yearId, yearNumber });
    const value = row?.week_names;
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch (error) {
    console.error('Failed to read week names', error);
    return {};
  }
};

export const saveWeekNames = async (
  weekNames,
  projectId = DEFAULT_PROJECT_ID,  // eslint-disable-line no-unused-vars
  yearNumber = null,
) => {
  try {
    const userId = await requireUserId();
    const yearId = await findYearId(userId, yearNumber);
    if (!yearId) return;
    await writePlannerSettingsColumns({
      userId,
      yearId,
      yearNumber,
      columns: {
        week_names:
          weekNames && typeof weekNames === 'object' && !Array.isArray(weekNames)
            ? weekNames
            : {},
      },
    });
  } catch (error) {
    console.error('Failed to save week names', error);
  }
};

// ============================================================
// TASK ROWS (planner_rows + archived_weeks, with calendar headers)
// ============================================================
//
// Task row shape (the JS object the React code expects):
//   {
//     id: string,                  // 'row-0', 'archive-week-...', or DB UUID
//     checkbox: string|boolean,
//     project: string,             // nickname display string
//     subproject: string,
//     status: string,              // free-form dropdown value
//     task: string,
//     recurring: string,
//     estimate: string,
//     timeValue: string,           // '0.00' style, derived
//     [`day-${i}`]: string,        // per-day cell values
//     _isMonthRow / _isWeekRow / ... : boolean (calendar headers only),
//     archiveWeekLabel?: string,   // archive marker
//     ...other archive snapshot fields
//   }
//
// On save the helper:
//   1. Strips calendar header rows (the ones flagged `_isMonthRow`, etc.)
//   2. Splits archive-week rows out to archived_weeks
//   3. Writes the remainder to planner_rows
//
// On read the helper:
//   1. Reads planner_rows and archived_weeks
//   2. Reads daily_bounds from tactics_metrics for the daily min/max rows
//   3. Builds the seven calendar headers using createInitialData and the
//      daily bounds
//   4. Interleaves archive weeks back into the row list by display_order
//   5. Returns the flat array the consuming code expects

const CALENDAR_HEADER_IDS = new Set([
  'month-row',
  'week-row',
  'day-row',
  'dayofweek-row',
  'daily-min-row',
  'daily-max-row',
  'filter-row',
]);

const isCalendarHeaderRow = (row) => {
  if (!row) return false;
  if (CALENDAR_HEADER_IDS.has(row.id)) return true;
  return Boolean(
    row._isMonthRow ||
    row._isWeekRow ||
    row._isDayRow ||
    row._isDayOfWeekRow ||
    row._isDailyMinRow ||
    row._isDailyMaxRow ||
    row._isFilterRow,
  );
};

const isArchiveRow = (row) => {
  if (!row) return false;
  if (typeof row.archiveWeekLabel === 'string' && row.archiveWeekLabel.length > 0) return true;
  if (typeof row.id === 'string' && row.id.startsWith('archive-week-')) return true;
  if (typeof row.status === 'string' && row.status.toLowerCase().startsWith('archive')) return true;
  return false;
};

// Per-row fields stored as JSONB so we can round-trip future schema changes
// without losing data. day-* keys are split out into day_entries; status,
// estimate, etc. become first-class columns; everything else falls into
// extra_data.
const FIRST_CLASS_KEYS = new Set([
  'id',
  'checkbox',
  'project',
  'subproject',
  'status',
  'task',
  'recurring',
  'estimate',
  'timeValue',
  // task panel fields (added 2026-06-17)
  'notes',
  'taskCreatedAt',
  'completionCount',
  'lastCompletedAt',
]);

function plannerRowPayloadToDb({ row, userId, yearId, displayOrder }) {
  const dayEntries = {};
  const extraData = {};
  for (const [key, value] of Object.entries(row)) {
    if (FIRST_CLASS_KEYS.has(key)) continue;
    if (typeof key === 'string' && key.startsWith('day-')) {
      const idx = Number.parseInt(key.slice(4), 10);
      if (Number.isFinite(idx)) dayEntries[String(idx)] = value;
      continue;
    }
    extraData[key] = value;
  }

  const timeValueRaw = row.timeValue;
  const timeValueMinutes = (() => {
    if (typeof timeValueRaw === 'number') return Math.round(timeValueRaw * 60);
    if (typeof timeValueRaw === 'string') {
      const parsed = parseFloat(timeValueRaw);
      if (Number.isFinite(parsed)) return Math.round(parsed * 60);
    }
    return 0;
  })();

  // Preserve the row's existing UUID so task_events survive the delete+re-insert cycle.
  const isValidUUID = typeof row.id === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(row.id);

  return {
    ...(isValidUUID ? { id: row.id } : {}),
    user_id: userId,
    year_id: yearId,
    project_id: null,
    parent_row_id: null,
    row_kind: 'task',
    checkbox: row.checkbox === true || row.checkbox === 'true' || row.checkbox === 1 || row.checkbox === 'on',
    subproject_label: typeof row.subproject === 'string' ? row.subproject : '',
    status: typeof row.status === 'string' ? row.status : '-',
    task: typeof row.task === 'string' ? row.task : '',
    recurring: typeof row.recurring === 'string' ? row.recurring : '',
    estimate: typeof row.estimate === 'string' ? row.estimate : '',
    time_value_minutes: timeValueMinutes,
    day_entries: { __cells: dayEntries, __project: row.project ?? '', __extra: extraData },
    display_order: displayOrder,
    // task panel fields
    notes: typeof row.notes === 'string' ? row.notes : null,
    task_created_at: row.taskCreatedAt ?? null,
    completion_count: typeof row.completionCount === 'number' ? row.completionCount : 0,
    last_completed_at: row.lastCompletedAt ?? null,
  };
}

function plannerRowDbToPayload(dbRow) {
  const cells = dbRow.day_entries?.__cells || {};
  const project = dbRow.day_entries?.__project ?? '';
  const extra = dbRow.day_entries?.__extra || {};
  const row = {
    id: dbRow.id,
    checkbox: dbRow.checkbox === true,
    project,
    subproject: dbRow.subproject_label || '',
    status: dbRow.status || '-',
    task: dbRow.task || '',
    recurring: dbRow.recurring || '',
    estimate: dbRow.estimate || '',
    timeValue: typeof dbRow.time_value_minutes === 'number'
      ? (dbRow.time_value_minutes / 60).toFixed(2)
      : '0.00',
    // task panel fields
    notes: dbRow.notes ?? null,
    taskCreatedAt: dbRow.task_created_at ?? null,
    completionCount: typeof dbRow.completion_count === 'number' ? dbRow.completion_count : 0,
    lastCompletedAt: dbRow.last_completed_at ?? null,
  };
  for (const [idxStr, value] of Object.entries(cells)) {
    row[`day-${idxStr}`] = value;
  }
  for (const [key, value] of Object.entries(extra)) {
    row[key] = value;
  }
  return row;
}

function archiveRowPayloadToDb({ row, userId, yearId, weekNumber }) {
  return {
    user_id: userId,
    year_id: yearId,
    week_number: weekNumber,
    week_range_label: typeof row.archiveWeekLabel === 'string' ? row.archiveWeekLabel : null,
    archived_at: row.archivedAt || new Date().toISOString(),
    total_minutes: typeof row.totalMinutes === 'number' ? row.totalMinutes : null,
    daily_min_minutes: Array.isArray(row.dailyMinMinutes) ? row.dailyMinMinutes : [],
    daily_max_minutes: Array.isArray(row.dailyMaxMinutes) ? row.dailyMaxMinutes : [],
    snapshot: row,
  };
}

function archiveRowDbToPayload(dbRow) {
  const snapshot = dbRow.snapshot && typeof dbRow.snapshot === 'object' ? dbRow.snapshot : {};
  return {
    ...snapshot,
    id: snapshot.id || `archive-week-${dbRow.week_number}`,
    archiveWeekLabel: dbRow.week_range_label || snapshot.archiveWeekLabel || '',
  };
}

function applyDailyBoundsToHeaders(headers, dailyBounds, startDate) {
  // dailyBounds is an array of 7 { day, daily_max_minutes, daily_min_minutes }
  // returned by loadTacticsMetrics. Each day index in the cycle maps to a
  // specific calendar date (startDate + i days); we look up the bound by
  // that date's weekday name.
  if (!Array.isArray(dailyBounds) || dailyBounds.length === 0) return headers;

  const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  const boundsByDay = new Map();
  for (const entry of dailyBounds) {
    if (entry && typeof entry.day === 'string') boundsByDay.set(entry.day, entry);
  }

  const formatMinutes = (m) => {
    if (typeof m !== 'number' || !Number.isFinite(m)) return '';
    return (m / 60).toFixed(2);
  };

  const dailyMinRow = headers.find((r) => r._isDailyMinRow);
  const dailyMaxRow = headers.find((r) => r._isDailyMaxRow);

  if (!dailyMinRow && !dailyMaxRow) return headers;

  const baseDate = new Date(startDate || todayIso());

  let i = 0;
  while (true) {
    const key = `day-${i}`;
    if (!(dailyMinRow && key in dailyMinRow) && !(dailyMaxRow && key in dailyMaxRow)) break;
    const d = new Date(baseDate);
    d.setDate(baseDate.getDate() + i);
    const weekday = daysOfWeek[d.getDay()];
    const bound = boundsByDay.get(weekday);
    if (dailyMinRow) dailyMinRow[key] = formatMinutes(bound?.daily_min_minutes);
    if (dailyMaxRow) dailyMaxRow[key] = formatMinutes(bound?.daily_max_minutes);
    i += 1;
    if (i > 365) break; // safety guard
  }

  return headers;
}

export const readTaskRows = async (
  projectId = DEFAULT_PROJECT_ID,  // eslint-disable-line no-unused-vars
  yearNumber = null,
) => {
  try {
    const userId = await requireUserId();
    const cacheKey = taskRowsKey(yearNumber);
    if (hasCached(CACHE_NS, cacheKey)) return getCached(CACHE_NS, cacheKey);

    const yearRow = await findYearRow(userId, yearNumber);
    if (!yearRow) {
      setCached(CACHE_NS, cacheKey, []);
      return [];
    }

    const [tasksRes, archivesRes, metrics] = await Promise.all([
      supabase
        .from('planner_rows')
        .select('*')
        .eq('user_id', userId)
        .eq('year_id', yearRow.id)
        .order('display_order', { ascending: true }),
      supabase
        .from('archived_weeks')
        .select('*')
        .eq('user_id', userId)
        .eq('year_id', yearRow.id)
        .order('week_number', { ascending: true }),
      loadTacticsMetrics(yearNumber).catch(() => null),
    ]);

    if (tasksRes.error) throw tasksRes.error;
    if (archivesRes.error) throw archivesRes.error;

    const totalDays = yearRow.total_days || DEFAULT_TOTAL_DAYS;
    const startDate = yearRow.start_date || todayIso();
    const taskCount = (tasksRes.data || []).length;

    // Build the seven calendar header rows from scratch. createInitialData
    // produces both headers and a configurable number of blank rows; we
    // discard the blank rows and keep only the seven headers, then overlay
    // the daily bounds from tactics_metrics.
    const initial = createInitialData(0, totalDays, startDate);
    const headers = initial.slice(0, 7);
    applyDailyBoundsToHeaders(
      headers,
      metrics?.dailyBounds || metrics?.daily_bounds || [],
      startDate,
    );

    const taskRows = (tasksRes.data || []).map(plannerRowDbToPayload);
    const archiveRows = (archivesRes.data || []).map(archiveRowDbToPayload);

    let result;
    if (taskCount === 0 && archiveRows.length === 0) {
      // If there are no task rows and no archive rows we still return at least
      // some blank rows so the table renders the empty grid the user expects.
      result = [...headers, ...createInitialData(100, totalDays, startDate).slice(7)];
    } else {
      // Archive rows are appended after the live task rows. The original code
      // interleaved them inline based on `archive-week-*` ids in `task-rows`;
      // post-port they live in a separate table, so appending in week_number
      // order is the simplest faithful reconstruction. If insertion order
      // matters more than weekly order we can revisit.
      result = [...headers, ...taskRows, ...archiveRows];
    }

    // Deduplicate by row id — a safety net against the concurrent-save race
    // (two DELETEs then two INSERTs) that can land duplicate rows in
    // planner_rows. Calendar header rows above are always fresh-built so they
    // can never be duplicated; only the user rows need the check.
    const seenIds = new Set();
    result = result.filter(row => {
      if (!row?.id) return true; // keep id-less rows (shouldn't exist but be safe)
      if (seenIds.has(row.id)) return false;
      seenIds.add(row.id);
      return true;
    });

    setCached(CACHE_NS, cacheKey, result);
    return result;
  } catch (error) {
    console.error('Failed to read task rows', error);
    return [];
  }
};

// Serialize planner saves so concurrent DELETE+INSERT calls can't interleave.
//
// saveTaskRows uses a replace-the-layer pattern (DELETE all rows, then bulk
// INSERT). If two saves run concurrently — e.g. the 500ms debounce fires just
// before the user signs out, and the unmount flush fires immediately after —
// both DELETEs clear the table first, then both INSERTs add their rows,
// producing duplicate rows in Supabase. Chaining every save onto this promise
// ensures they execute one at a time: the second waits until the first's INSERT
// has committed before starting its own DELETE.
let _taskRowsSaveQueue = Promise.resolve();

export const saveTaskRows = (
  taskRows,
  projectId = DEFAULT_PROJECT_ID,  // eslint-disable-line no-unused-vars
  yearNumber = null,
) => {
  // Always run the next save regardless of whether the previous one threw, so
  // a transient network error doesn't permanently block future saves.
  _taskRowsSaveQueue = _taskRowsSaveQueue.then(
    () => _saveTaskRowsImpl(taskRows, yearNumber),
    () => _saveTaskRowsImpl(taskRows, yearNumber),
  );
  return _taskRowsSaveQueue;
};

async function _saveTaskRowsImpl(taskRows, yearNumber) {
  try {
    // Fire a snapshot before each save (internally throttled to one every
    // 2 minutes). Best-effort — a snapshot failure must never block the save.
    saveSiteSnapshot(yearNumber).catch(() => {});

    const userId = await requireUserId();
    const yearId = await findYearId(userId, yearNumber);
    if (!yearId) return;

    const allRows = Array.isArray(taskRows) ? taskRows : [];
    const persistedTaskRows = [];
    const archiveRowsToWrite = [];
    let archiveCounter = 0;

    for (const row of allRows) {
      if (isCalendarHeaderRow(row)) continue;
      if (isArchiveRow(row)) {
        archiveCounter += 1;
        archiveRowsToWrite.push({ row, weekNumber: archiveCounter });
        continue;
      }
      persistedTaskRows.push(row);
    }

    // Replace-the-layer pattern (same as helper #4): delete all existing
    // planner_rows + archived_weeks for this year, then bulk insert.
    const [taskDelete, archiveDelete] = await Promise.all([
      supabase
        .from('planner_rows')
        .delete()
        .eq('user_id', userId)
        .eq('year_id', yearId),
      supabase
        .from('archived_weeks')
        .delete()
        .eq('user_id', userId)
        .eq('year_id', yearId),
    ]);
    if (taskDelete.error) throw taskDelete.error;
    if (archiveDelete.error) throw archiveDelete.error;

    const insertOps = [];

    const dbTaskRows = persistedTaskRows.map((row, idx) =>
      plannerRowPayloadToDb({ row, userId, yearId, displayOrder: idx }),
    );
    if (dbTaskRows.length > 0) {
      insertOps.push(supabase.from('planner_rows').insert(dbTaskRows));
    }

    const dbArchiveRows = archiveRowsToWrite.map(({ row, weekNumber }) =>
      archiveRowPayloadToDb({ row, userId, yearId, weekNumber }),
    );
    if (dbArchiveRows.length > 0) {
      insertOps.push(supabase.from('archived_weeks').insert(dbArchiveRows));
    }

    if (insertOps.length > 0) {
      const insertRes = await Promise.all(insertOps);
      for (const r of insertRes) {
        if (r.error) throw r.error;
      }
    }

    // Cache the just-saved array so the next read returns it instantly
    // (snappy navigation between pages without losing user edits).
    // Guard: only cache if the session that initiated the save is still the
    // active user. Without this, an in-flight save from a just-logged-out
    // session calls setCached *after* clearAll(), repopulating the cache with
    // the old user's data and causing the next login to skip its fresh load.
    const { data: { user: currentUser } } = await supabase.auth.getUser();
    if (currentUser?.id === userId) {
      setCached(CACHE_NS, taskRowsKey(yearNumber), allRows);
    }
  } catch (error) {
    console.error('Failed to save task rows', error);
  }
}

// ============================================================
// Legacy storage key helper (kept for any one-off consumer)
// ============================================================

// ============================================================
// TASK NOTES (planner_rows.notes — direct UPDATE, not replace-the-layer)
// ============================================================
//
// Notes are saved immediately on blur/debounce so the user doesn't lose
// typed text if they close the panel before the next full saveTaskRows call.
// The direct UPDATE also avoids kicking off a full row replacement for a
// single-field change.

export const saveTaskNote = async (taskId, noteText) => {
  try {
    const userId = await requireUserId();
    const { error } = await supabase
      .from('planner_rows')
      .update({ notes: noteText ?? null })
      .eq('id', taskId)
      .eq('user_id', userId);
    if (error) throw error;
  } catch (error) {
    console.error('Failed to save task note', error);
  }
};

// ============================================================
// TASK EVENTS (task_events table — append-only)
// ============================================================
//
// writeTaskEvent: called at status change and (debounced) at task name change.
// readTaskEvents: returns all events for a task, newest first.
//
// Rules from docs/task-panel-handover.md:
//   - Write on every status change via the status dropdown
//   - Write on task name change (debounced, only when value actually differs)
//   - Do NOT write for the weekly recurring reset in archiveHelpers
//   - Increment completion_count + stamp last_completed_at when status → Done
//     on a recurring task (handled here alongside the event write)

/**
 * Append one event row for a field change on a task.
 *
 * @param {string}  taskId     - UUID of the planner_row
 * @param {object}  payload
 * @param {string}  payload.field      - 'status' | 'task_name'
 * @param {string|null} payload.oldValue  - previous value (null on first set)
 * @param {string}  payload.newValue   - new value
 * @param {string|null} [payload.note] - optional user note (Blocked, On Hold)
 * @param {boolean} [payload.isRecurring] - pass true on status events so the
 *   function can handle completion_count / last_completed_at bookkeeping.
 */
export const writeTaskEvent = async (taskId, { field, oldValue, newValue, note = null, isRecurring = false }) => {
  if (!taskId) return;
  console.log('[task-events] writeTaskEvent called', { taskId, field, oldValue, newValue });
  try {
    const userId = await requireUserId();

    const { error } = await supabase
      .from('task_events')
      .insert({
        task_id: taskId,
        user_id: userId,
        field,
        old_value: oldValue ?? null,
        new_value: newValue,
        note: note ?? null,
      });
    if (error) throw error;
    console.log('[task-events] writeTaskEvent success', { taskId, field, newValue });

    // Bookkeeping: increment completion_count and stamp last_completed_at when
    // a recurring task moves to Done.
    if (field === 'status' && newValue === 'Done' && isRecurring) {
      const { error: countError } = await supabase.rpc('increment_completion_count', {
        p_task_id: taskId,
        p_user_id: userId,
      }).catch(() => ({ error: new Error('rpc not available') }));

      // Fallback if the RPC doesn't exist yet: do a manual read-increment-write.
      if (countError) {
        const { data: rowData } = await supabase
          .from('planner_rows')
          .select('completion_count')
          .eq('id', taskId)
          .eq('user_id', userId)
          .maybeSingle();
        const current = rowData?.completion_count ?? 0;
        await supabase
          .from('planner_rows')
          .update({
            completion_count: current + 1,
            last_completed_at: new Date().toISOString(),
          })
          .eq('id', taskId)
          .eq('user_id', userId);
      }
    }

    // Stamp task_created_at when a task name is saved for the first time.
    if (field === 'task_name' && (!oldValue || oldValue === '') && newValue) {
      await supabase
        .from('planner_rows')
        .update({ task_created_at: new Date().toISOString() })
        .eq('id', taskId)
        .eq('user_id', userId)
        .is('task_created_at', null);
    }
  } catch (error) {
    console.error('Failed to write task event', error);
  }
};

/**
 * Read all events for a task, newest first.
 * Returns an empty array on error so callers can always map over the result.
 *
 * @param {string} taskId - UUID of the planner_row
 * @returns {Promise<Array>}
 */
export const readTaskEvents = async (taskId) => {
  if (!taskId) return [];
  try {
    const userId = await requireUserId();
    console.log('[task-events] readTaskEvents querying', { taskId });
    const { data, error } = await supabase
      .from('task_events')
      .select('*')
      .eq('task_id', taskId)
      .eq('user_id', userId)
      .order('changed_at', { ascending: false });
    if (error) throw error;
    console.log('[task-events] readTaskEvents result', { taskId, count: data?.length, rows: data });
    return data ?? [];
  } catch (error) {
    console.error('Failed to read task events', error);
    return [];
  }
};

// ============================================================
// Legacy storage key helper (kept for any one-off consumer)
// ============================================================

/**
 * Kept exported because a small number of utility scripts (and the dev-only
 * undo-draft sweep) still build storage keys the old way. Post-port, no
 * production code path should rely on this.
 */
export const getProjectKey = (
  template,
  projectId = DEFAULT_PROJECT_ID,
  yearNumber = null,
) => {
  let key = template.replace('{projectId}', projectId);
  if (yearNumber !== null && yearNumber !== undefined) {
    const parts = key.split('-');
    const lastPart = parts.pop();
    parts.push('year', yearNumber.toString(), lastPart);
    key = parts.join('-');
  }
  return key;
};
