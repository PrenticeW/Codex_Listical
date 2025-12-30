import storage from './storageService';

const STORAGE_KEY_TEMPLATE = 'staging-year-{yearNumber}-shortlist';
export const STAGING_STORAGE_EVENT = 'staging-state-update';

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
  try {
    const key = getStorageKey(yearNumber);
    const parsed = storage.getJSON(key, null);

    if (!parsed) {
      return { shortlist: [], archived: [] };
    }

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
  try {
    const key = getStorageKey(yearNumber);
    storage.setJSON(key, payload);

    // Dispatch custom event for cross-tab sync
    if (typeof window !== 'undefined') {
      const event = typeof CustomEvent === 'function'
        ? new CustomEvent(STAGING_STORAGE_EVENT, { detail: payload })
        : new Event(STAGING_STORAGE_EVENT);
      window.dispatchEvent(event);
    }
  } catch (error) {
    console.error('Failed to save staging shortlist', error);
  }
};

export const getStagingShortlist = (yearNumber = null) => loadStagingState(yearNumber).shortlist;

// Legacy export for backward compatibility
export const STAGING_STORAGE_KEY = 'staging-shortlist';
