/**
 * Revert Archive Operation
 *
 * Reverses a year archive+promote: demotes the newly active year back to
 * 'draft' and un-archives the previously archived year back to 'active',
 * then switches the UI to the restored active year.
 *
 * This is safe because performYearArchive only changes metadata statuses —
 * all storage keys for both years remain intact. Reversing the status
 * changes restores the exact pre-archive state.
 *
 * DEV ONLY — remove before launch.
 */

import {
  readYearMetadata,
  updateYearInfo,
  setCurrentYear,
} from '../../lib/yearMetadataStorage';
import { clearForYear } from '../../lib/storageCache';

/**
 * Find the most recently archived year (highest yearNumber with status 'archived').
 * @param {Array} years
 * @returns {Object|null}
 */
function getMostRecentlyArchivedYear(years) {
  return years
    .filter(y => y.status === 'archived')
    .sort((a, b) => b.yearNumber - a.yearNumber)[0] || null;
}

/**
 * Revert the last archive+promote operation.
 *
 * Pre-conditions:
 *   - An active year exists (the one that was just promoted from draft)
 *   - An archived year exists (the one that was just archived)
 *   - The active year's number is greater than the archived year's number
 *
 * Post-conditions:
 *   - The active year goes back to status 'draft'
 *   - The archived year goes back to status 'active' (endDate / archivedAt / stats cleared)
 *   - currentYear switches to the restored active year
 *
 * @returns {Promise<{ success: boolean, error?: string, restoredYear?: number, demotedYear?: number }>}
 */
export async function revertArchive() {
  try {
    const metadata = await readYearMetadata();
    if (!metadata) {
      return { success: false, error: 'No year metadata found' };
    }

    const activeYear = metadata.years.find(y => y.status === 'active');
    if (!activeYear) {
      return { success: false, error: 'No active year found' };
    }

    const archivedYear = getMostRecentlyArchivedYear(metadata.years);
    if (!archivedYear) {
      return { success: false, error: 'No archived year found to restore' };
    }

    // Safety: the active year should be newer than the archived year
    if (activeYear.yearNumber <= archivedYear.yearNumber) {
      return {
        success: false,
        error: `Active year (${activeYear.yearNumber}) is not newer than archived year (${archivedYear.yearNumber}) — nothing to revert`,
      };
    }

    // Demote the current active year back to draft. Use silent: true on both
    // status writes so we fire only one event at the end (via setCurrentYear),
    // not three events with intermediate inconsistent states.
    await updateYearInfo(activeYear.yearNumber, { status: 'draft' }, { silent: true });

    // Un-archive the previous year back to active. Clear the archived-at /
    // end-date / stats so the year looks exactly as it did before archiving.
    await updateYearInfo(archivedYear.yearNumber, {
      status: 'active',
      endDate: null,
      archivedAt: null,
      totalWeeksCompleted: 0,
      totalHoursCompleted: 0,
    }, { silent: true });

    // Both years' `years.status` columns changed. Clear caches before the
    // setCurrentYear event fires so the remounting pages read fresh state.
    clearForYear(archivedYear.yearNumber);
    clearForYear(activeYear.yearNumber);

    // Switch to the restored active year — fires the single authoritative
    // yearMetadataStorage event so YearContext re-reads the updated rows.
    await setCurrentYear(archivedYear.yearNumber);

    return {
      success: true,
      restoredYear: archivedYear.yearNumber,
      demotedYear: activeYear.yearNumber,
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}
