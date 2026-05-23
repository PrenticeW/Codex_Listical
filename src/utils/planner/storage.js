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
import { DEFAULT_PROJECT_ID } from '../../constants/plannerStorageKeys';

export { DEFAULT_PROJECT_ID };

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
  const { data, error } = await supabase
    .from('years')
    .select('id, start_date, total_days')
    .eq('user_id', userId)
    .eq('year_number', yearNumber)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
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

async function readPlannerSettingsRow({ userId, yearId }) {
  const { data, error } = await supabase
    .from('planner_settings')
    .select('*')
    .eq('user_id', userId)
    .eq('year_id', yearId)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

/**
 * Write a partial column set to planner_settings without clobbering columns
 * this caller does not own. Mirrors the writeYearSettingsRow pattern from
 * helper #4 so each save function only touches its own columns.
 */
async function writePlannerSettingsColumns({ userId, yearId, columns }) {
  const existing = await readPlannerSettingsRow({ userId, yearId });
  if (existing) {
    const { error } = await supabase
      .from('planner_settings')
      .update(columns)
      .eq('id', existing.id);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from('planner_settings')
      .insert({ user_id: userId, year_id: yearId, ...columns });
    if (error) throw error;
  }
}

// --- years table updates (start_date, total_days live here) -----------

async function updateYearColumns({ yearId, columns }) {
  const { error } = await supabase
    .from('years')
    .update(columns)
    .eq('id', yearId);
  if (error) throw error;
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
    const row = await readPlannerSettingsRow({ userId, yearId });
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
    const row = await readPlannerSettingsRow({ userId, yearId });
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
      yearId,
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
    const row = await readPlannerSettingsRow({ userId, yearId });
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
    const row = await readPlannerSettingsRow({ userId, yearId });
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
    const row = await readPlannerSettingsRow({ userId, yearId });
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
    const row = await readPlannerSettingsRow({ userId, yearId });
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
    const row = await readPlannerSettingsRow({ userId, yearId });
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
      yearId,
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
    const row = await readPlannerSettingsRow({ userId, yearId });
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
    const row = await readPlannerSettingsRow({ userId, yearId });
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
      columns: { collapsed_groups: arr },
    });
  } catch (error) {
    console.error('Failed to save collapsed groups', error);
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

  return {
    user_id: userId,
    year_id: yearId,
    project_id: null,
    parent_row_id: null,
    row_kind: 'task',
    checkbox: row.checkbox === true,
    subproject_label: typeof row.subproject === 'string' ? row.subproject : '',
    status: typeof row.status === 'string' ? row.status : '-',
    task: typeof row.task === 'string' ? row.task : '',
    recurring: typeof row.recurring === 'string' ? row.recurring : '',
    estimate: typeof row.estimate === 'string' ? row.estimate : '',
    time_value_minutes: timeValueMinutes,
    day_entries: { __cells: dayEntries, __project: row.project ?? '', __extra: extraData },
    display_order: displayOrder,
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
    const yearRow = await findYearRow(userId, yearNumber);
    if (!yearRow) return [];

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

    // If there are no task rows and no archive rows we still return at least
    // some blank rows so the table renders the empty grid the user expects.
    if (taskCount === 0 && archiveRows.length === 0) {
      return [...headers, ...createInitialData(100, totalDays, startDate).slice(7)];
    }

    // Archive rows are appended after the live task rows. The original code
    // interleaved them inline based on `archive-week-*` ids in `task-rows`;
    // post-port they live in a separate table, so appending in week_number
    // order is the simplest faithful reconstruction. If insertion order
    // matters more than weekly order we can revisit.
    return [...headers, ...taskRows, ...archiveRows];
  } catch (error) {
    console.error('Failed to read task rows', error);
    return [];
  }
};

export const saveTaskRows = async (
  taskRows,
  projectId = DEFAULT_PROJECT_ID,  // eslint-disable-line no-unused-vars
  yearNumber = null,
) => {
  try {
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
  } catch (error) {
    console.error('Failed to save task rows', error);
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
