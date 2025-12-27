/**
 * Daily Bounds Mapper Utility
 * Maps daily bounds (by day of week) to specific timeline dates
 */

/**
 * Format hours value to fixed 2 decimal places
 * @param {number} value - Hours value
 * @returns {string} Formatted value like "10.50"
 */
const formatHoursValue = (value) => {
  if (!Number.isFinite(value)) return '0.00';
  return value.toFixed(2);
};

/**
 * Maps daily bounds (by day of week) to specific timeline dates
 * @param {Array} dailyBounds - Array of {day, dailyMaxHours, dailyMinHours}
 * @param {Array} dates - Array of Date objects for the timeline
 * @returns {Object} { dailyMinValues: [], dailyMaxValues: [] }
 */
export const mapDailyBoundsToTimeline = (dailyBounds, dates) => {
  if (!dailyBounds || dailyBounds.length === 0) {
    return {
      dailyMinValues: dates.map(() => '0.00'),
      dailyMaxValues: dates.map(() => '0.00'),
    };
  }

  // Create a map from day name to bounds
  const boundsMap = new Map();
  dailyBounds.forEach((bound) => {
    boundsMap.set(bound.day, {
      minHours: bound.dailyMinHours,
      maxHours: bound.dailyMaxHours,
    });
  });

  // Map each timeline date to its day-of-week bounds
  const dailyMinValues = [];
  const dailyMaxValues = [];

  dates.forEach((date) => {
    const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
    const bounds = boundsMap.get(dayName);

    if (bounds) {
      dailyMinValues.push(formatHoursValue(bounds.minHours));
      dailyMaxValues.push(formatHoursValue(bounds.maxHours));
    } else {
      dailyMinValues.push('0.00');
      dailyMaxValues.push('0.00');
    }
  });

  return { dailyMinValues, dailyMaxValues };
};
