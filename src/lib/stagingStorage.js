const STORAGE_KEY_TEMPLATE = 'staging-year-{yearNumber}-shortlist';
export const STAGING_STORAGE_EVENT = 'staging-state-update';

const getWindowRef = () => (typeof window !== 'undefined' ? window : null);

/**
 * Get storage key for a specific year
 * @param {number|null} yearNumber - Year number (null for legacy key)
 * @returns {string} Storage key
 */
const getStorageKey = (yearNumber = null) => {
  if (yearNumber === null || yearNumber === undefined) {
    return 'staging-shortlist'; // Legacy key for backward compatibility
  }
  return STORAGE_KEY_TEMPLATE.replace('{yearNumber}', yearNumber.toString());
};

export const loadStagingState = (yearNumber = null) => {
  const win = getWindowRef();
  if (!win) {
    return { shortlist: [], archived: [] };
  }
  try {
    const key = getStorageKey(yearNumber);
    const raw = win.localStorage.getItem(key);
    if (!raw) {
      return { shortlist: [], archived: [] };
    }
    const parsed = JSON.parse(raw);
    return {
      shortlist: Array.isArray(parsed?.shortlist) ? parsed.shortlist : [],
      archived: Array.isArray(parsed?.archived) ? parsed.archived : [],
    };
  } catch (error) {
    console.error('Failed to read staging shortlist', error);
    return { shortlist: [], archived: [] };
  }
};

export const saveStagingState = (payload, yearNumber = null) => {
  const win = getWindowRef();
  if (!win) return;
  try {
    const key = getStorageKey(yearNumber);
    win.localStorage.setItem(key, JSON.stringify(payload));
    const event =
      typeof CustomEvent === 'function'
        ? new CustomEvent(STAGING_STORAGE_EVENT, { detail: payload })
        : new Event(STAGING_STORAGE_EVENT);
    win.dispatchEvent(event);
  } catch (error) {
    console.error('Failed to save staging shortlist', error);
  }
};

export const getStagingShortlist = (yearNumber = null) => loadStagingState(yearNumber).shortlist;

// Legacy export for backward compatibility
export const STAGING_STORAGE_KEY = 'staging-shortlist';
