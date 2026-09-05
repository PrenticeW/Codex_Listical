import { describe, it, expect } from 'vitest';
import {
  collectTasksForArchive,
  isArchiveSweepStatus,
  isTaskInArchivedWeek,
  taskHasDayOutsideRange,
  moveTasksToArchive,
  resetRecurringTasks,
  snapshotRecurringTask,
  insertRecurringSnapshots,
} from '../archiveHelpers';
import { isRecurringValue } from '../valueNormalizers';

const T = 84;
const WEEK = 7; // archiving week 2 (days 7-13)

// Mirrors the two filters in ProjectTimePlannerV2.handleArchiveWeek exactly.
const run = (data, weekId) => {
  const nonRecurring = collectTasksForArchive(data, t =>
    isArchiveSweepStatus(t.status) && !isRecurringValue(t.recurring) &&
    isTaskInArchivedWeek(t, WEEK, T) && !taskHasDayOutsideRange(t, WEEK, T));
  const recurring = collectTasksForArchive(data, t =>
    isArchiveSweepStatus(t.status) &&
    (isRecurringValue(t.recurring) || taskHasDayOutsideRange(t, WEEK, T)) &&
    isTaskInArchivedWeek(t, WEEK, T));
  const snaps = recurring.map(t => snapshotRecurringTask(t, WEEK, T));
  let out = resetRecurringTasks(data, T, WEEK);
  out = moveTasksToArchive(out, nonRecurring, weekId);
  out = insertRecurringSnapshots(out, snaps, weekId);
  return out;
};

describe("rows stamped recurring 'false' by the mobile app", () => {
  const weekId = 'archive-week-x';
  const base = [
    { id: 'hdr', _rowType: 'projectHeader', projectNickname: 'FINANCES', groupId: 'g1' },
    { id: 'archHdr', _rowType: 'archiveHeader' },
    { id: weekId, _rowType: 'archiveWeek', archiveWeekLabel: 'Year 5, Week 2' },
    { id: 'ah', _rowType: 'archivedProjectHeader', projectNickname: 'FINANCES', groupId: 'ag1', parentGroupId: weekId },
    { id: 'ag', _rowType: 'archivedProjectGeneral', projectNickname: 'FINANCES', parentGroupId: 'ag1' },
    { id: 'au', _rowType: 'archivedProjectUnscheduled', projectNickname: 'FINANCES', parentGroupId: 'ag1' },
  ];

  it('Done with hours in the archived week: moved out whole, not reset in place', () => {
    const task = { id: 't1', project: 'FINANCES', task: 'Move ISA', status: 'Done', recurring: 'false', 'day-9': '0.30' };
    const out = run([...base, task], weekId);
    const copies = out.filter(r => r.task === 'Move ISA');
    expect(copies).toHaveLength(1);              // one row, not original + snapshot
    expect(copies[0].id).toBe('t1');             // the original itself moved
    expect(copies[0]._isArchivedTask).toBe(true);
    expect(copies[0].status).toBe('Done');       // status kept
    expect(copies[0]['day-9']).toBe('0.30');     // hours kept
  });

  it('Accounted / Abandoned with no hours at all: moved out whole too', () => {
    const tasks = [
      { id: 't2', project: 'FINANCES', task: 'Hide weeks', status: 'Accounted', recurring: 'false' },
      { id: 't3', project: 'FINANCES', task: 'Sync msg', status: 'Abandoned', recurring: 'false' },
    ];
    const out = run([...base, ...tasks], weekId);
    for (const id of ['t2', 't3']) {
      const rows = out.filter(r => r.id === id);
      expect(rows).toHaveLength(1);
      expect(rows[0]._isArchivedTask).toBe(true);
    }
    expect(out.filter(r => ['Hide weeks', 'Sync msg'].includes(r.task))).toHaveLength(2);
  });

  it("'Not Recurring' (web checkbox) behaves the same", () => {
    const task = { id: 't4', project: 'FINANCES', task: 'Call V', status: 'Done', recurring: 'Not Recurring', 'day-10': '1.00' };
    const out = run([...base, task], weekId);
    const rows = out.filter(r => r.task === 'Call V');
    expect(rows).toHaveLength(1);
    expect(rows[0]._isArchivedTask).toBe(true);
  });

  it('a genuinely recurring row still gets snapshot + reset', () => {
    const task = { id: 't5', project: 'FINANCES', task: 'Build time', status: 'Done', recurring: 'Recurring', 'day-9': '1.00' };
    const out = run([...base, task], weekId);
    const live = out.find(r => r.id === 't5');
    expect(live._isArchivedTask).toBeUndefined();
    expect(live.status).toBe('Not Scheduled');
    expect(live['day-9']).toBe('');
    expect(out.filter(r => r.task === 'Build time' && r._isArchivedTask)).toHaveLength(1);
  });
});
