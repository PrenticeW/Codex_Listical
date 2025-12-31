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
 * });
 */
export default function useStorageSync({
  loadData,
  customEventName,
  storageKeys,
  extractData,
  dependency,
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
  }, [customEventName, storageKeys, loadData, extractDataCallback]);

  return [data, setData];
}
