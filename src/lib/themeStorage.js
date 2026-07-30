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
 */

import { supabase } from './supabase';
import { DEFAULT_THEME_FAMILY, THEME_FAMILIES } from './theme';

export const THEME_UPDATE_EVENT = 'theme-state-update';

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
    return THEME_FAMILIES.includes(family) ? family : DEFAULT_THEME_FAMILY;
  } catch {
    return DEFAULT_THEME_FAMILY;
  }
}

/**
 * Save the theme family for the signed-in user and broadcast
 * `theme-state-update`.
 * @param {string} family — one of THEME_FAMILIES
 * @returns {Promise<void>}
 */
export async function saveThemeFamily(family) {
  if (!THEME_FAMILIES.includes(family)) {
    throw new Error(`Unknown theme family: ${family}`);
  }
  const userId = await requireUserId();
  const { error } = await supabase
    .from('profiles')
    .update({ theme_family: family })
    .eq('id', userId);
  if (error) throw error;

  window.dispatchEvent(new CustomEvent(THEME_UPDATE_EVENT, {
    detail: { family },
  }));
}
