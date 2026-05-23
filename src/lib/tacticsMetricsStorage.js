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
const metricsKey = (userId, yearNumber, isSent) =>
  `tactics_metrics:${userId}:${isSent ? 'sent' : 'live'}:${yearNumber}`;

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

async function readMetricsRow({ userId, yearId, yearNumber, isSent }) {
  if (yearNumber != null) {
    const key = metricsKey(userId, yearNumber, isSent);
    if (hasCached(CACHE_NS, key)) return getCached(CACHE_NS, key);
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
    setCached(CACHE_NS, metricsKey(userId, yearNumber, isSent), row);
  }
  return row;
}

async function writeMetricsRow({ userId, yearId, yearNumber, isSent, columns }) {
  const existing = await readMetricsRow({ userId, yearId, yearNumber, isSent });
  let updatedRow;
  if (existing) {
    const update = { ...columns };
    if (isSent) update.sent_at = new Date().toISOString();
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
      ...columns,
    };
    if (isSent) insert.sent_at = new Date().toISOString();
    const { data, error } = await supabase
      .from('tactics_metrics')
      .insert(insert)
      .select()
      .single();
    if (error) throw error;
    updatedRow = data;
  }
  if (yearNumber != null) {
    setCached(CACHE_NS, metricsKey(userId, yearNumber, isSent), updatedRow);
  }
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
    await writeMetricsRow({ userId, yearId, yearNumber, isSent: false, columns });
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
 * @returns {Promise<object|null>}
 */
export async function loadSentMetricsSnapshot(yearNumber) {
  try {
    const userId = await requireUserId();
    const yearId = await findYearId(userId, yearNumber);
    if (!yearId) return null;
    const row = await readMetricsRow({ userId, yearId, yearNumber, isSent: true });
    return dbRowToPayload(row);
  } catch (error) {
    console.error('Failed to read sent metrics snapshot', error);
    return null;
  }
}
