import { describe, it, expect } from 'vitest';
import { buildArchiveWeekPanelData } from '../archiveWeekPanelData';

const data = [
  { id: 'wk1', _rowType: 'archiveRow', archiveLabel: 'Jan 5 - Jan 11', archiveWeekLabel: 'Year 1, Week 1' },
  { id: 'hdrA', _rowType: 'archivedProjectHeader', groupId: 'grpA', parentGroupId: 'wk1', projectNickname: 'Alpha' },
  { id: 't1', _rowType: 'projectTask', parentGroupId: 'grpA', status: 'Done', 'day-2': '2.30', _isArchivedTask: true },
  { id: 't2', _rowType: 'projectTask', parentGroupId: 'grpA', status: 'Done', 'day-3': '0.45', _isArchivedTask: true },
];

describe('archive week panel hours', () => {
  it('sums HH.mm day entries via minutes, not decimals', () => {
    const panel = buildArchiveWeekPanelData(data, 'wk1', {});
    const alpha = panel.projects.find((p) => p.name === 'Alpha');
    // 2h30m + 45m = 3h15m = 3.25 decimal hours → 3.3 after 1dp rounding.
    // The old parseFloat sum gave 2.30 + 0.45 = 2.8 (rounded from 2.75).
    expect(alpha.current).toBe(3.3);
  });
});
