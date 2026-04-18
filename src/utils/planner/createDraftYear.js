/**
 * Create Draft Year
 *
 * Initialises a new draft year (Year N+1) by copying data from the active year.
 * Called when the user presses "Plan Next Year".
 *
 * The active year (Year N) is left completely untouched — it remains writable.
 * No archive snapshot is needed here because Year N's storage keys are never
 * modified by this operation.
 */

import {
  createDraftYear as createDraftYearMetadata,
  getYearInfo,
  getDraftYear,
  calculateNextCycleStartDate,
  setCurrentYear,
} from '../../lib/yearMetadataStorage';
import {
  readStartDate,
  saveStartDate,
  readColumnSizing,
  saveColumnSizing,
  readSizeScale,
  saveSizeScale,
  readShowRecurring,
  saveShowRecurring,
  readShowSubprojects,
  saveShowSubprojects,
  readShowMaxMinRows,
  saveShowMaxMinRows,
  readSortStatuses,
  saveSortStatuses,
  readTotalDays,
  saveTotalDays,
  saveTaskRows,
  saveVisibleDayColumns,
} from './storage';
import { loadStagingState, saveStagingState } from '../../lib/stagingStorage';
import {
  loadTacticsMetrics,
  saveTacticsMetrics,
} from '../../lib/tacticsMetricsStorage';
import {
  loadTacticsChipsState,
  saveTacticsChipsState,
  loadTacticsSettings,
  saveTacticsSettings,
  loadTacticsColumnWidths,
  saveTacticsColumnWidths,
} from '../../lib/tacticsStorage';
// Note: task rows are no longer copied during draft creation.
// The System page starts blank; the user imports tasks via the Import Wizard
// after updating Goals and Plan for the new year.

const DEFAULT_PROJECT_ID = 'project-1';

/**
 * Create a draft year initialised from the current active year's data.
 * Switches the UI to the draft year when done.
 *
 * @param {number} activeYearNumber - The currently active year number
 * @returns {{ success: boolean, draftYear?: number, error?: string }}
 */
export async function createDraftYearFromActive(activeYearNumber) {
  try {
    // Guard: verify active year exists
    const yearInfo = getYearInfo(activeYearNumber);
    if (!yearInfo) {
      throw new Error(`Year ${activeYearNumber} does not exist`);
    }
    if (yearInfo.status !== 'active') {
      throw new Error(`Year ${activeYearNumber} is not active (status: ${yearInfo.status})`);
    }

    // Guard: prevent creating a second draft
    const existingDraft = getDraftYear();
    if (existingDraft) {
      throw new Error(`A draft year (Year ${existingDraft.yearNumber}) already exists`);
    }

    const draftYearNumber = activeYearNumber + 1;

    // --- Read active year data ---
    const startDate = readStartDate(DEFAULT_PROJECT_ID, activeYearNumber);
    const nextStartDate = calculateNextCycleStartDate(startDate);

    const columnSizing = readColumnSizing(DEFAULT_PROJECT_ID, activeYearNumber);
    const sizeScale = readSizeScale(DEFAULT_PROJECT_ID, activeYearNumber);
    const showRecurring = readShowRecurring(DEFAULT_PROJECT_ID, activeYearNumber);
    const showSubprojects = readShowSubprojects(DEFAULT_PROJECT_ID, activeYearNumber);
    const showMaxMinRows = readShowMaxMinRows(DEFAULT_PROJECT_ID, activeYearNumber);
    const sortStatuses = readSortStatuses(DEFAULT_PROJECT_ID, activeYearNumber);
    const totalDays = readTotalDays(DEFAULT_PROJECT_ID, activeYearNumber);

    const stagingState = loadStagingState(activeYearNumber);
    const tacticsMetrics = loadTacticsMetrics(activeYearNumber);
    const chipsState = loadTacticsChipsState(activeYearNumber);
    const tacticsSettings = loadTacticsSettings();
    const columnWidths = loadTacticsColumnWidths(activeYearNumber);

    // --- Create draft year metadata record ---
    createDraftYearMetadata(draftYearNumber, nextStartDate);

    // --- Copy planner UI settings ---
    saveColumnSizing(columnSizing, DEFAULT_PROJECT_ID, draftYearNumber);
    saveSizeScale(sizeScale, DEFAULT_PROJECT_ID, draftYearNumber);
    saveShowRecurring(showRecurring, DEFAULT_PROJECT_ID, draftYearNumber);
    saveShowSubprojects(showSubprojects, DEFAULT_PROJECT_ID, draftYearNumber);
    saveShowMaxMinRows(showMaxMinRows, DEFAULT_PROJECT_ID, draftYearNumber);
    saveSortStatuses(sortStatuses, DEFAULT_PROJECT_ID, draftYearNumber);
    saveTotalDays(totalDays, DEFAULT_PROJECT_ID, draftYearNumber);
    saveStartDate(nextStartDate, DEFAULT_PROJECT_ID, draftYearNumber);

    // All day columns visible in new year
    const freshVisibleDayColumns = {};
    for (let i = 0; i < totalDays; i++) {
      freshVisibleDayColumns[`day-${i}`] = true;
    }
    saveVisibleDayColumns(freshVisibleDayColumns, DEFAULT_PROJECT_ID, draftYearNumber);

    // Start with an empty System page — tasks are imported via the Import Wizard
    saveTaskRows([], DEFAULT_PROJECT_ID, draftYearNumber);

    // --- Copy Goal page (projects carry forward with full identity) ---
    saveStagingState(stagingState, draftYearNumber);

    // --- Copy Plan page (chips + metrics + settings carry forward) ---
    saveTacticsMetrics(tacticsMetrics, draftYearNumber);
    saveTacticsChipsState(chipsState, draftYearNumber);
    saveTacticsSettings(tacticsSettings);
    if (columnWidths) {
      saveTacticsColumnWidths(columnWidths, draftYearNumber);
    }

    // --- Switch UI to draft year ---
    setCurrentYear(draftYearNumber);

    return { success: true, draftYear: draftYearNumber };
  } catch (error) {
    return { success: false, error: error.message };
  }
}
