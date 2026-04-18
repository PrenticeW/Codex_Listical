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
  saveYearMetadata,
  setCurrentYear,
} from '../../lib/yearMetadataStorage';

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
 * @returns {{ success: boolean, error?: string, restoredYear?: number, demotedYear?: number }}
 */
export function revertArchive() {
  try {
    const metadata = readYearMetadata();
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

    // Demote the current active year back to draft
    const activeIdx = metadata.years.findIndex(y => y.yearNumber === activeYear.yearNumber);
    metadata.years[activeIdx] = {
      ...metadata.years[activeIdx],
      status: 'draft',
    };

    // Un-archive the previous year back to active
    const archivedIdx = metadata.years.findIndex(y => y.yearNumber === archivedYear.yearNumber);
    metadata.years[archivedIdx] = {
      ...metadata.years[archivedIdx],
      status: 'active',
      endDate: null,
      archivedAt: null,
      totalWeeksCompleted: 0,
      totalHoursCompleted: 0,
    };

    // Switch to the restored active year
    metadata.currentYear = archivedYear.yearNumber;
    saveYearMetadata(metadata);

    // Also call setCurrentYear to fire the custom event for cross-tab sync
    setCurrentYear(archivedYear.yearNumber);

    return {
      success: true,
      restoredYear: archivedYear.yearNumber,
      demotedYear: activeYear.yearNumber,
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}
