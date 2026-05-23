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
import { clearForYear } from '../../lib/storageCache';

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
 * @returns {Promise<{ success: boolean, error?: string, removedKeyCount?: number }>}
 */
export async function undoDraftYear() {
  try {
    const draft = await getDraftYear();
    if (!draft) {
      return { success: false, error: 'No draft year found' };
    }

    const active = await getActiveYear();
    if (!active) {
      return { success: false, error: 'No active year found — cannot switch back' };
    }

    // Sweep every localStorage key associated with this draft year. After the
    // step-5 port lands fully, year-scoped data will live in Supabase under
    // year_id foreign keys with ON DELETE CASCADE, so deleting the year row
    // will tear down its planning data automatically. Until every helper is
    // ported, the localStorage sweep stays useful for keys whose helpers
    // have not migrated yet.
    const removedKeyCount = removeKeysMatching(
      (unscopedKey) => isKeyForYear(unscopedKey, draft.yearNumber)
    );

    // Best-effort cleanup of the send-to-system marker. The localStorage
    // sweep above no longer catches it (the marker now lives in Supabase
    // on planner_settings.send_to_system_at), so this await is the actual
    // cleanup path post helper #4 port. The Supabase cascade on year delete
    // will eventually make this redundant once helper #5 lands the
    // year-row delete itself, but for now we still need it.
    try {
      await clearSendToSystemTimestamp(draft.yearNumber);
    } catch {
      // Ignore — best effort
    }

    // Remove draft year from metadata. With the Supabase port this also
    // cascades any rows in year-scoped tables that reference this year_id.
    await deleteDraftYearRecord(draft.yearNumber);

    // Invalidate every cached entry tied to the deleted draft year so that
    // future reads (e.g. switching back to this year number after another
    // draft is created) don't return stale cached data.
    clearForYear(draft.yearNumber);

    // Switch back to active year
    await setCurrentYear(active.yearNumber);

    return { success: true, removedKeyCount };
  } catch (error) {
    return { success: false, error: error.message };
  }
}
