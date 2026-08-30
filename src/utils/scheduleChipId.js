/**
 * Chip-id helpers for schedule-item chips (docs/stable-chip-ids-spec.md).
 *
 * Two id forms coexist:
 * - UUID form (current):  `schedule-chip-{projectId}-sid-{scheduleId}`
 * - positional (legacy):  `schedule-chip-{projectId}-{itemIdx}`
 * Extra placements append `-extra-chip-{N}` (via createProjectChipId()).
 *
 * The `-sid-` marker makes UUID-form ids self-identifying. scheduleIds are
 * minted dashless (see createScheduleId in utils/staging/rowPairing.js) and
 * projectIds are UUIDs (hex + dashes, no letter 's'), so the first `-sid-`
 * in a chip id is always the marker — legacy parsers that would otherwise
 * mis-read a UUID as a numeric index must never run on UUID-form ids.
 */

export const SCHEDULE_CHIP_PREFIX = 'schedule-chip-';
export const SID_MARKER = '-sid-';
export const EXTRA_MARKER = '-extra-chip-';

export const isScheduleChipId = (id) =>
  typeof id === 'string' && id.startsWith(SCHEDULE_CHIP_PREFIX);

/**
 * Canonical chip id for a schedule item. UUID form when the item carries a
 * scheduleId; positional fallback otherwise (stale summaries from old
 * clients) — identical to the pre-change behaviour, never worse.
 */
export const buildScheduleChipId = (projectId, scheduleItem, itemIdx) =>
  scheduleItem && typeof scheduleItem.scheduleId === 'string' && scheduleItem.scheduleId
    ? `${SCHEDULE_CHIP_PREFIX}${projectId}${SID_MARKER}${scheduleItem.scheduleId}`
    : `${SCHEDULE_CHIP_PREFIX}${projectId}-${itemIdx}`;

/** Strip any `-extra-chip-{N}` suffix, leaving the canonical id. */
export const canonicalScheduleChipId = (chipId) => {
  if (typeof chipId !== 'string') return chipId;
  const extraMarker = chipId.indexOf(EXTRA_MARKER);
  return extraMarker !== -1 ? chipId.slice(0, extraMarker) : chipId;
};

/**
 * Stable per-item key for keying maps regardless of id form:
 * `sid-{scheduleId}` when the item has one, otherwise the index string.
 */
export const scheduleItemKey = (scheduleItem, itemIdx) =>
  scheduleItem && typeof scheduleItem.scheduleId === 'string' && scheduleItem.scheduleId
    ? `sid-${scheduleItem.scheduleId}`
    : String(itemIdx);

/**
 * Resolve `rest` (the part of a canonical id after `schedule-chip-{projectId}-`)
 * to a schedule item in `items`. UUID-form rest (`sid-…`) looks the item up
 * by scheduleId; legacy numeric rest indexes into the list, as before.
 * Returns { scheduleItem, itemIdx, itemKey } (scheduleItem/itemIdx null when
 * the referenced item no longer exists) or null when rest is unparseable.
 */
export const resolveScheduleItemByRest = (rest, items) => {
  if (typeof rest !== 'string' || !rest) return null;
  const list = Array.isArray(items) ? items : [];
  if (rest.startsWith('sid-')) {
    const scheduleId = rest.slice(4);
    if (!scheduleId) return null;
    const itemIdx = list.findIndex(
      (i) => i && typeof i.scheduleId === 'string' && i.scheduleId === scheduleId
    );
    return {
      scheduleItem: itemIdx >= 0 ? list[itemIdx] : null,
      itemIdx: itemIdx >= 0 ? itemIdx : null,
      itemKey: rest,
    };
  }
  const itemIdx = parseInt(rest, 10);
  if (!Number.isFinite(itemIdx)) return null;
  return { scheduleItem: list[itemIdx] ?? null, itemIdx, itemKey: String(itemIdx) };
};

/**
 * Resolve a schedule item from a full chip id when the projectId is known.
 * Extras are stripped first. Returns null for non-schedule ids or ids that
 * belong to another project; otherwise { scheduleItem, itemIdx, itemKey,
 * canonicalId }.
 */
export const resolveScheduleChip = (chipId, projectId, items) => {
  if (!isScheduleChipId(chipId)) return null;
  const idForParsing = canonicalScheduleChipId(chipId);
  const prefix = `${SCHEDULE_CHIP_PREFIX}${projectId}-`;
  if (!idForParsing.startsWith(prefix)) return null;
  const resolved = resolveScheduleItemByRest(idForParsing.slice(prefix.length), items);
  if (!resolved) return null;
  return { ...resolved, canonicalId: idForParsing };
};

/**
 * Split the inner part of a canonical chip id (`{projectId}-sid-{scheduleId}`
 * or `{projectId}-{itemIdx}`) when the projectId is NOT known up front.
 * Returns { projectId, itemKey, scheduleId, itemIdx } or null. Legacy split
 * (last dash + numeric index) only runs when the `-sid-` marker is absent,
 * so UUID scheduleIds can never be mis-read as an index.
 */
export const splitScheduleChipInner = (inner) => {
  if (typeof inner !== 'string' || !inner) return null;
  const sidIdx = inner.indexOf(SID_MARKER);
  if (sidIdx !== -1) {
    const projectId = inner.slice(0, sidIdx);
    const scheduleId = inner.slice(sidIdx + SID_MARKER.length);
    if (!projectId || !scheduleId) return null;
    return { projectId, itemKey: `sid-${scheduleId}`, scheduleId, itemIdx: null };
  }
  const lastDash = inner.lastIndexOf('-');
  if (lastDash === -1) return null;
  const projectId = inner.slice(0, lastDash);
  const itemIdx = parseInt(inner.slice(lastDash + 1), 10);
  if (!projectId || !Number.isFinite(itemIdx)) return null;
  return { projectId, itemKey: String(itemIdx), scheduleId: null, itemIdx };
};
