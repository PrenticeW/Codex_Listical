import { describe, it, expect } from 'vitest';
import { assignParentGroupIds } from '../../../hooks/planner/useParentGroupAssignment';

// Mirrors the drop path: moveRows + assignParentGroupIds (the fix), then the
// ProjectTimePlannerV2 step-4 "misplaced chip rows" check must NOT yank the row.
const moveRows = (prev, draggedIndices, insertAt) => {
  const d = [...prev];
  const dragged = draggedIndices.map(i => d[i]);
  for (let i = draggedIndices.length - 1; i >= 0; i--) d.splice(draggedIndices[i], 1);
  const before = draggedIndices.filter(i => i < insertAt).length;
  d.splice(insertAt - before, 0, ...dragged);
  return d;
};

const step4Misplaced = (rows) => {
  const sectionRowTypes = new Set(['projectGeneral', 'projectUnscheduled', 'subprojectGeneral', 'subprojectUnscheduled']);
  const misplacedIds = [];
  let i = 0;
  while (i < rows.length) {
    if (rows[i]._rowType === 'projectHeader') {
      const projectGroupId = rows[i].groupId;
      const blockIndices = [], sectionIndices = [];
      let j = i + 1;
      while (j < rows.length && rows[j]._rowType !== 'projectHeader') {
        const r = rows[j];
        if (r._rowType === 'subprojectHeader' && r.parentGroupId === projectGroupId) blockIndices.push(j);
        else if (r._rowType === 'projectTask' && r._chipId && r.parentGroupId?.startsWith('chip')) blockIndices.push(j);
        else if (sectionRowTypes.has(r._rowType)) sectionIndices.push(j);
        j++;
      }
      const firstSection = sectionIndices.length ? sectionIndices[0] : Infinity;
      blockIndices.filter(idx => idx > firstSection).forEach(idx => misplacedIds.push(rows[idx].id));
    }
    i++;
  }
  return misplacedIds;
};

const mkData = () => ([
  { id: 'ph', _rowType: 'projectHeader', groupId: 'project-LIFE' },
  { id: 'sh', _rowType: 'subprojectHeader', groupId: 'chip-1', parentGroupId: 'project-LIFE' },
  { id: 'gym', _rowType: 'projectTask', _chipId: 'c-gym', parentGroupId: 'chip-1', task: 'Gym' },
  { id: 'hair', _rowType: 'projectTask', _chipId: 'c-hair', parentGroupId: 'chip-1', task: 'Haircut' },
  { id: 'gen', _rowType: 'projectGeneral' },
  { id: 'laundry', _rowType: 'projectTask', task: 'Laundry' },
  { id: 'unsched', _rowType: 'projectUnscheduled' },
  { id: 'inbox', _isInboxRow: true },
]);

describe('drag a chip task under the General section row', () => {
  it('re-parents on drop so the reconcile effect no longer yanks it back', () => {
    const data = mkData();
    // Drag "Haircut" (idx 3) to land above "Laundry" (idx 5) — i.e. under General
    const moved = assignParentGroupIds(moveRows(data, [3], 5));
    const hair = moved.find(r => r.id === 'hair');
    expect(moved.map(r => r.id)).toEqual(['ph', 'sh', 'gym', 'gen', 'hair', 'laundry', 'unsched', 'inbox']);
    expect(hair.parentGroupId).toBe('project-LIFE');   // no longer chip-parented
    expect(step4Misplaced(moved)).toEqual([]);          // effect leaves it alone
  });

  it('without re-parenting the old behaviour yanked the row (regression guard)', () => {
    const data = mkData();
    const moved = moveRows(data, [3], 5); // no assignParentGroupIds — old drop path
    expect(step4Misplaced(moved)).toEqual(['hair']);
  });

  it('a chip task dragged within its own chip block keeps its chip parent', () => {
    const data = mkData();
    const moved = assignParentGroupIds(moveRows(data, [3], 2)); // Haircut above Gym
    expect(moved.find(r => r.id === 'hair').parentGroupId).toBe('chip-1');
    expect(step4Misplaced(moved)).toEqual([]);
  });
});
