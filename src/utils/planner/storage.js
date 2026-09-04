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
 *                      eight calendar header rows are NOT persisted; they are
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
 * the consuming code expects, which starts with the eight calendar header
 * rows (month, week, day, dayofweek, daily-min, daily-max, daily-total,
 * filter) followed by the user's task rows and any
 * archive-week snapshots interleaved by display_order. saveTaskRows strips the calendar headers before writing,
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
import { debounceSiteSnapshot } from '../../lib/snapshotStorage';
import { DEFAULT_PROJECT_ID } from '../../constants/plannerStorageKeys';
import {
  getCached,
  hasCached,
  invalidate,
  setCached,
  onSessionReset,
} from '../../lib/storageCache';
import {
  localUserId,
  loadPlannerSnapshot,
  savePlannerSnapshot,
  savePendingState,
  clearPendingState,
  setOfflineReplayHandler,
  replayPendingSaves,
  scheduleOfflineRetry,
} from '../../lib/plannerOffline';

export { DEFAULT_PROJECT_ID };
export { hasPendingOfflineSave } from '../../lib/plannerOffline';

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
/**
 * Drop the cached task rows for a year so the next readTaskRows hits
 * Supabase. Used by the System page's realtime subscription to pick up
 * writes made by other clients (e.g. the mobile app).
 */
export function invalidateTaskRowsCache(yearNumber) {
  invalidate(CACHE_NS, taskRowsKey(yearNumber));
}

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
  // Use limit(1) instead of maybeSingle() so duplicate year rows (which can
  // exist if the unique constraint was absent from the deployed schema) don't
  // return a PGRST116 error that silently breaks every System-page read/write.
  const { data, error } = await supabase
    .from('years')
    .select('id, start_date, total_days')
    .eq('user_id', userId)
    .eq('year_number', yearNumber)
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) throw error;
  const row = (data && data.length > 0) ? data[0] : null;
  // Only cache a FOUND row. Caching null poisoned the whole session when a
  // lookup raced ahead of the year row's insert (Plan Next Year: the draft
  // year's `years` insert is async while the UI switches immediately, so an
  // early save cached null for year N+1 and every later save became a silent
  // no-op — the offline pending record never cleared and the "Syncing
  // changes…" pill stuck for the session). A missing year is rare, so the
  // extra round-trip on repeat misses is fine.
  if (row) setCached(CACHE_NS, key, row);
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
  // Pure upsert — no read needed. ON CONFLICT DO UPDATE updates only the
  // columns present in the payload; other columns keep their DB values.
  // Eliminates the read-first race where 8 concurrent callers all see "no
  // row" and then all try to INSERT, causing unique-constraint violations.
  const { data, error } = await supabase
    .from('planner_settings')
    .upsert(
      { user_id: userId, year_id: yearId, ...columns },
      { onConflict: 'user_id,year_id' },
    )
    .select()
    .single();
  if (error) throw error;
  if (yearNumber != null) {
    setCached(CACHE_NS, settingsKey(yearNumber), data);
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
//   3. Builds the nine calendar headers using createInitialData and the
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
  'daily-total-row',
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
    row._isDailyTotalRow ||
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
  'projectId',
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
  // day-filter fields (added 2026-06-18)
  'dayTag',
  'dayTagLocked',
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

  // Always include id. Existing rows carry their DB UUID so task_events FKs
  // survive the delete+re-insert cycle. New rows (synthetic ids like 'row-0')
  // get a fresh UUID generated here. Without this, the Supabase JS client
  // collects all unique keys across the bulk-insert array and lists 'id' in
  // the PostgREST columns param — rows missing id then get null, which
  // violates the NOT NULL constraint and wipes all tasks on failure.
  const isValidUUID = typeof row.id === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(row.id);
  const rowId = isValidUUID ? row.id : crypto.randomUUID();

  return {
    id: rowId,
    user_id: userId,
    year_id: yearId,
    project_id: (typeof row.projectId === 'string' && row.projectId) ? row.projectId : null,
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
    // day-filter fields
    day_tag: typeof row.dayTag === 'string' ? row.dayTag : null,
    day_tag_locked: row.dayTagLocked === true,
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
    projectId: dbRow.project_id ?? null,
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
    // day-filter fields
    dayTag: dbRow.day_tag ?? null,
    dayTagLocked: dbRow.day_tag_locked === true,
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

// Convert the Plan page's "H.MM" hours representation (number like 1.3 or
// string like "1.30", where the decimal part is minutes/100, NOT a fraction
// of an hour) into integer minutes. Mirrors hmmToMinutes in
// tacticsMetricsStorage.js — loadTacticsMetrics returns dailyBounds entries
// already converted back to this camelCase H.MM payload shape.
function hmmHoursToMinutes(hmm) {
  if (hmm == null) return 0;
  if (typeof hmm === 'number') {
    if (!Number.isFinite(hmm) || hmm <= 0) return 0;
    const h = Math.floor(hmm);
    const mm = Math.round((hmm - h) * 100);
    return h * 60 + Math.min(Math.max(mm, 0), 59);
  }
  if (typeof hmm !== 'string') return 0;
  const trimmed = hmm.trim();
  if (!trimmed) return 0;
  const [hPart, mPart = '0'] = trimmed.split('.');
  const h = parseInt(hPart, 10) || 0;
  const m = parseInt(mPart.padEnd(2, '0').slice(0, 2), 10) || 0;
  return h * 60 + Math.min(Math.max(m, 0), 59);
}

function applyDailyBoundsToHeaders(headers, dailyBounds, startDate) {
  // dailyBounds is the camelCase payload from loadTacticsMetrics:
  // [{ day, weekNumber, dailyMaxHours, dailyMinHours }] with H.MM hour
  // values (weekNumber null = legacy global entry). This function used to
  // read snake_case minute fields (daily_min_minutes) that the payload does
  // not contain, so every cell resolved to '' — the System page's Daily
  // Min/Max rows came back BLANK from every readTaskRows call, and each
  // realtime refetch flashed them empty until the page's min/max effect
  // refilled them (which re-triggered a save → echo → refetch loop).
  // Now the mapping mirrors mapDailyBoundsToTimeline: per-week entries win
  // over the global fallback, and missing bounds render as '0.00' (matching
  // the page's formatting) rather than ''.
  const dailyMinRow = headers.find((r) => r._isDailyMinRow);
  const dailyMaxRow = headers.find((r) => r._isDailyMaxRow);
  if (!dailyMinRow && !dailyMaxRow) return headers;

  const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  // perWeekMap: weekNumber -> Map(dayName -> entry); globalMap: dayName -> entry
  const perWeekMap = new Map();
  const globalMap = new Map();
  for (const entry of (Array.isArray(dailyBounds) ? dailyBounds : [])) {
    if (!entry || typeof entry.day !== 'string') continue;
    if (entry.weekNumber != null) {
      if (!perWeekMap.has(entry.weekNumber)) perWeekMap.set(entry.weekNumber, new Map());
      perWeekMap.get(entry.weekNumber).set(entry.day, entry);
    } else {
      globalMap.set(entry.day, entry);
    }
  }

  const formatHours = (hmm) => (hmmHoursToMinutes(hmm) / 60).toFixed(2);

  const baseDate = new Date(startDate || todayIso());

  let i = 0;
  while (true) {
    const key = `day-${i}`;
    if (!(dailyMinRow && key in dailyMinRow) && !(dailyMaxRow && key in dailyMaxRow)) break;
    const d = new Date(baseDate);
    d.setDate(baseDate.getDate() + i);
    const weekday = daysOfWeek[d.getDay()];
    const weekNum = Math.floor(i / 7) + 1;
    const bound = perWeekMap.get(weekNum)?.get(weekday) ?? globalMap.get(weekday);
    if (dailyMinRow) dailyMinRow[key] = formatHours(bound?.dailyMinHours);
    if (dailyMaxRow) dailyMaxRow[key] = formatHours(bound?.dailyMaxHours);
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
    if (hasCached(CACHE_NS, cacheKey)) {
      // Cache hit (in-memory or the localStorage mirror rehydrated on page
      // load). The rows may be arbitrarily old — a machine last used weeks
      // ago serves them as if fresh — so the diff save must NOT treat them
      // as a server read. Restore the bookkeeping that was persisted with
      // the IndexedDB snapshot (written at the last real read/save on this
      // machine) so a save from this state diffs three-way against the
      // server state those rows actually came from, and the page-level
      // revalidation (planner-rows-stale / isPlannerYearServerFresh) fetches
      // the real rows shortly after. See the 2026-08-27 stale-tab incident in
      // docs/known-issues.md.
      if (!_readHighWater.has(yearNumber)) {
        await restoreBookkeepingFromSnapshot(userId, yearNumber);
      }
      return getCached(CACHE_NS, cacheKey);
    }

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

    // Record which planner_rows ids this client has seen server-side. The
    // diff-based save uses this to tell "row web created" apart from "row
    // another client (mobile) created that web hasn't refreshed in yet",
    // and "row web deleted" apart from "row deleted remotely".
    _knownRowIds.set(yearNumber, new Set((tasksRes.data || []).map((r) => r.id)));
    // Baseline for the three-way diff save: the server state these rows were
    // read as. Saves advance it only with web's own writes, so fields another
    // client changes after this read stay recognisable as remote.
    _baselineRows.set(yearNumber, new Map((tasksRes.data || []).map((r) => [r.id, baselineSnap(r)])));
    // High-water mark of this read: the newest planner_rows.updated_at the
    // server showed us. Any server row newer than this at save time was
    // written by another client after this read (clock-skew free — both
    // sides are server timestamps). Also marks the year as server-read this
    // session (see isPlannerYearServerFresh).
    _readHighWater.set(yearNumber, maxUpdatedAt(tasksRes.data || []));
    _serverReadYears.add(yearNumber);

    const totalDays = yearRow.total_days || DEFAULT_TOTAL_DAYS;
    const startDate = yearRow.start_date || todayIso();
    const taskCount = (tasksRes.data || []).length;

    // Build the eight calendar header rows from scratch. createInitialData
    // produces both headers and a configurable number of blank rows; we
    // discard the blank rows and keep only the eight headers, then overlay
    // the daily bounds from tactics_metrics.
    const initial = createInitialData(0, totalDays, startDate);
    const headers = initial.slice(0, 8);
    applyDailyBoundsToHeaders(
      headers,
      metrics?.dailyBounds || metrics?.daily_bounds || [],
      startDate,
    );

    const taskRows = (tasksRes.data || []).map(plannerRowDbToPayload);
    const archiveRows = (archivesRes.data || []).map(archiveRowDbToPayload);

    let result;
    if (taskCount === 0 && archiveRows.length === 0) {
      // No task rows and no archive rows: return just the calendar headers.
      // Padding with blank rows here (previously 92 of them) left a wall of
      // empty task rows on every new draft year, most of them stranded under
      // the Archive header. The inbox/archive structural rows are injected by
      // the page's structure effect, and users add rows via the Listical menu.
      result = [...headers];
    } else {
      // Archive week rows live in a separate table (archived_weeks), so their
      // position in the row list must be reconstructed on read. Each archived
      // project header (and stray archived task) carries parentGroupId equal
      // to its archive week's id, so re-insert every week row immediately
      // BEFORE its first child. Appending at the end (the previous behaviour)
      // put the green week row BELOW its own archived project rows after a
      // refresh, which also broke collapse — the week looked like it hadn't
      // taken its tasks with it.
      result = [...headers, ...taskRows];
      if (archiveRows.length > 0) {
        // Rebuild the archive section in canonical order. Week rows live in a
        // separate table (archived_weeks) and planner_rows display_order can
        // drift (older bugs persisted scrambled orders), so instead of trusting
        // stored positions we regroup by the parentGroupId chain:
        //   archive week → its archived project headers → each header's
        //   section rows and archived tasks (kept in their stored relative
        //   order within the group).
        const weekIds = new Set(archiveRows.map((w) => w.id));
        const headerGroupIds = new Set(
          result
            .filter((r) => r.parentGroupId && weekIds.has(r.parentGroupId) && r.groupId)
            .map((r) => r.groupId),
        );
        const isArchiveMember = (r) =>
          !!r.parentGroupId && (weekIds.has(r.parentGroupId) || headerGroupIds.has(r.parentGroupId));

        const remaining = result.filter((r) => !isArchiveMember(r));
        const block = [];
        for (const week of archiveRows) {
          block.push(week);
          const weekHeaders = result.filter((r) => r.parentGroupId === week.id);
          for (const header of weekHeaders) {
            block.push(header);
            if (header.groupId) {
              block.push(...result.filter((r) => r.parentGroupId === header.groupId));
            }
          }
        }

        // Insert the rebuilt block right after the Archive header row; if it
        // is missing (shouldn't happen), append at the end.
        const archiveHeaderIdx = remaining.findIndex((r) => r._rowType === 'archiveHeader');
        if (archiveHeaderIdx !== -1) {
          remaining.splice(archiveHeaderIdx + 1, 0, ...block);
        } else {
          remaining.push(...block);
        }
        result = remaining;
      }
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
    // Persist the freshly-read state (plus the known-id bookkeeping) so an
    // offline page load can hydrate from IndexedDB, and kick the replay loop
    // in case a pending save from a previous offline session is waiting.
    savePlannerSnapshot(userId, yearNumber, snapshotPayload(yearNumber, result));
    replayPendingSaves();
    return result;
  } catch (error) {
    console.error('Failed to read task rows', error);
    // Offline (or transient) failure: hydrate from the IndexedDB snapshot so
    // the System page still renders. Restoring _knownRowIds alongside the
    // rows keeps the diff save's resurrection guards correct for any edits
    // made against this snapshot.
    try {
      const uid = await localUserId();
      if (uid) {
        const snap = await loadPlannerSnapshot(uid, yearNumber);
        if (Array.isArray(snap?.rows) && snap.rows.length > 0) {
          adoptSnapshotBookkeeping(yearNumber, snap);
          setCached(CACHE_NS, taskRowsKey(yearNumber), snap.rows);
          return snap.rows;
        }
      }
    } catch { /* fall through to the empty default */ }
    return [];
  }
};

// Serialize planner saves so concurrent read-diff-write cycles can't
// interleave. saveTaskRows reads the server's current rows, diffs them
// against the desired state, and writes only the difference; two saves
// running concurrently would both diff against the same pre-save snapshot
// and double-apply. Chaining every save onto this promise ensures they
// execute one at a time.
let _taskRowsSaveQueue = Promise.resolve();

// Save-cycle bookkeeping for the realtime echo mute (ProjectTimePlannerV2).
// The mute must be measured from save COMPLETION, not initiation: a queued
// save can take longer than the mute window, and a refetch landing before it
// finishes would read pre-save DB state and overwrite good in-memory rows.
let _pendingTaskRowsSaves = 0;
let _lastTaskRowsSaveCompletedAt = 0;

/** True while any saveTaskRows call is queued or in flight. */
export const isTaskRowsSaveInFlight = () => _pendingTaskRowsSaves > 0;

/** Timestamp (ms) of the most recent saveTaskRows settle (success or failure). */
export const getLastTaskRowsSaveCompletedAt = () => _lastTaskRowsSaveCompletedAt;

// --- diff-save bookkeeping (per yearNumber) -------------------------------
// _knownRowIds: planner_rows ids this client has observed on the server
// (populated by readTaskRows fetches and maintained by saves). A desired row
// missing from the DB is only INSERTed when its id is NOT known — a known id
// missing from the DB means another client deleted it, and re-inserting it
// would resurrect the deletion from web's stale snapshot. Symmetrically, a
// DB row absent from web's desired state is only DELETEd when its id IS
// known — an unknown id means another client inserted it (e.g. mobile's
// delete-undo) after web's last refresh, and deleting it would erase that
// write.
const _knownRowIds = new Map(); // yearNumber -> Set<id>
// Web's blank grid rows carry synthetic ids ('row-0'); the DB needs UUIDs.
// The old delete-all save minted fresh UUIDs every save (harmless when every
// row was rewritten); a diff save must keep them stable or each save would
// duplicate every synthetic row.
const _syntheticRowIds = new Map(); // yearNumber -> Map<syntheticId, uuid>

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// JSON.stringify with recursively sorted keys — postgres jsonb reorders
// object keys, so a naive stringify of day_entries would diff every row.
function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value === undefined ? null : value);
}

// Columns the web save owns. id/user_id/year_id are identity; anything else
// in the desired payload is compared against the DB row.
const DIFF_KEYS = [
  'project_id', 'parent_row_id', 'row_kind', 'checkbox', 'subproject_label',
  'status', 'task', 'recurring', 'estimate', 'time_value_minutes',
  'day_entries', 'display_order', 'notes', 'task_created_at',
  'completion_count', 'last_completed_at', 'day_tag', 'day_tag_locked',
];

function plannerRowDiffers(desired, dbRow) {
  for (const key of DIFF_KEYS) {
    if (stableStringify(desired[key] ?? null) !== stableStringify(dbRow[key] ?? null)) return true;
  }
  return false;
}

// --- three-way merge baseline (per yearNumber) ----------------------------
// _baselineRows: for each row id, the DIFF_KEYS snapshot of the server state
// this client's in-memory rows are BASED ON (set on read; advanced only by
// this client's own writes). The diff save uses it to tell "web edited this
// field" (desired ≠ baseline → web's value wins) apart from "another client
// edited it after web's last refresh" (desired = baseline but server ≠
// baseline → server's value is kept). Without it, any row mobile touched
// between web's last refresh and web's next autosave read as "differs" and
// was overwritten wholesale with web's stale copy.
const _baselineRows = new Map(); // yearNumber -> Map<id, {DIFF_KEYS subset}>

function baselineSnap(dbRow) {
  const snap = {};
  for (const key of DIFF_KEYS) snap[key] = dbRow[key] ?? null;
  return snap;
}

// --- staleness guard (2026-08-27 incident) --------------------------------
// _readHighWater: per year, the newest planner_rows.updated_at this client
// observed at its last real server read (ISO string; '' when the year had
// no rows). Two jobs:
//   1. isPlannerYearServerFresh(year) — has this SESSION read the server for
//      this year? A cache-hit page load (localStorage mirror) has NOT, and
//      the System page uses this to revalidate immediately on mount.
//   2. The diff save's fallback for rows WITHOUT a baseline entry used to be
//      row-level last-writer-wins, which is how a weeks-old tab overwrote
//      days of mobile edits. Now such a row only wins if the server copy is
//      not newer than the high-water mark; otherwise the server row stands.
// Bookkeeping (known ids, baseline, high-water) is persisted with the
// IndexedDB snapshot and restored on cache-hit reads so the guard has a
// real basis even after a reload. When there is NO basis at all (fresh
// machine, pre-fix snapshot, pre-fix pending record) the save runs in
// restricted mode: no deletes, no overwrites of rows the server already
// has, inserts only for rows minted this session.
const _readHighWater = new Map(); // yearNumber -> ISO string

function maxUpdatedAt(rows) {
  let max = '';
  for (const r of rows) {
    const t = typeof r?.updated_at === 'string' ? r.updated_at : '';
    if (t > max) max = t;
  }
  return max;
}

// ISO timestamptz strings from postgres compare lexically only when they
// share a format; normalise through Date to be safe.
function isNewerThan(isoA, isoB) {
  if (!isoA) return false;
  if (!isoB) return true;
  const a = Date.parse(isoA);
  const b = Date.parse(isoB);
  if (Number.isNaN(a) || Number.isNaN(b)) return isoA > isoB;
  return a > b;
}

function snapshotPayload(yearNumber, rows) {
  return {
    rows,
    knownIds: [...(_knownRowIds.get(yearNumber) || [])],
    baseline: [...(_baselineRows.get(yearNumber) || new Map())],
    highWater: _readHighWater.get(yearNumber) ?? null,
    // Synthetic-id → UUID mapping. Without it a cache-hit page load re-mints
    // a fresh UUID for every row still carrying a synthetic id, and the save
    // inserts it beside the copy already on the server (2026-08-27 duplicate
    // Inbox/Archive header incident).
    synIds: [...(_syntheticRowIds.get(yearNumber) || new Map())],
    savedAt: Date.now(),
  };
}

// Adopt a snapshot's bookkeeping without clobbering anything this session
// already learned from the server.
function adoptSnapshotBookkeeping(yearNumber, snap) {
  if (!snap) return;
  if (!_knownRowIds.has(yearNumber) && Array.isArray(snap.knownIds)) {
    _knownRowIds.set(yearNumber, new Set(snap.knownIds));
  }
  if (!_baselineRows.has(yearNumber) && Array.isArray(snap.baseline)) {
    _baselineRows.set(yearNumber, new Map(snap.baseline));
  }
  if (!_readHighWater.has(yearNumber) && typeof snap.highWater === 'string') {
    _readHighWater.set(yearNumber, snap.highWater);
  }
  if (Array.isArray(snap.synIds)) {
    let synMap = _syntheticRowIds.get(yearNumber);
    if (!synMap) { synMap = new Map(); _syntheticRowIds.set(yearNumber, synMap); }
    for (const [synthetic, uuid] of snap.synIds) {
      if (!synMap.has(synthetic)) synMap.set(synthetic, uuid);
    }
  }
}

async function restoreBookkeepingFromSnapshot(userId, yearNumber) {
  try {
    const snap = await loadPlannerSnapshot(userId, yearNumber);
    adoptSnapshotBookkeeping(yearNumber, snap);
  } catch {
    // No snapshot → the save runs in restricted mode until a real read.
  }
}

// Years this SESSION has actually read from the server. Deliberately
// separate from _readHighWater: a snapshot-restored high-water mark is a
// valid save basis but must not count as "fresh" — that suppressed the
// System page's mount revalidation on every cache-hit load, so a stale
// cache could serve a whole session.
const _serverReadYears = new Set();

/** True once this session has read the server for `yearNumber`. */
export function isPlannerYearServerFresh(yearNumber) {
  return _serverReadYears.has(yearNumber);
}

// Forget everything this session believes about the server for every year
// and drop the row cache, so the next read hits the network and any save
// before then cannot overwrite newer remote rows. Fired when a tab wakes
// after a long sleep or regains connectivity; the System page listens for
// PLANNER_ROWS_STALE_EVENT and refetches through its realtime refresh path.
export const PLANNER_ROWS_STALE_EVENT = 'planner-rows-stale';
export function markPlannerRowsStale(reason = 'unknown') {
  for (const yearNumber of [..._readHighWater.keys()]) {
    invalidate(CACHE_NS, taskRowsKey(yearNumber));
  }
  _readHighWater.clear();
  _serverReadYears.clear();
  _baselineRows.clear();
  _knownRowIds.clear();
  if (typeof window !== 'undefined' && typeof CustomEvent === 'function') {
    window.dispatchEvent(new CustomEvent(PLANNER_ROWS_STALE_EVENT, { detail: { reason } }));
  }
}

// A tab hidden for longer than this is treated as stale on wake: whatever it
// holds may predate days of edits from another client.
const STALE_AFTER_HIDDEN_MS = 60 * 1000;
if (typeof document !== 'undefined' && typeof window !== 'undefined') {
  let hiddenAt = null;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      hiddenAt = Date.now();
      return;
    }
    if (hiddenAt != null && Date.now() - hiddenAt >= STALE_AFTER_HIDDEN_MS) {
      markPlannerRowsStale('tab-wake');
    }
    hiddenAt = null;
  });
  window.addEventListener('online', () => markPlannerRowsStale('online'));
}

// Monotonic id for pending-state records. A save only clears the IndexedDB
// pending record on success if no NEWER desired state has been persisted
// since it was queued — otherwise a slow save's success would erase the
// durability of edits made while it was in flight.
let _pendingSaveSeq = 0;

export const saveTaskRows = (
  taskRows,
  projectId = DEFAULT_PROJECT_ID,  // eslint-disable-line no-unused-vars
  yearNumber = null,
) => {
  // OUTBOX (offline-sync-plan Phase 2): persist the desired state to
  // IndexedDB BEFORE the network attempt — here in the wrapper, not the
  // queued impl, so the latest edits are durable the moment the save is
  // requested even if the tab closes while earlier saves are still queued.
  // The known-id and synthetic-id maps ride along: a replay after reload
  // must diff under the same bookkeeping or it could resurrect rows another
  // client deleted (or re-mint UUIDs for synthetic rows and duplicate them).
  const seq = ++_pendingSaveSeq;
  // Capture the bookkeeping NOW (synchronously) and hand the same object to
  // both the durable pending record and the queued save, so the save diffs
  // under the state the edit was made against even if markPlannerRowsStale
  // wipes the live maps before the queue reaches it.
  const bookkeeping = captureBookkeeping(yearNumber);
  localUserId().then((uid) => {
    if (!uid) return;
    savePendingState(uid, yearNumber, {
      taskRows,
      ...bookkeeping,
      seq,
      queuedAt: Date.now(),
    });
  });
  return _enqueueTaskRowsSave(taskRows, yearNumber, seq, bookkeeping);
};

// { knownIds, synIds, baseline, basedOnAt } — basedOnAt is the read
// high-water mark (ISO string, '' for an empty year) or null when this
// session has no server basis for the year at all.
function captureBookkeeping(yearNumber) {
  return {
    knownIds: [...(_knownRowIds.get(yearNumber) || [])],
    synIds: [...(_syntheticRowIds.get(yearNumber) || new Map())],
    baseline: [...(_baselineRows.get(yearNumber) || new Map())],
    basedOnAt: _readHighWater.has(yearNumber) ? _readHighWater.get(yearNumber) : null,
  };
}

function _enqueueTaskRowsSave(taskRows, yearNumber, seq, bookkeeping) {
  // Always run the next save regardless of whether the previous one threw, so
  // a transient network error doesn't permanently block future saves.
  _pendingTaskRowsSaves += 1;
  const settle = () => {
    _pendingTaskRowsSaves = Math.max(0, _pendingTaskRowsSaves - 1);
    _lastTaskRowsSaveCompletedAt = Date.now();
  };
  _taskRowsSaveQueue = _taskRowsSaveQueue.then(
    () => _saveTaskRowsImpl(taskRows, yearNumber, seq, bookkeeping).finally(settle),
    () => _saveTaskRowsImpl(taskRows, yearNumber, seq, bookkeeping).finally(settle),
  );
  return _taskRowsSaveQueue;
}

// bookkeeping (replay only): { knownIds, synIds } captured when the pending
// state was queued. A replayed save MUST diff under the known-id set it was
// made against: rows another client created AFTER the pending state was
// queued are then unknown ids, which the diff leaves alone — diffing under a
// fresher known set instead would mark those rows known-but-undesired and
// DELETE them from a stale snapshot.
async function _saveTaskRowsImpl(taskRows, yearNumber, seq = 0, bookkeeping = null) {
  try {
    const userId = await requireUserId();
    const yearId = await findYearId(userId, yearNumber);
    if (!yearId) {
      // No `years` row yet (e.g. a save racing ahead of Plan Next Year's
      // async year insert). A silent return here would strand the durable
      // pending record forever — the "Syncing changes…" pill would stick
      // until a later session's replay. Treat it as a retryable failure:
      // findYearRow no longer caches misses, so the backoff retry re-queries
      // and succeeds once the year row lands.
      scheduleOfflineRetry();
      return;
    }

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

    // Diff-based save (replaced the delete-all-then-reinsert pattern,
    // 2026-07-19). Rewriting every row from web's in-memory snapshot erased
    // any write another client (mobile) made since web's last refresh — a
    // mobile delete got resurrected, a mobile delete-undo's re-insert got
    // wiped by the next web save. Now the save reads the server's current
    // rows (inside the serialized queue, so no interleaving) and writes only
    // the difference, using _knownRowIds to leave rows web has never seen
    // alone and to avoid resurrecting rows deleted remotely.

    // Stable UUIDs for synthetic-id rows (see _syntheticRowIds above).
    let synMap = _syntheticRowIds.get(yearNumber);
    if (!synMap) { synMap = new Map(); _syntheticRowIds.set(yearNumber, synMap); }
    // Replay: adopt the persisted synthetic-id mapping (only for ids not
    // already mapped this session) so a replayed save can't re-mint UUIDs
    // for rows whose first attempt half-landed, duplicating them.
    if (Array.isArray(bookkeeping?.synIds)) {
      for (const [synthetic, uuid] of bookkeeping.synIds) {
        if (!synMap.has(synthetic)) synMap.set(synthetic, uuid);
      }
    }
    // UUIDs minted in THIS save (synthetic ids nobody mapped before — not
    // this session, not the snapshot, not the pending record). Only these
    // are provably rows web just created; a mapping adopted from persisted
    // state describes a row that may already be on the server.
    const mintedHere = new Set();
    const desiredRows = persistedTaskRows.map((row, idx) => {
      let id = row.id;
      if (!(typeof id === 'string' && UUID_RE.test(id))) {
        if (!synMap.has(id)) {
          const uuid = crypto.randomUUID();
          synMap.set(id, uuid);
          mintedHere.add(uuid);
        }
        id = synMap.get(id);
      }
      return plannerRowPayloadToDb({ row: { ...row, id }, userId, yearId, displayOrder: idx });
    });

    const { data: currentData, error: currentErr } = await supabase
      .from('planner_rows')
      .select('*')
      .eq('user_id', userId)
      .eq('year_id', yearId);
    if (currentErr) throw currentErr;
    const currentById = new Map((currentData || []).map((r) => [r.id, r]));
    const desiredIds = new Set(desiredRows.map((r) => r.id));
    // Fallback (save before any read this pageload — shouldn't happen, since
    // autosave requires hydration): treat the server's rows as known, which
    // reduces to last-writer-wins for deletes but still never resurrects.
    // Replay: the known set persisted WITH the pending state wins outright
    // (see the bookkeeping note above _saveTaskRowsImpl).
    const known = Array.isArray(bookkeeping?.knownIds)
      ? new Set(bookkeeping.knownIds)
      : _knownRowIds.get(yearNumber) || new Set();

    // Baseline for the three-way merge. Replay: the baseline persisted WITH
    // the pending state wins, for the same reason as the known set — it is
    // the state the queued edits were made against.
    const baseline = Array.isArray(bookkeeping?.baseline)
      ? new Map(bookkeeping.baseline)
      : _baselineRows.get(yearNumber) || new Map();
    const nextBaseline = new Map(baseline);

    // Staleness guard (see _readHighWater). basedOnAt is the server
    // high-water mark the desired state was built against; null means this
    // save has NO server basis (fresh machine, pre-fix snapshot or pending
    // record, or a save that beat the first read) → restricted mode.
    const basedOnAt = bookkeeping
      ? (typeof bookkeeping.basedOnAt === 'string' ? bookkeeping.basedOnAt : null)
      : (_readHighWater.has(yearNumber) ? _readHighWater.get(yearNumber) : null);
    const hasBasis = basedOnAt !== null;
    // Structural rows (Inbox divider, Archive header, project headers) exist
    // once per year / per project. With no server basis we cannot tell "web
    // just created this one" from "the cache lost the id of the one the
    // server already has" — both get a freshly minted UUID — so never insert
    // a structural row whose kind is already on the server.
    const structuralKey = (dbRow) => {
      const extra = dbRow?.day_entries?.__extra || {};
      if (extra._isInboxRow) return 'inbox';
      if (extra._rowType === 'archiveHeader') return 'archive';
      if (extra._rowType === 'projectHeader' || extra._rowType === 'projectUnscheduled' || extra._rowType === 'projectGeneral') {
        return `${extra._rowType}:${dbRow.project_id ?? extra.projectNickname ?? ''}`;
      }
      return null;
    };
    const serverStructural = new Set();
    for (const r of currentById.values()) {
      const k = structuralKey(r);
      if (k) serverStructural.add(k);
    }
    let guarded = 0; // rows the guard refused to overwrite/delete/insert

    const toUpsert = [];
    for (const d of desiredRows) {
      const cur = currentById.get(d.id);
      if (!cur) {
        // Missing from the DB. Known id → another client deleted it since we
        // last looked; do NOT resurrect it. Unknown id → a row web created.
        // No basis: we cannot tell "web created it" from "another client
        // deleted it since this stale copy was taken", so only rows minted
        // here (or a save into a still-empty year) may insert.
        if (known.has(d.id)) continue;
        if (!hasBasis && currentById.size > 0) {
          const k = structuralKey(d);
          if (!mintedHere.has(d.id) || (k && serverStructural.has(k))) { guarded += 1; continue; }
        }
        toUpsert.push(d);
        nextBaseline.set(d.id, baselineSnap(d));
        continue;
      }
      if (!plannerRowDiffers(d, cur)) {
        // In sync with the server — adopt it as the baseline (covers rows
        // read before the baseline map existed, and convergent edits).
        nextBaseline.set(d.id, baselineSnap(cur));
        continue;
      }
      const base = baseline.get(d.id);
      if (!base) {
        // No baseline for this row. Row-level last-writer-wins is only safe
        // if the server copy has not moved since the state we based this on
        // — otherwise the server row is the newer write (another client's)
        // and this copy is stale: keep the server's and adopt it as baseline
        // so the next save diffs properly.
        if (hasBasis && !isNewerThan(cur.updated_at, basedOnAt)) {
          toUpsert.push(d);
          nextBaseline.set(d.id, baselineSnap(d));
        } else {
          guarded += 1;
          nextBaseline.set(d.id, baselineSnap(cur));
        }
        continue;
      }
      // Three-way merge per field: web's value wins only for fields web
      // actually changed since its last read (desired ≠ baseline); fields
      // web left alone keep the server's value, so a remote (mobile) edit
      // web hasn't refreshed in yet is never overwritten by a stale copy.
      // Both-changed conflicts resolve to web's value (last writer here).
      const merged = { ...d };
      const newBase = { ...base };
      for (const key of DIFF_KEYS) {
        const dv = stableStringify(d[key] ?? null);
        const bv = stableStringify(base[key] ?? null);
        if (dv === bv) {
          merged[key] = cur[key] ?? null; // web untouched → server value stands
        } else {
          newBase[key] = d[key] ?? null; // web's own write advances the baseline
        }
      }
      if (plannerRowDiffers(merged, cur)) toUpsert.push(merged);
      nextBaseline.set(d.id, newBase);
    }
    const toDelete = [];
    for (const id of currentById.keys()) {
      // In the DB but not in web's state. Unknown id → another client
      // inserted it since web's last refresh (e.g. an undo re-insert);
      // leave it — the realtime refresh will bring it into web's view.
      if (desiredIds.has(id) || !known.has(id)) continue;
      // No basis → the known set is not trustworthy enough to delete on.
      if (!hasBasis) { guarded += 1; continue; }
      toDelete.push(id);
    }

    if (guarded > 0) {
      console.warn('[planner-save] staleness guard kept server rows', {
        guarded, hasBasis, basedOnAt, replay: bookkeeping?.replay === true,
      });
    }
    // TODO(debug): remove after cross-client sync is verified.
    console.log('[planner-save] diff', { upsert: toUpsert.length, delete: toDelete.length, server: currentById.size });

    if (toUpsert.length > 0) {
      const { error: upsertErr } = await supabase
        .from('planner_rows')
        .upsert(toUpsert, { onConflict: 'id' });
      if (upsertErr) throw upsertErr;
    }
    if (toDelete.length > 0) {
      const { error: deleteErr } = await supabase
        .from('planner_rows')
        .delete()
        .eq('user_id', userId)
        .in('id', toDelete);
      if (deleteErr) throw deleteErr;
    }

    const nextKnown = new Set(known);
    for (const d of toUpsert) nextKnown.add(d.id);
    for (const id of toDelete) {
      nextKnown.delete(id);
      nextBaseline.delete(id);
    }
    _knownRowIds.set(yearNumber, nextKnown);
    _baselineRows.set(yearNumber, nextBaseline);

    // archived_weeks used to be replace-the-layer (delete-all then
    // re-insert), gated on _serverReadYears after the 2026-08-28
    // stale-browser overwrite. That gate had its own data-loss hole: a week
    // archived in a session the gate distrusted was never written at all,
    // and the next reload rebuilt the archive section from the (empty)
    // table, so the week silently vanished (happened in production,
    // 2026-08-26). Now the save is non-destructive: every in-memory week is
    // upserted (matched by the snapshot's client-generated id, so re-saves
    // update rather than duplicate) in EVERY save, stale or fresh — an
    // insert/update cannot wipe weeks this session has never seen. Deleting
    // server weeks absent from memory (archive revert) stays behind the
    // server-read gate.
    {
      const existingRes = await supabase
        .from('archived_weeks')
        .select('id, week_number, snapshot')
        .eq('user_id', userId)
        .eq('year_id', yearId);
      if (existingRes.error) throw existingRes.error;
      const existingBySnapId = new Map(
        (existingRes.data || [])
          .filter((r) => r.snapshot && typeof r.snapshot.id === 'string')
          .map((r) => [r.snapshot.id, r]),
      );

      const memorySnapIds = new Set();
      for (const { row, weekNumber } of archiveRowsToWrite) {
        const dbRow = archiveRowPayloadToDb({ row, userId, yearId, weekNumber });
        const snapId = typeof row.id === 'string' ? row.id : null;
        if (snapId) memorySnapIds.add(snapId);
        const existing = snapId ? existingBySnapId.get(snapId) : null;
        if (existing) {
          const upd = await supabase
            .from('archived_weeks')
            .update(dbRow)
            .eq('id', existing.id);
          if (upd.error) throw upd.error;
        } else {
          const ins = await supabase.from('archived_weeks').insert(dbRow);
          if (ins.error) throw ins.error;
        }
      }

      // Destructive part only: remove server weeks the user deleted from a
      // session that has genuinely read the server (archive revert). A stale
      // or offline session can add and update weeks but never remove them.
      if (_serverReadYears.has(yearNumber)) {
        const toRemove = (existingRes.data || []).filter(
          (r) => !(r.snapshot && memorySnapIds.has(r.snapshot.id)),
        );
        for (const r of toRemove) {
          const del = await supabase.from('archived_weeks').delete().eq('id', r.id);
          if (del.error) throw del.error;
        }
      } else if ((existingRes.data || []).some((r) => !(r.snapshot && memorySnapIds.has(r.snapshot.id)))) {
        console.warn('[planner-save] archive deletes skipped: year not server-read this session');
      }
    }

    // Cache the just-saved array so the next read returns it instantly
    // (snappy navigation between pages without losing user edits).
    // Guard: only cache if the session that initiated the save is still the
    // active user. Without this, an in-flight save from a just-logged-out
    // session calls setCached *after* clearAll(), repopulating the cache with
    // the old user's data and causing the next login to skip its fresh load.
    // Persist rows under their server UUIDs: a cached synthetic id would be
    // re-minted as a brand-new row on the next page load.
    const rowsForCache = allRows.map((row) => {
      const mapped = synMap.get(row.id);
      return mapped ? { ...row, id: mapped } : row;
    });
    const { data: { user: currentUser } } = await supabase.auth.getUser();
    if (currentUser?.id === userId) {
      setCached(CACHE_NS, taskRowsKey(yearNumber), rowsForCache);
    }

    // Save confirmed: clear the pending record — unless a newer desired
    // state was persisted while this save was in flight, in which case that
    // newer record must stay durable until ITS save confirms. Refresh the
    // offline snapshot with the just-saved state either way.
    if (seq === _pendingSaveSeq) {
      clearPendingState(userId, yearNumber);
    }
    savePlannerSnapshot(userId, yearNumber, snapshotPayload(yearNumber, rowsForCache));

    // Schedule a snapshot after 30s of inactivity so the captured state
    // includes this edit but rapid/mid-thought edits don't produce partials.
    debounceSiteSnapshot(yearNumber);
  } catch (error) {
    console.error('Failed to save task rows', error);
    // The desired state is already durable in IndexedDB (persisted in the
    // saveTaskRows wrapper). Arm the capped-backoff retry; the 'online' and
    // visibilitychange listeners in plannerOffline also wake the replay.
    scheduleOfflineRetry();
  }
}

// Replay handler for pending saves left over from an offline session (or an
// earlier failed save). Restores the bookkeeping the pending state was
// computed under, then re-runs it through the normal save path — the diff
// against the server's live rows happens at replay time, so anything another
// client wrote in the meantime is respected exactly as in an online save.
setOfflineReplayHandler((yearNumber, payload) => {
  if (!Array.isArray(payload?.taskRows)) return Promise.resolve();
  const seq = ++_pendingSaveSeq;
  return _enqueueTaskRowsSave(payload.taskRows, yearNumber, seq, {
    knownIds: payload.knownIds,
    synIds: payload.synIds,
    baseline: payload.baseline,
    // Pre-fix records have no basedOnAt → restricted mode (see the
    // staleness guard): they can add rows but never overwrite or delete.
    basedOnAt: typeof payload.basedOnAt === 'string' ? payload.basedOnAt : null,
    replay: true,
  });
});

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

// Chip task notes are keyed by the stable chip ID (tactics chip UUID).
// Previously held in localStorage; now stored in the chip_task_notes Supabase
// table (migration 20260618000001_chip_task_notes.sql).
//
// In-memory cache so loadChipTaskNote stays synchronous at the call sites in
// ProjectTimePlannerV2 where chip rows are rebuilt. Call preloadChipTaskNotes()
// on mount to populate the cache from Supabase before chips are rendered.
// Falls back to localStorage on a cache miss so any notes written before the
// migration are still visible until the user saves them again.
const CHIP_NOTE_PREFIX = 'listical-chip-note-';
const chipNotesCache = new Map(); // chipId → note text (or null)

// Sign-out / account-switch: drop every piece of per-session bookkeeping so
// the next account's first save in this tab cannot diff against, or adopt
// ids from, the previous account (see storageCache.onSessionReset).
onSessionReset(() => {
  _knownRowIds.clear();
  _syntheticRowIds.clear();
  _baselineRows.clear();
  _readHighWater.clear();
  _serverReadYears.clear();
  chipNotesCache.clear();
});

// Fetch all chip notes for the signed-in user and populate chipNotesCache.
// Also migrates any localStorage-only notes to Supabase (one-time, per device).
// Call this once on System-page mount before chip rows are rendered.
export const preloadChipTaskNotes = async () => {
  try {
    const userId = await requireUserId();
    const { data, error } = await supabase
      .from('chip_task_notes')
      .select('chip_id, note')
      .eq('user_id', userId);
    if (error) throw error;

    // Populate cache from Supabase.
    chipNotesCache.clear();
    for (const row of data) {
      chipNotesCache.set(row.chip_id, row.note || null);
    }

    // One-time migration: push any localStorage-only notes up to Supabase.
    const toMigrate = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(CHIP_NOTE_PREFIX)) continue;
      const chipId = key.slice(CHIP_NOTE_PREFIX.length);
      if (chipNotesCache.has(chipId)) continue; // already in Supabase
      const note = localStorage.getItem(key);
      if (note) toMigrate.push({ user_id: userId, chip_id: chipId, note, updated_at: new Date().toISOString() });
    }
    if (toMigrate.length > 0) {
      const { error: migrateError } = await supabase
        .from('chip_task_notes')
        .upsert(toMigrate, { onConflict: 'user_id,chip_id' });
      if (!migrateError) {
        for (const row of toMigrate) {
          chipNotesCache.set(row.chip_id, row.note);
          localStorage.removeItem(CHIP_NOTE_PREFIX + row.chip_id);
        }
      }
    }
  } catch (err) {
    console.error('Failed to preload chip task notes', err);
  }
};

// Save a chip task note to Supabase and update the in-memory cache.
// taskId is 'chip-task-<chipId>'.
export const saveChipTaskNote = async (taskId, noteText) => {
  const chipId = taskId.slice('chip-task-'.length);
  if (!chipId) return;

  // Update cache immediately so subsequent loadChipTaskNote calls see the value.
  chipNotesCache.set(chipId, noteText || null);

  try {
    const userId = await requireUserId();
    if (noteText) {
      const { error } = await supabase
        .from('chip_task_notes')
        .upsert(
          { user_id: userId, chip_id: chipId, note: noteText, updated_at: new Date().toISOString() },
          { onConflict: 'user_id,chip_id' }
        );
      if (error) throw error;
    } else {
      // Empty note — delete the row so the table stays clean.
      const { error } = await supabase
        .from('chip_task_notes')
        .delete()
        .eq('user_id', userId)
        .eq('chip_id', chipId);
      if (error) throw error;
    }
    // Clean up any leftover localStorage entry for this chip.
    localStorage.removeItem(CHIP_NOTE_PREFIX + chipId);
  } catch (err) {
    console.error('Failed to save chip task note', err);
  }
};

// Synchronous read from the in-memory cache.
// Falls back to localStorage for notes written before preloadChipTaskNotes ran
// (e.g. on the very first render before the async preload completes).
export const loadChipTaskNote = (chipId) => {
  if (chipNotesCache.has(chipId)) return chipNotesCache.get(chipId);
  return localStorage.getItem(CHIP_NOTE_PREFIX + chipId) || null;
};

export const saveTaskNote = async (taskId, noteText) => {
  if (!taskId) return;
  // Chip tasks have ephemeral planner_row UUIDs — use chip_task_notes table.
  if (taskId.startsWith('chip-task-')) {
    await saveChipTaskNote(taskId, noteText);
    return;
  }
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

    // Bookkeeping: increment completion_count and stamp last_completed_at when
    // a recurring task moves to Done.
    if (field === 'status' && newValue === 'Done' && isRecurring) {
      let countError = null;
      try {
        const { error } = await supabase.rpc('increment_completion_count', {
          p_task_id: taskId,
          p_user_id: userId,
        });
        countError = error;
      } catch {
        countError = new Error('rpc not available');
      }

      // Fallback if the RPC doesn't exist yet: do a manual read-increment-write.
      // Skip for non-UUID row IDs (e.g. chip-task rows) — they have no planner_rows record.
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(taskId);
      if (countError && isUUID) {
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
    const { data, error } = await supabase
      .from('task_events')
      .select('*')
      .eq('task_id', taskId)
      .eq('user_id', userId)
      .order('changed_at', { ascending: false });
    if (error) throw error;
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
