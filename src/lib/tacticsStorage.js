/**
 * Tactics Storage (Plan page chips, year settings, column widths, send-to-system marker)
 *
 * Storage backend: Supabase. Three tables back this module:
 *   tactics_year_settings   one row per (user_id, year_id), holds the eight
 *                           Plan-page settings AND column_widths
 *   tactics_chips           many rows per (user_id, year_id, is_sent), one
 *                           per chip on the Plan grid
 *   tactics_custom_projects many rows per (user_id, year_id, is_sent), one
 *                           per custom project a user added on the Plan grid
 *   planner_settings        one row per (user_id, year_id), shared with
 *                           helper #5; this helper only touches the
 *                           send_to_system_at column on it
 *
 * Live vs sent layering: tactics_chips and tactics_custom_projects use an
 * is_sent boolean. is_sent=false is the live, auto-saved layer. is_sent=true
 * is the frozen snapshot written when the user presses Send to System; the
 * System page reads exclusively from the is_sent=true layer.
 *
 * Public API stays the same as the localStorage version. Every function is
 * now async:
 *   loadTacticsYearSettings(year)             => Promise<settings>
 *   saveTacticsYearSettings(payload, year)    => Promise<void>
 *   loadTacticsChipsState(year)               => Promise<{ projectChips, customProjects, chipTimeOverrides }>
 *   saveTacticsChipsState(payload, year)      => Promise<void>
 *   loadSentChipsSnapshot(year)               => Promise<{ projectChips, customProjects, chipTimeOverrides }>
 *   saveSentChipsSnapshot(payload, year)      => Promise<void>
 *   loadTacticsColumnWidths(year)             => Promise<number[]|null>
 *   saveTacticsColumnWidths(widths, year)     => Promise<void>
 *   getSendToSystemTimestamp(year)            => Promise<string|null>  (ISO timestamp)
 *   setSendToSystemTimestamp(year)            => Promise<void>
 *   clearSendToSystemTimestamp(year)          => Promise<void>
 *
 * Chip duration source of truth: the schema deliberately has NO
 * intrinsic duration_minutes column on tactics_chips (dropped in
 * 20260516000003_drop_chip_duration_minutes.sql). Duration is derived at
 * read time from start_row_id + end_row_id + the year's increment_minutes,
 * with override_minutes (per chip) winning when explicitly set. Persisting
 * an intrinsic duration was the cause of the May 2026 stale-field bug class.
 */

import { supabase } from './supabase';
import { getCached, hasCached, setCached } from './storageCache';
import { debounceSiteSnapshot } from './snapshotStorage';

// --- cache namespacing -------------------------------------------------

const CACHE_NS = 'tacticsStorage';
const yearSettingsKey = (yearNumber) => `tactics_year_settings:${yearNumber}`;
const chipsLayerKey = (yearNumber, isSent) => `tactics_chips:${isSent ? 'sent' : 'live'}:${yearNumber}`;
const sendTsKey = (yearNumber) => `send_to_system_at:${yearNumber}`;

/**
 * Synchronous peek into the tactics cache for a year. Returns shapes
 * matching the async load functions:
 *   yearSettings      same shape as loadTacticsYearSettings(), or null
 *   columnWidths      same shape as loadTacticsColumnWidths(), or null
 *   liveChips         same shape as loadTacticsChipsState(), or null
 *   sentChips         same shape as loadSentChipsSnapshot(), or null
 *   sendToSystemAt    ISO string or null
 * Used in useState lazy initialisers so the Plan page renders instantly
 * on cache hit instead of flashing defaults before the async load resolves.
 */
export function peekTacticsCache(yearNumber) {
  if (yearNumber == null) {
    return {
      yearSettings: null,
      columnWidths: null,
      liveChips: null,
      sentChips: null,
      sendToSystemAt: null,
    };
  }
  const ysk = yearSettingsKey(yearNumber);
  const lk = chipsLayerKey(yearNumber, false);
  const sk = chipsLayerKey(yearNumber, true);
  const tk = sendTsKey(yearNumber);
  const settingsRow = hasCached(CACHE_NS, ysk) ? getCached(CACHE_NS, ysk) : null;
  return {
    yearSettings: settingsRow ? yearSettingsRowToPayload(settingsRow) : null,
    columnWidths: settingsRow && Array.isArray(settingsRow.column_widths)
      ? settingsRow.column_widths
      : null,
    liveChips: hasCached(CACHE_NS, lk) ? getCached(CACHE_NS, lk) : null,
    sentChips: hasCached(CACHE_NS, sk) ? getCached(CACHE_NS, sk) : null,
    sendToSystemAt: hasCached(CACHE_NS, tk) ? getCached(CACHE_NS, tk) : null,
  };
}

// --- exported event names (unchanged) ---------------------------------

export const TACTICS_CHIPS_STORAGE_EVENT = 'tactics-chips-state-update';
// Fired when a live-layer chip save is dropped because another client saved
// first (HIGH-2 guard). detail carries the fresh server layer; TacticsPage
// listens and replaces its in-memory chip state so the user stops editing a
// stale layer. Kept separate from TACTICS_CHIPS_STORAGE_EVENT because that
// event's existing consumers treat it as "a save just succeeded".
export const TACTICS_CHIPS_CONFLICT_EVENT = 'tactics-chips-conflict';
export const TACTICS_SETTINGS_STORAGE_EVENT = 'tactics-settings-state-update';
export const TACTICS_SEND_TO_SYSTEM_EVENT = 'tactics-send-to-system';

// Legacy constant. No longer used internally (the timestamp lives in
// planner_settings.send_to_system_at) but exported so any importer that
// references the name still resolves.
export const TACTICS_SEND_TO_SYSTEM_TS_KEY = 'tactics-send-to-system-ts';

// --- defaults ---------------------------------------------------------

const DEFAULT_YEAR_SETTINGS = {
  startHour: '',
  startMinute: '',
  incrementMinutes: 60,
  showAmPm: true,
  use24Hour: false,
  startDay: 'Sunday',
  chipDisplayModes: { __default__: { duration: false, clock: false } },
  summaryRowOrder: null,
  defaultChipOverrides: {},
};

const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// --- internal helpers -------------------------------------------------

async function requireUserId() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error('No authenticated user');
  return user.id;
}

async function findYearId(userId, yearNumber) {
  const { data, error } = await supabase
    .from('years')
    .select('id')
    .eq('user_id', userId)
    .eq('year_number', yearNumber)
    .maybeSingle();
  if (error) throw error;
  return data?.id ?? null;
}

function requireYearNumber(yearNumber) {
  if (yearNumber === null || yearNumber === undefined) {
    throw new Error('tacticsStorage: yearNumber is required for year-scoped settings');
  }
}

function dispatchEvent(eventName, payload, yearNumber) {
  if (typeof window === 'undefined') return;
  const detail = { ...(payload || {}), __eventYear: yearNumber };
  const event = typeof CustomEvent === 'function'
    ? new CustomEvent(eventName, { detail })
    : new Event(eventName);
  window.dispatchEvent(event);
}

// --- year settings + column widths (shared row) -----------------------

async function readYearSettingsRow({ userId, yearId, yearNumber }) {
  if (yearNumber != null) {
    const key = yearSettingsKey(yearNumber);
    if (hasCached(CACHE_NS, key)) return getCached(CACHE_NS, key);
  }
  const { data, error } = await supabase
    .from('tactics_year_settings')
    .select('*')
    .eq('user_id', userId)
    .eq('year_id', yearId)
    .maybeSingle();
  if (error) throw error;
  const row = data ?? null;
  if (yearNumber != null) {
    setCached(CACHE_NS, yearSettingsKey(yearNumber), row);
  }
  return row;
}

/**
 * Write a partial column set to tactics_year_settings without clobbering
 * the columns this caller doesn't own. saveTacticsYearSettings sends the
 * eight settings columns; saveTacticsColumnWidths sends column_widths only;
 * each leaves the other untouched.
 */
async function writeYearSettingsRow({ userId, yearId, yearNumber, columns }) {
  const existing = await readYearSettingsRow({ userId, yearId, yearNumber });
  let updatedRow;
  if (existing) {
    const { data, error } = await supabase
      .from('tactics_year_settings')
      .update(columns)
      .eq('id', existing.id)
      .select()
      .single();
    if (error) throw error;
    updatedRow = data;
  } else {
    const { data, error } = await supabase
      .from('tactics_year_settings')
      .insert({ user_id: userId, year_id: yearId, ...columns })
      .select()
      .single();
    if (error) throw error;
    updatedRow = data;
  }
  if (yearNumber != null) {
    setCached(CACHE_NS, yearSettingsKey(yearNumber), updatedRow);
  }
}

function yearSettingsRowToPayload(row) {
  if (!row) return { ...DEFAULT_YEAR_SETTINGS };
  return {
    startHour: typeof row.start_hour === 'string' ? row.start_hour : '',
    startMinute: typeof row.start_minute === 'string' ? row.start_minute : '',
    incrementMinutes:
      typeof row.increment_minutes === 'number' && Number.isFinite(row.increment_minutes)
        ? row.increment_minutes
        : 60,
    showAmPm: row.show_am_pm !== false,
    use24Hour: row.use_24_hour === true,
    startDay: DAYS_OF_WEEK.includes(row.start_day) ? row.start_day : DAYS_OF_WEEK[0],
    chipDisplayModes:
      row.chip_display_modes &&
      typeof row.chip_display_modes === 'object' &&
      !Array.isArray(row.chip_display_modes)
        ? row.chip_display_modes
        : { __default__: { duration: false, clock: false } },
    summaryRowOrder: Array.isArray(row.summary_row_order) ? row.summary_row_order : null,
    defaultChipOverrides:
      row.default_chip_overrides &&
      typeof row.default_chip_overrides === 'object' &&
      !Array.isArray(row.default_chip_overrides)
        ? row.default_chip_overrides
        : {},
  };
}

function payloadToYearSettingsColumns(payload) {
  return {
    start_hour: typeof payload?.startHour === 'string' ? payload.startHour : '',
    start_minute: typeof payload?.startMinute === 'string' ? payload.startMinute : '',
    increment_minutes:
      typeof payload?.incrementMinutes === 'number' && Number.isFinite(payload.incrementMinutes)
        ? payload.incrementMinutes
        : 60,
    show_am_pm: payload?.showAmPm !== false,
    use_24_hour: payload?.use24Hour === true,
    start_day: DAYS_OF_WEEK.includes(payload?.startDay) ? payload.startDay : DAYS_OF_WEEK[0],
    chip_display_modes:
      payload?.chipDisplayModes &&
      typeof payload.chipDisplayModes === 'object' &&
      !Array.isArray(payload.chipDisplayModes)
        ? payload.chipDisplayModes
        : { __default__: { duration: false, clock: false } },
    summary_row_order: Array.isArray(payload?.summaryRowOrder) ? payload.summaryRowOrder : null,
    default_chip_overrides:
      payload?.defaultChipOverrides &&
      typeof payload.defaultChipOverrides === 'object' &&
      !Array.isArray(payload.defaultChipOverrides)
        ? payload.defaultChipOverrides
        : {},
  };
}

/**
 * Read the tactics page settings for a given year.
 * Throws if yearNumber is null or undefined.
 * @param {number} yearNumber
 * @returns {Promise<object>}
 */
export async function loadTacticsYearSettings(yearNumber) {
  requireYearNumber(yearNumber);
  try {
    const userId = await requireUserId();
    const yearId = await findYearId(userId, yearNumber);
    if (!yearId) return { ...DEFAULT_YEAR_SETTINGS };
    const row = await readYearSettingsRow({ userId, yearId, yearNumber });
    return yearSettingsRowToPayload(row);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('tacticsStorage:')) throw error;
    console.error('Failed to read tactics year settings', error);
    return { ...DEFAULT_YEAR_SETTINGS };
  }
}

/**
 * Save the tactics page settings for a given year and broadcast the change.
 * Throws if yearNumber is null or undefined.
 * @param {object} payload
 * @param {number} yearNumber
 */
export async function saveTacticsYearSettings(payload, yearNumber) {
  requireYearNumber(yearNumber);
  try {
    const userId = await requireUserId();
    const yearId = await findYearId(userId, yearNumber);
    if (!yearId) {
      console.error(`Cannot save tactics year settings: year ${yearNumber} does not exist`);
      return;
    }
    const columns = payloadToYearSettingsColumns(payload);
    await writeYearSettingsRow({ userId, yearId, yearNumber, columns });
    dispatchEvent(TACTICS_SETTINGS_STORAGE_EVENT, payload, yearNumber);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('tacticsStorage:')) throw error;
    console.error('Failed to save tactics year settings', error);
  }
}

/**
 * Read the Plan-grid column widths for a year.
 * @param {number} yearNumber
 * @returns {Promise<number[]|null>}
 */
export async function loadTacticsColumnWidths(yearNumber) {
  try {
    const userId = await requireUserId();
    const yearId = await findYearId(userId, yearNumber);
    if (!yearId) return null;
    const row = await readYearSettingsRow({ userId, yearId, yearNumber });
    const widths = row?.column_widths;
    return Array.isArray(widths) ? widths : null;
  } catch (error) {
    console.error('Failed to read tactics column widths', error);
    return null;
  }
}

/**
 * Save the Plan-grid column widths for a year. Leaves the rest of the
 * tactics_year_settings row untouched.
 * @param {number[]} widths
 * @param {number} yearNumber
 */
export async function saveTacticsColumnWidths(widths, yearNumber) {
  try {
    const userId = await requireUserId();
    const yearId = await findYearId(userId, yearNumber);
    if (!yearId) {
      console.error(`Cannot save tactics column widths: year ${yearNumber} does not exist`);
      return;
    }
    await writeYearSettingsRow({
      userId,
      yearId,
      yearNumber,
      columns: { column_widths: Array.isArray(widths) ? widths : [] },
    });
  } catch (error) {
    console.error('Failed to save tactics column widths', error);
  }
}

// --- chips state + custom projects (live + sent layers) ---------------

function chipRowToPayload(row) {
  return {
    id: row.chip_id,
    columnIndex: row.column_index,
    dayName: row.day_name ?? null,
    startRowId: row.start_row_id,
    endRowId: row.end_row_id,
    startMinutes: row.start_minutes ?? undefined,
    projectId: row.project_id_external,
    displayLabel: row.display_label ?? null,
    userModified: row.user_modified === true,
    // Note: no durationMinutes here. Callers derive at read time from
    // startRowId/endRowId/incrementMinutes, with chipTimeOverrides winning.
  };
}

function chipPayloadToRow(chip, { userId, yearId, isSent, chipTimeOverrides }) {
  const overrideMinutes = chipTimeOverrides && typeof chipTimeOverrides === 'object'
    ? chipTimeOverrides[chip.id]
    : null;
  return {
    user_id: userId,
    year_id: yearId,
    is_sent: isSent,
    chip_id: chip.id,
    column_index: chip.columnIndex,
    day_name: chip.dayName ?? null,
    start_row_id: chip.startRowId,
    end_row_id: chip.endRowId,
    start_minutes: typeof chip.startMinutes === 'number' ? chip.startMinutes : null,
    project_id_external: chip.projectId,
    display_label: chip.displayLabel ?? null,
    override_minutes:
      typeof overrideMinutes === 'number' && Number.isFinite(overrideMinutes)
        ? overrideMinutes
        : null,
    user_modified: chip.userModified === true,
  };
}

function customProjectRowToPayload(row) {
  return {
    id: row.external_id,
    label: row.label,
    color: row.color,
  };
}

function customProjectPayloadToRow(custom, { userId, yearId, isSent }) {
  return {
    user_id: userId,
    year_id: yearId,
    is_sent: isSent,
    external_id: custom.id,
    label: custom.label,
    color: custom.color,
  };
}

// --- live-layer optimistic concurrency (HIGH-2 guard) ------------------
//
// The live chip save is replace-the-layer (delete + reinsert of the whole
// (user, year, is_sent=false) slice), so a save from a stale client used to
// silently erase everything another device had added since this client's
// last read. Guard: tactics_year_settings.chips_live_version (migration
// 20260724000001) is bumped with a compare-and-set before every live-layer
// rewrite. On CAS failure the save is dropped and the layer refetched
// instead; saveTacticsChipsState broadcasts the fresh state so the UI
// converges on server truth. The very last local edit on the losing client
// is discarded — an accepted trade-off vs silently wiping the other
// device's chips.
//
// The sent layer stays unguarded on purpose: it is only written by an
// explicit Send to System press, where last-press-wins is the right
// semantic.

// yearNumber -> last chips_live_version this client observed on the server.
// Absent entry means this session has not yet read the live layer from the
// DB (e.g. state hydrated from the localStorage cache mirror) — the first
// save then does a fresh read + content compare before claiming a version.
const _chipLiveVersions = new Map();

// JSON.stringify with recursively sorted keys, skipping undefined-valued
// entries (a fresh DB read carries e.g. `startMinutes: undefined` while the
// same layer rehydrated from localStorage lacks the key entirely — the two
// must compare equal). Mirrors stableStringify in utils/planner/storage.js.
function stableChipsStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableChipsStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).filter((k) => value[k] !== undefined).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableChipsStringify(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value === undefined ? null : value);
}

// Normalise a chips-layer object for comparison: the save path caches empty
// collections as null while a fresh DB read of an empty layer returns []
// (and vice versa for overrides) — the two spellings must compare equal.
function normalizeChipsLayerForCompare(layer) {
  if (!layer || typeof layer !== 'object') return null;
  return {
    projectChips: Array.isArray(layer.projectChips) ? layer.projectChips : [],
    customProjects: Array.isArray(layer.customProjects) ? layer.customProjects : [],
    chipTimeOverrides:
      layer.chipTimeOverrides && typeof layer.chipTimeOverrides === 'object'
        ? layer.chipTimeOverrides
        : {},
  };
}

/**
 * Compare-and-set bump of chips_live_version. Returns the new version on
 * success, or null on conflict (another client bumped it first).
 */
async function casBumpChipsLiveVersion({ userId, yearId, expected }) {
  const { data, error } = await supabase
    .from('tactics_year_settings')
    .update({ chips_live_version: expected + 1 })
    .eq('user_id', userId)
    .eq('year_id', yearId)
    .eq('chips_live_version', expected)
    .select('chips_live_version');
  if (error) throw error;
  if (Array.isArray(data) && data.length > 0) return expected + 1;
  // No row matched: either a version mismatch, or the settings row does not
  // exist yet (first ever chip save for this year).
  if (expected === 0) {
    const { error: insErr } = await supabase
      .from('tactics_year_settings')
      .insert({ user_id: userId, year_id: yearId, chips_live_version: 1 });
    if (!insErr) return 1;
    // 23505 = the row appeared concurrently → treat as a version conflict.
    if (insErr.code !== '23505') throw insErr;
  }
  return null;
}

/**
 * Uncached fetch of a chips layer straight from the DB, plus (live layer
 * only) the current chips_live_version. readChipsLayer wraps this with the
 * cache; the save-path guard uses it directly.
 */
async function fetchChipsLayerFromDb({ userId, yearId, isSent }) {
  const [chipsRes, customRes, versionRes] = await Promise.all([
    supabase
      .from('tactics_chips')
      .select('*')
      .eq('user_id', userId)
      .eq('year_id', yearId)
      .eq('is_sent', isSent),
    supabase
      .from('tactics_custom_projects')
      .select('*')
      .eq('user_id', userId)
      .eq('year_id', yearId)
      .eq('is_sent', isSent),
    isSent
      ? Promise.resolve(null)
      : supabase
          .from('tactics_year_settings')
          .select('chips_live_version')
          .eq('user_id', userId)
          .eq('year_id', yearId)
          .maybeSingle(),
  ]);
  if (chipsRes.error) throw chipsRes.error;
  if (customRes.error) throw customRes.error;
  if (versionRes?.error) throw versionRes.error;

  const chipRows = chipsRes.data || [];
  const customRows = customRes.data || [];

  let result;
  if (chipRows.length === 0 && customRows.length === 0) {
    // Confirmed empty: the DB has 0 chip rows for this (user, year, is_sent)
    // slice. Empty arrays (not null) let callers distinguish "confirmed no
    // data" from "read failed". loadTacticsChipsState returns null on any
    // error so the load effect never treats a failed read as a first-time
    // user and calls buildInitialSleepBlocks — which would then autosave,
    // deleting the real chips from the DB.
    result = { projectChips: [], customProjects: [], chipTimeOverrides: null };
  } else {
    const projectChips = chipRows.length > 0 ? chipRows.map(chipRowToPayload) : null;
    const customProjects =
      customRows.length > 0 ? customRows.map(customProjectRowToPayload) : null;

    // Reconstruct chipTimeOverrides from per-chip override_minutes. Only
    // include chips with a non-null override so callers' `if (overrides?.[id])`
    // guards behave the same as they did pre-port.
    const chipTimeOverrides = {};
    for (const row of chipRows) {
      if (row.override_minutes != null) {
        chipTimeOverrides[row.chip_id] = row.override_minutes;
      }
    }
    const overrides = Object.keys(chipTimeOverrides).length > 0 ? chipTimeOverrides : null;
    result = { projectChips, customProjects, chipTimeOverrides: overrides };
  }

  // chips_live_version reads 0 when the settings row doesn't exist yet.
  const version = versionRes?.data?.chips_live_version ?? 0;
  return { result, version };
}

async function readChipsLayer({ userId, yearId, yearNumber, isSent }) {
  if (yearNumber != null) {
    const key = chipsLayerKey(yearNumber, isSent);
    if (hasCached(CACHE_NS, key)) return getCached(CACHE_NS, key);
  }
  const { result, version } = await fetchChipsLayerFromDb({ userId, yearId, isSent });
  if (yearNumber != null) {
    setCached(CACHE_NS, chipsLayerKey(yearNumber, isSent), result);
    if (!isSent) _chipLiveVersions.set(yearNumber, version);
  }
  return result;
}

// Serialises writeChipsLayer calls per (userId, yearNumber, isSent) slice.
// Without this, a rapid sequence of saves can race their delete + insert
// operations against each other and Supabase rejects the second insert
// with a 409 unique-constraint violation on (user_id, year_id, chip_id,
// is_sent). Queuing the saves means each completes before the next begins.
const chipSaveQueues = new Map();

async function withChipSaveLock(key, fn) {
  const prior = chipSaveQueues.get(key);
  const run = (async () => {
    if (prior) {
      try { await prior; } catch { /* swallow prior errors so they don't block follow-on saves */ }
    }
    return fn();
  })();
  chipSaveQueues.set(key, run);
  try {
    return await run;
  } finally {
    if (chipSaveQueues.get(key) === run) chipSaveQueues.delete(key);
  }
}

async function writeChipsLayer({ userId, yearId, yearNumber, isSent, payload }) {
  const lockKey = `${userId}:${yearNumber ?? 'global'}:${isSent}`;
  return withChipSaveLock(lockKey, () => writeChipsLayerInner({ userId, yearId, yearNumber, isSent, payload }));
}

async function writeChipsLayerInner({ userId, yearId, yearNumber, isSent, payload }) {
  const projectChips = Array.isArray(payload?.projectChips) ? payload.projectChips : [];
  const customProjects = Array.isArray(payload?.customProjects) ? payload.customProjects : [];
  const chipTimeOverrides =
    payload?.chipTimeOverrides && typeof payload.chipTimeOverrides === 'object'
      ? payload.chipTimeOverrides
      : null;

  // --- HIGH-2 guard (live layer only): claim the next chips_live_version
  // before rewriting the layer. A stale client fails the CAS and its save is
  // dropped; the caller refetches and rebroadcasts server state instead.
  if (!isSent && yearNumber != null) {
    let expected = _chipLiveVersions.get(yearNumber);

    if (expected == null) {
      // No version observed this session (state hydrated from the
      // localStorage mirror, or the module reloaded). Fetch the layer fresh
      // and compare it to the last state this client knew: a difference
      // means another client wrote since — conflict, don't overwrite.
      const knownBefore = getCached(CACHE_NS, chipsLayerKey(yearNumber, false));
      const fresh = await fetchChipsLayerFromDb({ userId, yearId, isSent: false });
      if (
        knownBefore !== undefined &&
        stableChipsStringify(normalizeChipsLayerForCompare(knownBefore)) !==
          stableChipsStringify(normalizeChipsLayerForCompare(fresh.result))
      ) {
        return { conflict: true, fresh: fresh.result, freshVersion: fresh.version };
      }
      expected = fresh.version;
    }

    const newVersion = await casBumpChipsLiveVersion({ userId, yearId, expected });
    if (newVersion == null) {
      const fresh = await fetchChipsLayerFromDb({ userId, yearId, isSent: false });
      return { conflict: true, fresh: fresh.result, freshVersion: fresh.version };
    }
    _chipLiveVersions.set(yearNumber, newVersion);
  }

  // Replace-the-layer pattern: delete every chip and custom project at this
  // (user, year, is_sent) slice, then insert the new set. Done as two
  // parallel deletes followed by two parallel inserts to keep round-trips
  // to two. Not transactional; pre-launch this is fine.
  const deleteRes = await Promise.all([
    supabase
      .from('tactics_chips')
      .delete()
      .eq('user_id', userId)
      .eq('year_id', yearId)
      .eq('is_sent', isSent),
    supabase
      .from('tactics_custom_projects')
      .delete()
      .eq('user_id', userId)
      .eq('year_id', yearId)
      .eq('is_sent', isSent),
  ]);
  for (const r of deleteRes) {
    if (r.error) throw r.error;
  }

  const chipRows = projectChips
    .filter((c) => c && typeof c.id === 'string')
    .map((c) => chipPayloadToRow(c, { userId, yearId, isSent, chipTimeOverrides }));
  const customRows = customProjects
    .filter((c) => c && typeof c.id === 'string')
    .map((c) => customProjectPayloadToRow(c, { userId, yearId, isSent }));

  const insertOps = [];
  if (chipRows.length > 0) {
    // Use upsert instead of insert so that if two saves race (e.g. after a
    // Vite HMR module reload resets the chipSaveQueues lock), the second
    // write updates rather than 409-conflicting on the unique constraint
    // (user_id, year_id, chip_id, is_sent).
    insertOps.push(
      supabase
        .from('tactics_chips')
        .upsert(chipRows, { onConflict: 'user_id,year_id,chip_id,is_sent' })
    );
  }
  if (customRows.length > 0) {
    insertOps.push(supabase.from('tactics_custom_projects').insert(customRows));
  }
  if (insertOps.length > 0) {
    const insertRes = await Promise.all(insertOps);
    for (const r of insertRes) {
      if (r.error) throw r.error;
    }
  }

  // Cache the freshly-saved layer so the next read returns it instantly.
  if (yearNumber != null) {
    const cached = {
      projectChips: projectChips.length > 0 ? projectChips : null,
      customProjects: customProjects.length > 0 ? customProjects : null,
      chipTimeOverrides: chipTimeOverrides && Object.keys(chipTimeOverrides).length > 0
        ? chipTimeOverrides
        : null,
    };
    setCached(CACHE_NS, chipsLayerKey(yearNumber, isSent), cached);
  }
}

/**
 * Read the live chip state for a year.
 *
 * Return value contract:
 *   null                          — read failed (auth error, network error, etc).
 *                                   Callers MUST NOT save default state when this
 *                                   is returned; the real chips may still be in DB.
 *   { projectChips: [], ... }     — confirmed no chips in DB (first-time user).
 *                                   Callers may call buildInitialSleepBlocks.
 *   { projectChips: [...], ... }  — real chips loaded successfully.
 *
 * @param {number} yearNumber
 * @returns {Promise<{projectChips: Array, customProjects: Array, chipTimeOverrides: object|null}|null>}
 */
export async function loadTacticsChipsState(yearNumber) {
  try {
    const userId = await requireUserId();
    const yearId = await findYearId(userId, yearNumber);
    if (!yearId) {
      // Year doesn't exist yet (e.g. mid-setup). Treat as confirmed empty so
      // the caller can initialise sleep blocks — but only if auth succeeded.
      return { projectChips: [], customProjects: [], chipTimeOverrides: null };
    }
    return await readChipsLayer({ userId, yearId, yearNumber, isSent: false });
  } catch (error) {
    // Return null (not the shape object) so callers know this was a failure,
    // not a confirmed-empty DB. This prevents the load effect from calling
    // buildInitialSleepBlocks and opening the autosave gate, which would
    // wipe the real chips 600ms later once auth has settled.
    console.error('Failed to read tactics chip state', error);
    return null;
  }
}

/**
 * Save the live chip state for a year and broadcast the change. Callers
 * should debounce this (the Plan page autosaves on every chip edit).
 * @param {object} payload
 * @param {number} yearNumber
 */
export async function saveTacticsChipsState(payload, yearNumber) {
  try {
    const userId = await requireUserId();
    const yearId = await findYearId(userId, yearNumber);
    if (!yearId) {
      console.error(`Cannot save tactics chip state: year ${yearNumber} does not exist`);
      return;
    }
    const res = await writeChipsLayer({ userId, yearId, yearNumber, isSent: false, payload });
    if (res?.conflict) {
      // Another client saved this layer since we last read it. Drop this
      // stale save, adopt the server's state, and broadcast it so the Plan
      // page re-renders with the merged reality instead of silently wiping
      // the other client's chips.
      console.warn(
        `[tactics-chips] save conflict for year ${yearNumber}: another client saved first; refreshing from server`,
      );
      setCached(CACHE_NS, chipsLayerKey(yearNumber, false), res.fresh);
      _chipLiveVersions.set(yearNumber, res.freshVersion);
      // Dedicated conflict event: TacticsPage listens for this and replaces
      // its chip state with the server layer (the storage-update event below
      // only reaches read-side consumers like useTacticsChips). Note the
      // version bookkeeping above is only safe BECAUSE the page applies this
      // state — if it didn't, the tab's next edit would save its stale layer
      // under the now-valid version.
      dispatchEvent(TACTICS_CHIPS_CONFLICT_EVENT, res.fresh, yearNumber);
      dispatchEvent(TACTICS_CHIPS_STORAGE_EVENT, res.fresh, yearNumber);
      return;
    }
    // Schedule a snapshot after 30s of inactivity so the captured state
    // includes this edit but rapid/mid-thought edits don't produce partials.
    debounceSiteSnapshot(yearNumber);
    dispatchEvent(TACTICS_CHIPS_STORAGE_EVENT, payload, yearNumber);
  } catch (error) {
    console.error('Failed to save tactics chip state', error);
  }
}

/**
 * Read the "sent to System" chip snapshot for a year. System page reads
 * exclusively from this layer.
 * @param {number} yearNumber
 * @returns {Promise<{projectChips: Array|null, customProjects: Array|null, chipTimeOverrides: object|null}>}
 */
export async function loadSentChipsSnapshot(yearNumber) {
  try {
    const userId = await requireUserId();
    const yearId = await findYearId(userId, yearNumber);
    if (!yearId) return { projectChips: null, customProjects: null, chipTimeOverrides: null };
    return await readChipsLayer({ userId, yearId, yearNumber, isSent: true });
  } catch (error) {
    console.error('Failed to read sent chips snapshot', error);
    return { projectChips: null, customProjects: null, chipTimeOverrides: null };
  }
}

/**
 * Save the "sent to System" chip snapshot for a year. Called only when the
 * user presses Send to System.
 * @param {object} payload
 * @param {number} yearNumber
 */
export async function saveSentChipsSnapshot(payload, yearNumber) {
  try {
    const userId = await requireUserId();
    const yearId = await findYearId(userId, yearNumber);
    if (!yearId) {
      console.error(`Cannot save sent chips snapshot: year ${yearNumber} does not exist`);
      return;
    }
    await writeChipsLayer({ userId, yearId, yearNumber, isSent: true, payload });
  } catch (error) {
    console.error('Failed to save sent chips snapshot', error);
  }
}

// --- send-to-system timestamp (lives on planner_settings) -------------

async function readPlannerSettingsRow({ userId, yearId }) {
  const { data, error } = await supabase
    .from('planner_settings')
    .select('id, send_to_system_at')
    .eq('user_id', userId)
    .eq('year_id', yearId)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

async function writePlannerSettingsTimestamp({ userId, yearId, value }) {
  // Pure upsert — mirrors writePlannerSettingsColumns in storage.js.
  // The old read-then-INSERT pattern raced with concurrent writes from the
  // System page GearPanel, producing 23505 unique-constraint violations.
  const { error } = await supabase
    .from('planner_settings')
    .upsert(
      { user_id: userId, year_id: yearId, send_to_system_at: value },
      { onConflict: 'user_id,year_id' },
    );
  if (error) throw error;
}

/**
 * Read the Send-to-System timestamp for a year. Returns an ISO timestamp
 * string (e.g. "2026-05-16T16:32:11.123Z") or null if no Send has happened.
 * Format note: previously this returned the legacy `Date.now().toString()`
 * epoch-ms string. Callers compare it for identity (`ts !== last`) and
 * truthiness (`!!ts`), both of which work with ISO strings.
 * @param {number} yearNumber
 * @returns {Promise<string|null>}
 */
export async function getSendToSystemTimestamp(yearNumber) {
  try {
    const userId = await requireUserId();
    const key = sendTsKey(yearNumber);
    if (hasCached(CACHE_NS, key)) return getCached(CACHE_NS, key);
    const yearId = await findYearId(userId, yearNumber);
    if (!yearId) {
      setCached(CACHE_NS, key, null);
      return null;
    }
    const row = await readPlannerSettingsRow({ userId, yearId });
    const value = row?.send_to_system_at ?? null;
    setCached(CACHE_NS, key, value);
    return value;
  } catch (error) {
    console.error('Failed to read send-to-system timestamp', error);
    return null;
  }
}

/**
 * Stamp the Send-to-System marker for a year with the current time.
 * @param {number} yearNumber
 */
export async function setSendToSystemTimestamp(yearNumber) {
  try {
    const userId = await requireUserId();
    const yearId = await findYearId(userId, yearNumber);
    if (!yearId) {
      console.error(`Cannot set send-to-system timestamp: year ${yearNumber} does not exist`);
      return;
    }
    const value = new Date().toISOString();
    await writePlannerSettingsTimestamp({ userId, yearId, value });
    setCached(CACHE_NS, sendTsKey(yearNumber), value);
  } catch (error) {
    console.error('Failed to set send-to-system timestamp', error);
  }
}

/**
 * Clear the Send-to-System marker for a year. Used when (re)creating or
 * undoing a draft year.
 * @param {number} yearNumber
 */
export async function clearSendToSystemTimestamp(yearNumber) {
  try {
    const userId = await requireUserId();
    const yearId = await findYearId(userId, yearNumber);
    if (!yearId) return; // nothing to clear
    await writePlannerSettingsTimestamp({ userId, yearId, value: null });
    setCached(CACHE_NS, sendTsKey(yearNumber), null);
  } catch (error) {
    console.error('Failed to clear send-to-system timestamp', error);
  }
}
