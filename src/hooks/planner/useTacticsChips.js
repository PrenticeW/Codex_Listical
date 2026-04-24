/**
 * Tactics Chips Hook
 * Loads scheduled chips from Tactics storage and enriches them with
 * project nickname for use in the System page.
 */

import { useCallback } from 'react';
import { useYear } from '../../contexts/YearContext';
import {
  loadTacticsChipsState,
  loadTacticsSettings,
  TACTICS_CHIPS_STORAGE_EVENT,
} from '../../lib/tacticsStorage';
import { loadStagingState, STAGING_STORAGE_EVENT } from '../../lib/stagingStorage';
import useStorageSync from '../common/useStorageSync';

const SYSTEM_PROJECTS = new Set(['sleep', 'rest', 'buffer']);
const DAY_COLUMN_COUNT = 7;

/**
 * Estimate chip duration from row IDs when durationMinutes is not stored.
 * Each 'hour-*' and 'sleep-start' row counts as 60 min; 'sleep-end' and
 * 'trailing-*' rows each count as incrementMinutes.
 * Returns null when the row IDs can't be parsed.
 * @param {string} startRowId
 * @param {string} endRowId
 * @param {number} incrementMinutes
 * @returns {number|null}
 */
function estimateDurationFromRowIds(startRowId, endRowId, incrementMinutes) {
  if (!startRowId || !incrementMinutes) return null;
  const end = endRowId || startRowId;

  // Parse hour from a row id like 'hour-9', 'sleep-start' (≈ hour boundary), or 'sleep-end'/'trailing-N'
  const rowHour = (id) => {
    if (!id) return null;
    if (id === 'sleep-start') return -1; // treated as an hour row
    if (id.startsWith('hour-')) {
      const h = parseInt(id.slice(5), 10);
      return Number.isFinite(h) ? h : null;
    }
    return null; // sleep-end, trailing-N
  };

  const isHourRow = (id) => id === 'sleep-start' || (id && id.startsWith('hour-'));
  const isIncrRow = (id) => id === 'sleep-end' || (id && id.startsWith('trailing-'));

  if (startRowId === end) {
    // Single row
    return isHourRow(startRowId) ? 60 : incrementMinutes;
  }

  // Both hour rows — count spans between them
  const startH = rowHour(startRowId);
  const endH = rowHour(end);
  if (startH !== null && endH !== null) {
    // Hours wrap around midnight (0–23), distance = (endH - startH + 24) % 24 + 1
    const span = ((endH - startH + 24) % 24) + 1;
    return span * 60;
  }

  // start is hour row, end is incr row → at least 1 hour + incrementMinutes
  if (startH !== null && isIncrRow(end)) {
    return 60 + incrementMinutes;
  }

  // start is incr row
  if (isIncrRow(startRowId)) {
    if (isIncrRow(end)) {
      const si = parseInt(startRowId.startsWith('trailing-') ? startRowId.slice(9) : '0', 10);
      const ei = parseInt(end.startsWith('trailing-') ? end.slice(9) : '0', 10);
      const rows = Math.abs(ei - si) + 1;
      return rows * incrementMinutes;
    }
    return incrementMinutes;
  }

  return incrementMinutes; // fallback
}

/**
 * Format minutes as H:MM
 * @param {number} minutes
 * @returns {string}
 */
function formatDuration(minutes) {
  if (!Number.isFinite(minutes) || minutes <= 0) return null;
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  if (hours > 0 && remaining > 0) return `${hours} hour${hours !== 1 ? 's' : ''} ${remaining} minutes`;
  if (hours > 0) return `${hours} hour${hours !== 1 ? 's' : ''}`;
  return `${remaining} minutes`;
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
 * @param {Object|null} chipTimeOverrides
 * @param {number} incrementMinutes
 * @returns {Array}
 */
function enrichChips(projectChips, idToNicknameMap, chipTimeOverrides, incrementMinutes) {
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
      const storedMinutes = (chipTimeOverrides?.[chip.id] ?? chip.durationMinutes) ?? null;
      const durationMinutes = storedMinutes ?? estimateDurationFromRowIds(chip.startRowId, chip.endRowId, incrementMinutes);
      const formattedDuration = durationMinutes != null ? formatDuration(durationMinutes) : null;
      return { ...chip, projectNickname, durationMinutes, formattedDuration };
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
    const { projectChips, chipTimeOverrides } = loadTacticsChipsState(currentYear);
    const idToNicknameMap = buildProjectIdToNicknameMap(currentYear);
    const { incrementMinutes } = loadTacticsSettings();
    return enrichChips(projectChips, idToNicknameMap, chipTimeOverrides, incrementMinutes);
  }, [currentYear]);

  const extractChips = useCallback(
    (payload) => {
      const projectChips = payload?.projectChips ?? null;
      const chipTimeOverrides = payload?.chipTimeOverrides ?? null;
      const idToNicknameMap = buildProjectIdToNicknameMap(currentYear);
      const { incrementMinutes } = loadTacticsSettings();
      return enrichChips(projectChips, idToNicknameMap, chipTimeOverrides, incrementMinutes);
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
    currentYearNumber: currentYear, // H3: ignore chip events from other years
  });

  return { chips: chips ?? [] };
}
