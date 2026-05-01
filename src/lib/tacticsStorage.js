import storage from './storageService';

const TACTICS_YEAR_SETTINGS_KEY_TEMPLATE = 'tactics-year-{yearNumber}-settings';
const TACTICS_CHIPS_KEY_TEMPLATE = 'tactics-year-{yearNumber}-chips-state';
const TACTICS_COLUMN_WIDTHS_KEY_TEMPLATE = 'tactics-column-widths-{yearNumber}';
export const TACTICS_CHIPS_STORAGE_EVENT = 'tactics-chips-state-update';
export const TACTICS_SETTINGS_STORAGE_EVENT = 'tactics-settings-state-update';
export const TACTICS_SEND_TO_SYSTEM_EVENT = 'tactics-send-to-system';
export const TACTICS_SEND_TO_SYSTEM_TS_KEY = 'tactics-send-to-system-ts';

// One-shot cleanup of the legacy global settings key after the year-scope
// split (May 2026). The key was previously used to store all eight tactics
// page settings under a single un-year-scoped blob, which leaked changes on a
// draft year into the active year. Settings are now per-year, so this blob is
// dead data. removeItem is idempotent so calling it on every module load is
// harmless. Safe to delete this block in a future hygiene pass once we are
// confident no pre-split data remains in any user's localStorage.
try {
  storage.removeItem('tactics-page-settings');
} catch {
  // Best effort
}

// Internal: key builder for the year-scoped send-to-system timestamp.
// Consumers should use the get/set/clear helpers below rather than reading
// or writing this key directly.
const getSendToSystemTsKey = (yearNumber) =>
  yearNumber != null
    ? `tactics-year-${yearNumber}-send-to-system-ts`
    : TACTICS_SEND_TO_SYSTEM_TS_KEY;

/**
 * Read the "Send to System" timestamp for a given year.
 * Returns the stored timestamp string or null if the marker is absent.
 *
 * Routing through storageService means the key is user-scoped on the
 * authenticated planner, so two users on the same device do not see each
 * other's send-to-system state.
 *
 * @param {number|null} yearNumber
 * @returns {string|null}
 */
export function getSendToSystemTimestamp(yearNumber) {
  return storage.getItem(getSendToSystemTsKey(yearNumber));
}

/**
 * Stamp the "Send to System" marker for a given year with the current time.
 *
 * @param {number|null} yearNumber
 */
export function setSendToSystemTimestamp(yearNumber) {
  storage.setItem(getSendToSystemTsKey(yearNumber), Date.now().toString());
}

/**
 * Remove the "Send to System" marker for a given year.
 * Used when (re)creating or undoing a draft year.
 *
 * @param {number|null} yearNumber
 */
export function clearSendToSystemTimestamp(yearNumber) {
  storage.removeItem(getSendToSystemTsKey(yearNumber));
}

const DEFAULT_YEAR_SETTINGS = {
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

const getYearSettingsKey = (yearNumber) => {
  // Year-scoped settings have no legacy null-year fallback. The previous
  // global tactics-page-settings key was the source of cross-year contamination
  // (a draft year's wake/sleep/etc. changes leaking into the active year), so
  // the new helpers refuse to operate without an explicit year. Throw loudly
  // rather than fall back, so any future caller that drops the year argument
  // surfaces the mistake at call time instead of producing silently wrong data.
  if (yearNumber === null || yearNumber === undefined) {
    throw new Error('tacticsStorage: yearNumber is required for year-scoped settings');
  }
  return TACTICS_YEAR_SETTINGS_KEY_TEMPLATE.replace('{yearNumber}', yearNumber.toString());
};

/**
 * Read the tactics page settings for a given year.
 *
 * All eight settings (start hour, start minute, increment minutes, AM/PM
 * toggle, 24-hour toggle, start day, chip display modes, summary row order)
 * are now scoped to the year so two years can hold independent values.
 *
 * Throws if yearNumber is null or undefined. The legacy global key
 * (tactics-page-settings) is no longer read.
 *
 * @param {number} yearNumber
 * @returns {object} settings object matching DEFAULT_YEAR_SETTINGS shape
 */
export const loadTacticsYearSettings = (yearNumber) => {
  try {
    const key = getYearSettingsKey(yearNumber);
    const parsed = storage.getJSON(key, null);
    if (!parsed) return { ...DEFAULT_YEAR_SETTINGS };
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
    // Re-throw the explicit "yearNumber is required" error so callers see it;
    // swallow other read errors (corrupt JSON, etc.) and return defaults so the
    // page still renders.
    if (error instanceof Error && error.message.startsWith('tacticsStorage:')) {
      throw error;
    }
    console.error('Failed to read tactics year settings', error);
    return { ...DEFAULT_YEAR_SETTINGS };
  }
};

/**
 * Save the tactics page settings for a given year and broadcast the change.
 *
 * Throws if yearNumber is null or undefined. The dispatched event carries
 * __eventYear in its detail so listeners on a different year can short-circuit
 * (per the H3 cross-year event contract documented in CLAUDE.md). No live
 * listener exists today; the event is fired for parity with the other
 * year-scoped storage modules and to make a future cross-page consumer cheap
 * to wire in.
 *
 * @param {object} payload settings object matching DEFAULT_YEAR_SETTINGS shape
 * @param {number} yearNumber
 */
export const saveTacticsYearSettings = (payload, yearNumber) => {
  try {
    const key = getYearSettingsKey(yearNumber);
    storage.setJSON(key, payload);

    // Dispatch the H3-compliant event. Reserved __eventYear key does not
    // collide with payload fields (startHour, startMinute, incrementMinutes,
    // showAmPm, use24Hour, startDay, chipDisplayModes, summaryRowOrder).
    if (typeof window !== 'undefined') {
      const eventDetail = { ...(payload || {}), __eventYear: yearNumber };
      const event = typeof CustomEvent === 'function'
        ? new CustomEvent(TACTICS_SETTINGS_STORAGE_EVENT, { detail: eventDetail })
        : new Event(TACTICS_SETTINGS_STORAGE_EVENT);
      window.dispatchEvent(event);
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('tacticsStorage:')) {
      throw error;
    }
    console.error('Failed to save tactics year settings', error);
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

    // Dispatch custom event for reactive updates. Include the year number in
    // the detail so listeners on a different year can ignore stale events
    // (H3). The reserved __eventYear key does not collide with payload fields
    // (projectChips / customProjects / chipTimeOverrides).
    if (typeof window !== 'undefined') {
      const eventDetail = { ...(payload || {}), __eventYear: yearNumber };
      const event = typeof CustomEvent === 'function'
        ? new CustomEvent(TACTICS_CHIPS_STORAGE_EVENT, { detail: eventDetail })
        : new Event(TACTICS_CHIPS_STORAGE_EVENT);
      window.dispatchEvent(event);
    }
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

// --- "Sent to System" snapshot ---
// Written only when the user presses "Send to System". The System page reads
// from these keys so it is isolated from live Plan page auto-saves.

const SENT_CHIPS_KEY_TEMPLATE = 'tactics-year-{yearNumber}-sent-chips';

const getSentChipsKey = (yearNumber) => {
  if (yearNumber === null || yearNumber === undefined) {
    return 'tactics-sent-chips';
  }
  return SENT_CHIPS_KEY_TEMPLATE.replace('{yearNumber}', yearNumber.toString());
};

export const saveSentChipsSnapshot = (payload, yearNumber = null) => {
  try {
    storage.setJSON(getSentChipsKey(yearNumber), payload);
  } catch (error) {
    console.error('Failed to save sent chips snapshot', error);
  }
};

export const loadSentChipsSnapshot = (yearNumber = null) => {
  try {
    const parsed = storage.getJSON(getSentChipsKey(yearNumber), null);
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
    console.error('Failed to read sent chips snapshot', error);
    return { projectChips: null, customProjects: null, chipTimeOverrides: null };
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
