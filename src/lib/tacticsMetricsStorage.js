import storage from './storageService';

const TACTICS_METRICS_STORAGE_KEY_TEMPLATE = 'tactics-year-{yearNumber}-metrics-state';
export const TACTICS_METRICS_STORAGE_EVENT = 'tactics-metrics-state-update';

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
  try {
    const key = getStorageKey(yearNumber);
    return storage.getJSON(key, null);
  } catch (error) {
    console.error('Failed to read tactics metrics', error);
    return null;
  }
};

const saveTacticsMetrics = (payload, yearNumber = null) => {
  try {
    const key = getStorageKey(yearNumber);
    storage.setJSON(key, payload);

    // Dispatch custom event for reactive updates
    if (typeof window !== 'undefined') {
      const event = typeof CustomEvent === 'function'
        ? new CustomEvent(TACTICS_METRICS_STORAGE_EVENT, { detail: payload })
        : new Event(TACTICS_METRICS_STORAGE_EVENT);
      window.dispatchEvent(event);
    }
  } catch (error) {
    console.error('Failed to save tactics metrics', error);
  }
};

// --- "Sent to System" snapshot ---

const SENT_METRICS_KEY_TEMPLATE = 'tactics-year-{yearNumber}-sent-metrics';

const getSentMetricsKey = (yearNumber = null) => {
  if (yearNumber === null || yearNumber === undefined) {
    return 'tactics-sent-metrics';
  }
  return SENT_METRICS_KEY_TEMPLATE.replace('{yearNumber}', yearNumber.toString());
};

const saveSentMetricsSnapshot = (payload, yearNumber = null) => {
  try {
    storage.setJSON(getSentMetricsKey(yearNumber), payload);
  } catch (error) {
    console.error('Failed to save sent metrics snapshot', error);
  }
};

const loadSentMetricsSnapshot = (yearNumber = null) => {
  try {
    return storage.getJSON(getSentMetricsKey(yearNumber), null);
  } catch (error) {
    console.error('Failed to read sent metrics snapshot', error);
    return null;
  }
};

export { loadTacticsMetrics, saveTacticsMetrics, saveSentMetricsSnapshot, loadSentMetricsSnapshot };
