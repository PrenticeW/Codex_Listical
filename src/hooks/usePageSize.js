/**
 * Per-Page Size Hook
 * Manages page-specific size scale settings
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import storage from '../lib/storageService';

// Default values
const DEFAULT_SIZE_SCALE = 1.0;
const MIN_SIZE_SCALE = 0.5;
const MAX_SIZE_SCALE = 2.0;
const SIZE_STEP = 0.1;

/**
 * Get the storage key for a specific page
 * @param {string} pageId - Page identifier (e.g., 'goal', 'plan', 'system')
 * @returns {string} Storage key
 */
const getStorageKey = (pageId) => `page-size-scale-${pageId}`;

/**
 * Get the event name for a specific page
 * @param {string} pageId - Page identifier
 * @returns {string} Event name
 */
const getEventName = (pageId) => `page-size-change-${pageId}`;

/**
 * Read the page size scale from storage for a specific page
 * @param {string} pageId - Page identifier
 * @returns {number} Size scale (defaults to 1.0)
 */
const readPageSizeScale = (pageId) => {
  try {
    const raw = storage.getItem(getStorageKey(pageId));
    if (!raw) return DEFAULT_SIZE_SCALE;
    const parsed = parseFloat(raw);
    return Number.isFinite(parsed) ? parsed : DEFAULT_SIZE_SCALE;
  } catch (error) {
    console.error(`Failed to read page size scale for ${pageId}`, error);
    return DEFAULT_SIZE_SCALE;
  }
};

/**
 * Save the page size scale to storage for a specific page
 * @param {string} pageId - Page identifier
 * @param {number} scale - Size scale value
 * @returns {boolean} True if the value was actually changed
 */
const savePageSizeScale = (pageId, scale) => {
  try {
    const key = getStorageKey(pageId);
    const currentValue = storage.getItem(key);
    const newValue = scale.toString();

    // Only save and dispatch if the value actually changed
    if (currentValue === newValue) {
      return false;
    }

    storage.setItem(key, newValue);
    // Dispatch custom event so other instances can sync
    window.dispatchEvent(new CustomEvent(getEventName(pageId), { detail: scale }));
    return true;
  } catch (error) {
    console.error(`Failed to save page size scale for ${pageId}`, error);
    return false;
  }
};

/**
 * Hook to manage per-page size scale
 * @param {string} pageId - Page identifier (e.g., 'goal', 'plan', 'system')
 * @returns {Object} Page size state and control functions
 */
export default function usePageSize(pageId = 'global') {
  const [sizeScale, setSizeScaleState] = useState(() => readPageSizeScale(pageId));
  const currentPageIdRef = useRef(pageId);

  // Track the current pageId for the save function
  useEffect(() => {
    currentPageIdRef.current = pageId;
  }, [pageId]);

  // Sync with storage and other component instances (same pageId only)
  useEffect(() => {
    const handleStorageChange = (event) => {
      if (event.detail !== undefined) {
        setSizeScaleState(event.detail);
      }
    };

    const eventName = getEventName(pageId);
    window.addEventListener(eventName, handleStorageChange);
    return () => {
      window.removeEventListener(eventName, handleStorageChange);
    };
  }, [pageId]);

  // Re-read from storage when pageId changes
  useEffect(() => {
    const storedValue = readPageSizeScale(pageId);
    setSizeScaleState(storedValue);
  }, [pageId]);

  // Wrapped setter that saves to storage immediately
  const setSizeScale = useCallback((value) => {
    const currentPageId = currentPageIdRef.current;
    const newValue = typeof value === 'function' ? value(readPageSizeScale(currentPageId)) : value;
    const clamped = Math.max(MIN_SIZE_SCALE, Math.min(MAX_SIZE_SCALE, newValue));
    setSizeScaleState(clamped);
    savePageSizeScale(currentPageId, clamped);
  }, []);

  const increaseSize = useCallback(() => {
    setSizeScale((prev) => prev + SIZE_STEP);
  }, [setSizeScale]);

  const decreaseSize = useCallback(() => {
    setSizeScale((prev) => prev - SIZE_STEP);
  }, [setSizeScale]);

  const resetSize = useCallback(() => {
    setSizeScale(DEFAULT_SIZE_SCALE);
  }, [setSizeScale]);

  return {
    sizeScale,
    setSizeScale,
    increaseSize,
    decreaseSize,
    resetSize,
    minScale: MIN_SIZE_SCALE,
    maxScale: MAX_SIZE_SCALE,
  };
}
