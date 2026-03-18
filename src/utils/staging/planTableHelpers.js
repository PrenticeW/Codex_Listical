/**
 * Plan table helper utilities and constants
 */

import { getRowPairId } from './rowPairing';

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

/**
 * @typedef {Array<string> & RowMetadata} RowArray
 * A plan table row represented as an array of string values with optional
 * non-enumerable metadata properties for row type, pairing, and section info.
 */

/**
 * @typedef {Object} RowMetadata
 * @property {('header'|'prompt'|'response'|'data')} [__rowType] - Type of row
 * @property {string} [__pairId] - Unique ID linking prompt/response row pairs
 * @property {string} [__sectionType] - Section type for header rows (Reasons, Outcomes, Actions, Schedule, Subprojects)
 * @property {boolean} [__isTotalRow] - Whether this row displays totals
 */

/**
 * @typedef {Object} StagingItem
 * @property {string} id - Unique identifier for the item
 * @property {string} text - Original input text
 * @property {string} [projectName] - Display name for the project
 * @property {string} [projectNickname] - Short nickname (uppercase)
 * @property {string} [color] - Project color (hex or HSL)
 * @property {boolean} planTableVisible - Whether plan table is shown
 * @property {boolean} planTableCollapsed - Whether plan table is collapsed
 * @property {boolean} [hasPlan] - Whether item has a plan
 * @property {RowArray[]} planTableEntries - Array of row arrays
 * @property {boolean} [addedToPlan] - Whether item is added to scheduling plan
 * @property {boolean} [showOutcomeTotals] - Whether to show outcome totals
 * @property {boolean} [isSimpleTable] - Whether using simple table format
 * @property {number} [planReasonRowCount] - Number of reason rows
 * @property {number} [planOutcomeRowCount] - Number of outcome rows
 * @property {number} [planOutcomeQuestionRowCount] - Number of question rows
 * @property {number} [planNeedsQuestionRowCount] - Number of needs question rows
 * @property {number} [planNeedsPlanRowCount] - Number of needs plan rows
 * @property {number} [planSubprojectRowCount] - Number of schedule rows
 * @property {number} [planXxxRowCount] - Number of subproject rows
 */

/**
 * @typedef {Object} StagingState
 * @property {StagingItem[]} shortlist - Active items in the shortlist
 * @property {StagingItem[]} archived - Archived items
 */

/**
 * @typedef {Object} PlanModalState
 * @property {boolean} open - Whether modal is open
 * @property {string|null} itemId - ID of item being edited
 * @property {string} projectName - Project name in modal
 * @property {string} projectNickname - Project nickname in modal
 * @property {string|null} color - Project color in modal
 */

/**
 * @typedef {Object} Command
 * @property {Function} execute - Execute the command
 * @property {Function} undo - Undo the command
 */

/**
 * @typedef {Object} SectionBoundaries
 * @property {number} reasonCount - Number of reason rows
 * @property {number} outcomeCount - Number of outcome rows
 * @property {number} questionCount - Number of question rows
 * @property {number} needsQuestionCount - Number of needs question rows
 * @property {number} needsPlanCount - Number of needs plan rows
 * @property {number} scheduleCount - Number of schedule rows
 * @property {number} subprojectCount - Number of subproject rows
 * @property {number} reasonRowLimit - End of reasons section
 * @property {number} outcomeHeadingRow - Outcome section header row
 * @property {number} outcomePromptStart - First outcome prompt row
 * @property {number} outcomePromptEnd - Last outcome prompt row
 * @property {number} questionPromptStart - First question prompt row
 * @property {number} questionPromptEnd - Last question prompt row
 * @property {number} needsHeadingRow - Needs section header row
 * @property {number} needsQuestionStart - First needs question row
 * @property {number} needsQuestionEnd - Last needs question row
 * @property {number} needsPlanStart - First needs plan row
 * @property {number} needsPlanEnd - Last needs plan row
 * @property {number} scheduleHeadingRow - Schedule section header row
 * @property {number} schedulePromptRow - Schedule prompt row
 * @property {number} scheduleStart - First schedule data row
 * @property {number} scheduleEnd - Last schedule data row
 * @property {number} subprojectsHeadingRow - Subprojects section header row
 * @property {number} subprojectsPromptRow - Subprojects prompt row
 * @property {number} subprojectStart - First subproject data row
 * @property {number} subprojectEnd - Last subproject data row
 */

// =============================================================================
// CONSTANTS
// =============================================================================

export const PLAN_TABLE_ROWS = 15;
export const PLAN_TABLE_COLS = 6;

/**
 * Column index constants for plan table rows.
 * Eliminates magic numbers like row[4] or row[5] throughout the codebase.
 */
export const COL = {
  DRAG_HANDLE: 0,  // Drag handle / row indicator
  LABEL: 1,        // Label/prompt text (for prompt rows)
  CONTENT: 2,      // Main content/response text
  DETAIL: 3,       // Additional detail column
  ESTIMATE: 4,     // Time estimate (dropdown selection)
  TIME_VALUE: 5,   // Time value (H.MM format)
};

/**
 * Define non-enumerable metadata properties on a row array.
 * Consolidates the repeated Object.defineProperty pattern used throughout the codebase.
 *
 * @param {Array} row - The row array to add metadata to
 * @param {Object} metadata - Metadata values to set
 * @param {string} [metadata.rowType] - Row type (header, prompt, response, data)
 * @param {string} [metadata.pairId] - Pair ID for linked prompt/response rows
 * @param {string} [metadata.sectionType] - Section type for header rows (Reasons, Outcomes, etc.)
 * @param {boolean} [metadata.isTotalRow] - Whether this is a total row
 * @returns {Array} The same row array with metadata properties added
 */
export const defineRowMetadata = (row, { rowType, pairId, sectionType, isTotalRow } = {}) => {
  if (rowType !== undefined) {
    Object.defineProperty(row, '__rowType', {
      value: rowType,
      writable: true,
      configurable: true,
      enumerable: false,
    });
  }
  if (pairId !== undefined) {
    Object.defineProperty(row, '__pairId', {
      value: pairId,
      writable: true,
      configurable: true,
      enumerable: false,
    });
  }
  if (sectionType !== undefined) {
    Object.defineProperty(row, '__sectionType', {
      value: sectionType,
      writable: true,
      configurable: true,
      enumerable: false,
    });
  }
  if (isTotalRow !== undefined) {
    Object.defineProperty(row, '__isTotalRow', {
      value: isTotalRow,
      writable: true,
      configurable: true,
      enumerable: false,
    });
  }
  return row;
};

export const COLOR_SWATCH_HUES = [0, 28, 45, 90, 150, 210, 270, 300];
export const COLOR_SWATCH_LIGHTNESS = [40, 50, 60, 70];
export const COLOR_SATURATION = 75;

export const COLOR_PALETTE = COLOR_SWATCH_HUES.flatMap((hue) =>
  COLOR_SWATCH_LIGHTNESS.map(
    (lightness) => `hsl(${hue}, ${COLOR_SATURATION}%, ${lightness}%)`
  )
);

export const PLAN_ESTIMATE_OPTIONS = [
  '-',
  'Custom',
  '1 Minute',
  ...Array.from({ length: 11 }, (_, i) => `${(i + 1) * 5} Minutes`),
  ...[1, 2, 3, 4, 5, 6, 7, 8].map((h) => `${h} Hour${h > 1 ? 's' : ''}`),
];

/**
 * Parse estimate label to minutes
 */
export const parseEstimateLabelToMinutes = (label) => {
  if (!label || label === '-' || label === 'Custom') return null;
  const minuteMatch = label.match(/^(\d+)\s+Minute/);
  if (minuteMatch) {
    return parseInt(minuteMatch[1], 10);
  }
  const hourMatch = label.match(/^(\d+)\s+Hour/);
  if (hourMatch) {
    return parseInt(hourMatch[1], 10) * 60;
  }
  return null;
};

/**
 * Format minutes to H.MM format
 */
export const formatMinutesToHHmm = (minutes) => {
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hrs}.${mins.toString().padStart(2, '0')}`;
};

/**
 * Convert minutes to estimate label (or 'Custom' if no match)
 */
export const minutesToEstimateLabel = (minutes) => {
  if (minutes == null || minutes === 0) return '-';
  if (minutes === 1) return '1 Minute';
  if (minutes < 60 && minutes % 5 === 0 && minutes >= 5 && minutes <= 55) {
    return `${minutes} Minutes`;
  }
  if (minutes >= 60 && minutes % 60 === 0) {
    const hours = minutes / 60;
    if (hours >= 1 && hours <= 8) {
      return `${hours} Hour${hours > 1 ? 's' : ''}`;
    }
  }
  return 'Custom';
};

/**
 * Parse time value string (H.MM format) to minutes
 */
export const parseTimeValueToMinutes = (value) => {
  if (value == null) return 0;
  const stringValue = typeof value === 'string' ? value : String(value);
  const trimmed = stringValue.trim();
  if (!trimmed) return 0;
  const [hrsPart, minsPart = '0'] = trimmed.split('.');
  const hours = parseInt(hrsPart, 10);
  const minutes = parseInt(minsPart.padEnd(2, '0').slice(0, 2), 10);
  if (Number.isNaN(hours)) return 0;
  const safeMinutes = Number.isNaN(minutes) ? 0 : Math.min(Math.max(minutes, 0), 59);
  return hours * 60 + safeMinutes;
};

/**
 * Clone a single row while preserving non-enumerable metadata
 */
export const cloneRowWithMetadata = (row) => {
  if (!Array.isArray(row)) return row;
  const newRow = [...row];
  return defineRowMetadata(newRow, {
    rowType: row['__rowType'],
    pairId: row['__pairId'],
    sectionType: row['__sectionType'],
    isTotalRow: row['__isTotalRow'],
  });
};

/**
 * Deep clone staging state while preserving row metadata (__rowType, __pairId)
 * Use this instead of JSON.parse(JSON.stringify()) for undo/redo state capture
 */
export const cloneStagingState = (state) => {
  if (!state) return state;
  return {
    ...state,
    shortlist: state.shortlist?.map((item) => ({
      ...item,
      planTableEntries: item.planTableEntries?.map(cloneRowWithMetadata) || [],
    })) || [],
    archived: state.archived?.map((item) => ({
      ...item,
      planTableEntries: item.planTableEntries?.map(cloneRowWithMetadata) || [],
    })) || [],
  };
};

/**
 * Clone plan table entries with row count normalization
 */
export const clonePlanTableEntries = (entries, ensureRows = PLAN_TABLE_ROWS) => {
  const source = Array.isArray(entries) ? entries : [];
  const rowCount = Math.max(source.length, ensureRows);
  const normalized = [];

  for (let row = 0; row < rowCount; row += 1) {
    const sourceRow = Array.isArray(source[row]) ? source[row] : [];
    const nextRow = [];
    for (let col = 0; col < PLAN_TABLE_COLS; col += 1) {
      const value = sourceRow[col];
      nextRow.push(typeof value === 'string' ? value : '');
    }

    // Preserve row metadata
    if (sourceRow) {
      defineRowMetadata(nextRow, {
        rowType: sourceRow['__rowType'],
        pairId: sourceRow['__pairId'],
        sectionType: sourceRow['__sectionType'],
        isTotalRow: sourceRow['__isTotalRow'],
      });
    }

    normalized.push(nextRow);
  }
  return normalized;
};

/**
 * Build project plan summary from item data
 */
/**
 * Calculate totals for measurable outcome rows by summing action time values
 * that follow each prompt row in the Actions section.
 * Returns a Map of rowIndex -> totalMinutes for each prompt row in Actions section
 */
export const calculateOutcomeTotals = (entries) => {
  const totals = new Map();
  let currentSection = '';
  let currentPromptIdx = null;

  for (let i = 0; i < entries.length; i++) {
    const row = entries[i];
    if (row?.__rowType === 'header') {
      currentSection = row.__sectionType || '';
      currentPromptIdx = null; // Reset when entering new section
    } else if (currentSection === 'Actions') {
      if (row?.__rowType === 'prompt') {
        // Found a new measurable outcome row - track its index
        currentPromptIdx = i;
        totals.set(currentPromptIdx, 0);
      } else if (row?.__rowType === 'response' && currentPromptIdx !== null) {
        // Sum time values from response rows (actions) into the current prompt's total
        const value = row[COL.TIME_VALUE] ?? '';
        const minutes = parseTimeValueToMinutes(value);
        totals.set(currentPromptIdx, (totals.get(currentPromptIdx) || 0) + minutes);
      }
    }
  }

  return totals;
};

/**
 * Calculate the section total for all measurable outcome rows (prompt rows in Actions section)
 * Returns total minutes (sum of all outcome totals)
 */
export const calculateOutcomeSectionTotal = (entries, outcomeTotals) => {
  let sectionTotal = 0;

  // outcomeTotals is now keyed by row index, so just sum all values
  outcomeTotals.forEach((minutes) => {
    sectionTotal += minutes;
  });

  return sectionTotal;
};

/**
 * Calculate section boundaries (row positions) for a plan table item.
 * Consolidates the repeated row position calculation logic used throughout the codebase.
 *
 * @param {StagingItem} item - The staging item with row count properties
 * @returns {SectionBoundaries} Object containing all calculated row positions
 */
export const calculateSectionBoundaries = (item) => {
  const reasonCount = item.planReasonRowCount ?? 1;
  const outcomeCount = item.planOutcomeRowCount ?? 1;
  const questionCount = item.planOutcomeQuestionRowCount ?? 1;
  const needsQuestionCount = item.planNeedsQuestionRowCount ?? 1;
  const needsPlanCount = item.planNeedsPlanRowCount ?? 1;
  const scheduleCount = item.planSubprojectRowCount ?? 1;
  const subprojectCount = item.planXxxRowCount ?? 1;

  // Reasons section
  const reasonRowLimit = 2 + reasonCount;

  // Outcomes section
  const outcomeHeadingRow = reasonRowLimit;
  const outcomePromptStart = outcomeHeadingRow + 1;
  const outcomePromptEnd = outcomePromptStart + Math.max(outcomeCount - 1, 0);

  // Questions section (linked to outcomes)
  const questionPromptStart = outcomePromptEnd + 1;
  const questionPromptEnd = questionPromptStart + Math.max(questionCount - 1, 0);

  // Needs section
  const needsHeadingRow = questionPromptEnd + 1;
  const needsQuestionStart = needsHeadingRow + 1;
  const needsQuestionEnd = needsQuestionStart + Math.max(needsQuestionCount - 1, 0);
  const needsPlanStart = needsQuestionEnd + 1;
  const needsPlanEnd = needsPlanStart + Math.max(needsPlanCount - 1, 0);

  // Schedule section (previously called "subprojects" in some places)
  const scheduleHeadingRow = needsPlanStart + Math.max(needsPlanCount, 0);
  const schedulePromptRow = scheduleHeadingRow + 1;
  const scheduleStart = schedulePromptRow + 1;
  const scheduleEnd = scheduleStart + Math.max(scheduleCount - 1, 0);

  // Subprojects section (previously called "xxx" in some places)
  const subprojectsHeadingRow = scheduleStart + Math.max(scheduleCount, 0);
  const subprojectsPromptRow = subprojectsHeadingRow + 1;
  const subprojectStart = subprojectsPromptRow + 1;
  const subprojectEnd = subprojectStart + Math.max(subprojectCount - 1, 0);

  return {
    // Row counts
    reasonCount,
    outcomeCount,
    questionCount,
    needsQuestionCount,
    needsPlanCount,
    scheduleCount,
    subprojectCount,
    // Reasons
    reasonRowLimit,
    // Outcomes
    outcomeHeadingRow,
    outcomePromptStart,
    outcomePromptEnd,
    // Questions
    questionPromptStart,
    questionPromptEnd,
    // Needs
    needsHeadingRow,
    needsQuestionStart,
    needsQuestionEnd,
    needsPlanStart,
    needsPlanEnd,
    // Schedule
    scheduleHeadingRow,
    schedulePromptRow,
    scheduleStart,
    scheduleEnd,
    // Subprojects
    subprojectsHeadingRow,
    subprojectsPromptRow,
    subprojectStart,
    subprojectEnd,
  };
};

export const buildProjectPlanSummary = (item) => {
  if (!item) return { subprojects: [], totalHours: '0.00' };

  const entries = clonePlanTableEntries(item.planTableEntries);

  // Use row metadata to find Schedule prompt rows (works for the new simple table format)
  const subprojects = [];
  let inScheduleSection = false;
  let scheduleTotalMinutes = 0;
  for (let rowIdx = 0; rowIdx < entries.length; rowIdx += 1) {
    const row = entries[rowIdx];
    if (row.__rowType === 'header') {
      inScheduleSection = row.__sectionType === 'Schedule';
      continue;
    }
    if (inScheduleSection && row.__rowType === 'prompt') {
      const name = (row[COL.CONTENT] ?? '').trim();
      const timeValue = row[COL.ESTIMATE] ?? '0.00';
      subprojects.push({ name, timeValue });
      scheduleTotalMinutes += parseTimeValueToMinutes(timeValue);
    }
  }

  // Also sum Actions section (needsPlan rows) for total hours
  let needsPlanTotalMinutes = 0;
  let inActionsSection = false;
  for (let rowIdx = 0; rowIdx < entries.length; rowIdx += 1) {
    const row = entries[rowIdx];
    if (row.__rowType === 'header') {
      inActionsSection = row.__sectionType === 'Actions';
      continue;
    }
    if (inActionsSection && row.__rowType === 'response') {
      needsPlanTotalMinutes += parseTimeValueToMinutes(row[COL.TIME_VALUE] ?? '');
    }
  }

  const projectTotalMinutes = needsPlanTotalMinutes + scheduleTotalMinutes;

  return {
    subprojects,
    needsPlanTotalMinutes,
    scheduleTotalMinutes,
    totalHours: formatMinutesToHHmm(projectTotalMinutes),
  };
};
