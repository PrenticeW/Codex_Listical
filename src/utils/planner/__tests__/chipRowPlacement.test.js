import { describe, it, expect } from 'vitest';
import { placeChipRows, relocateStrayChipTasks } from '../chipRowPlacement.js';
import { assignMissingKeys } from '../orderKey.js';

// 2026-10-12 MOVE HOUSE mis-filing: live chip tasks of other projects were
// pulled under the LAST project (MOVE HOUSE) because the old chip-sync reorder
// scanned it through the Inbox and Archive.
const ph = (n) => ({ id: `ph-${n}`, _rowType: 'projectHeader', groupId: `project-${n}`, projectNickname: n });
const gen = (n) => ({ id: `gen-${n}`, _rowType: 'projectGeneral', parentGroupId: `project-${n}` });
const uns = (n) => ({ id: `uns-${n}`, _rowType: 'projectUnscheduled', parentGroupId: `project-${n}` });
const sh = (n, c) => ({ id: `sh-${c}`, _rowType: 'subprojectHeader', groupId: `chip-${c}`, parentGroupId: `project-${n}`, _chipId: c });
const ct = (c, k = 0) => ({ id: `ct-${c}-${k}`, _rowType: 'projectTask', _chipId: c, parentGroupId: `chip-${c}` });
const inbox = { id: 'inbox', _isInboxRow: true };
const archive = { id: 'archive', _rowType: 'archiveHeader' };
const ids = (rows) => rows.map((r) => r.id);

describe('placeChipRows', () => {
  it('never pulls another project\'s chip tasks under the last project', () => {
    const rows = [
      ph('SELF LOVE'), sh('SELF LOVE', 'a'), gen('SELF LOVE'), uns('SELF LOVE'),
      ph('MOVE HOUSE'), gen('MOVE HOUSE'), uns('MOVE HOUSE'),
      inbox, { id: 'inbox-task' },
      archive, ct('a'), // stray chip task keyed down in the archive region
    ];
    const { rows: out, movedIds } = placeChipRows(rows);
    expect(ids(out)).toEqual([
      'ph-SELF LOVE', 'sh-a', 'ct-a-0', 'gen-SELF LOVE', 'uns-SELF LOVE',
      'ph-MOVE HOUSE', 'gen-MOVE HOUSE', 'uns-MOVE HOUSE',
      'inbox', 'inbox-task', 'archive',
    ]);
    expect(movedIds).toEqual(['ct-a-0']);
  });

  it('moves chip tasks sitting under the wrong project back under their own header (the 2026-10-12 state)', () => {
    const rows = [
      ph('LIFE UPKEEP'), sh('LIFE UPKEEP', 'u1'), sh('LIFE UPKEEP', 'u2'), gen('LIFE UPKEEP'),
      ph('MOVE HOUSE'), ct('u1'), ct('u2'), ct('u2', 1), gen('MOVE HOUSE'), uns('MOVE HOUSE'),
    ];
    const { rows: out } = placeChipRows(rows);
    expect(ids(out)).toEqual([
      'ph-LIFE UPKEEP', 'sh-u1', 'ct-u1-0', 'sh-u2', 'ct-u2-0', 'ct-u2-1', 'gen-LIFE UPKEEP',
      'ph-MOVE HOUSE', 'gen-MOVE HOUSE', 'uns-MOVE HOUSE',
    ]);
  });

  it('still lifts a project\'s own chip block above its section rows', () => {
    const rows = [ph('P'), gen('P'), sh('P', 'x'), ct('x'), uns('P')];
    expect(ids(placeChipRows(rows).rows)).toEqual(['ph-P', 'sh-x', 'ct-x-0', 'gen-P', 'uns-P']);
  });

  it('leaves correctly placed rows, manual rows in a chip group, and archived copies alone', () => {
    const archivedCopy = { id: 'arch-copy', _rowType: 'projectTask', _chipId: 'x', parentGroupId: 'archived-P-group-1', _isArchivedTask: true };
    const manual = { id: 'manual', parentGroupId: 'chip-x' };
    const rows = [ph('P'), sh('P', 'x'), ct('x'), manual, gen('P'), archive, archivedCopy];
    const res = placeChipRows(rows);
    expect(res.movedIds).toEqual([]);
    expect(res.rows).toBe(rows);
  });

  it('does not guess when the chip header is missing or duplicated', () => {
    const rows = [ph('P'), gen('P'), ph('Q'), ct('gone'), gen('Q')];
    expect(relocateStrayChipTasks(rows).movedIds).toEqual([]);
  });
});

describe('assignMissingKeys duplicate handling', () => {
  it('lets the smallest id keep a duplicated key regardless of in-memory order', () => {
    const a = () => [{ id: 'b-row', orderKey: 'zz' }, { id: 'a-row', orderKey: 'zz' }];
    const r1 = a(); assignMissingKeys(r1);
    const r2 = a().reverse(); assignMissingKeys(r2);
    expect(r1.find((r) => r.id === 'a-row').orderKey).toBe('zz');
    expect(r2.find((r) => r.id === 'a-row').orderKey).toBe('zz');
  });

  it('never mints a key another row already holds, even when neighbours are inverted', () => {
    // In-memory order disagrees with key order (regrouped archive): the run
    // after 'zy' used to be keyed open-ended and could land on 'zz'.
    const rows = [
      { id: '1', orderKey: 'zy' }, { id: '9', orderKey: 'zy' }, // duplicate -> needs key
      { id: '2', orderKey: 'b' },
      { id: '3', orderKey: 'zz' },
    ];
    assignMissingKeys(rows);
    const keys = rows.map((r) => r.orderKey);
    expect(new Set(keys).size).toBe(keys.length);
    expect(rows[1].orderKey > 'zy' && rows[1].orderKey < 'zz').toBe(true);
  });
});
