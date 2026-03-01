/**
 * Plan table helper utilities and constants
 */

import { getRowPairId } from './rowPairing';

export const PLAN_TABLE_ROWS = 15;
export const PLAN_TABLE_COLS = 6;

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
  if (row['__rowType']) {
    Object.defineProperty(newRow, '__rowType', {
      value: row['__rowType'],
      writable: true,
      configurable: true,
      enumerable: false,
    });
  }
  if (row['__pairId']) {
    Object.defineProperty(newRow, '__pairId', {
      value: row['__pairId'],
      writable: true,
      configurable: true,
      enumerable: false,
    });
  }
  return newRow;
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

    // Preserve pair metadata
    if (sourceRow && sourceRow['__pairId']) {
      Object.defineProperty(nextRow, '__pairId', {
        value: sourceRow['__pairId'],
        writable: true,
        configurable: true,
        enumerable: false,
      });
    }

    // Preserve row type metadata
    if (sourceRow && sourceRow['__rowType']) {
      Object.defineProperty(nextRow, '__rowType', {
        value: sourceRow['__rowType'],
        writable: true,
        configurable: true,
        enumerable: false,
      });
    }

    normalized.push(nextRow);
  }
  return normalized;
};

/**
 * Build project plan summary from item data
 */
export const buildProjectPlanSummary = (item) => {
  if (!item) return { subprojects: [], totalHours: '0.00' };

  const entries = clonePlanTableEntries(item.planTableEntries);
  const reasonRowCount = item.planReasonRowCount ?? 1;
  const outcomeRowCount = item.planOutcomeRowCount ?? 1;
  const questionRowCount = item.planOutcomeQuestionRowCount ?? 1;
  const needsQuestionRowCount = item.planNeedsQuestionRowCount ?? 1;
  const needsPlanRowCount = item.planNeedsPlanRowCount ?? 1;
  const scheduleRowCount = item.planSubprojectRowCount ?? 1;
  const subprojectRowCount = item.planXxxRowCount ?? 1;

  // Calculate row positions
  const outcomeHeadingRow = 2 + reasonRowCount;
  const outcomePromptStart = outcomeHeadingRow + 1;
  const outcomePromptEnd = outcomePromptStart + Math.max(outcomeRowCount - 1, 0);
  const questionPromptStart = outcomePromptEnd + 1;
  const questionPromptEnd = questionPromptStart + Math.max(questionRowCount - 1, 0);
  const needsHeadingRow = questionPromptEnd + 1;
  const needsQuestionStart = needsHeadingRow + 1;
  const needsQuestionEnd = needsQuestionStart + Math.max(needsQuestionRowCount - 1, 0);
  const needsPlanStart = needsQuestionEnd + 1;
  const scheduleHeadingRow = needsPlanStart + Math.max(needsPlanRowCount, 0);
  const schedulePromptRow = scheduleHeadingRow + 1;
  const scheduleStart = schedulePromptRow + 1;
  const subprojectsHeadingRow = scheduleStart + Math.max(scheduleRowCount, 0);
  const subprojectsPromptRow = subprojectsHeadingRow + 1;
  const subprojectStart = subprojectsPromptRow + 1;

  // Extract schedule items (these appear as "subprojects" in TacticsPage)
  // The Schedule section contains weekly recurring activities
  const subprojects = [];
  for (let idx = 0; idx < Math.max(scheduleRowCount, 0); idx += 1) {
    const rowIdx = scheduleStart + idx;
    const rowValues = entries[rowIdx] ?? Array.from({ length: PLAN_TABLE_COLS }, () => '');
    subprojects.push({
      name: (rowValues[2] ?? '').trim(),
      timeValue: rowValues[4] ?? '0.00',
    });
  }

  // Calculate total minutes
  const calculateMinutes = (baseIdx, rowCount) =>
    Array.from({ length: Math.max(rowCount, 0) }, (_, idx) => {
      const rowIdx = baseIdx + idx;
      const rowValues = entries[rowIdx] ?? [];
      return parseTimeValueToMinutes(rowValues[4] ?? '');
    }).reduce((sum, value) => sum + value, 0);

  const needsPlanTotalMinutes = calculateMinutes(needsPlanStart, needsPlanRowCount);
  const scheduleTotalMinutes = calculateMinutes(scheduleStart, scheduleRowCount);
  const projectTotalMinutes = needsPlanTotalMinutes + scheduleTotalMinutes;

  return {
    subprojects,
    needsPlanTotalMinutes,
    scheduleTotalMinutes,
    totalHours: formatMinutesToHHmm(projectTotalMinutes),
  };
};
