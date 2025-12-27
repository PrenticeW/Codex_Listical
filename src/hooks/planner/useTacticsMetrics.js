/**
 * Tactics Metrics Hook
 * Manages tactics metrics (daily min/max bounds) with reactive updates
 */

import { useState, useEffect } from 'react';
import {
  loadTacticsMetrics,
  TACTICS_METRICS_STORAGE_EVENT
} from '../../lib/tacticsMetricsStorage';

/**
 * Hook to load and sync tactics metrics (daily min/max bounds)
 * Automatically updates when TacticsPage saves new metrics
 *
 * @returns {Object} Tactics metrics data
 */
export default function useTacticsMetrics() {
  const [dailyBounds, setDailyBounds] = useState(() => {
    const metrics = loadTacticsMetrics();
    return metrics?.dailyBounds || [];
  });

  useEffect(() => {
    const handleMetricsUpdate = (event) => {
      // event.detail contains the full payload from saveTacticsMetrics
      const payload = event.detail || loadTacticsMetrics();
      setDailyBounds(payload?.dailyBounds || []);
    };

    const handleStorageEvent = (e) => {
      // Handle cross-tab sync via native storage event
      if (e.key === 'tactics-metrics-state') {
        const metrics = loadTacticsMetrics();
        setDailyBounds(metrics?.dailyBounds || []);
      }
    };

    if (typeof window !== 'undefined') {
      // Listen to custom event for same-page updates
      window.addEventListener(TACTICS_METRICS_STORAGE_EVENT, handleMetricsUpdate);

      // Listen to native storage event for cross-tab updates
      window.addEventListener('storage', handleStorageEvent);

      return () => {
        window.removeEventListener(TACTICS_METRICS_STORAGE_EVENT, handleMetricsUpdate);
        window.removeEventListener('storage', handleStorageEvent);
      };
    }
  }, []);

  return { dailyBounds };
}
