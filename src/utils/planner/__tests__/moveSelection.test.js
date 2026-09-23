import { describe, it, expect, vi } from 'vitest';

// statusesStorage pulls in the supabase client; stub the pieces sortInbox
// uses so the test runs without a network-capable environment.
vi.mock('../../../lib/supabase', () => ({ supabase: {} }));
vi.mock('../../../lib/storageCache', () => ({
  getCached: () => null,
  setCached: () => {},
  invalidate: () => {},
}));

import {
  getMoveSelectionState,
  createMoveSelectionCommand,
} from '../sortInbox';

// Minimal System page shape: two project blocks, then the Inbox.
// getSortTarget (real implementation): Done sweeps -> 'general',
// Scheduled -> 'general', '-'/missing -> 'unscheduled'.
const makeData = () => [
  { id: 'pg-a', _rowType: 'projectGeneral', projectNickname: 'Alpha' },
  { id: 'pu-a', _rowType: 'projectUnscheduled', projectNickname: 'Alpha' },
  { id: 'pg-b', _rowType: 'projectGeneral', projectNickname: 'Beta' },
  { id: 'pu-b', _rowType: 'projectUnscheduled', projectNickname: 'Beta' },
  { id: 'inbox', _isInboxRow: true },
  { id: 'sub', _rowType: 'subprojectHeader', project: 'Alpha' },
  { id: 't1', project: 'Alpha', status: 'Done', task: 'one' },
  { id: 't2', project: 'Beta', status: '-', task: 'two' },
  { id: 't3', project: 'Alpha', status: 'Scheduled', task: 'three' },
  { id: 't4', project: 'Ghost', status: 'Done', task: 'four' },
  { id: 't5', project: 'Alpha', status: 'Done', task: 'five' },
];

const sel = (...ids) => new Set(ids);

const harness = (initial) => {
  let data = initial;
  const setData = (next) => {
    data = typeof next === 'function' ? next(data) : next;
  };
  return { get: () => data, setData };
};

describe('getMoveSelectionState', () => {
  it('is disabled with no selection', () => {
    expect(getMoveSelectionState(makeData(), sel()))
      .toEqual({ enabled: false, movableCount: 0 });
  });

  it('counts only rows the move would actually send', () => {
    // t1 movable; sub is a header (skipped); t4 has no live project section
    const s = getMoveSelectionState(makeData(), sel('t1', 'sub', 't4'));
    expect(s).toEqual({ enabled: true, movableCount: 1 });
  });

  it('is disabled when only headers or unmatched rows are selected', () => {
    expect(getMoveSelectionState(makeData(), sel('sub', 't4')))
      .toEqual({ enabled: false, movableCount: 0 });
    // Rows outside the Inbox never move
    expect(getMoveSelectionState(makeData(), sel('pg-a')))
      .toEqual({ enabled: false, movableCount: 0 });
  });

  it('allows non-contiguous selections', () => {
    const s = getMoveSelectionState(makeData(), sel('t1', 't5'));
    expect(s).toEqual({ enabled: true, movableCount: 2 });
  });
});

describe('createMoveSelectionCommand', () => {
  it('files selected rows to their project sections, preserving relative order', () => {
    const h = harness(makeData());
    const result = createMoveSelectionCommand({
      data: h.get(), selectedRows: sel('t1', 't3', 't5'), setData: h.setData,
    });
    expect(result.movedCount).toBe(3);
    result.command.execute();
    expect(h.get().map(r => r.id)).toEqual([
      // Done + Scheduled both target 'general' -> after Alpha's general row,
      // keeping t1, t3, t5 relative order
      'pg-a', 't1', 't3', 't5', 'pu-a', 'pg-b', 'pu-b',
      'inbox', 'sub', 't2', 't4',
    ]);
  });

  it('routes "-"-status rows to the unscheduled section', () => {
    const h = harness(makeData());
    const result = createMoveSelectionCommand({
      data: h.get(), selectedRows: sel('t2'), setData: h.setData,
    });
    result.command.execute();
    expect(h.get().map(r => r.id)).toEqual([
      'pg-a', 'pu-a', 'pg-b', 'pu-b', 't2',
      'inbox', 'sub', 't1', 't3', 't4', 't5',
    ]);
  });

  it('skips headers and unmatched projects silently within a wider selection', () => {
    const h = harness(makeData());
    const result = createMoveSelectionCommand({
      data: h.get(), selectedRows: sel('sub', 't1', 't4'), setData: h.setData,
    });
    expect(result.movedCount).toBe(1);
    result.command.execute();
    const ids = h.get().map(r => r.id);
    expect(ids.indexOf('t1')).toBe(1); // filed after pg-a
    expect(ids.indexOf('sub')).toBeGreaterThan(ids.indexOf('inbox'));
    expect(ids.indexOf('t4')).toBeGreaterThan(ids.indexOf('inbox'));
  });

  it('returns null when nothing would move', () => {
    expect(createMoveSelectionCommand({
      data: makeData(), selectedRows: sel('sub', 't4'), setData: () => {},
    })).toBe(null);
    expect(createMoveSelectionCommand({
      data: makeData(), selectedRows: sel(), setData: () => {},
    })).toBe(null);
  });

  it('undo restores the original Inbox positions', () => {
    const h = harness(makeData());
    const before = h.get().map(r => r.id);
    const result = createMoveSelectionCommand({
      data: h.get(), selectedRows: sel('t1', 't2'), setData: h.setData,
    });
    result.command.execute();
    expect(h.get().map(r => r.id)).not.toEqual(before);
    result.command.undo();
    expect(h.get().map(r => r.id)).toEqual(before);
  });

  it('does not touch any non-order field on moved rows', () => {
    const h = harness(makeData());
    const original = h.get().find(r => r.id === 't1');
    const result = createMoveSelectionCommand({
      data: h.get(), selectedRows: sel('t1'), setData: h.setData,
    });
    result.command.execute();
    expect(h.get().find(r => r.id === 't1')).toBe(original);
  });
});
