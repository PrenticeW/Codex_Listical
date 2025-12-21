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
  ...Array.from({ length: 11 }, (_, i) => `${(i + 1) * 5} Minutes`),
  ...[1, 2, 3, 4, 5, 6, 7, 8].map((h) => `${h} Hour${h > 1 ? 's' : ''}`),
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
  if (label === 'Custom') return null;

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
