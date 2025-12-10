const TACTICS_METRICS_STORAGE_KEY = 'tactics-metrics-state';

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
  } catch (error) {
    console.error('Failed to save tactics metrics', error);
  }
};

export { loadTacticsMetrics, saveTacticsMetrics };
