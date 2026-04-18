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
  defineRowMetadata,
  PLAN_TABLE_COLS,
} from '../staging/planTableHelpers';
import { SECTION_CONFIG } from '../staging/sectionConfig';
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
  saveSentChipsSnapshot,
} from '../../lib/tacticsStorage';
// Note: task rows are no longer copied during draft creation.
// The System page starts blank; the user imports tasks via the Import Wizard
// after updating Goals and Plan for the new year.

const DEFAULT_PROJECT_ID = 'project-1';

// --- Row helpers (mirrors useShortlistState.js createSimpleTable logic) ---

const ROW_TYPE = { HEADER: 'header', PROMPT: 'prompt', RESPONSE: 'response', DATA: 'data' };

const makeRow = (firstCell = '', rowType = ROW_TYPE.DATA, sectionType = null) => {
  const row = Array.from({ length: PLAN_TABLE_COLS }, (_, i) => (i === 0 ? firstCell : ''));
  return defineRowMetadata(row, { rowType, sectionType });
};

const makePromptRow = (text) => {
  const row = Array.from({ length: PLAN_TABLE_COLS }, (_, i) => (i === 1 ? text : ''));
  return defineRowMetadata(row, { rowType: ROW_TYPE.PROMPT });
};

const makeResponseRow = (placeholder = '') => {
  const row = Array.from({ length: PLAN_TABLE_COLS }, (_, i) => (i === 2 ? placeholder : ''));
  return defineRowMetadata(row, { rowType: ROW_TYPE.RESPONSE });
};

const makeSchedulePromptRow = (text) => {
  const row = Array.from({ length: PLAN_TABLE_COLS }, (_, i) => (i === 2 ? text : ''));
  return defineRowMetadata(row, { rowType: ROW_TYPE.PROMPT });
};

/**
 * Extract existing subproject data rows from the item's plan table entries.
 * Returns an array of cloned response/data rows from the Subprojects section
 * that have non-empty content.
 */
const extractSubprojectRows = (item) => {
  if (!Array.isArray(item.planTableEntries)) return [];

  let inSubprojects = false;
  const rows = [];

  for (const row of item.planTableEntries) {
    if (row?.__rowType === 'header') {
      inSubprojects = row.__sectionType === 'Subprojects';
      continue;
    }
    if (inSubprojects && row?.__rowType !== 'prompt') {
      // Keep rows that have content in any cell
      const hasContent = row.some((cell, i) => i > 0 && cell && cell.trim());
      if (hasContent) {
        const clone = [...row];
        defineRowMetadata(clone, {
          rowType: row.__rowType,
          pairId: row.__pairId,
          sectionType: row.__sectionType,
          isTotalRow: row.__isTotalRow,
        });
        rows.push(clone);
      }
    }
  }

  return rows;
};

/**
 * Reset a staging item for the draft year.
 * Keeps: id, projectName, projectNickname, color, subareas (subprojects).
 * Clears: reasons, outcomes, actions, tagline, schedule items — all reset to defaults.
 */
const resetItemForDraft = (item) => {
  const existingSubprojects = extractSubprojectRows(item);

  // Build fresh simple table with subprojects carried over
  const rows = [
    // Reasons section — empty
    makeRow(SECTION_CONFIG.Reasons.header, ROW_TYPE.HEADER, 'Reasons'),
    makePromptRow(SECTION_CONFIG.Reasons.prompt),
    makeRow('', ROW_TYPE.DATA),
    // Outcomes section — empty
    makeRow(SECTION_CONFIG.Outcomes.header, ROW_TYPE.HEADER, 'Outcomes'),
    makePromptRow(SECTION_CONFIG.Outcomes.prompt),
    makeResponseRow(SECTION_CONFIG.Outcomes.placeholder),
    makeRow('', ROW_TYPE.DATA),
    // Actions section — empty
    makeRow(SECTION_CONFIG.Actions.header, ROW_TYPE.HEADER, 'Actions'),
    makePromptRow(SECTION_CONFIG.Actions.prompt),
    makeResponseRow(SECTION_CONFIG.Actions.placeholder),
    makeRow('', ROW_TYPE.DATA),
    // Subprojects section — carry over existing subareas
    makeRow(SECTION_CONFIG.Subprojects.header, ROW_TYPE.HEADER, 'Subprojects'),
    makePromptRow(SECTION_CONFIG.Subprojects.prompt),
    ...(existingSubprojects.length > 0 ? existingSubprojects : [makeRow('', ROW_TYPE.DATA)]),
    // Schedule section — empty
    makeRow(SECTION_CONFIG.Schedule.header, ROW_TYPE.HEADER, 'Schedule'),
    makeSchedulePromptRow(SECTION_CONFIG.Schedule.prompt),
    makeRow('', ROW_TYPE.DATA),
  ];

  return {
    id: item.id,
    text: item.text,
    projectName: item.projectName,
    projectNickname: item.projectNickname,
    color: item.color,
    projectTagline: '',
    planTableVisible: true,
    planTableCollapsed: true,
    hasPlan: true,
    addedToPlan: false,
    planTableEntries: rows,
    planReasonRowCount: 0,
    planOutcomeRowCount: 0,
    planOutcomeQuestionRowCount: 0,
    planNeedsQuestionRowCount: 0,
    planNeedsPlanRowCount: 0,
    planSubprojectRowCount: 0,
    planXxxRowCount: 0,
    isSimpleTable: true,
  };
};

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

    // --- Copy Goal page (keep identity + subareas, reset template answers) ---
    const draftStagingState = {
      shortlist: (stagingState.shortlist || []).map(resetItemForDraft),
      archived: stagingState.archived || [],
    };
    saveStagingState(draftStagingState, draftYearNumber);

    // --- Copy Plan page (metrics + settings carry forward) ---
    saveTacticsMetrics(tacticsMetrics, draftYearNumber);
    // Strip project and schedule chips — only keep sleep, rest, buffer, and
    // custom chips. Project chips reference staging projects whose addedToPlan
    // has been reset to false, so carrying them forward would show stale chips
    // on the draft Plan page.
    const KEEP_PROJECT_IDS = new Set(['sleep', 'rest', 'buffer']);
    const draftChipsState = { ...chipsState };
    if (Array.isArray(draftChipsState.projectChips)) {
      draftChipsState.projectChips = draftChipsState.projectChips.filter(
        (chip) => {
          const pid = chip.projectId;
          return KEEP_PROJECT_IDS.has(pid) ||
            (typeof pid === 'string' && pid.startsWith('custom-'));
        }
      );
    }
    saveTacticsChipsState(draftChipsState, draftYearNumber);
    saveTacticsSettings(tacticsSettings);
    if (columnWidths) {
      saveTacticsColumnWidths(columnWidths, draftYearNumber);
    }

    // Clear any stale "sent to system" data for this year number — prevents
    // outdated chip subheaders from appearing on the draft System page if a
    // previous draft with the same number was undone without full cleanup.
    saveSentChipsSnapshot({ projectChips: null, customProjects: null, chipTimeOverrides: null }, draftYearNumber);
    try {
      localStorage.removeItem(`tactics-year-${draftYearNumber}-send-to-system-ts`);
    } catch {
      // Best effort
    }

    // --- Switch UI to draft year ---
    setCurrentYear(draftYearNumber);

    return { success: true, draftYear: draftYearNumber };
  } catch (error) {
    return { success: false, error: error.message };
  }
}
