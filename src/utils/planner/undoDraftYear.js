/**
 * Undo Draft Year
 *
 * Deletes all data for the draft year and removes it from metadata,
 * then switches the UI back to the active year.
 *
 * DEV ONLY — remove the trigger before launch.
 */

import { removeKeysMatching } from '../../lib/storageService';
import {
  getDraftYear,
  getActiveYear,
  deleteDraftYearRecord,
  setCurrentYear,
} from '../../lib/yearMetadataStorage';
import { clearSendToSystemTimestamp } from '../../lib/tacticsStorage';

/**
 * Predicate matching every storage key associated with a specific year.
 *
 * Two patterns the sweep needs to cover (M1):
 *
 *   1. Standard convention `{domain}-year-{N}-{descriptor}`. Catches Goal
 *      shortlist, Plan chips (live + sent), Plan metrics (live + sent), the
 *      send-to-system timestamp, and every per-project planner key — which
 *      gets `-year-{N}-` injected by getProjectKey before its descriptor
 *      (e.g. `planner-v2-project-1-year-2-task-rows`).
 *
 *   2. Known non-standard year-scoped keys. `tactics-column-widths-{N}` is
 *      the only one today — CLAUDE.md flags it as bypassing the storage
 *      module pattern. Any future bypass should be added here explicitly.
 *
 * The flanking dashes in `-year-${N}-` prevent `year-1` from matching
 * `year-12`, `year-13`, etc. Global keys (`app-year-metadata`,
 * `tactics-page-settings`, `listical_age_block`) do not contain
 * `-year-{N}-` for any specific N and are therefore never matched.
 */
function isKeyForYear(unscopedKey, yearNumber) {
  if (unscopedKey.includes(`-year-${yearNumber}-`)) return true;
  if (unscopedKey === `tactics-column-widths-${yearNumber}`) return true;
  return false;
}

/**
 * Remove a draft year and all its storage data.
 * Switches the UI back to the active year.
 *
 * @returns {{ success: boolean, error?: string, removedKeyCount?: number }}
 */
export function undoDraftYear() {
  try {
    const draft = getDraftYear();
    if (!draft) {
      return { success: false, error: 'No draft year found' };
    }

    const active = getActiveYear();
    if (!active) {
      return { success: false, error: 'No active year found — cannot switch back' };
    }

    // Sweep every storage key associated with this draft year (user-scoped
    // by storageService). Replaces the previous hand-maintained list, which
    // had a typo on the live metrics key and missed the sent-metrics key
    // entirely. The predicate is cheap and the sweep stays correct as new
    // year-scoped keys are introduced — provided they follow the
    // `{domain}-year-{N}-{descriptor}` convention or are added to
    // isKeyForYear's explicit list.
    const removedKeyCount = removeKeysMatching(
      (unscopedKey) => isKeyForYear(unscopedKey, draft.yearNumber)
    );

    // The send-to-system timestamp matches the sweep above, but route through
    // tacticsStorage too so any side effects of the helper run (e.g. future
    // cache invalidation). Best effort — the sweep already removed the key.
    try {
      clearSendToSystemTimestamp(draft.yearNumber);
    } catch {
      // Ignore — already removed
    }

    // Remove draft year from metadata
    deleteDraftYearRecord(draft.yearNumber);

    // Switch back to active year
    setCurrentYear(active.yearNumber);

    return { success: true, removedKeyCount };
  } catch (error) {
    return { success: false, error: error.message };
  }
}
