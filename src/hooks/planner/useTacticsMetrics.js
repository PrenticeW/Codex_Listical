/**
 * Tactics Metrics Hook
 * Manages tactics metrics (daily min/max bounds) with reactive updates
 */

import { useCallback } from 'react';
import { useYear } from '../../contexts/YearContext';
import {
  loadTacticsMetrics,
  TACTICS_METRICS_STORAGE_EVENT
} from '../../lib/tacticsMetricsStorage';
import useStorageSync from '../common/useStorageSync';

/**
 * Convert project weekly quotas array to Map
 * @param {Array} quotasArray - Array of quota objects
 * @returns {Map} Map of project label to weekly hours
 */
function buildQuotasMap(quotasArray) {
  const quotasMap = new Map();
  if (quotasArray && Array.isArray(quotasArray)) {
    quotasArray.forEach((quota) => {
      if (quota?.label && quota?.weeklyHours) {
        quotasMap.set(quota.label, quota.weeklyHours);
      }
    });
  }
  return quotasMap;
}

/**
 * Hook to load and sync tactics metrics (daily min/max bounds)
 * Automatically updates when TacticsPage saves new metrics or year changes
 *
 * @returns {Object} Tactics metrics data
 */
export default function useTacticsMetrics() {
  const { currentYear } = useYear();

  // Load daily bounds
  const loadDailyBounds = useCallback(() => {
    const metrics = loadTacticsMetrics(currentYear);
    return metrics?.dailyBounds || [];
  }, [currentYear]);

  const extractDailyBounds = useCallback((payload) => {
    return payload?.dailyBounds || [];
  }, []);

  const [dailyBounds] = useStorageSync({
    loadData: loadDailyBounds,
    customEventName: TACTICS_METRICS_STORAGE_EVENT,
    storageKeys: [`tactics-year-${currentYear}-metrics-state`, 'tactics-metrics-state'],
    extractData: extractDailyBounds,
    dependency: currentYear,
  });

  // Load project weekly quotas
  const loadQuotas = useCallback(() => {
    const metrics = loadTacticsMetrics(currentYear);
    return buildQuotasMap(metrics?.projectWeeklyQuotas);
  }, [currentYear]);

  const extractQuotas = useCallback((payload) => {
    return buildQuotasMap(payload?.projectWeeklyQuotas);
  }, []);

  const [projectWeeklyQuotas] = useStorageSync({
    loadData: loadQuotas,
    customEventName: TACTICS_METRICS_STORAGE_EVENT,
    storageKeys: [`tactics-year-${currentYear}-metrics-state`, 'tactics-metrics-state'],
    extractData: extractQuotas,
    dependency: currentYear,
  });

  return { dailyBounds, projectWeeklyQuotas };
}
