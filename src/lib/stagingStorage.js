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

/**
 * Serialize a row for storage.
 * Converts array with metadata to an object { cells: [...], _rowType?, _pairId? }
 * so that metadata survives JSON serialization.
 */
const serializeRow = (row) => {
  if (!Array.isArray(row)) return row;
  const serialized = {
    cells: [...row],
  };
  // Include metadata as regular object properties
  if (row.__rowType) {
    serialized._rowType = row.__rowType;
  }
  if (row.__pairId) {
    serialized._pairId = row.__pairId;
  }
  return serialized;
};

/**
 * Deserialize a row from storage.
 * Converts object { cells: [...], _rowType?, _pairId? } back to array with non-enumerable metadata.
 * Also handles legacy format (plain arrays without metadata).
 */
const deserializeRow = (row) => {
  // Handle new format: { cells: [...], _rowType?, _pairId? }
  if (row && typeof row === 'object' && Array.isArray(row.cells)) {
    const deserialized = [...row.cells];
    if (row._rowType) {
      Object.defineProperty(deserialized, '__rowType', {
        value: row._rowType,
        writable: true,
        configurable: true,
        enumerable: false,
      });
    }
    if (row._pairId) {
      Object.defineProperty(deserialized, '__pairId', {
        value: row._pairId,
        writable: true,
        configurable: true,
        enumerable: false,
      });
    }
    return deserialized;
  }
  // Handle legacy format: plain array
  if (Array.isArray(row)) {
    return [...row];
  }
  return row;
};

/**
 * Serialize an item's planTableEntries for storage
 */
const serializeItem = (item) => {
  if (!item || !Array.isArray(item.planTableEntries)) return item;
  return {
    ...item,
    planTableEntries: item.planTableEntries.map(serializeRow),
  };
};

/**
 * Deserialize an item's planTableEntries from storage
 */
const deserializeItem = (item) => {
  if (!item || !Array.isArray(item.planTableEntries)) return item;
  return {
    ...item,
    planTableEntries: item.planTableEntries.map(deserializeRow),
  };
};

export const loadStagingState = (yearNumber = null) => {
  try {
    const key = getStorageKey(yearNumber);
    const parsed = storage.getJSON(key, null);

    if (!parsed) {
      return { shortlist: [], archived: [] };
    }

    return {
      shortlist: Array.isArray(parsed?.shortlist) ? parsed.shortlist.map(deserializeItem) : [],
      archived: Array.isArray(parsed?.archived) ? parsed.archived.map(deserializeItem) : [],
    };
  } catch (error) {
    console.error('Failed to read staging shortlist', error);
    return { shortlist: [], archived: [] };
  }
};

export const saveStagingState = (payload, yearNumber = null) => {
  try {
    const key = getStorageKey(yearNumber);
    // Serialize items to preserve row type metadata
    const serializedPayload = {
      ...payload,
      shortlist: Array.isArray(payload?.shortlist) ? payload.shortlist.map(serializeItem) : [],
      archived: Array.isArray(payload?.archived) ? payload.archived.map(serializeItem) : [],
    };
    storage.setJSON(key, serializedPayload);

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
