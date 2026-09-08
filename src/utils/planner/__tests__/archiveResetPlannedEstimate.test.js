import { describe, it, expect } from 'vitest';
import { resetRecurringTasks } from '../archiveHelpers';

const T = 84;
const WEEK = 7; // archiving week 2 (days 7-13)

const chipTask = (over = {}) => ({
  id: 't1',
  _rowType: 'projectTask',
  task: 'Stretch',
  status: 'Done',
  recurring: 'true',
  estimate: 'Custom',
  timeValue: '3.00',
  _originalEstimate: '2 Hours',
  _originalTimeValue: '2.00',
  'day-9': '3.00',
  ...over,
});

describe('archive resets recurring chip tasks to their planned estimate', () => {
  it('restores estimate and timeValue from the chip originals', () => {
    const [out] = resetRecurringTasks([chipTask()], T, WEEK);
    expect(out.estimate).toBe('2 Hours');
    expect(out.timeValue).toBe('2.00');
    expect(out['day-9']).toBe('');
    expect(out.status).toBe('Not Scheduled');
    expect(out._originalEstimate).toBe('2 Hours'); // plan itself untouched
  });

  it('leaves rows with no plan (no chip origin) as they are', () => {
    const [out] = resetRecurringTasks(
      [chipTask({ _originalEstimate: undefined, _originalTimeValue: undefined })], T, WEEK);
    expect(out.estimate).toBe('Custom');
    expect(out.timeValue).toBe('3.00');
  });

  it('leaves Multi rows alone', () => {
    const [out] = resetRecurringTasks(
      [chipTask({ estimate: 'Multi', 'day-8': '1.00' })], T, WEEK);
    expect(out.estimate).toBe('Multi');
    expect(out.timeValue).toBe('3.00');
  });

  it('does not touch non-recurring rows or rows outside the archived week', () => {
    const notRecurring = chipTask({ id: 'a', recurring: 'false' });
    const otherWeek = chipTask({ id: 'b', 'day-9': '', 'day-20': '3.00' });
    const [a, b] = resetRecurringTasks([notRecurring, otherWeek], T, WEEK);
    expect(a.estimate).toBe('Custom');
    expect(b.estimate).toBe('Custom');
    expect(b['day-20']).toBe('3.00');
  });

  it('never touches archived snapshots', () => {
    const [out] = resetRecurringTasks([chipTask({ _isArchivedTask: true })], T, WEEK);
    expect(out.estimate).toBe('Custom');
    expect(out['day-9']).toBe('3.00');
  });
});
