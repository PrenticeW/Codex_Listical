/**
 * Display label for the Estimate cell (2026-10-19).
 *
 * The STORED estimate stays exactly as it is: 'Custom' is a load-bearing
 * signal on web and mobile ("the time value is user-controlled — never
 * recompute it from the label"; see useComputedDataV2 and tacular-mobile
 * lib/plannerData.js estimateLabelForMinutes). Never write the friendly
 * text back into row.estimate: parseEstimateLabelToMinutes would read
 * "12 hours, 55 minutes" as 12 hours and drop the minutes.
 *
 * This only changes what the cell SHOWS: a 'Custom' row displays its actual
 * time ("12 hours, 55 minutes") instead of the word. Every other label is shown
 * unchanged. Mobile mirror: customTimeLabel in tacular-mobile SystemScreen.
 */

/** "H.MM" (hours dot literal minutes, e.g. "12.55") → total minutes. */
function hhmmToMinutes(timeValue) {
  const [h, m] = String(timeValue ?? '').trim().split('.');
  const hours = parseInt(h, 10) || 0;
  const mins = parseInt((m || '').padEnd(2, '0').slice(0, 2), 10) || 0;
  return hours * 60 + mins;
}

/** 775 → "12 hours, 55 minutes", 60 → "1 hour", 5 → "5 minutes", 1 → "1 minute". */
export function formatDurationLabel(totalMinutes) {
  const total = Math.max(0, Math.round(totalMinutes || 0));
  const h = Math.floor(total / 60);
  const m = total % 60;
  const parts = [];
  if (h > 0) parts.push(`${h} hour${h === 1 ? '' : 's'}`);
  if (m > 0) parts.push(`${m} minute${m === 1 ? '' : 's'}`);
  return parts.join(', ');
}

/**
 * What the Estimate cell should show for a row.
 * @param {string} estimate  stored label ('Custom', '2 Hours', '-', 'Multi', …)
 * @param {string} timeValue stored "H.MM" value
 */
export function estimateDisplayLabel(estimate, timeValue) {
  if (estimate !== 'Custom') return estimate;
  const label = formatDurationLabel(hhmmToMinutes(timeValue));
  return label || 'Custom'; // no usable time: keep the plain word
}
