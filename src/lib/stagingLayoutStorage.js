/**
 * Staging Layout Storage
 *
 * Persists the user's chosen Goal page table width (px).
 *
 * Storage backend: Supabase (`profiles.staging_table_width`).
 * Deliberately NOT year-scoped — the width is a per-account layout
 * preference and applies to every year, so functions here take no
 * yearNumber (same as `themeStorage`).
 *
 * NULL / null means "full width": the table spans the page minus any open
 * side panel, exactly as before this preference existed. A saved width is
 * applied as `min(width, available space)`, so the existing side panel
 * reactivity is untouched — the panel only ever narrows the table further,
 * never the other way round.
 *
 * A localStorage mirror of the last-known width lets the Goal page apply
 * the preference synchronously on first paint (see peekStagingTableWidth),
 * avoiding a full-width flash while the Supabase read is in flight. The
 * mirror is a cache only; Supabase stays the source of truth and
 * loadStagingTableWidth refreshes the mirror on every successful read.
 */

import { supabase } from './supabase';

const WIDTH_CACHE_KEY = 'listical-staging-table-width';

// Floor keeps every fixed column (gutter, buttons, estimate, time value)
// plus a usable slice of prompt cell visible. The page's runtime overflow
// floor (boxMinWidth) may raise this further; it never lowers it.
export const MIN_STAGING_TABLE_WIDTH = 560;

const normaliseWidth = (value) => {
  const parsed = typeof value === 'number' ? value : parseInt(value, 10);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(MIN_STAGING_TABLE_WIDTH, Math.round(parsed));
};

function cacheStagingTableWidth(width) {
  try {
    if (width == null) {
      localStorage.removeItem(WIDTH_CACHE_KEY);
    } else {
      localStorage.setItem(WIDTH_CACHE_KEY, String(width));
    }
  } catch {
    // Storage unavailable (private mode / quota) — cache is best-effort.
  }
}

/**
 * Synchronously read the cached table width from localStorage.
 * Returns null when nothing valid is cached (first visit, full-width
 * preference, cleared storage).
 * @returns {number|null}
 */
export function peekStagingTableWidth() {
  try {
    return normaliseWidth(localStorage.getItem(WIDTH_CACHE_KEY));
  } catch {
    return null;
  }
}

async function requireUserId() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    throw new Error('No authenticated user');
  }
  return user.id;
}

/**
 * Load the saved table width for the signed-in user.
 * Returns null (full width) when unset or on error.
 * @returns {Promise<number|null>}
 */
export async function loadStagingTableWidth() {
  try {
    const userId = await requireUserId();
    const { data, error } = await supabase
      .from('profiles')
      .select('staging_table_width')
      .eq('id', userId)
      .single();
    if (error) throw error;
    const width = normaliseWidth(data?.staging_table_width);
    cacheStagingTableWidth(width);
    return width;
  } catch {
    return null;
  }
}

/**
 * Save the table width for the signed-in user.
 * @param {number|null} width — px, or null to reset to full width
 * @returns {Promise<void>}
 */
export async function saveStagingTableWidth(width) {
  const normalised = width == null ? null : normaliseWidth(width);
  const userId = await requireUserId();
  const { error } = await supabase
    .from('profiles')
    .update({ staging_table_width: normalised })
    .eq('id', userId);
  if (error) throw error;

  cacheStagingTableWidth(normalised);
}
