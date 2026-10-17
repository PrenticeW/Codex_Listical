import { describe, it, expect } from 'vitest';
import { deriveRowSections, deriveRowSectionsFromDb } from '../deriveSections';

const header = (id, nick) => ({ id, _rowType: 'projectHeader', projectNickname: nick });
const sub = (id, nick, title) => ({ id, _rowType: 'subprojectHeader', projectNickname: nick, subprojectName: title });
const general = (id, nick) => ({ id, _rowType: 'projectGeneral', projectNickname: nick });
const task = (id, extra = {}) => ({ id, task: `t-${id}`, ...extra });

describe('deriveRowSections (in-memory walk)', () => {
  it('assigns tasks under a project header to that project', () => {
    const out = deriveRowSections([header('h1', 'TACULAR'), task('t1')]);
    expect(out).toEqual([
      { rowId: 't1', section: 'project', projectNickname: 'TACULAR', groupTitle: null },
    ]);
  });

  it('puts tasks after the Inbox divider in the inbox, even with a project column set', () => {
    const out = deriveRowSections([
      header('h1', 'TACULAR'),
      task('t1'),
      { id: 'inbox', _isInboxRow: true },
      task('t2', { project: 'TACULAR', projectId: 'abc' }),
    ]);
    expect(out[1]).toEqual({ rowId: 't2', section: 'inbox', projectNickname: null, groupTitle: null });
  });

  it('assigns tasks under a subprojectHeader to that group', () => {
    const out = deriveRowSections([
      header('h1', 'TACULAR'),
      sub('s1', 'TACULAR', 'Bug Fixes'),
      task('t1'),
    ]);
    expect(out[0]).toEqual({ rowId: 't1', section: 'project', projectNickname: 'TACULAR', groupTitle: 'Bug Fixes' });
  });

  it('projectGeneral resets the group context and opens General', () => {
    const out = deriveRowSections([
      header('h1', 'TACULAR'),
      sub('s1', 'TACULAR', 'Bug Fixes'),
      task('t1'),
      general('g1', 'TACULAR'),
      task('t2'),
    ]);
    expect(out[1]).toEqual({ rowId: 't2', section: 'project', projectNickname: 'TACULAR', groupTitle: 'General' });
  });

  it('deletedChip tombstones do not close the current section', () => {
    const out = deriveRowSections([
      header('h1', 'TACULAR'),
      sub('s1', 'TACULAR', 'Feature'),
      { id: 'd1', _rowType: 'deletedChip' },
      task('t1'),
    ]);
    expect(out[0].groupTitle).toBe('Feature');
    expect(out[0].projectNickname).toBe('TACULAR');
  });

  it('excludes archive rows and everything after the archive header', () => {
    const out = deriveRowSections([
      header('h1', 'TACULAR'),
      task('t1'),
      { id: 'a1', _rowType: 'archiveHeader' },
      task('t2'),
      task('t3', { _isArchivedTask: true }),
    ]);
    expect(out.map(r => r.rowId)).toEqual(['t1']);
  });

  it('a task with no positional context gets section null (caller falls back to projectId)', () => {
    const out = deriveRowSections([task('t1')]);
    expect(out[0]).toEqual({ rowId: 't1', section: null, projectNickname: null, groupTitle: null });
  });
});

describe('deriveRowSectionsFromDb (raw planner_rows)', () => {
  const db = (id, key, extra = {}, rest = {}) => ({
    id, row_kind: 'task', order_key: key, display_order: 0,
    day_entries: { __cells: {}, __project: '', __extra: extra }, ...rest,
  });

  it('orders by order_key bytes and walks structural markers from __extra', () => {
    const rows = [
      db('t2', 'a4'),                                            // inbox task (after divider)
      db('h1', 'a1', { _rowType: 'projectHeader', projectNickname: 'TACULAR' }),
      db('t1', 'a2'),                                            // project task
      db('inbox', 'a3', { _isInboxRow: true }),
    ];
    const out = deriveRowSectionsFromDb(rows);
    expect(out).toEqual([
      { rowId: 't1', section: 'project', projectNickname: 'TACULAR', groupTitle: null },
      { rowId: 't2', section: 'inbox', projectNickname: null, groupTitle: null },
    ]);
  });

  it('null-key rows fall back to display_order', () => {
    const rows = [
      db('t1', null, {}, { display_order: 2 }),
      db('h1', null, { _rowType: 'projectHeader', projectNickname: 'SELF LOVE' }, { display_order: 1 }),
    ];
    const out = deriveRowSectionsFromDb(rows);
    expect(out[0]).toEqual({ rowId: 't1', section: 'project', projectNickname: 'SELF LOVE', groupTitle: null });
  });

  it('skips deletedChip tombstones and archived tasks', () => {
    const rows = [
      db('h1', 'a1', { _rowType: 'projectHeader', projectNickname: 'TACULAR' }),
      db('d1', 'a2', { _rowType: 'deletedChip' }),
      db('t1', 'a3'),
      db('arch', 'a4', { _rowType: 'archiveHeader' }),
      db('t9', 'a5', { _isArchivedTask: true }),
    ];
    const out = deriveRowSectionsFromDb(rows);
    expect(out.map(r => r.rowId)).toEqual(['t1']);
    expect(out[0].projectNickname).toBe('TACULAR');
  });
});
