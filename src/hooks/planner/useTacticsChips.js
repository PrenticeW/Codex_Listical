/**
 * Tactics Chips Hook
 * Loads scheduled chips from Tactics storage and enriches them with
 * project nickname for use in the System page.
 */

import { useCallback } from 'react';
import { useYear } from '../../contexts/YearContext';
import {
  loadTacticsChipsState,
  TACTICS_CHIPS_STORAGE_EVENT,
} from '../../lib/tacticsStorage';
import { loadStagingState, STAGING_STORAGE_EVENT } from '../../lib/stagingStorage';
import useStorageSync from '../common/useStorageSync';

const SYSTEM_PROJECTS = new Set(['sleep', 'rest', 'buffer']);
const DAY_COLUMN_COUNT = 7;

/**
 * Format minutes as H:MM
 * @param {number} minutes
 * @returns {string}
 */
function formatDuration(minutes) {
  if (!Number.isFinite(minutes) || minutes <= 0) return null;
  const hours = Math.floor(minutes / 60);
  const remaining = Math.abs(minutes % 60);
  return `${hours}:${remaining.toString().padStart(2, '0')}`;
}

/**
 * Build a map from staging project id → projectNickname (or projectName)
 * @param {number|null} yearNumber
 * @returns {Map<string, string>}
 */
function buildProjectIdToNicknameMap(yearNumber) {
  const { shortlist } = loadStagingState(yearNumber);
  const map = new Map();
  if (!Array.isArray(shortlist)) return map;
  shortlist.forEach((item) => {
    if (!item?.id) return;
    const nickname = (item.projectNickname || '').trim();
    const name = (item.projectName || '').trim();
    map.set(item.id, nickname || name);
  });
  return map;
}

/**
 * Enrich chips: filter to day-column project chips and add projectNickname + formattedDuration
 * @param {Array} projectChips
 * @param {Map} idToNicknameMap
 * @returns {Array}
 */
function enrichChips(projectChips, idToNicknameMap) {
  if (!Array.isArray(projectChips)) return [];
  return projectChips
    .filter((chip) => {
      if (!chip) return false;
      if (SYSTEM_PROJECTS.has(chip.projectId)) return false;
      if (chip.columnIndex >= DAY_COLUMN_COUNT) return false;
      if (!chip.dayName) return false;
      return true;
    })
    .map((chip) => {
      const projectNickname = idToNicknameMap.get(chip.projectId) || null;
      const durationMinutes = chip.durationMinutes ?? null;
      const formattedDuration = durationMinutes != null ? formatDuration(durationMinutes) : null;
      return { ...chip, projectNickname, formattedDuration };
    });
}

/**
 * Hook to load and sync tactics chips for use in the System page.
 * Returns an array of enriched chip objects with:
 *   - projectNickname: matches the key used in System page rows
 *   - formattedDuration: "H:MM" string (null if unknown)
 *   - displayLabel: chip label from Tactics (may be null)
 *   - dayName: day of week string
 *
 * @returns {{ chips: Array }}
 */
export default function useTacticsChips() {
  const { currentYear } = useYear();

  const loadChips = useCallback(() => {
    const { projectChips } = loadTacticsChipsState(currentYear);
    const idToNicknameMap = buildProjectIdToNicknameMap(currentYear);
    return enrichChips(projectChips, idToNicknameMap);
  }, [currentYear]);

  const extractChips = useCallback(
    (payload) => {
      const projectChips = payload?.projectChips ?? null;
      const idToNicknameMap = buildProjectIdToNicknameMap(currentYear);
      return enrichChips(projectChips, idToNicknameMap);
    },
    [currentYear]
  );

  const [chips] = useStorageSync({
    loadData: loadChips,
    customEventName: TACTICS_CHIPS_STORAGE_EVENT,
    storageKeys: [
      `tactics-year-${currentYear}-chips-state`,
      'tactics-chips-state',
    ],
    extractData: extractChips,
    dependency: currentYear,
  });

  return { chips: chips ?? [] };
}
