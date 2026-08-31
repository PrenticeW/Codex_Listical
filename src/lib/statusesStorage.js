/**
 * Statuses storage — per-user editable status chips.
 * Spec: docs/STATUS_MANAGER_SPEC.md. Table: statuses (see
 * supabase/migrations/20260831000001_statuses_table.sql).
 *
 * Rows in planner_rows store status IDS as text. For the pre-existing
 * statuses the id IS the historical label ("Done", "Blocked", …) so no data
 * migration was needed; new custom statuses get generated ids and labels are
 * display-only.
 *
 * A module-level registry mirrors the loaded list so pure utils
 * (multiStatus.js, archiveHelpers.js, sortInbox.ts, …) can look statuses up
 * synchronously without signature changes. Before the first load (or
 * offline) the registry holds DEFAULT_STATUSES, which reproduce the old
 * hardcoded behaviour exactly. STATUSES_UPDATED_EVENT fires on every
 * registry change so React state can follow.
 *
 * Flags:
 *   locked        undeletable + unrenameable ('-', Not Scheduled, Scheduled,
 *                 Done) — the app assigns/targets these directly.
 *   archive_sweep the single "counts as finished" flag: Archive Week sweep,
 *                 Multi-row terminal semantics, sort target 'general'.
 *   active        false = soft-deleted; hidden from dropdowns/panel but kept
 *                 so archived weeks still render label + colour.
 */

import { supabase } from './supabase';
import { getCached, setCached, invalidate } from './storageCache';

export const STATUSES_UPDATED_EVENT = 'listical-statuses-updated';

const CACHE_NS = 'statusesStorage';
const CACHE_KEY = 'statuses';

/** '-' blank default — never stored, never listed, undeletable. */
export const BLANK_STATUS = Object.freeze({
  id: '-', label: '-', bg: '#ffffff',
  sortOrder: -1, archiveSweep: false, builtIn: true, locked: true, active: true,
});

/**
 * Seeds. id === legacy label (rows already store these strings).
 * archiveSweep on = old ARCHIVE_SWEEP_STATUSES (Done, Abandoned, Accounted)
 * plus Skipped (terminal in old TERMINAL_STATUSES; flags are merged now —
 * flagged in spec for review).
 */
export const DEFAULT_STATUSES = [
  { id: 'Not Scheduled', label: 'Not Scheduled', bg: '#e5e5e5', archiveSweep: false, locked: true },
  { id: 'Scheduled', label: 'Scheduled', bg: '#ffe5a0', archiveSweep: false, locked: true },
  { id: 'Done', label: 'Done', bg: '#c9e9c0', archiveSweep: true, locked: true },
  { id: 'Blocked', label: 'Blocked', bg: '#f3c4c4', archiveSweep: false, locked: false },
  { id: 'On Hold', label: 'On Hold', bg: '#505050', archiveSweep: false, locked: false },
  { id: 'Abandoned', label: 'Abandoned', bg: '#e8d9f3', archiveSweep: true, locked: false },
  { id: 'Skipped', label: 'Skipped', bg: '#f9eeff', archiveSweep: true, locked: false },
  { id: 'Accounted', label: 'Accounted', bg: '#b3cd99', archiveSweep: true, locked: false },
  { id: 'Special', label: 'Special', bg: '#cce3ff', archiveSweep: false, locked: false },
].map((s, i) => ({ ...s, sortOrder: i, builtIn: true, active: true }));

/**
 * Legacy text colours for the seeded chips. The new model stores only bg and
 * derives text (statusTextColour), but the original hand-tuned tinted text
 * colours read better than pure black/white, so seeds keep them until the
 * user recolours the chip (then derived kicks in).
 */
const LEGACY_TEXT = {
  '-': '#000000', 'Not Scheduled': '#000000', 'Scheduled': '#473821',
  'Done': '#276436', 'Abandoned': '#5a3b74', 'Blocked': '#9c2f2f',
  'On Hold': '#ffffff', 'Special': '#3a70b7', 'Skipped': '#5a3286',
  'Accounted': '#11734b',
};
const LEGACY_BG = {
  'Not Scheduled': '#e5e5e5', 'Scheduled': '#ffe5a0', 'Done': '#c9e9c0',
  'Abandoned': '#e8d9f3', 'Blocked': '#f3c4c4', 'On Hold': '#505050',
  'Special': '#cce3ff', 'Skipped': '#f9eeff', 'Accounted': '#b3cd99',
};

/** Pure black/white contrast pick from a hex background (no DOM). */
export function statusTextColour(bg) {
  if (typeof bg !== 'string') return '#000000';
  const m = bg.trim().match(/^#?([0-9a-f]{6})$/i);
  if (!m) return '#000000';
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) > 170 ? '#000000' : '#ffffff';
}

// ─── registry ───────────────────────────────────────────────────────────────

let registry = [...DEFAULT_STATUSES];
let registryLoaded = false; // true once Supabase has answered at least once

const emit = () => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(STATUSES_UPDATED_EVENT));
  }
};

const setRegistry = (rows) => {
  registry = rows;
  setCached(CACHE_NS, CACHE_KEY, rows);
  emit();
};

/** All records incl. soft-deleted, sorted. */
export function getAllStatuses() {
  return [...registry].sort((a, b) => a.sortOrder - b.sortOrder);
}

/** Active statuses in panel/dropdown order (excludes '-'). */
export function getActiveStatuses() {
  return getAllStatuses().filter((s) => s.active);
}

/** Lookup by id; falls back to BLANK_STATUS for '-' / '' / null. */
export function getStatusById(id) {
  if (!id || id === '-') return BLANK_STATUS;
  return registry.find((s) => s.id === id) || null;
}

/** Display label for an id (archives may hold soft-deleted ids). */
export function getStatusLabel(id) {
  const s = getStatusById(id);
  return s ? s.label : String(id ?? '-');
}

/**
 * Chip colours for a status id → { bg, text }.
 * Unknown ids (no record at all) render grey per spec.
 */
export function getStatusColors(id) {
  const s = getStatusById(id);
  if (!s) return { bg: '#e5e5e5', text: '#616161' };
  // Seeds keep their legacy tinted text while the bg is unchanged.
  if (LEGACY_TEXT[s.id] !== undefined && (s.id === '-' || s.bg === LEGACY_BG[s.id])) {
    return { bg: s.bg, text: LEGACY_TEXT[s.id] };
  }
  return { bg: s.bg, text: statusTextColour(s.bg) };
}

/** archive_sweep drives Archive Week sweep + Multi-row terminal semantics. */
export function isSweepStatus(id) {
  return Boolean(getStatusById(id)?.archiveSweep);
}
export function getSweepStatusIds() {
  return registry.filter((s) => s.archiveSweep).map((s) => s.id);
}

/**
 * Inbox/planner sort target for a status id.
 * Custom statuses: archive_sweep on -> 'general', off -> 'unscheduled'.
 * Legacy overrides keep the historical sortInbox filing for three built-ins
 * whose sweep flag would now say otherwise (Abandoned + Skipped sweep but
 * always filed 'unscheduled'; Special doesn't sweep but filed 'general').
 */
const LEGACY_SORT_OVERRIDES = {
  Abandoned: 'unscheduled', Skipped: 'unscheduled', Special: 'general',
};
export function getSortTarget(id) {
  if (!id || id === '-') return 'unscheduled';
  if (LEGACY_SORT_OVERRIDES[id]) return LEGACY_SORT_OVERRIDES[id];
  if (id === 'Scheduled') return 'general';
  return isSweepStatus(id) ? 'general' : 'unscheduled';
}

export function isLockedStatus(id) {
  return Boolean(getStatusById(id)?.locked);
}

// ─── row shapes ─────────────────────────────────────────────────────────────

const fromDb = (r) => ({
  id: r.id, label: r.label, bg: r.bg, sortOrder: r.sort_order,
  archiveSweep: r.archive_sweep, builtIn: r.built_in, locked: r.locked,
  active: r.active,
});

const toDb = (s, userId) => ({
  user_id: userId, id: s.id, label: s.label, bg: s.bg,
  sort_order: s.sortOrder, archive_sweep: s.archiveSweep,
  built_in: s.builtIn, locked: s.locked, active: s.active,
  updated_at: new Date().toISOString(),
});

async function getUserId() {
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

// ─── load / seed ────────────────────────────────────────────────────────────

/**
 * Load the user's statuses, seeding DEFAULT_STATUSES on first use.
 * Updates the registry and returns the full list (incl. inactive).
 */
export async function loadStatuses() {
  const userId = await getUserId();
  if (!userId) return getAllStatuses();

  const { data, error } = await supabase
    .from('statuses')
    .select('*')
    .eq('user_id', userId)
    .order('sort_order', { ascending: true });

  if (error) {
    console.error('loadStatuses failed:', error);
    return getAllStatuses(); // keep whatever the registry has (defaults/cache)
  }

  if (!data || data.length === 0) {
    const seeded = DEFAULT_STATUSES.map((s) => toDb(s, userId));
    const { error: seedError } = await supabase.from('statuses').insert(seeded);
    if (seedError) console.error('seed statuses failed:', seedError);
    registryLoaded = true;
    setRegistry([...DEFAULT_STATUSES]);
    return getAllStatuses();
  }

  registryLoaded = true;
  setRegistry(data.map(fromDb));
  return getAllStatuses();
}

export function statusesReady() {
  return registryLoaded;
}

// ─── mutations (optimistic: registry first, then Supabase) ──────────────────

const genId = () =>
  `st_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

export async function createStatus({ label, bg, archiveSweep = false }) {
  const status = {
    id: genId(), label: label.trim(), bg,
    sortOrder: Math.max(-1, ...registry.map((s) => s.sortOrder)) + 1,
    archiveSweep, builtIn: false, locked: false, active: true,
  };
  setRegistry([...registry, status]);
  const userId = await getUserId();
  if (userId) {
    const { error } = await supabase.from('statuses').insert(toDb(status, userId));
    if (error) console.error('createStatus failed:', error);
  }
  return status;
}

export async function updateStatus(id, patch) {
  const current = registry.find((s) => s.id === id);
  if (!current) return null;
  if (current.locked && 'label' in patch) delete patch.label; // locked = unrenameable
  const next = { ...current, ...patch };
  setRegistry(registry.map((s) => (s.id === id ? next : s)));
  const userId = await getUserId();
  if (userId) {
    const { error } = await supabase
      .from('statuses')
      .update(toDb(next, userId))
      .eq('user_id', userId)
      .eq('id', id);
    if (error) console.error('updateStatus failed:', error);
  }
  return next;
}

/** Soft delete: keeps the record so archives still render the chip. */
export async function softDeleteStatus(id) {
  const current = registry.find((s) => s.id === id);
  if (!current || current.locked) return false;
  await updateStatus(id, { active: false });
  return true;
}

/** Persist a full active-list reorder (array of ids in new order). */
export async function reorderStatuses(orderedIds) {
  const orderMap = new Map(orderedIds.map((id, i) => [id, i]));
  const next = registry.map((s) =>
    orderMap.has(s.id) ? { ...s, sortOrder: orderMap.get(s.id) } : s
  );
  setRegistry(next);
  const userId = await getUserId();
  if (userId) {
    await Promise.all(
      next
        .filter((s) => orderMap.has(s.id))
        .map((s) =>
          supabase.from('statuses')
            .update({ sort_order: s.sortOrder, updated_at: new Date().toISOString() })
            .eq('user_id', userId)
            .eq('id', s.id)
        )
    ).catch((e) => console.error('reorderStatuses failed:', e));
  }
}

export function invalidateStatusesCache() {
  invalidate(CACHE_NS, CACHE_KEY);
}

// Hydrate registry from cache synchronously on module load (fast paint).
const cachedRows = getCached(CACHE_NS, CACHE_KEY);
if (Array.isArray(cachedRows) && cachedRows.length) registry = cachedRows;
