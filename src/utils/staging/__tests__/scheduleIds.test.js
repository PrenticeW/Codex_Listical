import { describe, it, expect } from 'vitest';
import {
  defineRowMetadata,
  cloneRowWithMetadata,
  clonePlanTableEntries,
  buildProjectPlanSummary,
  PLAN_TABLE_COLS,
} from '../planTableHelpers';
import { ensureScheduleRowIds, getRowScheduleId, createScheduleId } from '../rowPairing';
import { serializeRow, deserializeRow } from '../../../lib/stagingStorage';
import { buildScheduleLayout } from '../../../ScheduleChips';
import {
  buildScheduleChipId,
  canonicalScheduleChipId,
  resolveScheduleChip,
  resolveScheduleItemByRest,
  splitScheduleChipInner,
  scheduleItemKey,
} from '../../scheduleChipId';

const PROJECT_ID = 'de305d54-75b4-431b-adb2-eb6b9e546014'; // UUID with dashes

const makeRow = (cells, meta) => {
  const row = Array.from({ length: PLAN_TABLE_COLS }, (_, i) => cells?.[i] ?? '');
  return defineRowMetadata(row, meta);
};

const makeScheduleTable = () => [
  makeRow(['Schedule'], { rowType: 'header', sectionType: 'Schedule' }),
  makeRow(['', '', 'Item A', '', '1 Hour'], { rowType: 'prompt' }),
  makeRow(['', '', 'Item B', '', '30 Minutes'], { rowType: 'prompt' }),
  makeRow([''], { rowType: 'data' }), // spacer — never gets an id
];

describe('lazy minting (ensureScheduleRowIds)', () => {
  it('mints ids only for Schedule-section non-data rows, and is idempotent', () => {
    const entries = makeScheduleTable();
    const changed = ensureScheduleRowIds(entries);
    expect(changed).toBe(true);
    expect(getRowScheduleId(entries[0])).toBeNull(); // header
    expect(getRowScheduleId(entries[1])).toBeTruthy();
    expect(getRowScheduleId(entries[2])).toBeTruthy();
    expect(getRowScheduleId(entries[3])).toBeNull(); // data spacer
    expect(getRowScheduleId(entries[1])).not.toBe(getRowScheduleId(entries[2]));

    const idA = getRowScheduleId(entries[1]);
    expect(ensureScheduleRowIds(entries)).toBe(false); // no re-mint
    expect(getRowScheduleId(entries[1])).toBe(idA);
  });

  it('does not touch rows outside the Schedule section', () => {
    const entries = [
      makeRow(['Actions'], { rowType: 'header', sectionType: 'Actions' }),
      makeRow(['', 'do a thing'], { rowType: 'prompt' }),
    ];
    ensureScheduleRowIds(entries);
    expect(getRowScheduleId(entries[1])).toBeNull();
  });

  it('mints dashless ids', () => {
    expect(createScheduleId()).not.toContain('-');
  });
});

describe('id threading: rows → summary → layout → chip id', () => {
  it('threads scheduleId end to end', () => {
    const entries = makeScheduleTable();
    ensureScheduleRowIds(entries);
    const idA = getRowScheduleId(entries[1]);
    const idB = getRowScheduleId(entries[2]);

    const item = { id: PROJECT_ID, planTableEntries: entries };
    const summary = buildProjectPlanSummary(item);
    expect(summary.scheduleItems.map((i) => i.scheduleId)).toEqual([idA, idB]);

    const layout = buildScheduleLayout([{ id: PROJECT_ID, planSummary: summary }]);
    const items = layout.scheduleItemsByProject.get(PROJECT_ID);
    expect(items.map((i) => i.scheduleId)).toEqual([idA, idB]);

    const chipId = buildScheduleChipId(PROJECT_ID, items[0], 0);
    expect(chipId).toBe(`schedule-chip-${PROJECT_ID}-sid-${idA}`);

    // Round-trip: chip id resolves back to the same item even after reorder
    const reordered = [items[1], items[0]];
    const resolved = resolveScheduleChip(chipId, PROJECT_ID, reordered);
    expect(resolved.scheduleItem).toBe(items[0]);
    expect(resolved.itemIdx).toBe(1);
    expect(resolved.canonicalId).toBe(chipId);
  });

  it('falls back to positional ids for items without scheduleId (old clients)', () => {
    const items = [{ name: 'Legacy', timeValue: '1 Hour' }];
    expect(buildScheduleChipId(PROJECT_ID, items[0], 0)).toBe(
      `schedule-chip-${PROJECT_ID}-0`
    );
    const resolved = resolveScheduleChip(`schedule-chip-${PROJECT_ID}-0`, PROJECT_ID, items);
    expect(resolved.scheduleItem).toBe(items[0]);
    expect(resolved.itemIdx).toBe(0);
  });
});

describe('parsing safety', () => {
  it('splitScheduleChipInner handles both forms without misreading UUIDs', () => {
    const sid = createScheduleId();
    const uuidForm = splitScheduleChipInner(`${PROJECT_ID}-sid-${sid}`);
    expect(uuidForm).toEqual({
      projectId: PROJECT_ID,
      itemKey: `sid-${sid}`,
      scheduleId: sid,
      itemIdx: null,
    });

    const legacy = splitScheduleChipInner(`${PROJECT_ID}-3`);
    expect(legacy.projectId).toBe(PROJECT_ID);
    expect(legacy.itemIdx).toBe(3);
    expect(legacy.itemKey).toBe('3');
  });

  it('never resolves a sid-form rest as a numeric index', () => {
    const items = [{ name: 'A' }, { name: 'B' }];
    const resolved = resolveScheduleItemByRest('sid-0abc123', items);
    expect(resolved.scheduleItem).toBeNull(); // no such id — NOT items[0]
    expect(resolved.itemIdx).toBeNull();
  });

  it('strips -extra-chip- suffixes to the canonical id', () => {
    const sid = createScheduleId();
    const canonical = `schedule-chip-${PROJECT_ID}-sid-${sid}`;
    expect(canonicalScheduleChipId(`${canonical}-extra-chip-7`)).toBe(canonical);
    expect(canonicalScheduleChipId(canonical)).toBe(canonical);
  });

  it('scheduleItemKey prefers scheduleId over index', () => {
    expect(scheduleItemKey({ scheduleId: 'abc' }, 4)).toBe('sid-abc');
    expect(scheduleItemKey({}, 4)).toBe('4');
  });
});

describe('persistence and clones carry __scheduleId', () => {
  it('serializeRow/deserializeRow round-trips _scheduleId', () => {
    const row = makeRow(['', '', 'Item A'], { rowType: 'prompt', scheduleId: 'abc123' });
    const serialized = serializeRow(row);
    expect(serialized._scheduleId).toBe('abc123');
    expect(JSON.parse(JSON.stringify(serialized))._scheduleId).toBe('abc123');
    const back = deserializeRow(serialized);
    expect(getRowScheduleId(back)).toBe('abc123');
  });

  it('cloneRowWithMetadata and clonePlanTableEntries preserve the id (undo/redo never re-mints)', () => {
    const entries = makeScheduleTable();
    ensureScheduleRowIds(entries);
    const idA = getRowScheduleId(entries[1]);

    expect(getRowScheduleId(cloneRowWithMetadata(entries[1]))).toBe(idA);
    const cloned = clonePlanTableEntries(entries, entries.length);
    expect(getRowScheduleId(cloned[1])).toBe(idA);
    expect(ensureScheduleRowIds(cloned)).toBe(false);
  });
});
