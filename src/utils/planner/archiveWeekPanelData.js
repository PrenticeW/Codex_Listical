/**
 * Archive Week panel data builder
 *
 * Pure derivation of the Archive Week detail panel payload
 * (05_ARCHIVE_WEEK_PANEL spec) from the System table's data array.
 * No storage access, no side effects — the page computes this and
 * broadcasts it to SystemPanel.
 *
 * Notes on field mapping (see the spec + docs/known-issues.md):
 * - label / week number    → archiveWeekLabel ("Year X, Week Y"; the week
 *                            part is user-editable and may be a custom name)
 * - range                  → archiveLabel (date range, user-editable — when
 *                            the user has replaced it with free context text
 *                            it is shown as an italic name line instead)
 * - week name lines        → frozen archiveCalendarWeekName (stamped at
 *                            archive time), then the edited archiveLabel
 *                            context text when it differs from a plain range
 * - quota                  → archivedWeeklyQuota, frozen per project header
 * - delta                  → current − last week (NOT vs quota; the quota
 *                            variant is deferred, see known-issues.md).
 *                            Projects with no quota (null) render '—'.
 */

import { ARCHIVE_ROW_TYPES } from '../../constants/planner/rowTypes';

export const AREA_ORDER = ['personal', 'social', 'growth', 'duties'];

const AREA_LABELS = {
  personal: 'Personal',
  social: 'Social',
  growth: 'Growth',
  duties: 'Duties',
};

// Matches the generated archive range format at the START of archiveLabel,
// e.g. "Dec 29 - Jan 4" (calculateWeekRange in archiveHelpers.js). The field
// is auto-populated with the range and user-editable — users append context
// text after the date, so capture the range prefix and treat whatever
// follows (after an optional separator) as the context line.
const DATE_RANGE_PREFIX_RE = /^([A-Za-z]{3,9}\.?\s?\d{1,2}\s*[-–—]\s*[A-Za-z]{3,9}\.?\s?\d{1,2})\s*[-–—:,·|]*\s*([\s\S]*)$/;

// Round to whole minutes (not 0.1h — 7h05m must stay 7h05m, not become 7.1h).
const roundMin = (v) => Math.round(v * 60) / 60;

// Day entries are HH.mm encoded ("2.30" = 2h30m), the same convention as
// timeValue (see useTotalsCalculation / useArchiveTotals). Convert each
// entry to minutes before summing, then return decimal hours — reading the
// raw value with parseFloat would count 2.30 as 2.3h instead of 2.5h.
const sumRowDayEntries = (row) => {
  let totalMinutes = 0;
  for (const [key, value] of Object.entries(row)) {
    if (!key.startsWith('day-')) continue;
    const n = parseFloat(value);
    if (!Number.isFinite(n)) continue;
    const hours = Math.floor(n);
    const mins = Math.round((n - hours) * 100);
    totalMinutes += hours * 60 + mins;
  }
  return totalMinutes / 60;
};

// "Year X, Week Y" → { yearPart: "Year X", weekPart: "Week Y" }
const splitWeekLabel = (label = '') => {
  const i = label.indexOf(', ');
  if (i === -1) return { yearPart: '', weekPart: label };
  return { yearPart: label.slice(0, i), weekPart: label.slice(i + 2) };
};

// Parse "Week 6" → 6; custom week names fall back to the caller's ordinal.
const weekNumberOf = (weekPart, fallback) => {
  const m = /^week\s+(\d+)$/i.exec((weekPart || '').trim());
  return m ? parseInt(m[1], 10) : fallback;
};

// Identity keys for matching a project across adjacent archive weeks.
// Older archive weeks (created before projectId was stamped on archived
// headers, July 2026) only carry a nickname, while newer ones carry the
// stable id — so a single-key comparison would never match across the two
// eras. Register/try every identity the header has, most stable first.
const projectKeysOf = (header, projectIdByNickname) => {
  const keys = [];
  const pid = header.projectId || projectIdByNickname?.get(header.projectNickname) || null;
  if (pid) keys.push(`id:${pid}`);
  const nick = typeof header.projectNickname === 'string' ? header.projectNickname.trim().toLowerCase() : '';
  if (nick) keys.push(`nick:${nick}`);
  const proj = typeof header.project === 'string' ? header.project.trim().toLowerCase() : '';
  if (proj) keys.push(`proj:${proj}`);
  if (keys.length === 0) keys.push(`row:${header.id}`);
  return keys;
};

// All archived project headers under one archive week, each with the summed
// day-entry hours of the rows hanging under its group (archived tasks +
// section rows; section rows carry no day values so they contribute 0).
const projectEntriesForWeek = (data, archiveWeekId) => {
  const headers = data.filter(
    (r) =>
      r._rowType === ARCHIVE_ROW_TYPES.ARCHIVED_PROJECT_HEADER &&
      r.parentGroupId === archiveWeekId,
  );
  return headers.map((header) => {
    const hours = data
      .filter((r) => r.parentGroupId === header.groupId)
      .reduce((sum, r) => sum + sumRowDayEntries(r), 0);
    return { header, hours: roundMin(hours) };
  });
};

// "2.30" (2h30m) -> 2.5 decimal hours
const hhmmToDecimalHours = (value) => {
  const n = parseFloat(value);
  if (!Number.isFinite(n)) return 0;
  const hours = Math.floor(n);
  const mins = Math.round((n - hours) * 100);
  return hours + mins / 60;
};

const parseQuota = (raw) => {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (typeof raw === 'string' && raw.trim() !== '') {
    const n = parseFloat(raw);
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

/**
 * Build the Archive Week panel payload for one archive week row.
 *
 * @param {object[]} data - The System table data array
 * @param {string} archiveRowId - id of the selected archive week row
 * @param {object} maps - { projectInfoById, projectIdByNickname } from useProjectsData
 * @returns {object|null} Panel payload, or null when the row isn't found
 */
export function buildArchiveWeekPanelData(
  data,
  archiveRowId,
  { projectInfoById = new Map(), projectIdByNickname = new Map() } = {},
) {
  const weeks = data.filter((r) => r._rowType === ARCHIVE_ROW_TYPES.ARCHIVE_WEEK);
  const index = weeks.findIndex((r) => r.id === archiveRowId);
  if (index === -1) return null;

  const row = weeks[index];
  const prevRow = index > 0 ? weeks[index - 1] : null;
  const nextRow = index < weeks.length - 1 ? weeks[index + 1] : null;

  const entries = projectEntriesForWeek(data, row.id);

  // Previous week's hours, registered under every identity each header has,
  // so lookups succeed across mixed-era rows (id vs nickname keyed).
  const prevByKey = new Map();
  if (prevRow) {
    for (const e of projectEntriesForWeek(data, prevRow.id)) {
      for (const key of projectKeysOf(e.header, projectIdByNickname)) {
        if (!prevByKey.has(key)) prevByKey.set(key, e.hours);
      }
    }
  }
  const lookupLast = (header) => {
    if (!prevRow) return null;
    for (const key of projectKeysOf(header, projectIdByNickname)) {
      if (prevByKey.has(key)) return prevByKey.get(key);
    }
    return null;
  };

  const projects = entries.map(({ header, hours }) => {
    const pid = header.projectId || projectIdByNickname.get(header.projectNickname) || null;
    const info = pid != null ? projectInfoById.get(pid) : null;
    return {
      name: header.projectNickname || header.project || 'Project',
      color: info?.color || 'var(--n-slate)',
      last: lookupLast(header),
      current: hours,
      quota: parseQuota(header.archivedWeeklyQuota),
      area: header.archivedArea ?? null,
    };
  });

  // Group current hours by frozen area; missing/unknown area → Unassigned.
  const areaTotals = new Map();
  projects.forEach((p) => {
    const key = AREA_ORDER.includes(p.area) ? p.area : 'unassigned';
    areaTotals.set(key, (areaTotals.get(key) || 0) + p.current);
  });
  const areas = AREA_ORDER.filter((a) => (areaTotals.get(a) || 0) > 0).map((a) => ({
    name: AREA_LABELS[a],
    hours: roundMin(areaTotals.get(a)),
  }));
  const unassignedHours = areaTotals.get('unassigned') || 0;
  if (unassignedHours > 0) {
    areas.push({ name: 'Unassigned', hours: roundMin(unassignedHours), unassigned: true });
  }

  const { weekPart } = splitWeekLabel(row.archiveWeekLabel || '');
  const thisNum = weekNumberOf(weekPart, index + 1);
  const lastNum = prevRow
    ? weekNumberOf(splitWeekLabel(prevRow.archiveWeekLabel || '').weekPart, index)
    : null;

  const rawLabel = (row.archiveLabel || '').trim();
  // Split the editable header text into the auto-populated date range prefix
  // and any user-appended context text after it. No date prefix at all means
  // the user replaced the whole field — show it all as context, no range.
  const rangeMatch = DATE_RANGE_PREFIX_RE.exec(rawLabel);
  const range = rangeMatch ? rangeMatch[1].trim() : null;
  const contextText = rangeMatch
    ? (rangeMatch[2].trim() || null)
    : (rawLabel || null);
  const calendarName =
    typeof row.archiveCalendarWeekName === 'string' && row.archiveCalendarWeekName.trim()
      ? row.archiveCalendarWeekName.trim()
      : null;

  const nameLines = [];
  if (calendarName) nameLines.push(calendarName);
  if (contextText && contextText !== calendarName) nameLines.push(contextText);

  return {
    id: row.id,
    label: weekPart || `Week ${thisNum}`,
    range,
    nameLines,
    isFirstWeek: index === 0,
    isLatestWeek: index === weeks.length - 1,
    lastLabel: lastNum != null ? `Wk ${lastNum}` : '—',
    thisLabel: `Wk ${thisNum}`,
    // archiveWeeklyMin/Max are HH.mm encoded ("2.30" = 2h30m) — convert to
    // decimal hours for the panel, which works in fractional hours.
    quotaRange: [
      hhmmToDecimalHours(row.archiveWeeklyMin),
      hhmmToDecimalHours(row.archiveWeeklyMax),
    ],
    projects,
    areas,
    // Adjacent archive week rows — the panel pager re-selects these via the
    // same TASK_ROW_DETAIL_EVENT used by table row clicks.
    prevRow,
    nextRow,
  };
}
