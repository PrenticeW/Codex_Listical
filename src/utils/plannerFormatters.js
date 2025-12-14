/**
 * Planner Formatting Utilities
 * Functions for formatting dates, times, and values in the planner
 */

/**
 * Formats a number as hours with 2 decimal places
 */
export const formatHoursValue = (value) => {
  if (!Number.isFinite(value)) return '0.00';
  return value.toFixed(2);
};

/**
 * Formats a total value with 2 decimal places
 */
export const formatTotalValue = (value) => {
  if (value == null) return '0.00';
  return value.toFixed(2);
};

/**
 * Formats minutes as HH.mm format (e.g., 90 minutes => "1.30")
 */
export const formatMinutesToHHmm = (minutes) => {
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hrs}.${mins.toString().padStart(2, '0')}`;
};

/**
 * Formats a Date object for input field (YYYY-MM-DD)
 */
export const formatDateForInput = (date) => {
  const year = date.getFullYear().toString().padStart(4, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Parses an estimate label (like "5 Minutes" or "2 Hours") into minutes
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
