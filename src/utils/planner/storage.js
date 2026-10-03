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

import { supabase, CLIENT_BUILD } from '../../lib/supabase';
import { decryptRows, encryptField, encryptJson, encryptWritesEnabled, decryptJsonPreferEnc, hasDataKey, isEncrypted, initDataKey } from '../../lib/crypto';
import { createInitialData } from './dataCreators';
import { ensureOrderKeys, assignMissingKeys, compareRowOrder, isValidOrderKey } from './orderKey';
import { isRecurringValue } from './valueNormalizers';
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

// Phase 2 (decrypt-on-read, docs/encryption-plan.md): the encrypted text
// columns of planner_rows. archived_weeks.snapshot (jsonb) is handled via
// decryptRows' jsonFields argument at its read sites.
const PLANNER_ROW_ENC_TEXT = ['task', 'notes', 'subproject_label'];

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

/**
 * Drop the cached planner_settings row for a year so the next settings read
 * hits Supabase. A cache-hit page load otherwise serves visible_day_columns
 * (hidden weeks), week names, toggles etc. from a mirror that can be weeks
 * old — a stale browser showed a week hidden on another device (2026-09-08).
 */
export function invalidatePlannerSettingsCache(yearNumber) {
  invalidate(CACHE_NS, settingsKey(yearNumber));
}

/**
 * Server-truth read of the planner_settings row for a year. Bypasses and
 * refreshes the cache. Unlike the per-column readers this THROWS on failure
 * instead of returning defaults, so a revalidation that fails (offline, auth
 * not ready) never replaces good cached state with "everything visible".
 * Returns null only for a genuine missing row.
 */
export async function readPlannerSettingsRowStrict(yearNumber) {
  const userId = await requireUserId();
  const yearId = await findYearId(userId, yearNumber);
  if (!yearId) return null;
  invalidatePlannerSettingsCache(yearNumber);
  return readPlannerSettingsRow({ userId, yearId, yearNumber });
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
// Settings-write guard. Wake/focus revalidation (usePlannerStorage,
// useCollapsibleGroups) must not adopt a server row while one of this tab's
// own settings writes is in flight or has only just landed — the read could
// return the pre-save row and silently revert the user's change, which the
// autosave would then persist. Every planner_settings write funnels through
// writePlannerSettingsColumns, so tracking it here covers all columns
// (including collapsed_groups).
let _settingsWritesInFlight = 0;
let _lastSettingsWriteAt = 0;
const SETTINGS_WRITE_RECENT_MS = 5000;
export function isPlannerSettingsWriteRecent() {
  return _settingsWritesInFlight > 0
    || (Date.now() - _lastSettingsWriteAt) < SETTINGS_WRITE_RECENT_MS;
}

async function writePlannerSettingsColumns({ userId, yearId, yearNumber, columns }) {
  // Pure upsert — no read needed. ON CONFLICT DO UPDATE updates only the
  // columns present in the payload; other columns keep their DB values.
  // Eliminates the read-first race where 8 concurrent callers all see "no
  // row" and then all try to INSERT, causing unique-constraint violations.
  _settingsWritesInFlight += 1;
  try {
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
  } finally {
    _settingsWritesInFlight -= 1;
    _lastSettingsWriteAt = Date.now();
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
  'orderKey',
  'displayOrder',
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
    // Stable project id — but never for a plain task row whose project cell
    // is empty: paths that clear the visible project (keyboard clear, paste
    // of blanks) historically left projectId behind, and the mobile app's
    // project_id fallback then kept showing the removed project
    // (2026-10-02 incident). Structural rows (_rowType set) keep their id —
    // they legitimately carry project_id with an empty __project.
    project_id: (typeof row.projectId === 'string' && row.projectId &&
      (row._rowType || (typeof row.project === 'string' && row.project.trim() && row.project !== '-')))
      ? row.projectId : null,
    parent_row_id: null,
    row_kind: 'task',
    checkbox: row.checkbox === true || row.checkbox === 'true' || row.checkbox === 1 || row.checkbox === 'on',
    subproject_label: typeof row.subproject === 'string' ? row.subproject : '',
    status: typeof row.status === 'string' ? row.status : '-',
    task: typeof row.task === 'string' ? row.task : '',
    // Canonicalise the recurring vocabulary at the write boundary
    // (2026-10-03, docs/known-issues.md): the column historically held
    // 'true'/'false' alongside 'Recurring'/'Not Recurring', and the mixed
    // spellings are what let the grid checkbox decouple from the archive's
    // recurring semantics. Every save now converges a row to the canonical
    // spelling; '' stays '' (unset) so untouched rows don't churn.
    recurring: (typeof row.recurring === 'string' && row.recurring.trim() !== '')
      ? (isRecurringValue(row.recurring) ? 'Recurring' : 'Not Recurring')
      : '',
    estimate: typeof row.estimate === 'string' ? row.estimate : '',
    time_value_minutes: timeValueMinutes,
    day_entries: { __cells: dayEntries, __project: row.project ?? '', __extra: extraData },
    display_order: displayOrder,
    // Stable per-row position (2026-09-22 reorder fix). Assigned by
    // ensureOrderKeys in the save; display_order above is legacy, kept only
    // for inserts so pre-fix clients still sort sensibly.
    order_key: isValidOrderKey(row.orderKey) ? row.orderKey : null,
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
    orderKey: dbRow.order_key ?? null,
    displayOrder: typeof dbRow.display_order === 'number' ? dbRow.display_order : 0,
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
    // __decryptFailed is session-state (the read marks weeks it could not
    // decrypt), never content — strip it so it can't be persisted.
    snapshot: (() => { const { __decryptFailed, ...snap } = row; return snap; })(),
  };
}

function archiveRowDbToPayload(dbRow) {
  const snapshot = dbRow.snapshot && typeof dbRow.snapshot === 'object' ? dbRow.snapshot : {};
  const payload = {
    ...snapshot,
    id: snapshot.id || `archive-week-${dbRow.week_number}`,
    archiveWeekLabel: dbRow.week_range_label || snapshot.archiveWeekLabel || '',
  };
  // Snapshot ciphertext present but undecryptable (missing or late data
  // key): the id above is a lossy fallback — archived headers reference the
  // ORIGINAL minted week id via parentGroupId, so grouping can't be trusted
  // and this state must never be written back (2026-10-03 archive-churn
  // incident, docs/known-issues.md). The flag rides in the row itself so it
  // survives the IndexedDB snapshot and gates replayed offline saves too;
  // saveTaskRows checks it before touching anything archive-shaped.
  if (dbRow.__snapshotDecryptFailed === true) payload.__decryptFailed = true;
  return payload;
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
      // Deliberately NOT cached: a transient miss here (auth/user race, year
      // row still being created) would poison the cache with [] and every
      // later read this session would serve "empty year" from it.
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

    // Phase 2 (decrypt-on-read, docs/encryption-plan.md): decrypt BEFORE
    // any bookkeeping, so the diff baselines (_baselineRows) snapshot
    // PLAINTEXT values — desired rows stay plaintext until Phase 3 encrypts
    // at the write boundary, and a baseline of ciphertext would make every
    // row look remotely-changed. No-op while data is plaintext.
    // Login's initDataKey is fire-and-forget, so a read racing it would
    // decrypt-fail and hydrate `{}` fallbacks (the 2026-10-03 archive-churn
    // incident). Await it here — a no-op once the key is cached, and never
    // throws (plaintext mode when the key service is down).
    await initDataKey(userId);
    const taskData = await decryptRows(
      tasksRes.data || [], PLANNER_ROW_ENC_TEXT,
    );
    const archiveData = await Promise.all((archivesRes.data || []).map(async (r) => {
      const snapshot = await decryptJsonPreferEnc(r.snapshot_enc, r.snapshot);
      // decryptJsonPreferEnc returns the plaintext column VALUE (same
      // reference) when the _enc value exists but would not decrypt — on a
      // Phase 3 row that plaintext is the `{}` placeholder, i.e. the week's
      // snapshot (and its minted id) is lost to this session.
      const __snapshotDecryptFailed = isEncrypted(r.snapshot_enc) && snapshot === r.snapshot;
      if (__snapshotDecryptFailed) {
        console.warn('[planner-read] archived week snapshot failed to decrypt; archive is read-only this session', { weekNumber: r.week_number });
      }
      return { ...r, snapshot, __snapshotDecryptFailed };
    }));

    // Record which planner_rows ids this client has seen server-side. The
    // diff-based save uses this to tell "row web created" apart from "row
    // another client (mobile) created that web hasn't refreshed in yet",
    // and "row web deleted" apart from "row deleted remotely".
    _knownRowIds.set(yearNumber, new Set(taskData.map((r) => r.id)));
    _sessionOrderKeys.set(
      yearNumber,
      new Map(taskData
        .filter((r) => isValidOrderKey(r.order_key))
        .map((r) => [r.id, r.order_key])),
    );
    // Baseline for the three-way diff save: the server state these rows were
    // read as. Saves advance it only with web's own writes, so fields another
    // client changes after this read stay recognisable as remote.
    _baselineRows.set(yearNumber, new Map(taskData.map((r) => [r.id, baselineSnap(r)])));
    // High-water mark of this read: the newest planner_rows.updated_at the
    // server showed us. Any server row newer than this at save time was
    // written by another client after this read (clock-skew free — both
    // sides are server timestamps). Also marks the year as server-read this
    // session (see isPlannerYearServerFresh).
    _readHighWater.set(yearNumber, maxUpdatedAt(taskData));
    _serverReadYears.add(yearNumber);

    const totalDays = yearRow.total_days || DEFAULT_TOTAL_DAYS;
    const startDate = yearRow.start_date || todayIso();
    const taskCount = taskData.length;

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

    const taskRows = taskData
      .map(plannerRowDbToPayload)
      .sort(compareRowOrder);
    const archiveRows = archiveData.map(archiveRowDbToPayload);

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
      {
        // Rebuild the archive section in canonical order. Week rows live in a
        // separate table (archived_weeks) and planner_rows display_order can
        // drift (older bugs persisted scrambled orders), so instead of trusting
        // stored positions we regroup by the parentGroupId chain:
        //   archive week → its archived project headers → each header's
        //   section rows and archived tasks (kept in their stored relative
        //   order within the group).
        //
        // Resilience (2026-09-21 incident): the regroup must NOT require the
        // week rows to exist. When archived_weeks rows are missing (they were
        // once mass-deleted by a stale-tab save), the archived project groups
        // still render, regrouped under the Archive header in stored order,
        // instead of scrambling the whole section.
        const weekIds = new Set(archiveRows.map((w) => w.id));
        const archivedHeaders = result.filter(
          (r) => r._rowType === 'archivedProjectHeader' && r.groupId,
        );
        // Self-heal lost week linkage (2026-10-02 incident): a mount that
        // hydrated archive weeks under fallback ids (snapshot decrypt not
        // ready) let the page's structural repair strip parentGroupId from
        // every archived header, and the save persisted it. The link is
        // recoverable: the archive handler mints the week id and the batch's
        // header groupIds from Date.now() in the same tick, so both embed
        // the same archive moment. Re-parent any header whose parentGroupId
        // is missing (or points at no known week/group) to the week whose
        // id-embedded timestamp is the latest one at-or-before the header's
        // batch timestamp (60s grace for clock order). The restored link
        // rides __extra on the next save, making the repair permanent.
        {
          const tsOfWeek = (w) => {
            const m = /^archive-week-(\d{10,})-/.exec(String(w.id || ''));
            return m ? Number(m[1]) : null;
          };
          const weeksWithTs = archiveRows
            .map((w) => ({ w, ts: tsOfWeek(w) }))
            .filter((e) => e.ts !== null)
            .sort((a, b) => a.ts - b.ts);
          if (weeksWithTs.length > 0) {
            const knownParents = new Set([...weekIds, ...result.map((r) => r.groupId).filter(Boolean)]);
            for (const header of archivedHeaders) {
              if (header.parentGroupId && knownParents.has(header.parentGroupId)) continue;
              const m = /-group-(\d{10,})-/.exec(String(header.groupId));
              if (!m) continue;
              const batchTs = Number(m[1]);
              let best = null;
              for (const e of weeksWithTs) {
                if (e.ts <= batchTs + 60000) best = e; else break;
              }
              if (best) header.parentGroupId = best.w.id;
            }
          }
        }
        const headerGroupIds = new Set(archivedHeaders.map((r) => r.groupId));
        const isArchiveMember = (r) =>
          r._rowType === 'archivedProjectHeader' ||
          (!!r.parentGroupId && (weekIds.has(r.parentGroupId) || headerGroupIds.has(r.parentGroupId)));

        // Keep only the FIRST Archive header row — a duplicated structural
        // header (seen once in bad data) would otherwise split the section.
        let seenArchiveHeader = false;
        const remaining = result.filter((r) => {
          if (isArchiveMember(r)) return false;
          if (r._rowType === 'archiveHeader') {
            if (seenArchiveHeader) return false;
            seenArchiveHeader = true;
          }
          return true;
        });

        const block = [];
        const pushedHeaders = new Set();
        const pushHeader = (header) => {
          pushedHeaders.add(header);
          block.push(header);
          if (header.groupId) {
            block.push(...result.filter((r) => r.parentGroupId === header.groupId));
          }
        };
        for (const week of archiveRows) {
          block.push(week);
          const weekHeaders = result.filter((r) => r.parentGroupId === week.id);
          for (const header of weekHeaders) pushHeader(header);
        }
        // Orphaned archived headers (their week row is gone from
        // archived_weeks): append after the known weeks, in stored order,
        // each still followed by its own group's rows.
        for (const header of archivedHeaders) {
          if (!pushedHeaders.has(header)) pushHeader(header);
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
  'day_entries', 'order_key', 'notes', 'task_created_at',
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
// Per-session order keys (2026-09-22 reorder fix): yearNumber -> Map<id, key>.
// Seeded from every real server read, advanced by each save's ensureOrderKeys
// pass. The save trusts THIS map over the page's row copies, so keys survive
// page-state rebuilds and a save never re-mints keys for unmoved rows.
const _sessionOrderKeys = new Map();

// Rows the USER moved this session (2026-10-02 intent-gated ordering).
// yearNumber -> Set<client row id>. The save only rewrites order_key for
// rows in this set (and rows with no valid key); every other row keeps the
// SERVER's key, so a stale machine can never silently undo another
// machine's reordering. Registered by the drag-and-drop drop/undo handlers
// and by the chip-sync repositioning pass; captured (and cleared) with the
// save's bookkeeping so offline replays re-apply the move exactly once.
const _movedRowIds = new Map();

export function markRowsMoved(yearNumber, ids) {
  if (!Array.isArray(ids) || ids.length === 0) return;
  let set = _movedRowIds.get(yearNumber);
  if (!set) { set = new Set(); _movedRowIds.set(yearNumber, set); }
  for (const id of ids) if (id != null) set.add(id);
}

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
    invalidate(CACHE_NS, settingsKey(yearNumber));
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
      // Replay refuses records from other builds (plannerOffline.js).
      clientBuild: CLIENT_BUILD,
    });
  });
  return _enqueueTaskRowsSave(taskRows, yearNumber, seq, bookkeeping);
};

// { knownIds, synIds, baseline, basedOnAt } — basedOnAt is the read
// high-water mark (ISO string, '' for an empty year) or null when this
// session has no server basis for the year at all.
function captureBookkeeping(yearNumber) {
  // movedIds is consumed on capture: the save that carries it writes the
  // moved rows' new keys (which then persist via the server/session maps),
  // so later saves must not treat the rows as freshly moved.
  const moved = _movedRowIds.get(yearNumber);
  const movedIds = moved ? [...moved] : [];
  if (moved) moved.clear();
  return {
    knownIds: [...(_knownRowIds.get(yearNumber) || [])],
    synIds: [...(_syntheticRowIds.get(yearNumber) || new Map())],
    baseline: [...(_baselineRows.get(yearNumber) || new Map())],
    basedOnAt: _readHighWater.has(yearNumber) ? _readHighWater.get(yearNumber) : null,
    movedIds,
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

    // Archive integrity gate (2026-10-03 incident): any week row hydrated
    // from a failed snapshot decrypt means the in-memory archive — week
    // ids, grouping, ordering — is a lossy reconstruction. A save from this
    // state inserted duplicate weeks under fallback ids and then deleted
    // the real ones as "stale", churning the archive on every save cycle.
    // While the flag is up, nothing archive-shaped is written: the
    // archived_weeks layer is skipped wholesale and archive-member
    // planner_rows are held back from upserts AND deletes below.
    const archiveDecryptFailed = archiveRowsToWrite.some(
      ({ row }) => row && row.__decryptFailed === true,
    );

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
    // Server rows are fetched BEFORE synthetic-id resolution (2026-10-02
    // duplicate-structure fix): a synthetic id with no live mapping adopts
    // the server's existing row of the same structural identity instead of
    // minting a fresh UUID that would insert a second copy beside it.
    const { data: currentData, error: currentErr } = await supabase
      .from('planner_rows')
      .select('*')
      .eq('user_id', userId)
      .eq('year_id', yearId);
    if (currentErr) throw currentErr;
    // Phase 2: decrypt before the three-way diff / structural adoption, so
    // the save always compares plaintext-to-plaintext (desired rows stay
    // plaintext until Phase 3 encrypts at the write boundary).
    const decryptedCurrent = await decryptRows(currentData || [], PLANNER_ROW_ENC_TEXT);
    const currentById = new Map(decryptedCurrent.map((r) => [r.id, r]));

    // Structural identity (2026-10-02; extends the 2026-09-15 guard's key).
    // One canonical key per one-per-year / one-per-project / one-per-chip
    // row: the Inbox divider, the Archive header, project header / General /
    // Unscheduled rows, chip group headers, chip task rows, and deletedChip
    // tombstones. Two machines computing the same key converge on one row.
    // Archived copies are NOT structural (2026-10-03 gym-rows incident):
    // an archived snapshot of a chip task keeps _rowType 'projectTask' and
    // its _chipId, and archived custom subproject rows keep their original
    // _rowType — so without this guard the live row and EVERY weekly
    // archived copy share one structural key, adoption collapses them onto
    // one row, and the save deletes the archived copies as absent. The DB
    // index planner_rows_structural_uniq carries the same exclusion.
    const isArchivedCopy = (extra) => {
      if (extra._isArchivedTask === true || String(extra._isArchivedTask) === 'true') return true;
      const t = extra._rowType;
      if (typeof t === 'string' && t.startsWith('archived')) return true;
      const parent = extra.parentGroupId;
      return typeof parent === 'string'
        && (parent.startsWith('archived-') || parent.startsWith('archive-week-'));
    };
    const structuralKey = (dbRow) => {
      const extra = dbRow?.day_entries?.__extra || {};
      if (isArchivedCopy(extra)) return null;
      if (extra._isInboxRow) return 'inbox';
      const t = extra._rowType;
      if (t === 'archiveHeader') return 'archive';
      if (t === 'projectHeader' || t === 'projectUnscheduled' || t === 'projectGeneral') {
        return `${t}:${dbRow.project_id ?? extra.projectNickname ?? ''}`;
      }
      if (t === 'subprojectHeader' && (extra._chipGroupKey || extra._chipId)) {
        return `chipHeader:${extra._chipGroupKey ?? extra._chipId}`;
      }
      if (t === 'projectTask' && extra._chipId) return `chipTask:${extra._chipId}`;
      if (t === 'deletedChip') return `tombstone:${extra._chipGroupKey ?? extra._chipId ?? ''}`;
      return null;
    };
    // Client-row mirror of structuralKey, returning every key variant the
    // row could be known by on the server (project rows match by project_id
    // AND by nickname — older server rows may lack project_id).
    const clientStructuralKeys = (row) => {
      if (isArchivedCopy(row)) return []; // archived copies are never structural
      if (row._isInboxRow) return ['inbox'];
      const t = row._rowType;
      if (t === 'archiveHeader') return ['archive'];
      if (t === 'projectHeader' || t === 'projectUnscheduled' || t === 'projectGeneral') {
        const keys = [];
        if (row.projectId) keys.push(`${t}:${row.projectId}`);
        if (row.projectNickname) keys.push(`${t}:${row.projectNickname}`);
        return keys;
      }
      if (t === 'subprojectHeader' && (row._chipGroupKey || row._chipId)) {
        return [`chipHeader:${row._chipGroupKey ?? row._chipId}`];
      }
      if (t === 'projectTask' && row._chipId) return [`chipTask:${row._chipId}`];
      if (t === 'deletedChip') return [`tombstone:${row._chipGroupKey ?? row._chipId ?? ''}`];
      return [];
    };
    // Oldest server row per structural key (plus the nickname variant for
    // project rows) — the copy every client converges on.
    const serverRowByStructKey = new Map();
    {
      const byCreated = [...decryptedCurrent].sort((a, b) =>
        String(a.created_at ?? '').localeCompare(String(b.created_at ?? '')));
      for (const r of byCreated) {
        const extra = r?.day_entries?.__extra || {};
        const keys = [];
        const k = structuralKey(r);
        if (k) keys.push(k);
        const t = extra._rowType;
        if ((t === 'projectHeader' || t === 'projectUnscheduled' || t === 'projectGeneral')
            && r.project_id && extra.projectNickname) {
          keys.push(`${t}:${extra.projectNickname}`);
        }
        for (const key of keys) {
          if (!serverRowByStructKey.has(key)) serverRowByStructKey.set(key, r);
        }
      }
    }

    // UUIDs minted in THIS save (synthetic ids nobody mapped before — not
    // this session, not the snapshot, not the pending record). Only these
    // are provably rows web just created; a mapping adopted from persisted
    // state describes a row that may already be on the server.
    const mintedHere = new Set();
    // Resolved-id dedupe (2026-10-02 sync-stall fix). When the in-memory
    // state still carries duplicate structural copies (hydrated before the
    // server-side dedupe ran), two client rows resolve to the SAME adopted
    // server UUID. Sending both in one upsert makes Postgres reject the
    // whole batch with 21000 ("ON CONFLICT DO UPDATE command cannot affect
    // row a second time"), and the offline retry then replays the identical
    // payload forever — the lingering "Syncing changes…" stall. Keep the
    // first copy per resolved id and drop the rest from this save; the next
    // realtime read collapses the client-side duplicates.
    const seenDesiredIds = new Set();
    const desiredRows = [];
    persistedTaskRows.forEach((row, idx) => {
      let id = row.id;
      if (!(typeof id === 'string' && UUID_RE.test(id))) {
        // Resolve the synthetic id. A persisted mapping that no longer
        // points at a live server row is re-resolved — it may describe a
        // row another client deleted and re-created under a new UUID.
        const mapped = synMap.get(id);
        const mappedLive = mapped != null && currentById.has(mapped);
        if (!mapped || !mappedLive) {
          let adopted = null;
          for (const k of clientStructuralKeys(row)) {
            const existing = serverRowByStructKey.get(k);
            if (existing) { adopted = existing.id; break; }
          }
          if (adopted) {
            synMap.set(id, adopted);
          } else if (!mapped) {
            const uuid = crypto.randomUUID();
            synMap.set(id, uuid);
            mintedHere.add(uuid);
          }
        }
        id = synMap.get(id);
      }
      if (seenDesiredIds.has(id)) {
        console.warn('[planner-save] dropped duplicate resolved row from save payload', { id });
        return;
      }
      seenDesiredIds.add(id);
      desiredRows.push(plannerRowPayloadToDb({ row: { ...row, id }, userId, yearId, displayOrder: idx }));
    });

    // Assign per-row order keys — intent-gated (2026-10-02, replacing the
    // 2026-09-22 LIS pass). The old pass judged "out of place" against THIS
    // client's in-memory sequence, so a machine opened with a stale picture
    // rewrote keys for rows another machine had moved — the cross-device
    // "jumbled rows" bug. Now a row's key is only ever rewritten when (a)
    // the user moved it on this client (bookkeeping.movedIds, registered by
    // the drop handlers) or (b) it has no valid key yet / duplicates another
    // key. Every other row keeps the SERVER's current key, falling back to
    // the session map and then the payload for rows the server doesn't have.
    {
      let keyMap = _sessionOrderKeys.get(yearNumber);
      if (!keyMap) { keyMap = new Map(); _sessionOrderKeys.set(yearNumber, keyMap); }
      const movedIds = new Set();
      if (Array.isArray(bookkeeping?.movedIds)) {
        for (const mid of bookkeeping.movedIds) movedIds.add(synMap.get(mid) ?? mid);
      }
      const keyRows = desiredRows.map((d) => {
        if (movedIds.has(d.id)) return { id: d.id, orderKey: null }; // rekey between new neighbours
        const serverKey = currentById.get(d.id)?.order_key;
        if (isValidOrderKey(serverKey)) return { id: d.id, orderKey: serverKey };
        const own = keyMap.get(d.id) ?? (isValidOrderKey(d.order_key) ? d.order_key : null);
        return { id: d.id, orderKey: own };
      });
      // Structural-row self-heal (2026-10-02 incident): intent-gating keeps
      // the server's key even when it is nonsense — the Inbox divider once
      // carried a key that sorted it AFTER the whole archive block, so the
      // mobile app (which trusts raw key order positionally) absorbed every
      // inbox row into the last project section and stamped that project's
      // id onto them. Structural rows (headers, section rows, the Inbox
      // divider, archive chrome) are web-injected chrome, not user-dragged
      // content, so cross-device drag intent never applies to them: when a
      // structural row's kept key doesn't sort between its rendered
      // neighbours' keys, drop it and let assignMissingKeys re-key it in
      // place. Task rows are never touched here.
      {
        const valid = keyRows.map((r) => (isValidOrderKey(r.orderKey) ? r.orderKey : null));
        for (let i = 0; i < keyRows.length; i += 1) {
          if (valid[i] === null) continue;
          const extra = desiredRows[i].day_entries?.__extra || {};
          const structural = Boolean(extra._rowType || extra._isInboxRow || extra._isArchiveRow);
          if (!structural) continue;
          let p = i - 1;
          while (p >= 0 && valid[p] === null) p -= 1;
          let nx = i + 1;
          while (nx < keyRows.length && valid[nx] === null) nx += 1;
          const before = p >= 0 ? valid[p] : null;
          const after = nx < keyRows.length ? valid[nx] : null;
          if ((before !== null && valid[i] <= before) || (after !== null && valid[i] >= after)) {
            keyRows[i].orderKey = null;
          }
        }
      }
      assignMissingKeys(keyRows);
      for (const kr of keyRows) keyMap.set(kr.id, kr.orderKey);
      for (const d of desiredRows) d.order_key = keyMap.get(d.id);
    }

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
    // Structural rows exist once per year / per project / per chip. With no
    // server basis we cannot tell "web just created this one" from "the
    // cache lost the id of the one the server already has" — so never
    // insert a structural row whose kind is already on the server.
    // (structuralKey itself is defined above, next to the identity
    // adoption that uses it.)
    const serverStructural = new Set();
    const serverStructuralRows = new Map(); // structuralKey -> [server rows]
    for (const r of currentById.values()) {
      const k = structuralKey(r);
      if (k) {
        serverStructural.add(k);
        if (!serverStructuralRows.has(k)) serverStructuralRows.set(k, []);
        serverStructuralRows.get(k).push(r);
      }
    }
    let guarded = 0; // rows the guard refused to overwrite/delete/insert

    const toUpsert = [];
    for (const d of desiredRows) {
      const cur = currentById.get(d.id);
      // display_order is legacy (pre order_key clients). Never rewrite it on
      // an existing row — order lives in order_key now; the idx stamped at
      // payload build only seeds brand-new rows.
      if (cur && typeof cur.display_order === 'number') d.display_order = cur.display_order;
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
        // Belt and braces (2026-09-15 duplicate-header incident): NEVER
        // insert a second copy of a one-per-year / one-per-project
        // structural row while the server's copy survives this save. A
        // stale tab re-minting UUIDs for rows it lost track of is the only
        // way to reach this, and inserting the copy corrupts the layout
        // (two project headers, a second Inbox divider). The insert is
        // allowed only when every server row of the same kind is being
        // deleted in this same save (a genuine replacement).
        {
          const k = structuralKey(d);
          const survivors = k ? (serverStructuralRows.get(k) || []).filter((r) =>
            r.id !== d.id && (desiredIds.has(r.id) || !known.has(r.id) || !hasBasis)
          ) : [];
          if (survivors.length > 0) {
            console.warn('[planner-save] duplicate structural row refused', { key: k, keptId: survivors[0].id });
            guarded += 1;
            continue;
          }
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

    // Archive integrity gate, planner_rows side (see archiveDecryptFailed
    // above): with an undecryptable week in memory, the archive section was
    // rebuilt around fallback ids — hold back every write and delete that
    // touches an archive-member row, and roll their baselines back to the
    // server's copy so the next (healthy) save diffs correctly.
    if (archiveDecryptFailed) {
      const isArchiveMemberDb = (r) => {
        const extra = r?.day_entries?.__extra || {};
        return (typeof extra._rowType === 'string' && extra._rowType.startsWith('archivedProject'))
          || extra._isArchivedTask === true
          || (typeof extra.archiveWeekLabel === 'string' && extra.archiveWeekLabel.length > 0);
      };
      let held = 0;
      for (let i = toUpsert.length - 1; i >= 0; i -= 1) {
        const d = toUpsert[i];
        if (!isArchiveMemberDb(d)) continue;
        const cur = currentById.get(d.id);
        if (cur) nextBaseline.set(d.id, baselineSnap(cur));
        else nextBaseline.delete(d.id);
        toUpsert.splice(i, 1);
        held += 1;
      }
      for (let i = toDelete.length - 1; i >= 0; i -= 1) {
        const cur = currentById.get(toDelete[i]);
        if (cur && isArchiveMemberDb(cur)) {
          toDelete.splice(i, 1);
          held += 1;
        }
      }
      if (held > 0) {
        guarded += held;
        console.warn('[planner-save] archive gate held back archive-member rows (snapshot decrypt failed)', { held });
      }
    }

    // Mass-delete circuit breaker (2026-09-08 wipe). A desired state that
    // (a) no longer contains the permanent Inbox divider the UI always
    // carries while the server still has one, or (b) would delete nearly
    // every row on the server in one save, is a corrupt/empty in-memory
    // state — a failed or empty read hydrated as "empty year" while this
    // session's earlier bookkeeping still authorised deletes — not a user
    // action. Keep the server's rows (drop ALL deletes, keep upserts) and
    // let the next real read resync. Legitimate saves are unaffected: the
    // UI cannot delete the Inbox row, and no single user action removes
    // 80% of a populated year at once.
    const desiredStructural = new Set();
    for (const d of desiredRows) {
      const k = structuralKey(d);
      if (k) desiredStructural.add(k);
    }
    const inboxVanished = serverStructural.has('inbox') && !desiredStructural.has('inbox');
    const massDelete = toDelete.length >= 5 && toDelete.length >= 0.8 * currentById.size;
    if (toDelete.length > 0 && (inboxVanished || massDelete)) {
      console.error('[planner-save] wipe circuit breaker: refusing deletes', {
        wouldDelete: toDelete.length, server: currentById.size, inboxVanished, massDelete,
      });
      guarded += toDelete.length;
      // Forget these ids so the refused deletes do not advance known/baseline
      // as if they had happened; the next read re-adopts the server rows.
      toDelete.length = 0;
      // Half-applied replacement guard (2026-10-02 duplicate incident): with
      // the deletes refused, any INSERT that was only allowed as a
      // replacement of a structural row must not land either — it would sit
      // beside the kept copy (duplicate headers / chips). Drop those inserts
      // and point their synthetic ids back at the surviving server row.
      for (let i = toUpsert.length - 1; i >= 0; i -= 1) {
        const d = toUpsert[i];
        if (currentById.has(d.id)) continue; // update, not insert
        const k = structuralKey(d);
        if (!k) continue;
        const survivor = serverRowByStructKey.get(k);
        if (survivor && survivor.id !== d.id) {
          toUpsert.splice(i, 1);
          nextBaseline.delete(d.id);
          guarded += 1;
          for (const [synthetic, uuid] of synMap) {
            if (uuid === d.id) synMap.set(synthetic, survivor.id);
          }
        }
      }
    }

    // Keyless-blank guard (2026-10-02 blanking incident): a client that has
    // no data key cannot have decrypted an encrypted task, so a desired ''
    // over an enc1: server value can only be a failed hydration, never the
    // user clearing text they could see. Keep the server's value row by row.
    if (!hasDataKey()) {
      for (let i = toUpsert.length - 1; i >= 0; i -= 1) {
        const d = toUpsert[i];
        const cur = currentById.get(d.id);
        if (cur && isEncrypted(cur.task) && (d.task ?? '') === '') {
          toUpsert.splice(i, 1);
          nextBaseline.set(d.id, baselineSnap(cur));
          guarded += 1;
        }
      }
    }

    // Content-wipe circuit breaker (2026-10-02 blanking incident, sibling of
    // the mass-delete breaker above). A save that overwrites the task text
    // of many rows with empty strings is a corrupt in-memory state — a tab
    // whose module graph or decryption broke mid-load rendered rows it
    // couldn't populate and is now diffing that emptiness against the
    // server. No user action blanks 5+ task cells in one save. A state
    // corrupt enough to do that cannot be trusted for ANY of its writes or
    // deletes, so refuse the whole save: no upserts, no deletes, no
    // baseline/known advancement, no cache or offline-snapshot refresh —
    // the next real read resyncs from the server. The pending-save record
    // for this seq is cleared so the corrupt payload does not replay.
    {
      let blankedTasks = 0;
      for (const d of toUpsert) {
        const cur = currentById.get(d.id);
        if (cur && (cur.task ?? '') !== '' && (d.task ?? '') === '') blankedTasks += 1;
      }
      if (blankedTasks >= 5) {
        console.error('[planner-save] content-wipe circuit breaker: refusing save', {
          blankedTasks, upserts: toUpsert.length, deletes: toDelete.length, server: currentById.size,
        });
        if (seq === _pendingSaveSeq) clearPendingState(userId, yearNumber);
        return;
      }
    }

    if (guarded > 0) {
      console.warn('[planner-save] staleness guard kept server rows', {
        guarded, hasBasis, basedOnAt, replay: bookkeeping?.replay === true,
      });
    }
    // TODO(debug): remove after cross-client sync is verified.
    console.log('[planner-save] diff', { upsert: toUpsert.length, delete: toDelete.length, server: currentById.size });

    if (toUpsert.length > 0) {
      // Phase 3 (planner_rows flip): encrypt content fields at the Supabase
      // boundary, AFTER the three-way diff and baseline bookkeeping above —
      // baselines/_sessionOrderKeys/known-id sets all snapshot PLAINTEXT.
      // Encrypt onto copies so toUpsert's plaintext objects (already
      // captured by nextBaseline via baselineSnap) are never mutated.
      let upsertRows = toUpsert;
      if (encryptWritesEnabled('planner_rows')) {
        upsertRows = await Promise.all(toUpsert.map(async (d) => ({
          ...d,
          task: await encryptField(d.task ?? ''),
          notes: d.notes == null ? null : await encryptField(d.notes),
          subproject_label: await encryptField(d.subproject_label ?? ''),
        })));
      }
      const { error: upsertErr } = await supabase
        .from('planner_rows')
        .upsert(upsertRows, { onConflict: 'id' });
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
    //
    // Archive integrity gate (2026-10-03): a session holding a week whose
    // snapshot failed to decrypt carries fallback week ids. Its upserts
    // would land as DUPLICATE weeks (fallback id matches nothing in
    // existingBySnapId) and its memorySnapIds would mark every REAL week
    // stale for deletion — the exact production churn. Skip the layer
    // entirely; the archive is read-only until a read decrypts cleanly.
    if (archiveDecryptFailed) {
      console.warn('[planner-save] archived_weeks writes skipped: a week snapshot failed to decrypt this session');
    } else {
      const existingRes = await supabase
        .from('archived_weeks')
        .select('id, week_number, week_range_label, snapshot, snapshot_enc')
        .eq('user_id', userId)
        .eq('year_id', yearId);
      if (existingRes.error) throw existingRes.error;
      // Phase 3: snapshot ciphertext lives in snapshot_enc (jsonb column is
      // a {} placeholder); the snapId matching below needs the decrypted
      // object. No-op on plaintext rows.
      const existingArchived = await Promise.all((existingRes.data || []).map(async (r) => ({
        ...r,
        snapshot: await decryptJsonPreferEnc(r.snapshot_enc, r.snapshot),
      })));
      const existingBySnapId = new Map(
        existingArchived
          .filter((r) => r.snapshot && typeof r.snapshot.id === 'string')
          .map((r) => [r.snapshot.id, r]),
      );

      const memorySnapIds = new Set();
      for (const { row, weekNumber } of archiveRowsToWrite) {
        const dbRow = archiveRowPayloadToDb({ row, userId, yearId, weekNumber });
        const plainSnapshot = dbRow.snapshot; // pre-encryption, for the no-op check
        // Phase 3: snapshot ciphertext goes in snapshot_enc; the NOT NULL
        // jsonb column gets a {} placeholder. With the flag off, write
        // plaintext and clear snapshot_enc so there is one source of truth.
        if (encryptWritesEnabled('archived_weeks')) {
          dbRow.snapshot_enc = await encryptJson(dbRow.snapshot);
          dbRow.snapshot = {};
        } else {
          dbRow.snapshot_enc = null;
        }
        const snapId = typeof row.id === 'string' ? row.id : null;
        if (snapId) memorySnapIds.add(snapId);
        const existing = snapId ? existingBySnapId.get(snapId) : null;
        if (existing) {
          // Skip the write when nothing changed. The old unconditional
          // update re-encrypted and rewrote every week on EVERY save,
          // churning updated_at/archived_at across devices for no reason.
          const unchanged =
            existing.week_number === dbRow.week_number
            && (existing.week_range_label ?? null) === (dbRow.week_range_label ?? null)
            && stableStringify(existing.snapshot ?? null) === stableStringify(plainSnapshot ?? null);
          if (unchanged) continue;
          // An update is an edit to an EXISTING archive — keep the original
          // archive timestamp rather than restamping it.
          delete dbRow.archived_at;
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
      //
      // Extra guard (2026-09-21 incident): a save whose in-memory state holds
      // ZERO archive weeks while the server holds some is never a legitimate
      // archive revert — reverts remove one week at a time. It is a stale or
      // partial snapshot, and letting it through mass-deleted every
      // archived_weeks row for the year. Refuse wholesale deletion outright.
      const staleServerWeeks = existingArchived.filter(
        (r) => !(r.snapshot && memorySnapIds.has(r.snapshot.id)),
      );
      if (staleServerWeeks.length > 0 && memorySnapIds.size === 0) {
        console.warn('[planner-save] archive deletes refused: in-memory state has no archive weeks but the server does (stale snapshot?)');
      } else if (_serverReadYears.has(yearNumber)) {
        for (const r of staleServerWeeks) {
          const del = await supabase.from('archived_weeks').delete().eq('id', r.id);
          if (del.error) throw del.error;
        }
      } else if (staleServerWeeks.length > 0) {
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

    // Populate cache from Supabase (Phase 2: decrypt-on-read).
    const noteRows = await decryptRows(data || [], ['note']);
    chipNotesCache.clear();
    for (const row of noteRows) {
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
      // Phase 3: encrypt at the write boundary (cache keeps plaintext).
      let migrateRows = toMigrate;
      if (encryptWritesEnabled('chip_task_notes')) {
        migrateRows = await Promise.all(
          toMigrate.map(async (row) => ({ ...row, note: await encryptField(row.note) }))
        );
      }
      const { error: migrateError } = await supabase
        .from('chip_task_notes')
        .upsert(migrateRows, { onConflict: 'user_id,chip_id' });
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
      // Phase 3: encrypt at the write boundary (cache keeps plaintext).
      const storedNote = encryptWritesEnabled('chip_task_notes')
        ? await encryptField(noteText)
        : noteText;
      const { error } = await supabase
        .from('chip_task_notes')
        .upsert(
          { user_id: userId, chip_id: chipId, note: storedNote, updated_at: new Date().toISOString() },
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
    // Phase 3 (planner_rows flip): encrypt at the write boundary. The task
    // panel keeps plaintext in memory; readTaskRows decrypts on read.
    const storedNote = (noteText != null && encryptWritesEnabled('planner_rows'))
      ? await encryptField(noteText)
      : (noteText ?? null);
    const { error } = await supabase
      .from('planner_rows')
      .update({ notes: storedNote })
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

    // Phase 3: encrypt content fields at the write boundary.
    const enc = encryptWritesEnabled('task_events');
    const { error } = await supabase
      .from('task_events')
      .insert({
        task_id: taskId,
        user_id: userId,
        field,
        old_value: enc ? await encryptField(oldValue ?? null) : (oldValue ?? null),
        new_value: enc ? await encryptField(newValue) : newValue,
        note: enc ? await encryptField(note ?? null) : (note ?? null),
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
    // Phase 2: decrypt-on-read for the three encrypted task_events columns.
    return decryptRows(data ?? [], ['old_value', 'new_value', 'note']);
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
