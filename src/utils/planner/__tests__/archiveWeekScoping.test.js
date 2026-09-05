import { describe, it, expect } from 'vitest';
import {
  isTaskInArchivedWeek,
  taskHasDayOutsideRange,
  snapshotRecurringTask,
  resetRecurringTasks,
} from '../archiveHelpers';

const T = 84;

describe('archive week scoping', () => {
  it('keeps week-two Done tasks out of a week-one archive', () => {
    expect(isTaskInArchivedWeek({ status: 'Done', 'day-8': '1:30' }, 0, T)).toBe(false);
    expect(isTaskInArchivedWeek({ status: 'Done', 'day-8': '0.00' }, 0, T)).toBe(false);
  });

  it('a 0.00 in the target week ties the task to it', () => {
    expect(isTaskInArchivedWeek({ status: 'Done', 'day-2': '0.00' }, 0, T)).toBe(true);
    expect(isTaskInArchivedWeek({ status: 'Done', 'day-2': '0.00', 'day-15': '1:00' }, 0, T)).toBe(true);
  });

  it('blank tasks are still swept in', () => {
    expect(isTaskInArchivedWeek({ status: 'Done' }, 0, T)).toBe(true);
  });

  it('detects values outside the archived week', () => {
    expect(taskHasDayOutsideRange({ 'day-2': '1:00', 'day-9': '1:00' }, 0, T)).toBe(true);
    expect(taskHasDayOutsideRange({ 'day-2': '1:00' }, 0, T)).toBe(false);
  });

  it('snapshot keeps only the archived week values', () => {
    const snap = snapshotRecurringTask(
      { id: 'x', status: 'Done', 'day-2': '1:00', 'day-9': '2:00', 'multiStatus-9': 'Scheduled' }, 0, T);
    expect(snap['day-2']).toBe('1:00');
    expect(snap['day-9']).toBe('');
    expect(snap['multiStatus-9']).toBe('');
  });

  it('reset clears the archived week on spanning non-recurring tasks and keeps future status', () => {
    const rows = [{ id: 'a', status: 'Done', 'day-2': '1:00', 'day-9': '2:00' }];
    const [out] = resetRecurringTasks(rows, T, 0);
    expect(out['day-2']).toBe('');
    expect(out['day-9']).toBe('2:00');
    expect(out.status).toBe('Scheduled'); // one remaining instance, no forced Not Scheduled
  });

  it('reset uses the remaining single instance stored status', () => {
    const rows = [{ id: 'a', recurring: 'Recurring', status: 'Done', 'day-2': '1:00', 'day-9': '2:00', 'multiStatus-9': 'In Progress' }];
    const [out] = resetRecurringTasks(rows, T, 0);
    expect(out.status).toBe('In Progress');
  });

  it('reset leaves rows scheduled only in other weeks alone', () => {
    const rows = [{ id: 'a', recurring: 'Recurring', status: 'Done', 'day-9': '2:00' }];
    const [out] = resetRecurringTasks(rows, T, 0);
    expect(out['day-9']).toBe('2:00');
    expect(out.status).toBe('Done');
  });

  it('reset falls back to Not Scheduled when nothing remains', () => {
    const rows = [{ id: 'a', recurring: 'Recurring', status: 'Done', 'day-2': '1:00' }];
    const [out] = resetRecurringTasks(rows, T, 0);
    expect(out.status).toBe('Not Scheduled');
  });
});

describe('recurring vocabulary at archive time', () => {
  it("'Not Recurring' and 'false' are not recurring; the live row is left for moveTasksToArchive", () => {
    const rows = [
      { id: 'a', status: 'Done', recurring: 'Not Recurring', 'day-2': '1:00' },
      { id: 'b', status: 'Accounted', recurring: 'false', 'day-3': '1:00' },
      { id: 'c', status: 'Abandoned', recurring: '', 'day-4': '1:00' },
    ];
    // Not treated as recurring → resetRecurringTasks must not touch them
    // (they are moved whole into the archive by the caller instead).
    const out = resetRecurringTasks(rows, T, 0);
    expect(out).toEqual(rows);
  });

  it("'Recurring' and 'true' are recurring; the live row is reset in place", () => {
    const rows = [
      { id: 'a', status: 'Done', recurring: 'Recurring', 'day-2': '1:00' },
      { id: 'b', status: 'Done', recurring: 'true', 'day-3': '1:00' },
    ];
    const out = resetRecurringTasks(rows, T, 0);
    expect(out[0].status).toBe('Not Scheduled');
    expect(out[0]['day-2']).toBe('');
    expect(out[1].status).toBe('Not Scheduled');
    expect(out[1]['day-3']).toBe('');
  });
});
