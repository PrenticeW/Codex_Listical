/**
 * Chip grouping for the System page.
 *
 * Plan chips that share a project and a chip name are shown under ONE
 * subproject header row on the System page (one task row per chip remains
 * beneath it). This module owns the group key and the merged header label.
 *
 *   "10 minutes of Nurture F&F on Tuesday and Thursday"
 *   "10 minutes of Finances on Friday and 20 minutes on Saturday"
 */

const DAY_ORDER = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

export const toTitleCase = (str) =>
  str ? str.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) : str;

/** Display name for a chip (what is shown on the chip itself). */
export const chipDisplayName = (chip) => toTitleCase(chip.displayLabel || chip.projectNickname);

/**
 * Group key: project + lowercased chip name. Chips with the same key share a header.
 * Prefixed "cg-" so it can double as a stable row id suffix.
 */
export const chipGroupKey = (chip) => {
  const name = (chip.displayLabel || chip.projectNickname || '').trim().toLowerCase();
  return `${chip.projectNickname ?? ''}::${name}`;
};

const dayIndex = (dayName) => {
  const idx = DAY_ORDER.indexOf((dayName || '').toLowerCase());
  return idx === -1 ? DAY_ORDER.length : idx;
};

/** Sort chips by day of week (Monday first). */
export const sortChipsByDay = (chips) => [...chips].sort((a, b) => dayIndex(a.dayName) - dayIndex(b.dayName));

/** "A", "A and B", "A, B and C" */
const joinNatural = (parts) => {
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
};

/**
 * Build the merged header label for a group of chips (same project + name).
 * Consecutive chips sharing a duration are folded into one "X of NAME on D1 and D2"
 * clause; a change of duration starts a new "Y minutes on D3" clause.
 */
export const buildGroupLabel = (chips) => {
  if (!chips || chips.length === 0) return '';
  const sorted = sortChipsByDay(chips);
  const name = chipDisplayName(sorted[0]);

  // Bucket days by duration, preserving first-seen order of durations.
  const buckets = [];
  sorted.forEach((chip) => {
    const duration = chip.formattedDuration ? chip.formattedDuration.toLowerCase() : null;
    const day = toTitleCase(chip.dayName);
    const existing = buckets.find((b) => b.duration === duration);
    if (existing) existing.days.push(day);
    else buckets.push({ duration, days: [day] });
  });

  const clauses = buckets.map((b, i) => {
    const days = joinNatural(b.days);
    if (i === 0) return b.duration ? `${b.duration} of ${name} on ${days}` : `${name} on ${days}`;
    return b.duration ? `${b.duration} on ${days}` : days;
  });
  return joinNatural(clauses);
};

/** Group enriched chips → Map<groupKey, { key, chips, label, projectNickname }>. */
export const groupChips = (chips) => {
  const groups = new Map();
  (chips || []).forEach((chip) => {
    if (!chip?.projectNickname) return;
    const key = chipGroupKey(chip);
    if (!groups.has(key)) groups.set(key, { key, chips: [], projectNickname: chip.projectNickname });
    groups.get(key).chips.push(chip);
  });
  groups.forEach((g) => {
    g.chips = sortChipsByDay(g.chips);
    g.label = buildGroupLabel(g.chips);
  });
  return groups;
};
