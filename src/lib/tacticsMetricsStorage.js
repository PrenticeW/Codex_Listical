/**
 * Tactics Metrics Storage (Plan page metrics)
 *
 * Storage backend: Supabase `tactics_metrics` table. Each row is scoped to
 * a year_id, with an `is_sent` boolean separating the live autosaved row
 * from the snapshot that was written on Send to System. Partial unique
 * indexes (one_live_metrics_per_year, one_sent_metrics_per_year) enforce
 * "at most one of each per year".
 *
 * Public API stays the same as the localStorage version:
 *   loadTacticsMetrics(year)                 => Promise<Payload|null>
 *   saveTacticsMetrics(payload, year)        => Promise<void>
 *   loadSentMetricsSnapshot(year)            => Promise<Payload|null>
 *   saveSentMetricsSnapshot(payload, year)   => Promise<void>
 *
 * Format note: callers still pass and read "H.MM" decimal-minute strings
 * (weeklyHours, dailyMaxHours, dailyMinHours, availableHours, workingHours)
 * for backward compatibility; conversion to integer minutes for storage
 * happens inside this module.
 */

import { supabase } from './supabase';
import { getCached, hasCached, setCached } from './storageCache';

export const TACTICS_METRICS_STORAGE_EVENT = 'tactics-metrics-state-update';

// --- cache namespacing -------------------------------------------------

const CACHE_NS = 'tacticsMetricsStorage';
const metricsKey = (yearNumber, isSent) => `tactics_metrics:${isSent ? 'sent' : 'live'}:${yearNumber}`;

/**
 * Synchronous peek for the Plan page. Returns the raw cached rows; consumers
 * convert via dbRowToPayload if needed (kept private so callers don't have
 * to know about the wire shape).
 */
export function peekTacticsMetricsCache(yearNumber) {
  if (yearNumber == null) return { live: null, sent: null };
  const lk = metricsKey(yearNumber, false);
  const sk = metricsKey(yearNumber, true);
  // Applying cached live state to the UI → pin this tab's expected version
  // to the one stored alongside that cached row (see _metricsLiveVersions).
  if (hasCached(CACHE_NS, lk)) adoptLiveVersionFromCachedRow(yearNumber, getCached(CACHE_NS, lk));
  return {
    live: hasCached(CACHE_NS, lk) ? dbRowToPayload(getCached(CACHE_NS, lk)) : null,
    sent: hasCached(CACHE_NS, sk) ? dbRowToPayload(getCached(CACHE_NS, sk)) : null,
  };
}

// --- internal helpers --------------------------------------------------

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

/**
 * Convert "H.MM" representation (either a string like "1.30" OR a number
 * like 1.3 — where the decimal part is the minute count divided by 100,
 * NOT a fraction of an hour) into integer minutes.
 *
 * The Plan page emits both shapes: chip duration totals come through as
 * numbers from `minutesToHourMinuteDecimal`, while older code paths can
 * still pass strings.
 */
function hmmToMinutes(hmm) {
  if (hmm == null) return 0;

  if (typeof hmm === 'number') {
    if (!Number.isFinite(hmm) || hmm <= 0) return 0;
    const h = Math.floor(hmm);
    // The decimal part is minutes/100 to two decimal places.
    // Multiply by 100 to get raw minutes, round to defeat float drift
    // (e.g. 1.3 - 1 = 0.29999999...). Clamp to 0..59.
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

/**
 * Convert integer minutes back into the same "H.MM" decimal number the
 * Plan page emits, so the round-trip through Supabase is a no-op for
 * callers that read the value back.
 */
function minutesToHmm(minutes) {
  const total = Math.max(0, Math.round(minutes || 0));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h + m / 100;
}

function payloadToDbColumns(payload) {
  const quotas = Array.isArray(payload?.projectWeeklyQuotas)
    ? payload.projectWeeklyQuotas.map((q) => ({
        project_id: q.id ?? null,
        label: q.label ?? null,
        weekly_minutes: hmmToMinutes(q.weeklyHours),
      }))
    : [];

  const bounds = Array.isArray(payload?.dailyBounds)
    ? payload.dailyBounds.map((b) => ({
        day: b.day ?? null,
        week_number: b.weekNumber ?? null,
        daily_max_minutes: hmmToMinutes(b.dailyMaxHours),
        daily_min_minutes: hmmToMinutes(b.dailyMinHours),
      }))
    : [];

  return {
    project_weekly_quotas: quotas,
    daily_bounds: bounds,
    weekly_total_available_minutes: hmmToMinutes(payload?.weeklyTotals?.availableHours),
    weekly_total_working_minutes: hmmToMinutes(payload?.weeklyTotals?.workingHours),
  };
}

function dbRowToPayload(row) {
  if (!row) return null;
  const quotas = Array.isArray(row.project_weekly_quotas)
    ? row.project_weekly_quotas.map((q) => ({
        id: q.project_id ?? null,
        label: q.label ?? null,
        weeklyHours: minutesToHmm(q.weekly_minutes),
      }))
    : [];

  const bounds = Array.isArray(row.daily_bounds)
    ? row.daily_bounds.map((b) => ({
        day: b.day ?? null,
        weekNumber: b.week_number ?? null,
        dailyMaxHours: minutesToHmm(b.daily_max_minutes),
        dailyMinHours: minutesToHmm(b.daily_min_minutes),
      }))
    : [];

  return {
    projectWeeklyQuotas: quotas,
    dailyBounds: bounds,
    weeklyTotals: {
      availableHours: minutesToHmm(row.weekly_total_available_minutes),
      workingHours: minutesToHmm(row.weekly_total_working_minutes),
    },
  };
}

// --- live-row optimistic concurrency (HIGH-2 guard) ---------------------
//
// The live metrics save rewrites the whole (user, year, is_sent=false) row,
// so a save from a stale client used to silently overwrite every metric
// another device had written. Guard: tactics_metrics.live_version (migration
// 20260724000002) is bumped with a compare-and-set on every live-row update.
// On CAS failure the save is dropped and the row refetched; saveTacticsMetrics
// broadcasts the fresh state so read-side consumers converge on server truth.
// Live metrics are DERIVED from chip state (the Plan page recomputes and
// autosaves them on every chip change), so no page-side conflict handler is
// needed: once the chips layer converges (it has its own guard), the next
// recompute re-saves correct metrics under the adopted version.
//
// The sent snapshot stays unguarded on purpose — explicit Send to System is
// last-press-wins, same as chips.
//
// yearNumber -> live_version corresponding to the live row this TAB last
// loaded/saved. The version rides on the row itself, so the cached row (which
// is mirrored to localStorage) carries it too: a tab hydrating from cache
// adopts the version that was current when that cached row was written, not
// the DB's current version — otherwise a stale tab's save would pass the CAS
// and wipe the other tab's metrics. Adoption happens at state-application
// moments only (peekTacticsMetricsCache and cache-hit reads), never at save
// time. Mirrors _chipLiveVersions in tacticsStorage.js.
const _metricsLiveVersions = new Map();

function adoptLiveVersionFromCachedRow(yearNumber, row) {
  if (yearNumber == null) return;
  const v = row?.live_version;
  if (typeof v === 'number') _metricsLiveVersions.set(yearNumber, v);
}

// Serializes live-metrics saves per year so concurrent read-then-write
// cycles can't interleave (writeMetricsRow reads the existing row before
// deciding update vs insert). Mirrors the chip save queue.
const _metricsSaveQueues = new Map();

async function withMetricsSaveLock(key, fn) {
  const prior = _metricsSaveQueues.get(key);
  const run = (async () => {
    if (prior) {
      try { await prior; } catch { /* swallow prior errors so they don't block follow-on saves */ }
    }
    return fn();
  })();
  _metricsSaveQueues.set(key, run);
  try {
    return await run;
  } finally {
    if (_metricsSaveQueues.get(key) === run) _metricsSaveQueues.delete(key);
  }
}

// JSON.stringify with recursively sorted keys — postgres jsonb reorders
// object keys, so a naive stringify of the jsonb columns would compare
// unequal on every round-trip. Mirrors stableStringify in
// utils/planner/storage.js.
function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value === undefined ? null : value);
}

const METRICS_COLUMN_KEYS = [
  'project_weekly_quotas', 'daily_bounds',
  'weekly_total_available_minutes', 'weekly_total_working_minutes',
];

function metricsColumnsEqual(columns, row) {
  if (!row) return false;
  for (const key of METRICS_COLUMN_KEYS) {
    if (stableStringify(columns[key] ?? null) !== stableStringify(row[key] ?? null)) return false;
  }
  return true;
}

async function fetchLiveMetricsRowFromDb({ userId, yearId }) {
  const { data, error } = await supabase
    .from('tactics_metrics')
    .select('*')
    .eq('user_id', userId)
    .eq('year_id', yearId)
    .eq('is_sent', false)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

async function readMetricsRow({ userId, yearId, yearNumber, isSent, bypassCache = false }) {
  if (yearNumber != null && !bypassCache) {
    const key = metricsKey(yearNumber, isSent);
    if (hasCached(CACHE_NS, key)) {
      const cached = getCached(CACHE_NS, key);
      if (!isSent) adoptLiveVersionFromCachedRow(yearNumber, cached);
      return cached;
    }
  }
  const { data, error } = await supabase
    .from('tactics_metrics')
    .select('*')
    .eq('user_id', userId)
    .eq('year_id', yearId)
    .eq('is_sent', isSent)
    .maybeSingle();
  if (error) throw error;
  const row = data ?? null;
  if (yearNumber != null) {
    setCached(CACHE_NS, metricsKey(yearNumber, isSent), row);
    if (!isSent) adoptLiveVersionFromCachedRow(yearNumber, row);
  }
  return row;
}

async function writeMetricsRow({ userId, yearId, yearNumber, isSent, columns }) {
  if (!isSent) {
    return withMetricsSaveLock(`${userId}:${yearNumber ?? 'global'}`, () =>
      writeLiveMetricsRowGuarded({ userId, yearId, yearNumber, columns }));
  }
  const existing = await readMetricsRow({ userId, yearId, yearNumber, isSent });
  let updatedRow;
  if (existing) {
    const update = { ...columns, sent_at: new Date().toISOString() };
    const { data, error } = await supabase
      .from('tactics_metrics')
      .update(update)
      .eq('id', existing.id)
      .select()
      .single();
    if (error) throw error;
    updatedRow = data;
  } else {
    const insert = {
      user_id: userId,
      year_id: yearId,
      is_sent: isSent,
      sent_at: new Date().toISOString(),
      ...columns,
    };
    const { data, error } = await supabase
      .from('tactics_metrics')
      .insert(insert)
      .select()
      .single();
    if (error) throw error;
    updatedRow = data;
  }
  if (yearNumber != null) {
    setCached(CACHE_NS, metricsKey(yearNumber, isSent), updatedRow);
  }
  return undefined;
}

/**
 * Guarded live-row write (HIGH-2). Returns undefined on success, or
 * `{ conflict: true, fresh }` when another client saved first — the caller
 * drops the stale payload and broadcasts `fresh` (a raw DB row or null)
 * instead.
 */
async function writeLiveMetricsRowGuarded({ userId, yearId, yearNumber, columns }) {
  let expected = yearNumber != null ? _metricsLiveVersions.get(yearNumber) : null;

  if (expected == null) {
    // No version observed this session (module reloaded, or nothing loaded
    // yet). Fetch the row fresh and compare it to the last state this client
    // knew: a difference means another client wrote since — conflict, don't
    // overwrite. Mirrors the chips first-save path.
    const knownBefore = yearNumber != null ? getCached(CACHE_NS, metricsKey(yearNumber, false)) : undefined;
    const fresh = await fetchLiveMetricsRowFromDb({ userId, yearId });
    // knownBefore === null means this tab observed "no live row yet"; a row
    // appearing since is another client's insert — also a conflict.
    if (
      knownBefore !== undefined && fresh &&
      (knownBefore === null ||
        !metricsColumnsEqual(
          Object.fromEntries(METRICS_COLUMN_KEYS.map((k) => [k, knownBefore[k] ?? null])),
          fresh,
        ))
    ) {
      return { conflict: true, fresh };
    }
    expected = fresh?.live_version ?? 0;
  }

  // Skip the write when nothing changed relative to the row this tab last
  // observed — a no-op rewrite would still bump the version and force every
  // other tab into a spurious conflict.
  const cachedRow = yearNumber != null ? getCached(CACHE_NS, metricsKey(yearNumber, false)) : undefined;
  if (cachedRow && cachedRow.live_version === expected && metricsColumnsEqual(columns, cachedRow)) {
    return undefined;
  }

  // Compare-and-set on the live row's version: claim the next version or
  // lose to a faster client. Keyed on the (user, year, is_sent=false) slice
  // so no row-id fetch is needed (one_live_metrics_per_year guarantees at
  // most one match).
  const { data, error } = await supabase
    .from('tactics_metrics')
    .update({ ...columns, live_version: expected + 1 })
    .eq('user_id', userId)
    .eq('year_id', yearId)
    .eq('is_sent', false)
    .eq('live_version', expected)
    .select();
  if (error) throw error;

  let updatedRow;
  if (Array.isArray(data) && data.length > 0) {
    updatedRow = data[0];
  } else if (expected === 0) {
    // No row matched and none was expected: first-ever live save for this
    // year. A concurrent insert from another client loses on the
    // one_live_metrics_per_year unique index (23505) — treat that as a
    // conflict rather than throwing.
    const { data: insData, error: insErr } = await supabase
      .from('tactics_metrics')
      .insert({ user_id: userId, year_id: yearId, is_sent: false, live_version: 1, ...columns })
      .select()
      .single();
    if (insErr) {
      if (insErr.code === '23505') {
        const fresh = await fetchLiveMetricsRowFromDb({ userId, yearId });
        return { conflict: true, fresh };
      }
      throw insErr;
    }
    updatedRow = insData;
  } else {
    // Version mismatch: another client bumped it first.
    const fresh = await fetchLiveMetricsRowFromDb({ userId, yearId });
    return { conflict: true, fresh };
  }

  if (yearNumber != null) {
    setCached(CACHE_NS, metricsKey(yearNumber, false), updatedRow);
    adoptLiveVersionFromCachedRow(yearNumber, updatedRow);
  }
  return undefined;
}

function dispatchEvent(payload, yearNumber) {
  if (typeof window === 'undefined') return;
  const detail = { ...(payload || {}), __eventYear: yearNumber };
  const event = typeof CustomEvent === 'function'
    ? new CustomEvent(TACTICS_METRICS_STORAGE_EVENT, { detail })
    : new Event(TACTICS_METRICS_STORAGE_EVENT);
  window.dispatchEvent(event);
}

// --- public API --------------------------------------------------------

/**
 * Load the live tactics metrics for a year.
 * @param {number} yearNumber
 * @returns {Promise<object|null>}
 */
export async function loadTacticsMetrics(yearNumber) {
  try {
    const userId = await requireUserId();
    const yearId = await findYearId(userId, yearNumber);
    if (!yearId) return null;
    const row = await readMetricsRow({ userId, yearId, yearNumber, isSent: false });
    return dbRowToPayload(row);
  } catch (error) {
    console.error('Failed to read tactics metrics', error);
    return null;
  }
}

/**
 * Save the live tactics metrics. Callers should debounce this — every call
 * is a network round-trip and the Plan page recomputes metrics on most
 * chip-state changes.
 * @param {object} payload
 * @param {number} yearNumber
 */
export async function saveTacticsMetrics(payload, yearNumber) {
  try {
    const userId = await requireUserId();
    const yearId = await findYearId(userId, yearNumber);
    if (!yearId) {
      console.error(`Cannot save tactics metrics: year ${yearNumber} does not exist`);
      return;
    }
    const columns = payloadToDbColumns(payload);
    const res = await writeMetricsRow({ userId, yearId, yearNumber, isSent: false, columns });
    if (res?.conflict) {
      // Another client saved the live row since we last read it. Drop this
      // stale save, adopt the server's state, and broadcast it so read-side
      // consumers converge. No page-side snap is needed: live metrics are
      // derived from chip state, and the chips layer has its own guard —
      // once chips converge, the next recompute re-saves correct metrics
      // under the version adopted here.
      console.warn(
        `[tactics-metrics] save conflict for year ${yearNumber}: another client saved first; refreshing from server`,
      );
      if (yearNumber != null) {
        setCached(CACHE_NS, metricsKey(yearNumber, false), res.fresh ?? null);
        adoptLiveVersionFromCachedRow(yearNumber, res.fresh);
      }
      dispatchEvent(dbRowToPayload(res.fresh), yearNumber);
      return;
    }
    dispatchEvent(payload, yearNumber);
  } catch (error) {
    console.error('Failed to save tactics metrics', error);
  }
}

/**
 * Save the "sent to System" snapshot. Called only when the user presses
 * Send to System; the System page reads this layer.
 * @param {object} payload
 * @param {number} yearNumber
 */
export async function saveSentMetricsSnapshot(payload, yearNumber) {
  try {
    const userId = await requireUserId();
    const yearId = await findYearId(userId, yearNumber);
    if (!yearId) {
      console.error(`Cannot save sent metrics snapshot: year ${yearNumber} does not exist`);
      return;
    }
    const columns = payloadToDbColumns(payload);
    await writeMetricsRow({ userId, yearId, yearNumber, isSent: true, columns });
  } catch (error) {
    console.error('Failed to save sent metrics snapshot', error);
  }
}

/**
 * Load the "sent to System" snapshot. System page reads from this layer.
 * @param {number} yearNumber
 * @param {object} [options]
 * @param {boolean} [options.bypassCache=false] - Skip the in-memory/localStorage
 *   cache and fetch directly from Supabase. Use this when building the historical
 *   record inside handleSendToSystem so stale cache can't corrupt week locking.
 * @returns {Promise<object|null>}
 */
export async function loadSentMetricsSnapshot(yearNumber, { bypassCache = false } = {}) {
  try {
    const userId = await requireUserId();
    const yearId = await findYearId(userId, yearNumber);
    if (!yearId) return null;
    const row = await readMetricsRow({ userId, yearId, yearNumber, isSent: true, bypassCache });
    return dbRowToPayload(row);
  } catch (error) {
    console.error('Failed to read sent metrics snapshot', error);
    return null;
  }
}
