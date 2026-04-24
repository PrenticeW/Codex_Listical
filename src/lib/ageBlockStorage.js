/**
 * Age Block Storage
 *
 * Device-level block that prevents repeat signup attempts within 24 hours
 * of a failed age check. Deliberately NOT user-scoped — the block is tied
 * to the browser, not to an account, and is applied before the user is
 * authenticated. The `global: true` flag on every call opts out of the
 * user-scoping that storageService applies by default.
 *
 * Consumers: SignupPage.jsx (age gate). The 24-hour window logic lives in
 * SignupPage; this module is only responsible for the read/write/clear of
 * the raw timestamp string.
 */

import storage from './storageService';

const AGE_BLOCK_KEY = 'listical_age_block';

/**
 * Read the age-block timestamp, if any.
 * @returns {string|null} Stringified Date.now() or null.
 */
export function getAgeBlockTimestamp() {
  return storage.getItem(AGE_BLOCK_KEY, true);
}

/**
 * Stamp the age block with the current time.
 */
export function saveAgeBlockTimestamp() {
  storage.setItem(AGE_BLOCK_KEY, Date.now().toString(), true);
}

/**
 * Remove the age block (called once the 24-hour window has elapsed).
 */
export function clearAgeBlockTimestamp() {
  storage.removeItem(AGE_BLOCK_KEY, true);
}
