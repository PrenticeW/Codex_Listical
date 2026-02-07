/**
 * Shared Page Size Hook
 * Manages a global page size scale setting that applies across all pages
 */

import { useState, useCallback, useEffect } from 'react';
import storage from '../lib/storageService';

const PAGE_SIZE_STORAGE_KEY = 'global-page-size-scale';
const PAGE_SIZE_CHANGE_EVENT = 'page-size-change';

// Default values
const DEFAULT_SIZE_SCALE = 1.0;
const MIN_SIZE_SCALE = 0.5;
const MAX_SIZE_SCALE = 2.0;
const SIZE_STEP = 0.1;

/**
 * Read the global page size scale from storage
 * @returns {number} Size scale (defaults to 1.0)
 */
const readPageSizeScale = () => {
  try {
    const raw = storage.getItem(PAGE_SIZE_STORAGE_KEY);
    if (!raw) return DEFAULT_SIZE_SCALE;
    const parsed = parseFloat(raw);
    return Number.isFinite(parsed) ? parsed : DEFAULT_SIZE_SCALE;
  } catch (error) {
    console.error('Failed to read page size scale', error);
    return DEFAULT_SIZE_SCALE;
  }
};

/**
 * Save the global page size scale to storage
 * @param {number} scale - Size scale value
 */
const savePageSizeScale = (scale) => {
  try {
    storage.setItem(PAGE_SIZE_STORAGE_KEY, scale.toString());
    // Dispatch custom event so other instances can sync
    window.dispatchEvent(new CustomEvent(PAGE_SIZE_CHANGE_EVENT, { detail: scale }));
  } catch (error) {
    console.error('Failed to save page size scale', error);
  }
};

/**
 * Hook to manage global page size across all pages
 * @returns {Object} Page size state and control functions
 */
export default function usePageSize() {
  const [sizeScale, setSizeScale] = useState(() => readPageSizeScale());

  // Sync with storage and other component instances
  useEffect(() => {
    const handleStorageChange = (event) => {
      if (event.detail !== undefined) {
        setSizeScale(event.detail);
      }
    };

    window.addEventListener(PAGE_SIZE_CHANGE_EVENT, handleStorageChange);
    return () => {
      window.removeEventListener(PAGE_SIZE_CHANGE_EVENT, handleStorageChange);
    };
  }, []);

  // Save to storage when scale changes
  useEffect(() => {
    savePageSizeScale(sizeScale);
  }, [sizeScale]);

  const increaseSize = useCallback(() => {
    setSizeScale((prev) => Math.min(prev + SIZE_STEP, MAX_SIZE_SCALE));
  }, []);

  const decreaseSize = useCallback(() => {
    setSizeScale((prev) => Math.max(prev - SIZE_STEP, MIN_SIZE_SCALE));
  }, []);

  const resetSize = useCallback(() => {
    setSizeScale(DEFAULT_SIZE_SCALE);
  }, []);

  return {
    sizeScale,
    setSizeScale,
    increaseSize,
    decreaseSize,
    resetSize,
  };
}
