/**
 * Generic Storage Sync Hook
 * Handles both custom storage events and native cross-tab storage events
 *
 * This hook consolidates the pattern of listening to custom storage events
 * (same-page updates) and native storage events (cross-tab sync).
 */

import { useState, useEffect, useCallback } from 'react';

/**
 * Synchronizes state with storage events
 *
 * @param {Object} options - Configuration options
 * @param {Function} options.loadData - Function to load initial data
 * @param {string} options.customEventName - Custom event name to listen to
 * @param {string|string[]} options.storageKeys - Storage key(s) to watch for cross-tab sync
 * @param {Function} options.extractData - Function to extract data from event payload
 * @param {*} options.dependency - Dependency to trigger reload (e.g., currentYear)
 * @param {number|null} [options.currentYearNumber] - If provided, custom events
 *   whose detail.__eventYear does not match this value are ignored. Guards
 *   against cross-year event collisions (H3). Events without __eventYear fall
 *   through unchanged for backwards compatibility.
 *
 * @returns {Array} [data, setData] tuple
 *
 * @example
 * const [dailyBounds, setDailyBounds] = useStorageSync({
 *   loadData: () => loadTacticsMetrics(currentYear)?.dailyBounds || [],
 *   customEventName: TACTICS_METRICS_STORAGE_EVENT,
 *   storageKeys: [`tactics-year-${currentYear}-metrics-state`, 'tactics-metrics-state'],
 *   extractData: (payload) => payload?.dailyBounds || [],
 *   dependency: currentYear,
 *   currentYearNumber: currentYear,
 * });
 */
export default function useStorageSync({
  loadData,
  customEventName,
  storageKeys,
  extractData,
  dependency,
  currentYearNumber,
}) {
  const [data, setData] = useState(loadData);

  // Reload when dependency changes
  useEffect(() => {
    setData(loadData());
  }, [dependency, loadData]);

  // Memoize the data extraction function
  const extractDataCallback = useCallback(extractData, [extractData]);

  // Listen for storage events (both custom and native)
  useEffect(() => {
    const handleCustomEvent = (event) => {
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
      const payload = event.detail || loadData();
      setData(extractDataCallback(payload));
    };

    const handleNativeStorageEvent = (e) => {
      // Check if the changed key matches any of our expected keys
      const keys = Array.isArray(storageKeys) ? storageKeys : [storageKeys];
      if (keys.includes(e.key)) {
        setData(loadData());
      }
    };

    if (typeof window !== 'undefined') {
      // Listen to custom event for same-page updates
      window.addEventListener(customEventName, handleCustomEvent);

      // Listen to native storage event for cross-tab updates
      window.addEventListener('storage', handleNativeStorageEvent);

      return () => {
        window.removeEventListener(customEventName, handleCustomEvent);
        window.removeEventListener('storage', handleNativeStorageEvent);
      };
    }
  }, [customEventName, storageKeys, loadData, extractDataCallback, currentYearNumber]);

  return [data, setData];
}
