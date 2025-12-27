const TACTICS_METRICS_STORAGE_KEY = 'tactics-metrics-state';
export const TACTICS_METRICS_STORAGE_EVENT = 'tactics-metrics-state-update';

const getBrowserWindow = () => (typeof window !== 'undefined' ? window : null);

const loadTacticsMetrics = () => {
  const win = getBrowserWindow();
  if (!win) return null;
  try {
    const raw = win.localStorage.getItem(TACTICS_METRICS_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (error) {
    console.error('Failed to read tactics metrics', error);
    return null;
  }
};

const saveTacticsMetrics = (payload) => {
  const win = getBrowserWindow();
  if (!win) return;
  try {
    win.localStorage.setItem(TACTICS_METRICS_STORAGE_KEY, JSON.stringify(payload));

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
