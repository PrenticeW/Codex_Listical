import { describe, it, expect } from 'vitest';
import { computeArchiveTotals } from '../useArchiveTotals';

const T = 14;

const week = { id: 'wk1', _rowType: 'archiveRow' };
const header = { id: 'hdrA', _rowType: 'archivedProjectHeader', groupId: 'grpA', parentGroupId: 'wk1', projectNickname: 'Alpha' };
const general = { id: 'genA', _rowType: 'archivedProjectGeneral', parentGroupId: 'grpA' };

describe('computeArchiveTotals', () => {
  it('sums HH.mm timeValues via minutes, not decimals', () => {
    // 2.30 (2h30m) + 0.45 (45m) = 3h15m = "3.15"
    const data = [week, header, general,
      { id: 't1', _rowType: 'projectTask', parentGroupId: 'grpA', status: 'Done', timeValue: '2.30', 'day-2': '2.30', _isArchivedTask: true },
      { id: 't2', _rowType: 'projectTask', parentGroupId: 'grpA', status: 'Done', timeValue: '0.45', 'day-2': '0.45', _isArchivedTask: true },
    ];
    const { projectTotals, weekTotals } = computeArchiveTotals(data, T);
    expect(projectTotals.hdrA).toBe('3.15');
    expect(weekTotals.wk1.totalHours).toBe('3.15');
    expect(weekTotals.wk1.dayTotals['day-2']).toBe('3.15');
  });

  it('counts tasks even when later rows are ordinary task rows (no premature close)', () => {
    const tasks = Array.from({ length: 5 }, (_, i) => (
      { id: `t${i}`, _rowType: 'projectTask', parentGroupId: 'grpA', status: 'Done', timeValue: '1.00', _isArchivedTask: true }
    ));
    const { projectTotals } = computeArchiveTotals([week, header, general, ...tasks], T);
    expect(projectTotals.hdrA).toBe('5.00');
  });

  it('counts legacy rows with no _rowType', () => {
    const data = [week, header, general,
      { id: 't1', parentGroupId: 'grpA', status: 'Done', timeValue: '1.30', _isArchivedTask: true },
    ];
    expect(computeArchiveTotals(data, T).projectTotals.hdrA).toBe('1.30');
  });

  it('excludes Abandoned tasks and structure rows', () => {
    const data = [week, header, general,
      { id: 't1', _rowType: 'projectTask', parentGroupId: 'grpA', status: 'Abandoned', timeValue: '4.00', _isArchivedTask: true },
      { id: 'sub', _rowType: 'subprojectGeneral', parentGroupId: 'grpA', status: 'Done', timeValue: '9.00' },
    ];
    expect(computeArchiveTotals(data, T).projectTotals.hdrA).toBe('0.00');
    expect(computeArchiveTotals(data, T).weekTotals.wk1.totalHours).toBe('0.00');
  });

  it('counts tasks parented directly to the week toward the week total', () => {
    const data = [week, header, general,
      { id: 't1', _rowType: 'projectTask', parentGroupId: 'wk1', status: 'Done', timeValue: '0.30', _isArchivedTask: true },
    ];
    const { projectTotals, weekTotals } = computeArchiveTotals(data, T);
    expect(projectTotals.hdrA).toBe('0.00');
    expect(weekTotals.wk1.totalHours).toBe('0.30');
  });

  it('keeps weeks separate', () => {
    const week2 = { id: 'wk2', _rowType: 'archiveRow' };
    const headerB = { id: 'hdrB', _rowType: 'archivedProjectHeader', groupId: 'grpB', parentGroupId: 'wk2' };
    const data = [week, header, general, week2, headerB,
      { id: 't1', _rowType: 'projectTask', parentGroupId: 'grpA', status: 'Done', timeValue: '1.00', _isArchivedTask: true },
      { id: 't2', _rowType: 'projectTask', parentGroupId: 'grpB', status: 'Done', timeValue: '2.00', _isArchivedTask: true },
    ];
    const { weekTotals } = computeArchiveTotals(data, T);
    expect(weekTotals.wk1.totalHours).toBe('1.00');
    expect(weekTotals.wk2.totalHours).toBe('2.00');
  });
});
