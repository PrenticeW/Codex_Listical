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
import { getCached, hasCached, setCached, invalidate } from './storageCache';
import { debounceSiteSnapshot } from './snapshotStorage';

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
  if (!hasCached(CACHE_NS, k)) return null;
  const cached = getCached(CACHE_NS, k);
  if (!cached) return cached;
  // The cache stores rows in serialised form ({ cells, _rowType, ... }) so
  // localStorage round-trips keep the metadata. Deserialise here — same as
  // loadStagingState's cache hit — so consumers (TacticsPage stagingProjects,
  // useProjectsData) always see tagged row arrays. Returning the raw cache
  // made every row look like an empty object to buildProjectPlanSummary,
  // which silently dropped schedule items and subprojects on cache-hit loads.
  return {
    ...cached,
    shortlist: Array.isArray(cached.shortlist)
      ? cached.shortlist.map(deserializeItemFromCache)
      : [],
    archived: Array.isArray(cached.archived)
      ? cached.archived.map(deserializeItemFromCache)
      : [],
  };
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
  // Use limit(1) instead of maybeSingle() so duplicate year rows (which can
  // exist if the unique constraint was absent from the deployed schema) don't
  // return a PGRST116 error that silently breaks every save for that year.
  const { data, error } = await supabase
    .from('years')
    .select('id')
    .eq('user_id', userId)
    .eq('year_number', yearNumber)
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) throw error;
  return (data && data.length > 0) ? data[0].id : null;
}

/**
 * Serialize a row for storage as JSONB.
 * Same wrap-and-tag shape used by the localStorage version: arrays become
 * `{ cells: [...], _rowType?, _pairId?, _sectionType?, _isTotalRow? }`.
 */
export const serializeRow = (row) => {
  if (!Array.isArray(row)) return row;
  const serialized = { cells: [...row] };
  if (row.__rowType) serialized._rowType = row.__rowType;
  if (row.__pairId) serialized._pairId = row.__pairId;
  if (row.__sectionType) serialized._sectionType = row.__sectionType;
  if (row.__isTotalRow) serialized._isTotalRow = row.__isTotalRow;
  return serialized;
};

export const deserializeRow = (row) => {
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
    showActionTimes: row.show_action_times ?? false,
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
    show_action_times: item.showActionTimes ?? false,
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

/**
 * Prepare an item for the cache by serialising its planTableEntries into the
 * same `{ cells, _rowType, … }` form used for Supabase JSONB. This makes the
 * cached value safe to JSON.stringify (storageCache mirrors to localStorage),
 * which otherwise silently strips non-enumerable metadata properties like
 * __rowType, __pairId, and __sectionType.
 */
const serializeItemForCache = (item) => ({
  ...item,
  planTableEntries: Array.isArray(item.planTableEntries)
    ? item.planTableEntries.map(serializeRow)
    : [],
});

/**
 * Restore an item read from the cache by deserialising its planTableEntries
 * back into row arrays with non-enumerable metadata. Needed on every cache
 * read because the value may have come from a JSON.parse round-trip (page
 * refresh rehydrates the in-memory cache from localStorage).
 */
const deserializeItemFromCache = (item) => ({
  ...item,
  planTableEntries: Array.isArray(item.planTableEntries)
    ? item.planTableEntries.map(deserializeRow)
    : [],
});

/**
 * Returns true only if every item's planTableEntries are in the current
 * serialised form — i.e. objects like `{ cells: [...], _rowType: '...' }`
 * rather than plain arrays. Plain arrays mean the entry was written before
 * the serialisation fix and JSON.stringify stripped the non-enumerable
 * metadata. Stale caches must be invalidated so loadStagingState falls
 * through to Supabase and gets properly tagged data.
 */
function isCachedFormatValid(cached) {
  if (!cached) return false;
  const items = [...(cached.shortlist ?? []), ...(cached.archived ?? [])];
  return items.every((item) => {
    const entries = item?.planTableEntries;
    if (!Array.isArray(entries) || entries.length === 0) return true;
    const first = entries[0];
    // New format: { cells: [...], _rowType?: '...' }
    // Old format: plain array like ['header text', '', ...]
    return first != null && typeof first === 'object' && !Array.isArray(first) && Array.isArray(first.cells);
  });
}

// --- diff-save bookkeeping (HIGH-2 guard, ported from utils/planner/storage.js) ---
//
// _knownProjectIds: `projects` row ids this client's state incorporates
// (populated by loadStagingState on both the cache-hit and DB-fetch paths,
// and maintained by saves). A desired row missing from the DB is only
// INSERTed when its id is NOT known — a known id missing from the DB means
// another client deleted it, and re-inserting it would resurrect the
// deletion from this tab's stale snapshot. Symmetrically, a DB row absent
// from this tab's desired state is only DELETEd when its id IS known — an
// unknown id means another client inserted it after this tab's last load,
// and deleting it would erase that write.
const _knownProjectIds = new Map(); // yearNumber -> Set<id>

function recordKnownIds(yearNumber, ids) {
  if (yearNumber == null) return;
  _knownProjectIds.set(yearNumber, new Set(ids));
}

// Serialize staging saves so concurrent read-diff-write cycles can't
// interleave. saveStagingState reads the server's current rows, diffs them
// against the desired state, and writes only the difference; two saves
// running concurrently would both diff against the same pre-save snapshot
// and double-apply. Mirrors _taskRowsSaveQueue in utils/planner/storage.js.
let _stagingSaveQueue = Promise.resolve();

// JSON.stringify with recursively sorted keys — postgres jsonb reorders
// object keys, so a naive stringify of plan_table_entries would diff every
// row. Mirrors stableStringify in utils/planner/storage.js.
function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value === undefined ? null : value);
}

// Columns the staging save owns. id/user_id/year_id are identity; anything
// else produced by itemToDbRow is compared against the DB row so unchanged
// rows are not rewritten (a rewrite of an unchanged row would clobber a
// remote field edit this tab hasn't seen).
const STAGING_DIFF_KEYS = [
  'text', 'project_name', 'project_nickname', 'color',
  'plan_table_visible', 'plan_table_collapsed', 'has_plan', 'added_to_plan',
  'show_outcome_totals', 'show_action_times', 'is_simple_table',
  'plan_reason_row_count', 'plan_outcome_row_count',
  'plan_outcome_question_row_count', 'plan_needs_question_row_count',
  'plan_needs_plan_row_count', 'plan_schedule_row_count',
  'plan_subproject_row_count', 'plan_table_entries',
  'is_archived', 'display_order',
];

function stagingRowDiffers(desired, dbRow) {
  for (const key of STAGING_DIFF_KEYS) {
    if (stableStringify(desired[key] ?? null) !== stableStringify(dbRow[key] ?? null)) return true;
  }
  return false;
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
    if (hasCached(CACHE_NS, cacheKey)) {
      const cached = getCached(CACHE_NS, cacheKey);
      if (isCachedFormatValid(cached)) {
        // Cache entries are in the serialised { cells, _rowType, … } form —
        // safe to deserialise directly without a Supabase round-trip.
        // Record the ids this state incorporates so the diff save knows
        // which rows this tab has actually seen (see _knownProjectIds).
        recordKnownIds(yearNumber, [
          ...(cached.shortlist ?? []), ...(cached.archived ?? []),
        ].map((item) => item?.id).filter(Boolean));
        return {
          shortlist: (cached.shortlist ?? []).map(deserializeItemFromCache),
          archived: (cached.archived ?? []).map(deserializeItemFromCache),
        };
      }
      // Cache contains plain-array entries (pre-serialisation format written
      // before the fix). JSON.stringify already stripped __rowType etc., so
      // we cannot recover the metadata from this data. Invalidate so the
      // fetch below goes to Supabase and returns properly tagged rows.
      // After the subsequent saveStagingState the cache will be in the new
      // format and this branch will never fire again for this year.
      invalidate(CACHE_NS, cacheKey);
    }

    const yearId = await findYearId(userId, yearNumber);
    if (!yearId) {
      const empty = { shortlist: [], archived: [] };
      setCached(CACHE_NS, cacheKey, empty);
      recordKnownIds(yearNumber, []);
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
    recordKnownIds(yearNumber, rows.map((r) => r.id));
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
 * Save the full shortlist + archived state for a year.
 *
 * Diff-based save (HIGH-2, ported from the planner_rows pattern,
 * 2026-07-24 — replaced the delete-everything-not-in-payload + upsert-all
 * sync). Saves are serialized on a queue, then the server's current rows are
 * read and only the difference is written, with _knownProjectIds guarding
 * both directions:
 *
 *   - a DB row absent from this tab's state is deleted ONLY if this tab has
 *     seen it (otherwise it was created on another device — leave it);
 *   - a payload row missing from the DB is inserted ONLY if this tab has
 *     never seen it on the server (otherwise another device deleted it —
 *     don't resurrect it);
 *   - rows whose columns match the DB are not rewritten, so a stale tab no
 *     longer clobbers remote field edits on rows it didn't touch. Rows this
 *     tab DID change remain last-write-wins at the row level — same accepted
 *     trade-off as planner_rows.
 *
 * Fires the staging-state-update event after every successful save.
 *
 * Callers should debounce calls to this function — every invocation is a
 * round-trip to Supabase and unthrottled per-keystroke saves will saturate
 * the connection. `useShortlistState` does this; new callers should too.
 *
 * @param {{ shortlist: object[], archived: object[] }} payload
 * @param {number} yearNumber
 */
export function saveStagingState(payload, yearNumber) {
  // Always run the next save regardless of whether the previous one threw,
  // so a transient network error doesn't permanently block future saves.
  _stagingSaveQueue = _stagingSaveQueue.then(
    () => _saveStagingStateImpl(payload, yearNumber),
    () => _saveStagingStateImpl(payload, yearNumber),
  );
  return _stagingSaveQueue;
}

async function _saveStagingStateImpl(payload, yearNumber) {
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

    // Read the server's current rows (full rows, not just ids — the diff
    // needs the column values) inside the serialized queue.
    const { data: existingRows, error: existingErr } = await supabase
      .from('projects')
      .select('*')
      .eq('user_id', userId)
      .eq('year_id', yearId);
    if (existingErr) throw existingErr;

    const currentById = new Map((existingRows ?? []).map((r) => [r.id, r]));
    // Fallback (save before any load this pageload — shouldn't happen, since
    // autosave requires hydration): treat the server's rows as known, which
    // reduces to last-writer-wins for deletes but still never resurrects.
    const known = _knownProjectIds.get(yearNumber) || new Set(currentById.keys());

    const toUpsert = [];
    for (const d of desiredRows) {
      const cur = currentById.get(d.id);
      if (!cur) {
        // Missing from the DB. Known id → another client deleted it since we
        // last looked; do NOT resurrect it. Unknown id → a row this tab
        // created.
        if (!known.has(d.id)) toUpsert.push(d);
      } else if (stagingRowDiffers(d, cur)) {
        toUpsert.push(d);
      }
    }
    const toDelete = [];
    for (const id of currentById.keys()) {
      // In the DB but not in this tab's state. Unknown id → another client
      // inserted it since this tab's last load; leave it — the next
      // loadStagingState will bring it into view.
      if (!desiredIds.has(id) && known.has(id)) toDelete.push(id);
    }

    if (toDelete.length > 0) {
      const { error: deleteErr } = await supabase
        .from('projects')
        .delete()
        .eq('user_id', userId)
        .in('id', toDelete);
      if (deleteErr) throw deleteErr;
    }

    if (toUpsert.length > 0) {
      const { error: upsertErr } = await supabase
        .from('projects')
        .upsert(toUpsert, { onConflict: 'id' });
      if (upsertErr) throw upsertErr;
    }

    const nextKnown = new Set(known);
    for (const d of toUpsert) { if (d.id) nextKnown.add(d.id); }
    for (const id of toDelete) nextKnown.delete(id);
    _knownProjectIds.set(yearNumber, nextKnown);

    // Schedule a snapshot after 30s of inactivity so the captured state
    // includes this edit but rapid/mid-thought edits don't produce partials.
    debounceSiteSnapshot(yearNumber);

    // Refresh the cache with the serialised form of each item so the value
    // is safe to JSON.stringify (storageCache mirrors to localStorage on every
    // setCached call). Storing live JS objects with non-enumerable metadata
    // looks fine in-memory but silently loses __rowType / __pairId / etc. the
    // moment the cache is persisted and then JSON.parse'd back on page refresh.
    setCached(CACHE_NS, stagingKey(yearNumber), {
      shortlist: shortlist.map(serializeItemForCache),
      archived: archived.map(serializeItemForCache),
    });

    dispatchStagingEvent(payload, yearNumber);
  } catch (error) {
    console.error('Failed to save staging shortlist', error);
  }
}
