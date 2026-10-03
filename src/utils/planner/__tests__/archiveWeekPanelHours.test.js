import { describe, it, expect } from 'vitest';
import { buildArchiveWeekPanelData } from '../archiveWeekPanelData';

const data = [
  { id: 'wk1', _rowType: 'archiveRow', archiveLabel: 'Jan 5 - Jan 11', archiveWeekLabel: 'Year 1, Week 1' },
  { id: 'hdrA', _rowType: 'archivedProjectHeader', groupId: 'grpA', parentGroupId: 'wk1', projectNickname: 'Alpha' },
  // timeValue is the source of truth (same as the archive table rows);
  // HH.mm encoded: 2.30 = 2h30m, 0.45 = 45m.
  { id: 't1', _rowType: 'projectTask', parentGroupId: 'grpA', status: 'Done', timeValue: '2.30', 'day-2': '2.30', _isArchivedTask: true },
  { id: 't2', _rowType: 'projectTask', parentGroupId: 'grpA', status: 'Done', timeValue: '0.45', 'day-3': '0.45', _isArchivedTask: true },
  // Logged time with no day-cell placement: the old day-cell derivation
  // dropped this entirely (the 2026-10-03 "Plan SC" panel undercount).
  { id: 't3', _rowType: 'projectTask', parentGroupId: 'grpA', status: 'Done', timeValue: '1.00', _isArchivedTask: true },
  // Snapshot parked directly under the week (no matching archived project
  // header): counted by the archive row's week total, so the panel must
  // surface it too, as Unfiled.
  { id: 't4', _rowType: 'projectTask', parentGroupId: 'wk1', status: 'Done', timeValue: '0.30', _isArchivedTask: true },
];

describe('archive week panel hours', () => {
  it('matches the archive table: timeValue-based, minutes not decimals', () => {
    const panel = buildArchiveWeekPanelData(data, 'wk1', {});
    const alpha = panel.projects.find((p) => p.name === 'Alpha');
    // 2h30m + 45m + 1h = 4h15m = 4.25 decimal hours.
    expect(alpha.current).toBe(4.25);
  });

  it('surfaces week-parented snapshot hours as Unfiled so totals match the row', () => {
    const panel = buildArchiveWeekPanelData(data, 'wk1', {});
    const unfiled = panel.projects.find((p) => p.name === 'Unfiled');
    expect(unfiled).toBeDefined();
    expect(unfiled.current).toBe(0.5); // 30m
    const total = panel.projects.reduce((s, p) => s + p.current, 0);
    expect(total).toBe(4.75); // same as the archive row's week total
  });
});
