/**
 * Staging Storage (Goal page shortlist)
 *
 * Storage backend: Supabase `projects` table, scoped to a year via year_id.
 * One row per project. `plan_table_entries` is stored as JSONB and preserves
 * the wrapped-row format (`{ cells, _rowType, _pairId, _sectionType,
 * _isTotalRow }`) so the non-enumerable metadata round-trips.
 *
 * The public API is preserved from the localStorage version. Functions that
 * used to be synchronous now return promises:
 *
 *   loadStagingState(yearNumber)        => Promise<{ shortlist, archived }>
 *   saveStagingState(payload, yearNumber) => Promise<void>
 *   getStagingShortlist(yearNumber)     => Promise<StagingItem[]>
 *
 * The `staging-state-update` window event still fires after every successful
 * save, with `__eventYear` on the detail per the H3 cross-year contract.
 */

import { supabase } from './supabase';
import { defineRowMetadata } from '../utils/staging/planTableHelpers';
import { getCached, hasCached, setCached } from './storageCache';

export const STAGING_STORAGE_EVENT = 'staging-state-update';

// --- cache namespacing -------------------------------------------------

const CACHE_NS = 'stagingStorage';
const stagingKey = (yearNumber) => `staging_state:${yearNumber}`;

/**
 * Synchronous peek into the staging cache. Returns the cached
 * `{ shortlist, archived }` shape or null on miss.
 */
export function peekStagingCache(yearNumber) {
  if (yearNumber == null) return null;
  const k = stagingKey(yearNumber);
  return hasCached(CACHE_NS, k) ? getCached(CACHE_NS, k) : null;
}
// Legacy export kept so existing event-key consumers do not break.
export const STAGING_STORAGE_KEY = 'staging-shortlist';

// --- internal helpers --------------------------------------------------

async function requireUserId() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    throw new Error('No authenticated user');
  }
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
 * Serialize a row for storage as JSONB.
 * Same wrap-and-tag shape used by the localStorage version: arrays become
 * `{ cells: [...], _rowType?, _pairId?, _sectionType?, _isTotalRow? }`.
 */
const serializeRow = (row) => {
  if (!Array.isArray(row)) return row;
  const serialized = { cells: [...row] };
  if (row.__rowType) serialized._rowType = row.__rowType;
  if (row.__pairId) serialized._pairId = row.__pairId;
  if (row.__sectionType) serialized._sectionType = row.__sectionType;
  if (row.__isTotalRow) serialized._isTotalRow = row.__isTotalRow;
  return serialized;
};

const deserializeRow = (row) => {
  if (row && typeof row === 'object' && Array.isArray(row.cells)) {
    const deserialized = [...row.cells];
    return defineRowMetadata(deserialized, {
      rowType: row._rowType,
      pairId: row._pairId,
      sectionType: row._sectionType,
      isTotalRow: row._isTotalRow,
    });
  }
  if (Array.isArray(row)) {
    return [...row];
  }
  return row;
};

function dbRowToItem(row) {
  const entries = Array.isArray(row.plan_table_entries)
    ? row.plan_table_entries.map(deserializeRow)
    : [];
  return {
    id: row.id,
    text: row.text ?? '',
    projectName: row.project_name ?? undefined,
    projectNickname: row.project_nickname ?? undefined,
    color: row.color ?? undefined,
    planTableVisible: row.plan_table_visible ?? false,
    planTableCollapsed: row.plan_table_collapsed ?? false,
    hasPlan: row.has_plan ?? false,
    addedToPlan: row.added_to_plan ?? false,
    showOutcomeTotals: row.show_outcome_totals ?? false,
    isSimpleTable: row.is_simple_table ?? false,
    planReasonRowCount: row.plan_reason_row_count ?? 1,
    planOutcomeRowCount: row.plan_outcome_row_count ?? 1,
    planOutcomeQuestionRowCount: row.plan_outcome_question_row_count ?? 1,
    planNeedsQuestionRowCount: row.plan_needs_question_row_count ?? 1,
    planNeedsPlanRowCount: row.plan_needs_plan_row_count ?? 1,
    planSubprojectRowCount: row.plan_schedule_row_count ?? 1,
    planXxxRowCount: row.plan_subproject_row_count ?? 1,
    planTableEntries: entries,
  };
}

function itemToDbRow({ userId, yearId, item, isArchived, displayOrder }) {
  return {
    id: item.id,
    user_id: userId,
    year_id: yearId,
    text: item.text ?? '',
    project_name: item.projectName ?? null,
    project_nickname: item.projectNickname ?? null,
    color: item.color ?? null,
    plan_table_visible: item.planTableVisible ?? false,
    plan_table_collapsed: item.planTableCollapsed ?? false,
    has_plan: item.hasPlan ?? false,
    added_to_plan: item.addedToPlan ?? false,
    show_outcome_totals: item.showOutcomeTotals ?? false,
    is_simple_table: item.isSimpleTable ?? false,
    plan_reason_row_count: item.planReasonRowCount ?? 1,
    plan_outcome_row_count: item.planOutcomeRowCount ?? 1,
    plan_outcome_question_row_count: item.planOutcomeQuestionRowCount ?? 1,
    plan_needs_question_row_count: item.planNeedsQuestionRowCount ?? 1,
    plan_needs_plan_row_count: item.planNeedsPlanRowCount ?? 1,
    plan_schedule_row_count: item.planSubprojectRowCount ?? 1,
    plan_subproject_row_count: item.planXxxRowCount ?? 1,
    plan_table_entries: Array.isArray(item.planTableEntries)
      ? item.planTableEntries.map(serializeRow)
      : [],
    is_archived: isArchived,
    display_order: displayOrder,
  };
}

function dispatchStagingEvent(payload, yearNumber) {
  if (typeof window === 'undefined') return;
  const detail = { ...(payload || {}), __eventYear: yearNumber };
  const event = typeof CustomEvent === 'function'
    ? new CustomEvent(STAGING_STORAGE_EVENT, { detail })
    : new Event(STAGING_STORAGE_EVENT);
  window.dispatchEvent(event);
}

// --- public read API ---------------------------------------------------

/**
 * Load the shortlist + archived items for a year.
 * Returns `{ shortlist: [], archived: [] }` when there's no data.
 *
 * @param {number} yearNumber
 * @returns {Promise<{ shortlist: object[], archived: object[] }>}
 */
export async function loadStagingState(yearNumber) {
  try {
    const userId = await requireUserId();
    const cacheKey = stagingKey(yearNumber);
    if (hasCached(CACHE_NS, cacheKey)) return getCached(CACHE_NS, cacheKey);

    const yearId = await findYearId(userId, yearNumber);
    if (!yearId) {
      const empty = { shortlist: [], archived: [] };
      setCached(CACHE_NS, cacheKey, empty);
      return empty;
    }

    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .eq('user_id', userId)
      .eq('year_id', yearId)
      .order('display_order', { ascending: true });
    if (error) throw error;

    const rows = data ?? [];
    const shortlist = [];
    const archived = [];
    for (const row of rows) {
      const item = dbRowToItem(row);
      if (row.is_archived) {
        archived.push(item);
      } else {
        shortlist.push(item);
      }
    }
    const result = { shortlist, archived };
    setCached(CACHE_NS, cacheKey, result);
    return result;
  } catch (error) {
    console.error('Failed to read staging shortlist', error);
    return { shortlist: [], archived: [] };
  }
}

/**
 * Shorthand for the shortlist only.
 * @param {number} yearNumber
 * @returns {Promise<object[]>}
 */
export async function getStagingShortlist(yearNumber) {
  const state = await loadStagingState(yearNumber);
  return state.shortlist;
}

// --- public write API --------------------------------------------------

/**
 * Save the full shortlist + archived state for a year. Performs a three-step
 * sync against the existing rows for the year:
 *
 *   1. Delete rows in the DB whose id is no longer in the payload.
 *   2. Upsert every row in the payload (shortlist + archived), tagging
 *      is_archived and display_order from the array position.
 *   3. Fire the staging-state-update event so listeners refresh.
 *
 * Callers should debounce calls to this function — every invocation is a
 * round-trip to Supabase and unthrottled per-keystroke saves will saturate
 * the connection. `useShortlistState` does this; new callers should too.
 *
 * @param {{ shortlist: object[], archived: object[] }} payload
 * @param {number} yearNumber
 */
export async function saveStagingState(payload, yearNumber) {
  try {
    if (!payload || typeof payload !== 'object') return;

    const userId = await requireUserId();
    const yearId = await findYearId(userId, yearNumber);
    if (!yearId) {
      console.error(`Cannot save staging state: year ${yearNumber} does not exist`);
      return;
    }

    const shortlist = Array.isArray(payload.shortlist) ? payload.shortlist : [];
    const archived = Array.isArray(payload.archived) ? payload.archived : [];

    const desiredRows = [
      ...shortlist.map((item, idx) => itemToDbRow({
        userId, yearId, item, isArchived: false, displayOrder: idx,
      })),
      ...archived.map((item, idx) => itemToDbRow({
        userId, yearId, item, isArchived: true, displayOrder: idx,
      })),
    ];
    const desiredIds = new Set(desiredRows.map((r) => r.id).filter(Boolean));

    // Find ids already in the DB so we can compute deletions.
    const { data: existingRows, error: existingErr } = await supabase
      .from('projects')
      .select('id')
      .eq('user_id', userId)
      .eq('year_id', yearId);
    if (existingErr) throw existingErr;

    const idsToDelete = (existingRows ?? [])
      .map((r) => r.id)
      .filter((id) => !desiredIds.has(id));

    if (idsToDelete.length > 0) {
      const { error: deleteErr } = await supabase
        .from('projects')
        .delete()
        .in('id', idsToDelete);
      if (deleteErr) throw deleteErr;
    }

    if (desiredRows.length > 0) {
      const { error: upsertErr } = await supabase
        .from('projects')
        .upsert(desiredRows, { onConflict: 'id' });
      if (upsertErr) throw upsertErr;
    }

    // Refresh the cache with the just-saved shape so the next read returns
    // it instantly without a round-trip.
    setCached(CACHE_NS, stagingKey(yearNumber), {
      shortlist,
      archived,
    });

    dispatchStagingEvent(payload, yearNumber);
  } catch (error) {
    console.error('Failed to save staging shortlist', error);
  }
}
