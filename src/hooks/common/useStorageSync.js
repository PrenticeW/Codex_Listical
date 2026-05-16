/**
 * Generic Storage Sync Hook
 * Handles both custom storage events and native cross-tab storage events
 *
 * This hook consolidates the pattern of listening to custom storage events
 * (same-page updates) and native storage events (cross-tab sync).
 */

import { useState, useEffect, useCallback } from 'react';

/**
 * Synchronizes state with storage events.
 *
 * Async-aware: `loadData` may return either a value or a Promise. While the
 * initial fetch is in flight, `initialValue` is what consumers see. After
 * step-5 of the Supabase migration, every helper is async, so callers
 * should always provide an `initialValue` (empty array / null / etc.) to
 * avoid flashing `undefined` through state.
 *
 * @param {Object} options - Configuration options
 * @param {Function} options.loadData - Function to load data (sync or async)
 * @param {string} options.customEventName - Custom event name to listen to
 * @param {string|string[]} options.storageKeys - Storage key(s) to watch for cross-tab sync
 * @param {Function} options.extractData - Function to extract data from event payload (sync or async)
 * @param {*} options.dependency - Dependency to trigger reload (e.g., currentYear)
 * @param {number|null} [options.currentYearNumber] - If provided, custom events
 *   whose detail.__eventYear does not match this value are ignored. Guards
 *   against cross-year event collisions (H3). Events without __eventYear fall
 *   through unchanged for backwards compatibility.
 * @param {*} [options.initialValue=null] - Value used until the first load resolves.
 *
 * @returns {Array} [data, setData] tuple
 */
export default function useStorageSync({
  loadData,
  customEventName,
  storageKeys,
  extractData,
  dependency,
  currentYearNumber,
  initialValue = null,
}) {
  const [data, setData] = useState(initialValue);

  // Reload when dependency changes (or on mount).
  useEffect(() => {
    let cancelled = false;
    Promise.resolve()
      .then(() => loadData())
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((error) => {
        console.error('useStorageSync loadData failed:', error);
      });
    return () => { cancelled = true; };
  }, [dependency, loadData]);

  // Memoize the data extraction function
  const extractDataCallback = useCallback(extractData, [extractData]);

  // Listen for storage events (both custom and native)
  useEffect(() => {
    const handleCustomEvent = async (event) => {
      // H3 guard: if the event is tagged with a year and this listener is
      // scoped to a different year, ignore the event. Untagged events (legacy
      // or non-year-scoped callers) pass through.
      const eventYear = event?.detail?.__eventYear;
      if (
        currentYearNumber != null
        && eventYear != null
        && eventYear !== currentYearNumber
      ) {
        return;
      }
      const payload = event.detail ?? (await loadData());
      const extracted = await extractDataCallback(payload);
      setData(extracted);
    };

    const handleNativeStorageEvent = async (e) => {
      const keys = Array.isArray(storageKeys) ? storageKeys : [storageKeys];
      if (keys.includes(e.key)) {
        const fresh = await loadData();
        setData(fresh);
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener(customEventName, handleCustomEvent);
      window.addEventListener('storage', handleNativeStorageEvent);

      return () => {
        window.removeEventListener(customEventName, handleCustomEvent);
        window.removeEventListener('storage', handleNativeStorageEvent);
      };
    }
  }, [customEventName, storageKeys, loadData, extractDataCallback, currentYearNumber]);

  return [data, setData];
}
