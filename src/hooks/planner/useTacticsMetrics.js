/**
 * Tactics Metrics Hook
 * Manages tactics metrics (daily min/max bounds) with reactive updates
 */

import { useState, useEffect } from 'react';
import { useYear } from '../../contexts/YearContext';
import {
  loadTacticsMetrics,
  TACTICS_METRICS_STORAGE_EVENT
} from '../../lib/tacticsMetricsStorage';

/**
 * Hook to load and sync tactics metrics (daily min/max bounds)
 * Automatically updates when TacticsPage saves new metrics or year changes
 *
 * @returns {Object} Tactics metrics data
 */
export default function useTacticsMetrics() {
  const { currentYear } = useYear();

  const [dailyBounds, setDailyBounds] = useState(() => {
    const metrics = loadTacticsMetrics(currentYear);
    return metrics?.dailyBounds || [];
  });

  const [projectWeeklyQuotas, setProjectWeeklyQuotas] = useState(() => {
    const metrics = loadTacticsMetrics(currentYear);
    const quotasMap = new Map();

    if (metrics?.projectWeeklyQuotas && Array.isArray(metrics.projectWeeklyQuotas)) {
      metrics.projectWeeklyQuotas.forEach((quota) => {
        if (quota?.label && quota?.weeklyHours) {
          quotasMap.set(quota.label, quota.weeklyHours);
        }
      });
    }

    return quotasMap;
  });

  // Reload when year changes
  useEffect(() => {
    const metrics = loadTacticsMetrics(currentYear);
    setDailyBounds(metrics?.dailyBounds || []);

    const quotasMap = new Map();
    if (metrics?.projectWeeklyQuotas && Array.isArray(metrics.projectWeeklyQuotas)) {
      metrics.projectWeeklyQuotas.forEach((quota) => {
        if (quota?.label && quota?.weeklyHours) {
          quotasMap.set(quota.label, quota.weeklyHours);
        }
      });
    }
    setProjectWeeklyQuotas(quotasMap);
  }, [currentYear]);

  useEffect(() => {
    const handleMetricsUpdate = (event) => {
      // event.detail contains the full payload from saveTacticsMetrics
      const payload = event.detail || loadTacticsMetrics(currentYear);
      setDailyBounds(payload?.dailyBounds || []);

      // Update project weekly quotas
      const quotasMap = new Map();
      if (payload?.projectWeeklyQuotas && Array.isArray(payload.projectWeeklyQuotas)) {
        payload.projectWeeklyQuotas.forEach((quota) => {
          if (quota?.label && quota?.weeklyHours) {
            quotasMap.set(quota.label, quota.weeklyHours);
          }
        });
      }
      setProjectWeeklyQuotas(quotasMap);
    };

    const handleStorageEvent = (e) => {
      // Handle cross-tab sync via native storage event
      // Check if the key matches the current year's key
      const expectedKey = `tactics-year-${currentYear}-metrics-state`;
      if (e.key === expectedKey || e.key === 'tactics-metrics-state') {
        const metrics = loadTacticsMetrics(currentYear);
        setDailyBounds(metrics?.dailyBounds || []);

        // Update project weekly quotas
        const quotasMap = new Map();
        if (metrics?.projectWeeklyQuotas && Array.isArray(metrics.projectWeeklyQuotas)) {
          metrics.projectWeeklyQuotas.forEach((quota) => {
            if (quota?.label && quota?.weeklyHours) {
              quotasMap.set(quota.label, quota.weeklyHours);
            }
          });
        }
        setProjectWeeklyQuotas(quotasMap);
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
  }, [currentYear]);

  return { dailyBounds, projectWeeklyQuotas };
}
