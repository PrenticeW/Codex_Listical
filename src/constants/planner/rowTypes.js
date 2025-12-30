/**
 * Row Type Constants
 * Constants for different row types and their configurations
 */

// Status dropdown values
export const STATUS_VALUES = ['-', 'Not Scheduled', 'Scheduled', 'Done', 'Blocked', 'On Hold', 'Abandoned'];

// Estimate dropdown values
export const ESTIMATE_VALUES = [
  '-',
  'Custom',
  '1 Minute',
  '5 Minutes',
  '10 Minutes',
  '15 Minutes',
  '20 Minutes',
  '25 Minutes',
  '30 Minutes',
  '35 Minutes',
  '40 Minutes',
  '45 Minutes',
  '50 Minutes',
  '55 Minutes',
  '1 Hour',
  '2 Hours',
  '3 Hours',
  '4 Hours',
  '5 Hours',
  '6 Hours',
  '7 Hours',
  '8 Hours',
  '9 Hours',
  '10 Hours',
  'Multi',
];

// Status color styling
export const STATUS_COLOR_MAP = {
  '-': { bg: '#ffffff', text: '#000000' },
  'Not Scheduled': { bg: '#e5e5e5', text: '#000000' },
  'Scheduled': { bg: '#ffe5a0', text: '#473821' },
  'Done': { bg: '#c9e9c0', text: '#276436' },
  'Abandoned': { bg: '#e8d9f3', text: '#5a3b74' },
  'Blocked': { bg: '#f3c4c4', text: '#9c2f2f' },
  'On Hold': { bg: '#505050', text: '#ffffff' },
  'Special': { bg: '#cce3ff', text: '#3a70b7' },
};

// Estimate color styling (text colors only)
export const ESTIMATE_COLOR_MAP = {
  '1 Minute': { text: '#08ad2d' },
  '5 Minutes': { text: '#08ad2d' },
};

/**
 * Get status color style for a given status
 */
export const getStatusColorStyle = (status) => {
  const colors = STATUS_COLOR_MAP[status] || STATUS_COLOR_MAP['Not Scheduled'];
  return {
    backgroundColor: colors.bg,
    color: colors.text,
  };
};

/**
 * Parse estimate label to minutes
 */
export const parseEstimateLabelToMinutes = (label) => {
  if (!label || label === '-') return null;
  if (label === 'Custom' || label === 'Multi') return null;

  const minuteMatch = label.match(/^(\d+)\s+Minute/);
  if (minuteMatch) return parseInt(minuteMatch[1]);

  const hourMatch = label.match(/^(\d+)\s+Hour/);
  if (hourMatch) return parseInt(hourMatch[1]) * 60;

  return null;
};

/**
 * Format minutes to HH.mm format
 */
export const formatMinutesToHHmm = (minutes) => {
  if (minutes == null || isNaN(minutes)) return '0.00';
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}.${mins.toString().padStart(2, '0')}`;
};

// ============================================================
// ARCHIVE ROW TYPES
// ============================================================

/**
 * Archive row type identifiers
 */
export const ARCHIVE_ROW_TYPES = {
  ARCHIVE_HEADER: 'archiveHeader',
  ARCHIVE_WEEK: 'archiveRow',
  ARCHIVED_PROJECT_HEADER: 'archivedProjectHeader',
  ARCHIVED_PROJECT_GENERAL: 'archivedProjectGeneral',
  ARCHIVED_PROJECT_UNSCHEDULED: 'archivedProjectUnscheduled',
};

/**
 * Archive row styling constants
 */
export const ARCHIVE_ROW_STYLE = {
  backgroundColor: '#d9f6e0', // Light green
  color: '#000000',
};

export const ARCHIVE_HEADER_STYLE = {
  backgroundColor: '#000000', // Black
  color: '#ffffff', // White
};

export const ARCHIVED_PROJECT_HEADER_STYLE = {
  backgroundColor: '#d5a6bd', // Pink
  color: '#000000',
};

export const ARCHIVED_PROJECT_SUB_STYLE = {
  backgroundColor: '#f2e5eb', // Light pink
  color: '#000000',
};

/**
 * Archive row ID prefixes for generating unique IDs
 */
export const ARCHIVE_WEEK_ID_PREFIX = 'archive-week-';
export const ARCHIVED_ROW_ID_PREFIX = 'archived-';
export const ARCHIVE_HEADER_ID = 'archive-header';
