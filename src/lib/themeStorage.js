/**
 * Theme Storage
 *
 * Persists the user's chosen colour-theme family (see src/lib/theme.js).
 *
 * Storage backend: Supabase (`profiles.theme_family`).
 * Deliberately NOT year-scoped — the theme is a per-account appearance
 * preference and applies to every year, so functions here take no
 * yearNumber and the update event carries no `__eventYear` (same as
 * `yearMetadataStorage`).
 *
 * The `theme-state-update` window event fires after every successful save
 * with `{ family }` in detail, so any listener (Layout applies the theme)
 * can react without refetching.
 *
 * A localStorage mirror of the last-known family lets startup code apply
 * the theme synchronously before first paint (see peekThemeFamily and the
 * pre-render call in src/main.jsx) — without it, every refresh painted the
 * stylesheet's blue defaults for the moment the Supabase read was in
 * flight. The mirror is a cache only; Supabase stays the source of truth
 * and loadThemeFamily refreshes the mirror on every successful read.
 */

import { supabase } from './supabase';
import { DEFAULT_THEME_FAMILY, isValidThemeKey } from './theme';

export const THEME_UPDATE_EVENT = 'theme-state-update';

const THEME_CACHE_KEY = 'listical-theme-family';

function cacheThemeFamily(family) {
  try {
    localStorage.setItem(THEME_CACHE_KEY, family);
  } catch {
    // Storage unavailable (private mode / quota) — cache is best-effort.
  }
}

/**
 * Synchronously read the cached theme family from localStorage.
 * Returns null when nothing valid is cached (first visit, cleared storage),
 * so callers can leave the stylesheet defaults untouched.
 * @returns {string|null}
 */
export function peekThemeFamily() {
  try {
    const family = localStorage.getItem(THEME_CACHE_KEY);
    return isValidThemeKey(family) ? family : null;
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
 * Load the saved theme family for the signed-in user.
 * Falls back to the default family when unset, unknown, or on error.
 * @returns {Promise<string>}
 */
export async function loadThemeFamily() {
  try {
    const userId = await requireUserId();
    const { data, error } = await supabase
      .from('profiles')
      .select('theme_family')
      .eq('id', userId)
      .single();
    if (error) throw error;
    const family = data?.theme_family;
    const resolved = isValidThemeKey(family) ? family : DEFAULT_THEME_FAMILY;
    cacheThemeFamily(resolved);
    return resolved;
  } catch {
    return DEFAULT_THEME_FAMILY;
  }
}

/**
 * Save the theme family for the signed-in user and broadcast
 * `theme-state-update`.
 * @param {string} family — a theme key (family name or hsl colour string)
 * @returns {Promise<void>}
 */
export async function saveThemeFamily(family) {
  if (!isValidThemeKey(family)) {
    throw new Error(`Unknown theme family: ${family}`);
  }
  const userId = await requireUserId();
  const { error } = await supabase
    .from('profiles')
    .update({ theme_family: family })
    .eq('id', userId);
  if (error) throw error;

  cacheThemeFamily(family);

  window.dispatchEvent(new CustomEvent(THEME_UPDATE_EVENT, {
    detail: { family },
  }));
}
