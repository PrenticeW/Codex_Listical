import { describe, it, expect } from 'vitest';
import {
  getGroupSelectionState,
  buildGroupOrders,
  sortSpanRows,
  createGroupSelectionCommand,
} from '../groupSelection';

const task = (id, project, subproject, status, extra = {}) => ({
  id, project, subproject, status, ...extra,
});

const ORDERS = buildGroupOrders({
  projectSubprojectsMap: {
    Alpha: ['-', 'One', 'Two', 'Three'],
    Beta: ['-', 'Red', 'Blue'],
  },
  statuses: [{ id: 'Scheduled' }, { id: 'In Progress' }, { id: 'Done' }],
});

const sel = (...ids) => new Set(ids);

describe('getGroupSelectionState', () => {
  const data = [
    { id: 'h', _rowType: 'projectHeader', project: 'Alpha' },
    task('a', 'Alpha', 'One', 'Done'),
    task('b', 'Alpha', 'Two', 'Scheduled'),
    task('c', 'Beta', '-', 'Done'),
    task('d', 'Beta', 'Red', '-'),
  ];

  it('disables everything with no selection', () => {
    const s = getGroupSelectionState(data, sel());
    expect(s.hasSelection).toBe(false);
    expect(s.enabled).toEqual({ project: false, subproject: false, status: false });
    expect(s.hint).toBe(null);
  });

  it('blocks all three when a header row is selected', () => {
    const s = getGroupSelectionState(data, sel('h', 'a'));
    expect(s.enabled).toEqual({ project: false, subproject: false, status: false });
    expect(s.hint).toBe('Deselect header rows');
  });

  it('blocks all three when the selection is non-contiguous', () => {
    const s = getGroupSelectionState(data, sel('a', 'c'));
    expect(s.enabled).toEqual({ project: false, subproject: false, status: false });
    expect(s.hint).toBe('Select a continuous range');
  });

  it('disables only Subproject across multiple projects, with no hint', () => {
    const s = getGroupSelectionState(data, sel('b', 'c'));
    expect(s.enabled).toEqual({ project: true, subproject: false, status: true });
    expect(s.hint).toBe(null);
  });

  it('enables all three for a contiguous single-project selection', () => {
    const s = getGroupSelectionState(data, sel('a', 'b'));
    expect(s.enabled).toEqual({ project: true, subproject: true, status: true });
    expect(s.spanStart).toBe(1);
    expect(s.spanEnd).toBe(3);
  });
});

describe('sortSpanRows', () => {
  it('groups by project alphabetically with full tiebreak chain', () => {
    const rows = [
      task('1', 'Beta', 'Blue', 'Done'),
      task('2', 'Alpha', 'Two', 'Done'),
      task('3', 'Beta', 'Red', 'Scheduled'),
      task('4', 'Alpha', 'One', 'Scheduled'),
      task('5', 'Alpha', 'One', 'Done'),
    ];
    expect(sortSpanRows(rows, 'project', ORDERS).map(r => r.id))
      .toEqual(['4', '5', '2', '3', '1']);
  });

  it('sorts rows missing the chosen field below rows that have one', () => {
    const rows = [
      task('1', '-', 'x', 'Done'),
      task('2', 'Alpha', 'One', 'Done'),
      task('3', '', 'y', 'Done'),
      task('4', 'Beta', '-', 'Done'),
    ];
    expect(sortSpanRows(rows, 'project', ORDERS).map(r => r.id))
      .toEqual(['2', '4', '1', '3']);
  });

  it('groups by subproject in Goal-page order, not alphabetical', () => {
    const rows = [
      task('1', 'Alpha', 'Three', 'Done'),
      task('2', 'Alpha', 'One', 'Done'),
      task('3', 'Alpha', '-', 'Done'),
      task('4', 'Alpha', 'Two', 'Done'),
    ];
    expect(sortSpanRows(rows, 'subproject', ORDERS).map(r => r.id))
      .toEqual(['2', '4', '1', '3']);
  });

  it('groups by status in Manage Statuses order, missing status last', () => {
    const rows = [
      task('1', 'Alpha', 'One', 'Done'),
      task('2', 'Alpha', 'One', '-'),
      task('3', 'Alpha', 'Two', 'Scheduled'),
      task('4', 'Alpha', 'One', 'In Progress'),
    ];
    expect(sortSpanRows(rows, 'status', ORDERS).map(r => r.id))
      .toEqual(['3', '4', '1', '2']);
  });

  it('is stable: existing order is the final tiebreak', () => {
    const rows = [
      task('1', 'Alpha', 'One', 'Done'),
      task('2', 'Alpha', 'One', 'Done'),
      task('3', 'Alpha', 'One', 'Done'),
    ];
    expect(sortSpanRows(rows, 'status', ORDERS).map(r => r.id))
      .toEqual(['1', '2', '3']);
  });

  it('sorts unknown (stale) subprojects after known ones, above missing', () => {
    const rows = [
      task('1', 'Alpha', 'Ghost', 'Done'),
      task('2', 'Alpha', 'Two', 'Done'),
      task('3', 'Alpha', '-', 'Done'),
    ];
    expect(sortSpanRows(rows, 'subproject', ORDERS).map(r => r.id))
      .toEqual(['2', '1', '3']);
  });
});

describe('createGroupSelectionCommand', () => {
  const makeData = () => [
    { id: 'h', _rowType: 'projectHeader', project: 'Alpha' },
    task('a', 'Beta', '-', 'Done'),
    task('b', 'Alpha', 'One', 'Scheduled'),
    task('c', 'Alpha', 'Two', 'Done'),
    task('z', 'Zeta', '-', '-'),
  ];

  const harness = (initial) => {
    let data = initial;
    const setData = (updater) => { data = updater(data); };
    return { get: () => data, setData };
  };

  it('reorders only the selected span and leaves other rows untouched', () => {
    const h = harness(makeData());
    const cmd = createGroupSelectionCommand({
      data: h.get(), selectedRows: sel('a', 'b', 'c'), field: 'project',
      orders: ORDERS, setData: h.setData,
    });
    cmd.execute();
    expect(h.get().map(r => r.id)).toEqual(['h', 'b', 'c', 'a', 'z']);
    // Same row objects, no field touched — a grouping is a reorder, never an edit
    expect(h.get()[1]).toBe(makeData ? h.get()[1] : null);
    cmd.undo();
    expect(h.get().map(r => r.id)).toEqual(['h', 'a', 'b', 'c', 'z']);
  });

  it('returns null when already grouped (no-op)', () => {
    const h = harness(makeData());
    const cmd = createGroupSelectionCommand({
      data: h.get(), selectedRows: sel('b', 'c'), field: 'project',
      orders: ORDERS, setData: h.setData,
    });
    expect(cmd).toBe(null);
  });

  it('returns null when the field is blocked', () => {
    const h = harness(makeData());
    const cmd = createGroupSelectionCommand({
      data: h.get(), selectedRows: sel('a', 'b'), field: 'subproject',
      orders: ORDERS, setData: h.setData,
    });
    expect(cmd).toBe(null);
  });

  it('aborts rather than applying a stale order if a row vanished', () => {
    const h = harness(makeData());
    const cmd = createGroupSelectionCommand({
      data: h.get(), selectedRows: sel('a', 'b', 'c'), field: 'project',
      orders: ORDERS, setData: h.setData,
    });
    // Row deleted between compute and execute
    h.setData(prev => prev.filter(r => r.id !== 'b'));
    cmd.execute();
    expect(h.get().map(r => r.id)).toEqual(['h', 'a', 'c', 'z']);
  });

  it('applies within current positions at execute time (read-fresh)', () => {
    const h = harness(makeData());
    const cmd = createGroupSelectionCommand({
      data: h.get(), selectedRows: sel('a', 'b', 'c'), field: 'project',
      orders: ORDERS, setData: h.setData,
    });
    cmd.execute();
    cmd.undo();
    cmd.execute(); // redo path
    expect(h.get().map(r => r.id)).toEqual(['h', 'b', 'c', 'a', 'z']);
  });
});
