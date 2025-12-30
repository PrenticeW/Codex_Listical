/**
 * Year Metadata Storage
 *
 * Manages year-level metadata for the cycle-based planning system.
 * Each "year" represents a complete 12-week planning cycle.
 */

import storage from './storageService';

const YEAR_METADATA_KEY = 'app-year-metadata';

/**
 * @typedef {Object} YearInfo
 * @property {number} yearNumber - The year number (1, 2, 3, etc.)
 * @property {'active' | 'archived'} status - Current status of the year
 * @property {string} startDate - ISO date string (YYYY-MM-DD)
 * @property {string|null} endDate - ISO date string when archived, null if active
 * @property {string|null} archivedAt - ISO timestamp when archived
 * @property {number} totalWeeksCompleted - Number of weeks completed (0-12)
 * @property {number} totalHoursCompleted - Total hours of work completed
 */

/**
 * @typedef {Object} YearMetadata
 * @property {number} currentYear - The currently active year number
 * @property {YearInfo[]} years - Array of all years
 */

/**
 * Read year metadata from storage
 * @returns {YearMetadata|null}
 */
export function readYearMetadata() {
  try {
    return storage.getJSON(YEAR_METADATA_KEY, null);
  } catch (error) {
    console.error('Failed to read year metadata:', error);
    return null;
  }
}

/**
 * Write year metadata to storage
 * @param {YearMetadata} metadata
 */
export function saveYearMetadata(metadata) {
  try {
    storage.setJSON(YEAR_METADATA_KEY, metadata);

    // Dispatch custom event for cross-tab sync
    if (typeof window !== 'undefined' && typeof CustomEvent === 'function') {
      window.dispatchEvent(new CustomEvent('yearMetadataStorage', {
        detail: metadata
      }));
    }
  } catch (error) {
    console.error('Failed to save year metadata:', error);
  }
}

/**
 * Initialize year metadata for first-time users
 * @param {string} startDate - Start date for Year 1 (YYYY-MM-DD)
 * @returns {YearMetadata}
 */
export function initializeYearMetadata(startDate) {
  const metadata = {
    currentYear: 1,
    years: [
      {
        yearNumber: 1,
        status: 'active',
        startDate: startDate,
        endDate: null,
        archivedAt: null,
        totalWeeksCompleted: 0,
        totalHoursCompleted: 0
      }
    ]
  };

  saveYearMetadata(metadata);
  return metadata;
}

/**
 * Get the current active year number
 * @returns {number}
 */
export function getCurrentYear() {
  const metadata = readYearMetadata();
  return metadata ? metadata.currentYear : 1;
}

/**
 * Get information about a specific year
 * @param {number} yearNumber
 * @returns {YearInfo|null}
 */
export function getYearInfo(yearNumber) {
  const metadata = readYearMetadata();
  if (!metadata) return null;

  return metadata.years.find(y => y.yearNumber === yearNumber) || null;
}

/**
 * Get all years sorted by year number
 * @returns {YearInfo[]}
 */
export function getAllYears() {
  const metadata = readYearMetadata();
  if (!metadata) return [];

  return [...metadata.years].sort((a, b) => a.yearNumber - b.yearNumber);
}

/**
 * Get the active year info
 * @returns {YearInfo|null}
 */
export function getActiveYear() {
  const metadata = readYearMetadata();
  if (!metadata) return null;

  return metadata.years.find(y => y.status === 'active') || null;
}

/**
 * Get all archived years
 * @returns {YearInfo[]}
 */
export function getArchivedYears() {
  const metadata = readYearMetadata();
  if (!metadata) return [];

  return metadata.years
    .filter(y => y.status === 'archived')
    .sort((a, b) => b.yearNumber - a.yearNumber); // Most recent first
}

/**
 * Update specific year info
 * @param {number} yearNumber
 * @param {Partial<YearInfo>} updates
 */
export function updateYearInfo(yearNumber, updates) {
  const metadata = readYearMetadata();
  if (!metadata) return;

  const yearIndex = metadata.years.findIndex(y => y.yearNumber === yearNumber);
  if (yearIndex === -1) return;

  metadata.years[yearIndex] = {
    ...metadata.years[yearIndex],
    ...updates
  };

  saveYearMetadata(metadata);
}

/**
 * Set the current active year
 * @param {number} yearNumber
 */
export function setCurrentYear(yearNumber) {
  const metadata = readYearMetadata();
  if (!metadata) return;

  metadata.currentYear = yearNumber;
  saveYearMetadata(metadata);
}

/**
 * Create a new year
 * @param {number} yearNumber
 * @param {string} startDate - Start date (YYYY-MM-DD)
 * @returns {YearInfo}
 */
export function createNewYear(yearNumber, startDate) {
  const metadata = readYearMetadata();
  if (!metadata) return null;

  const newYear = {
    yearNumber,
    status: 'active',
    startDate,
    endDate: null,
    archivedAt: null,
    totalWeeksCompleted: 0,
    totalHoursCompleted: 0
  };

  metadata.years.push(newYear);
  saveYearMetadata(metadata);

  return newYear;
}

/**
 * Archive a year
 * @param {number} yearNumber
 * @param {Object} stats
 * @param {number} stats.totalWeeksCompleted
 * @param {number} stats.totalHoursCompleted
 */
export function archiveYear(yearNumber, stats) {
  const now = new Date().toISOString();
  const today = now.split('T')[0]; // YYYY-MM-DD

  updateYearInfo(yearNumber, {
    status: 'archived',
    endDate: today,
    archivedAt: now,
    totalWeeksCompleted: stats.totalWeeksCompleted,
    totalHoursCompleted: stats.totalHoursCompleted
  });
}

/**
 * Check if a year exists
 * @param {number} yearNumber
 * @returns {boolean}
 */
export function yearExists(yearNumber) {
  return getYearInfo(yearNumber) !== null;
}

/**
 * Calculate the end date for a 12-week cycle
 * @param {string} startDate - Start date (YYYY-MM-DD)
 * @returns {string} End date (YYYY-MM-DD)
 */
export function calculateCycleEndDate(startDate) {
  const date = new Date(startDate);
  date.setDate(date.getDate() + (12 * 7) - 1); // 12 weeks minus 1 day
  return date.toISOString().split('T')[0];
}

/**
 * Calculate the next cycle start date (day after previous cycle ends)
 * @param {string} previousStartDate - Previous cycle start date (YYYY-MM-DD)
 * @returns {string} Next start date (YYYY-MM-DD)
 */
export function calculateNextCycleStartDate(previousStartDate) {
  const date = new Date(previousStartDate);
  date.setDate(date.getDate() + (12 * 7)); // Exactly 12 weeks later
  return date.toISOString().split('T')[0];
}
