/**
 * Group Selection By — one-shot reorder of a contiguous selection of task
 * rows by Project, Subproject or Status.
 *
 * Spec: design_handoff_group_by bundle + implementation brief. Deliberately
 * NOT a persistent view mode: no state is stored, no group header rows are
 * inserted, rows are never auto-filed. The result is a plain reorder of the
 * selected span, applied through setData + the command pattern — the exact
 * same path as a manual drag-reorder — so the save layer assigns fresh
 * order keys only to rows that actually moved and mobile syncs it as an
 * ordinary reorder. Do not add a second write path or any field recording
 * that a grouping happened.
 */

import { isDraggableRow } from './rowTypeChecks';
import { normalizeProjectKey } from './valueNormalizers';

export const GROUP_FIELD_LABELS = {
  project: 'Project',
  subproject: 'Subproject',
  status: 'Status',
};

/** '-' is the app-wide blank sentinel (BLANK_STATUS, project '-'). */
const isMissingValue = (value) => {
  if (value == null) return true;
  const v = String(value).trim();
  return v === '' || v === '-';
};

const DISABLED = { project: false, subproject: false, status: false };

/**
 * Derive the enabled/disabled state of the three group-by options (plus the
 * single hint line) from the current selection. Blocking rules, in order:
 *   1. Selection includes header/subheader/structural rows → all blocked.
 *   2. Selection is non-contiguous in data order → all blocked.
 *   3. Selection spans multiple projects → Subproject alone blocked
 *      (no hint per design review; subproject order is per-project).
 */
export function getGroupSelectionState(data, selectedRows) {
  const blockedAll = (hint) => ({
    hasSelection: !!selectedRows && selectedRows.size > 0,
    enabled: { ...DISABLED },
    hint,
    spanStart: -1,
    spanEnd: -1,
  });

  if (!selectedRows || selectedRows.size === 0) return blockedAll(null);

  const indices = [];
  for (let i = 0; i < data.length; i += 1) {
    if (selectedRows.has(data[i].id)) indices.push(i);
  }
  if (indices.length === 0) return blockedAll(null);

  // Grouping a single row is a no-op — grey the actions out until the
  // selection has something to reorder.
  if (indices.length === 1) return blockedAll('Select at least two rows');

  if (indices.some((i) => !isDraggableRow(data[i]))) {
    return blockedAll('Deselect header rows');
  }

  const spanStart = indices[0];
  const spanEnd = indices[indices.length - 1] + 1;
  if (spanEnd - spanStart !== indices.length) {
    return blockedAll('Select a continuous range');
  }

  const projectKeys = new Set(
    indices.map((i) => normalizeProjectKey(data[i].project))
  );
  const multiProject = projectKeys.size > 1;

  return {
    hasSelection: true,
    enabled: { project: true, subproject: !multiProject, status: true },
    hint: null,
    spanStart,
    spanEnd,
  };
}

/**
 * Build the per-field order lookups the sort needs.
 * @param projectSubprojectsMap  Goal-page subprojects per project nickname
 *   (useProjectsData.projectSubprojectsMap — arrays already in Goal order)
 * @param statuses  Active statuses in Manage Statuses order
 *   (statusesStorage.getActiveStatuses())
 */
export function buildGroupOrders({ projectSubprojectsMap, statuses }) {
  const subprojectOrderByProject = new Map();
  for (const [projectKey, subs] of Object.entries(projectSubprojectsMap || {})) {
    const order = new Map();
    (subs || []).forEach((name, idx) => {
      const key = normalizeProjectKey(name);
      if (key && key !== '-' && !order.has(key)) order.set(key, idx);
    });
    subprojectOrderByProject.set(normalizeProjectKey(projectKey), order);
  }
  const statusOrder = new Map();
  (statuses || []).forEach((s, idx) => {
    const id = typeof s === 'string' ? s : s.id;
    if (id != null && !statusOrder.has(id)) statusOrder.set(id, idx);
  });
  return { subprojectOrderByProject, statusOrder };
}

// Three-tier compare shared by every level of the chain: rows with a value
// sort above rows without one; values with a defined position sort by it;
// present-but-unknown values (stale data) sort after known ones,
// alphabetically so the result is still deterministic.
const TIER_KNOWN = 0;
const TIER_UNKNOWN = 1;
const TIER_MISSING = 2;

const compareRanked = (a, b) => {
  if (a.tier !== b.tier) return a.tier - b.tier;
  if (a.tier === TIER_KNOWN) return a.rank - b.rank;
  if (a.tier === TIER_UNKNOWN) return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
  return 0;
};

const rankProject = (row) => {
  const key = normalizeProjectKey(row.project);
  if (isMissingValue(key)) return { tier: TIER_MISSING, rank: 0, key: '' };
  // Project order is alphabetical (deliberate v1 choice — swap for
  // user-defined Goal ordering if that ever lands).
  return { tier: TIER_UNKNOWN, rank: 0, key };
};

const rankSubproject = (row, orders) => {
  const key = normalizeProjectKey(row.subproject);
  if (isMissingValue(key)) return { tier: TIER_MISSING, rank: 0, key: '' };
  // GUARD: subproject order is defined only within one project. Every chain
  // below reaches this comparator only when the two rows share a project
  // (Project sorts first, or is uniform by the multi-project precondition),
  // so looking up by this row's project is safe. Never compare subprojects
  // across two different projects — that has no defined order.
  const order = orders.subprojectOrderByProject.get(normalizeProjectKey(row.project));
  if (order && order.has(key)) return { tier: TIER_KNOWN, rank: order.get(key), key };
  return { tier: TIER_UNKNOWN, rank: 0, key };
};

const rankStatus = (row, orders) => {
  const id = row.status;
  if (isMissingValue(id)) return { tier: TIER_MISSING, rank: 0, key: '' };
  if (orders.statusOrder.has(id)) {
    return { tier: TIER_KNOWN, rank: orders.statusOrder.get(id), key: String(id) };
  }
  return { tier: TIER_UNKNOWN, rank: 0, key: String(id).toLowerCase() };
};

const COMPARATORS = {
  project: (a, b) => compareRanked(rankProject(a), rankProject(b)),
  subproject: (a, b, orders) =>
    compareRanked(rankSubproject(a, orders), rankSubproject(b, orders)),
  status: (a, b, orders) =>
    compareRanked(rankStatus(a, orders), rankStatus(b, orders)),
};

// Full tiebreak chains per the brief. Existing order (stable sort) is the
// final tiebreak everywhere, so grouping never scrambles more than it must.
const CHAINS = {
  project: ['project', 'subproject', 'status'],
  subproject: ['subproject', 'status'], // project uniform by precondition
  status: ['status', 'project', 'subproject'],
};

/** Stable-sort a span of rows per the chain for `field`. Pure. */
export function sortSpanRows(rows, field, orders) {
  const chain = CHAINS[field];
  if (!chain) throw new Error(`groupSelection: unknown field ${field}`);
  return rows
    .map((row, idx) => ({ row, idx }))
    .sort((a, b) => {
      for (const step of chain) {
        const cmp = COMPARATORS[step](a.row, b.row, orders);
        if (cmp !== 0) return cmp;
      }
      return a.idx - b.idx; // stable: existing order
    })
    .map((e) => e.row);
}

/**
 * Build the reorder command for grouping the current selection by `field`,
 * or null when the action is blocked or would change nothing.
 *
 * The command reorders ONLY the selected rows, writing them back into the
 * exact positions the span occupies at execute time (looked up fresh by row
 * id). It touches no non-order field. Undo writes the previous id order back
 * through the same path as a fresh operation — never a cached payload.
 */
export function createGroupSelectionCommand({ data, selectedRows, field, orders, setData }) {
  const state = getGroupSelectionState(data, selectedRows);
  if (!state.enabled[field]) return null;

  const spanRows = data.slice(state.spanStart, state.spanEnd);
  const prevIds = spanRows.map((r) => r.id);
  const sortedIds = sortSpanRows(spanRows, field, orders).map((r) => r.id);

  if (sortedIds.every((id, i) => id === prevIds[i])) return null; // already grouped

  const applyIdOrder = (ids) => (prevData) => {
    const idSet = new Set(ids);
    const positions = [];
    const rowById = new Map();
    for (let i = 0; i < prevData.length; i += 1) {
      const row = prevData[i];
      if (idSet.has(row.id)) {
        positions.push(i);
        rowById.set(row.id, row);
      }
    }
    // A row was deleted (or duplicated) since the order was computed — do
    // nothing rather than apply a stale order to changed data.
    if (positions.length !== ids.length || rowById.size !== ids.length) {
      return prevData;
    }
    const next = [...prevData];
    ids.forEach((id, k) => {
      next[positions[k]] = rowById.get(id);
    });
    return next;
  };

  return {
    execute: () => setData(applyIdOrder(sortedIds)),
    undo: () => setData(applyIdOrder(prevIds)),
  };
}
