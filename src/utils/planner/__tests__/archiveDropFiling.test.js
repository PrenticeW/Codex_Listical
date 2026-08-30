import { describe, it, expect } from 'vitest';
import { moveTasksToArchive } from '../archiveHelpers';

const week = { id: 'wk-1', _rowType: 'archiveRow', groupId: 'wk-1' };
const header = {
  id: 'ah-1', _rowType: 'archivedProjectHeader', groupId: 'ap-1',
  parentGroupId: 'wk-1', projectNickname: 'alpha',
};
const general = {
  id: 'ag-1', _rowType: 'archivedProjectGeneral', projectNickname: 'alpha', parentGroupId: 'ap-1',
};
const unscheduled = {
  id: 'au-1', _rowType: 'archivedProjectUnscheduled', projectNickname: 'alpha', parentGroupId: 'ap-1',
};

describe('filing a live task into an existing archive week', () => {
  it('moves an Accounted task under the matching general section', () => {
    const task = { id: 't1', status: 'Accounted', projectNickname: 'alpha', task: 'wayward' };
    const data = [task, week, header, general, unscheduled];
    const out = moveTasksToArchive(data, [task], 'wk-1');

    const moved = out.find(r => r.id === 't1');
    expect(out.filter(r => r.id === 't1')).toHaveLength(1);
    expect(moved._isArchivedTask).toBe(true);
    expect(moved.parentGroupId).toBe('ap-1');
    // lands directly after the general section row
    expect(out.indexOf(moved)).toBe(out.findIndex(r => r.id === 'ag-1') + 1);
  });

  it('parks a task under the week when its project has no archived header', () => {
    const task = { id: 't2', status: 'Done', projectNickname: 'beta', task: 'orphan' };
    const data = [task, week, header, general, unscheduled];
    const out = moveTasksToArchive(data, [task], 'wk-1');

    const moved = out.find(r => r.id === 't2');
    expect(moved).toBeTruthy(); // not silently dropped
    expect(moved._isArchivedTask).toBe(true);
    expect(moved.parentGroupId).toBe('wk-1');
    expect(out.indexOf(moved)).toBe(out.findIndex(r => r.id === 'wk-1') + 1);
  });
});
