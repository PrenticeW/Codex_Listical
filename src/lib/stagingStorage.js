const STORAGE_KEY = 'staging-shortlist';
export const STAGING_STORAGE_EVENT = 'staging-state-update';

const getWindowRef = () => (typeof window !== 'undefined' ? window : null);

export const loadStagingState = () => {
  const win = getWindowRef();
  if (!win) {
    return { shortlist: [], archived: [] };
  }
  try {
    const raw = win.localStorage.getItem(STORAGE_KEY);
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

export const saveStagingState = (payload) => {
  const win = getWindowRef();
  if (!win) return;
  try {
    win.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    const event =
      typeof CustomEvent === 'function'
        ? new CustomEvent(STAGING_STORAGE_EVENT, { detail: payload })
        : new Event(STAGING_STORAGE_EVENT);
    win.dispatchEvent(event);
  } catch (error) {
    console.error('Failed to save staging shortlist', error);
  }
};

export const getStagingShortlist = () => loadStagingState().shortlist;

export const STAGING_STORAGE_KEY = STORAGE_KEY;
