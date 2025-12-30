/**
 * Centralized Storage Service
 *
 * All localStorage access should go through this service.
 * This provides a single point of control for:
 * - Error handling
 * - Browser environment checks
 * - Future authentication integration
 * - Backend storage migration (e.g., Supabase)
 * - Logging and debugging
 * - Quota management
 */

/**
 * Check if we're in a browser environment with localStorage available
 * @returns {boolean}
 */
function isBrowserEnvironment() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

/**
 * Storage error types
 */
export const StorageErrorType = {
  NOT_AVAILABLE: 'NOT_AVAILABLE',
  QUOTA_EXCEEDED: 'QUOTA_EXCEEDED',
  PARSE_ERROR: 'PARSE_ERROR',
  UNKNOWN: 'UNKNOWN',
};

/**
 * Custom storage error
 */
export class StorageError extends Error {
  constructor(message, type = StorageErrorType.UNKNOWN, originalError = null) {
    super(message);
    this.name = 'StorageError';
    this.type = type;
    this.originalError = originalError;
  }
}

/**
 * Get an item from storage
 * @param {string} key - Storage key
 * @returns {string|null} The stored value or null if not found
 * @throws {StorageError} If storage is not available or other errors occur
 */
export function getItem(key) {
  if (!isBrowserEnvironment()) {
    return null;
  }

  try {
    return window.localStorage.getItem(key);
  } catch (error) {
    console.error(`[StorageService] Failed to get item "${key}":`, error);
    throw new StorageError(
      `Failed to get item "${key}"`,
      StorageErrorType.UNKNOWN,
      error
    );
  }
}

/**
 * Set an item in storage
 * @param {string} key - Storage key
 * @param {string} value - Value to store
 * @throws {StorageError} If storage is not available or quota exceeded
 */
export function setItem(key, value) {
  if (!isBrowserEnvironment()) {
    console.warn('[StorageService] Attempted to set item in non-browser environment');
    return;
  }

  try {
    window.localStorage.setItem(key, value);
  } catch (error) {
    // Check for quota exceeded error
    if (
      error.name === 'QuotaExceededError' ||
      error.name === 'NS_ERROR_DOM_QUOTA_REACHED'
    ) {
      console.error(`[StorageService] Storage quota exceeded for key "${key}"`);
      throw new StorageError(
        `Storage quota exceeded for key "${key}"`,
        StorageErrorType.QUOTA_EXCEEDED,
        error
      );
    }

    console.error(`[StorageService] Failed to set item "${key}":`, error);
    throw new StorageError(
      `Failed to set item "${key}"`,
      StorageErrorType.UNKNOWN,
      error
    );
  }
}

/**
 * Remove an item from storage
 * @param {string} key - Storage key
 * @throws {StorageError} If storage is not available
 */
export function removeItem(key) {
  if (!isBrowserEnvironment()) {
    console.warn('[StorageService] Attempted to remove item in non-browser environment');
    return;
  }

  try {
    window.localStorage.removeItem(key);
  } catch (error) {
    console.error(`[StorageService] Failed to remove item "${key}":`, error);
    throw new StorageError(
      `Failed to remove item "${key}"`,
      StorageErrorType.UNKNOWN,
      error
    );
  }
}

/**
 * Clear all items from storage
 * @throws {StorageError} If storage is not available
 */
export function clear() {
  if (!isBrowserEnvironment()) {
    console.warn('[StorageService] Attempted to clear storage in non-browser environment');
    return;
  }

  try {
    window.localStorage.clear();
  } catch (error) {
    console.error('[StorageService] Failed to clear storage:', error);
    throw new StorageError(
      'Failed to clear storage',
      StorageErrorType.UNKNOWN,
      error
    );
  }
}

/**
 * Get a JSON item from storage
 * @template T
 * @param {string} key - Storage key
 * @param {T} [defaultValue=null] - Default value if key doesn't exist or parse fails
 * @returns {T} The parsed JSON value or default value
 */
export function getJSON(key, defaultValue = null) {
  try {
    const raw = getItem(key);
    if (raw === null) {
      return defaultValue;
    }
    return JSON.parse(raw);
  } catch (error) {
    if (error instanceof StorageError) {
      // Re-throw storage errors
      throw error;
    }
    // JSON parse error
    console.error(`[StorageService] Failed to parse JSON for key "${key}":`, error);
    return defaultValue;
  }
}

/**
 * Set a JSON item in storage
 * @param {string} key - Storage key
 * @param {*} value - Value to store (will be JSON.stringify'd)
 * @throws {StorageError} If storage is not available or quota exceeded
 */
export function setJSON(key, value) {
  try {
    const serialized = JSON.stringify(value);
    setItem(key, serialized);
  } catch (error) {
    if (error instanceof StorageError) {
      // Re-throw storage errors
      throw error;
    }
    // JSON stringify error
    console.error(`[StorageService] Failed to stringify value for key "${key}":`, error);
    throw new StorageError(
      `Failed to stringify value for key "${key}"`,
      StorageErrorType.UNKNOWN,
      error
    );
  }
}

/**
 * Check if a key exists in storage
 * @param {string} key - Storage key
 * @returns {boolean} True if the key exists
 */
export function hasKey(key) {
  try {
    return getItem(key) !== null;
  } catch (error) {
    console.error(`[StorageService] Failed to check key "${key}":`, error);
    return false;
  }
}

/**
 * Get all keys in storage
 * @returns {string[]} Array of all storage keys
 */
export function getAllKeys() {
  if (!isBrowserEnvironment()) {
    return [];
  }

  try {
    const keys = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key) {
        keys.push(key);
      }
    }
    return keys;
  } catch (error) {
    console.error('[StorageService] Failed to get all keys:', error);
    return [];
  }
}

/**
 * Get the total size of storage in bytes (approximate)
 * @returns {number} Approximate size in bytes
 */
export function getStorageSize() {
  if (!isBrowserEnvironment()) {
    return 0;
  }

  try {
    let total = 0;
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key) {
        const value = window.localStorage.getItem(key);
        total += key.length + (value?.length || 0);
      }
    }
    return total;
  } catch (error) {
    console.error('[StorageService] Failed to calculate storage size:', error);
    return 0;
  }
}

/**
 * Check if storage is available
 * @returns {boolean} True if storage is available
 */
export function isAvailable() {
  return isBrowserEnvironment();
}

/**
 * Default export with all methods
 */
export default {
  getItem,
  setItem,
  removeItem,
  clear,
  getJSON,
  setJSON,
  hasKey,
  getAllKeys,
  getStorageSize,
  isAvailable,
  StorageErrorType,
};
