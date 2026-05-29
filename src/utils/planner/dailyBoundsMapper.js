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
 * Maps daily bounds to specific timeline dates.
 *
 * Supports two formats:
 *   Legacy: { day, dailyMaxHours, dailyMinHours }
 *   Per-week: { weekNumber, day, dailyMaxHours, dailyMinHours }
 *
 * When per-week entries are present, each date is matched by its cycle week
 * number (Math.floor(dateIndex / 7) + 1) AND day name. Entries without a
 * weekNumber act as a global fallback (backwards compatibility).
 *
 * @param {Array} dailyBounds - Array of bound objects
 * @param {Array} dates - Array of Date objects for the timeline (index 0 = cycle day 0)
 * @returns {Object} { dailyMinValues: [], dailyMaxValues: [] }
 */
export const mapDailyBoundsToTimeline = (dailyBounds, dates) => {
  if (!dailyBounds || dailyBounds.length === 0) {
    return {
      dailyMinValues: dates.map(() => '0.00'),
      dailyMaxValues: dates.map(() => '0.00'),
    };
  }

  // perWeekMap: weekNumber -> Map(dayName -> bounds)
  // globalMap:  dayName -> bounds  (for legacy entries with no weekNumber)
  const perWeekMap = new Map();
  const globalMap = new Map();

  dailyBounds.forEach((bound) => {
    const val = {
      minHours: bound.dailyMinHours,
      maxHours: bound.dailyMaxHours,
    };
    if (bound.weekNumber != null) {
      if (!perWeekMap.has(bound.weekNumber)) {
        perWeekMap.set(bound.weekNumber, new Map());
      }
      perWeekMap.get(bound.weekNumber).set(bound.day, val);
    } else {
      globalMap.set(bound.day, val);
    }
  });

  const hasPerWeekData = perWeekMap.size > 0;

  const dailyMinValues = [];
  const dailyMaxValues = [];

  dates.forEach((date, i) => {
    const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
    let bounds;

    if (hasPerWeekData) {
      const weekNum = Math.floor(i / 7) + 1;
      // Prefer the exact week entry; fall back to global for weeks not yet sent.
      bounds = perWeekMap.get(weekNum)?.get(dayName) ?? globalMap.get(dayName);
    } else {
      bounds = globalMap.get(dayName);
    }

    dailyMinValues.push(formatHoursValue(bounds?.minHours ?? 0));
    dailyMaxValues.push(formatHoursValue(bounds?.maxHours ?? 0));
  });

  return { dailyMinValues, dailyMaxValues };
};
