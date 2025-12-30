const TACTICS_METRICS_STORAGE_KEY_TEMPLATE = 'tactics-year-{yearNumber}-metrics-state';
export const TACTICS_METRICS_STORAGE_EVENT = 'tactics-metrics-state-update';

const getBrowserWindow = () => (typeof window !== 'undefined' ? window : null);

/**
 * Get storage key for a specific year
 * @param {number|null} yearNumber - Year number (null for legacy key)
 * @returns {string} Storage key
 */
const getStorageKey = (yearNumber = null) => {
  if (yearNumber === null || yearNumber === undefined) {
    return 'tactics-metrics-state'; // Legacy key for backward compatibility
  }
  return TACTICS_METRICS_STORAGE_KEY_TEMPLATE.replace('{yearNumber}', yearNumber.toString());
};

const loadTacticsMetrics = (yearNumber = null) => {
  const win = getBrowserWindow();
  if (!win) return null;
  try {
    const key = getStorageKey(yearNumber);
    const raw = win.localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (error) {
    console.error('Failed to read tactics metrics', error);
    return null;
  }
};

const saveTacticsMetrics = (payload, yearNumber = null) => {
  const win = getBrowserWindow();
  if (!win) return;
  try {
    const key = getStorageKey(yearNumber);
    win.localStorage.setItem(key, JSON.stringify(payload));

    // Dispatch custom event for reactive updates
    const event = typeof CustomEvent === 'function'
      ? new CustomEvent(TACTICS_METRICS_STORAGE_EVENT, { detail: payload })
      : new Event(TACTICS_METRICS_STORAGE_EVENT);
    win.dispatchEvent(event);
  } catch (error) {
    console.error('Failed to save tactics metrics', error);
  }
};

export { loadTacticsMetrics, saveTacticsMetrics };
