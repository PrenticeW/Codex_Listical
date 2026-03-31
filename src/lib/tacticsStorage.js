import storage from './storageService';

const TACTICS_SETTINGS_KEY = 'tactics-page-settings';
const TACTICS_CHIPS_KEY_TEMPLATE = 'tactics-year-{yearNumber}-chips-state';
const TACTICS_COLUMN_WIDTHS_KEY_TEMPLATE = 'tactics-column-widths-{yearNumber}';

const DEFAULT_SETTINGS = {
  startHour: '',
  startMinute: '',
  incrementMinutes: 60,
  showAmPm: true,
  use24Hour: false,
  startDay: 'Sunday',
  chipDisplayModes: { __default__: { duration: false, clock: false } },
  summaryRowOrder: null,
};

const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const getChipsStorageKey = (yearNumber) => {
  if (yearNumber === null || yearNumber === undefined) {
    return 'tactics-chips-state'; // Legacy key for backward compatibility
  }
  return TACTICS_CHIPS_KEY_TEMPLATE.replace('{yearNumber}', yearNumber.toString());
};

const getColumnWidthsStorageKey = (yearNumber) => {
  if (yearNumber === null || yearNumber === undefined) {
    return 'tactics-column-widths';
  }
  return TACTICS_COLUMN_WIDTHS_KEY_TEMPLATE.replace('{yearNumber}', yearNumber.toString());
};

export const loadTacticsSettings = () => {
  try {
    const parsed = storage.getJSON(TACTICS_SETTINGS_KEY, null);
    if (!parsed) return { ...DEFAULT_SETTINGS };
    return {
      startHour: typeof parsed?.startHour === 'string' ? parsed.startHour : '',
      startMinute: typeof parsed?.startMinute === 'string' ? parsed.startMinute : '',
      incrementMinutes:
        typeof parsed?.incrementMinutes === 'number' && Number.isFinite(parsed.incrementMinutes)
          ? parsed.incrementMinutes
          : 60,
      showAmPm: parsed?.showAmPm !== false,
      use24Hour: parsed?.use24Hour === true,
      startDay: DAYS_OF_WEEK.includes(parsed?.startDay) ? parsed.startDay : DAYS_OF_WEEK[0],
      chipDisplayModes:
        parsed?.chipDisplayModes &&
        typeof parsed.chipDisplayModes === 'object' &&
        !Array.isArray(parsed.chipDisplayModes)
          ? parsed.chipDisplayModes
          : { __default__: { duration: false, clock: false } },
      summaryRowOrder: Array.isArray(parsed?.summaryRowOrder) ? parsed.summaryRowOrder : null,
    };
  } catch (error) {
    console.error('Failed to read tactics settings', error);
    return { ...DEFAULT_SETTINGS };
  }
};

export const saveTacticsSettings = (payload) => {
  try {
    storage.setJSON(TACTICS_SETTINGS_KEY, payload);
  } catch (error) {
    console.error('Failed to save tactics settings', error);
  }
};

export const loadTacticsChipsState = (yearNumber = null) => {
  try {
    const key = getChipsStorageKey(yearNumber);
    const parsed = storage.getJSON(key, null);
    if (!parsed) return { projectChips: null, customProjects: null, chipTimeOverrides: null };
    return {
      projectChips: Array.isArray(parsed?.projectChips) ? parsed.projectChips : null,
      customProjects: Array.isArray(parsed?.customProjects) ? parsed.customProjects : null,
      chipTimeOverrides:
        parsed?.chipTimeOverrides &&
        typeof parsed.chipTimeOverrides === 'object' &&
        !Array.isArray(parsed.chipTimeOverrides)
          ? parsed.chipTimeOverrides
          : null,
    };
  } catch (error) {
    console.error('Failed to read tactics chip state', error);
    return { projectChips: null, customProjects: null, chipTimeOverrides: null };
  }
};

export const saveTacticsChipsState = (payload, yearNumber = null) => {
  try {
    const key = getChipsStorageKey(yearNumber);
    storage.setJSON(key, payload);
  } catch (error) {
    console.error('Failed to save tactics chip state', error);
  }
};

export const loadTacticsColumnWidths = (yearNumber = null) => {
  try {
    const key = getColumnWidthsStorageKey(yearNumber);
    const saved = storage.getJSON(key, null);
    return saved && Array.isArray(saved) ? saved : null;
  } catch (error) {
    console.error('Failed to read tactics column widths', error);
    return null;
  }
};

export const saveTacticsColumnWidths = (widths, yearNumber = null) => {
  try {
    const key = getColumnWidthsStorageKey(yearNumber);
    storage.setJSON(key, widths);
  } catch (error) {
    console.error('Failed to save tactics column widths', error);
  }
};
