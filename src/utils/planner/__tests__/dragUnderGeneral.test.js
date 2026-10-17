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

// 2026-10-17: dropping ON a section row files the dragged row UNDER it
// (insertAt = targetIndex + 1 for SECTION_DROP_ROW_TYPES). A freshly added
// empty subheader was otherwise untargetable — no child row existed to aim
// at, so the drop landed at the bottom of the section above, or was a no-op
// when the dragged row already sat directly above the subheader.
import { SECTION_DROP_ROW_TYPES } from '../../../hooks/planner/useDragAndDropRows';

describe('drop onto a section row files the task under it', () => {
  const mk = () => ([
    { id: 'ph', _rowType: 'projectHeader', groupId: 'project-LIFE' },
    { id: 'gen', _rowType: 'projectGeneral' },
    { id: 'laundry', _rowType: 'projectTask', task: 'Laundry' },
    { id: 'unsched', _rowType: 'projectUnscheduled' },
    { id: 'sub', _rowType: 'subprojectGeneral', subprojectLabel: 'New' }, // empty new subheader
    { id: 'inbox', _isInboxRow: true },
  ]);
  const insertAtFor = (rows, targetIndex) =>
    SECTION_DROP_ROW_TYPES.has(rows[targetIndex]._rowType ?? '') ? targetIndex + 1 : targetIndex;

  it('a task dropped on an empty new subheader lands directly below it', () => {
    const rows = mk();
    const target = rows.findIndex(r => r.id === 'sub');
    const moved = moveRows(rows, [2], insertAtFor(rows, target)); // drag Laundry onto the subheader
    expect(moved.map(r => r.id)).toEqual(['ph', 'gen', 'unsched', 'sub', 'laundry', 'inbox']);
  });

  it('the row directly above the subheader can still be filed under it (previously a no-op)', () => {
    const rows = mk();
    // Make Laundry sit directly above the subheader first.
    const pre = moveRows(rows, [2], 4); // ... unsched, laundry, sub ...
    const target = pre.findIndex(r => r.id === 'sub');
    const moved = moveRows(pre, [pre.findIndex(r => r.id === 'laundry')], insertAtFor(pre, target));
    expect(moved.map(r => r.id)).toEqual(['ph', 'gen', 'unsched', 'sub', 'laundry', 'inbox']);
  });

  it('project headers are not section drop targets (drop still lands above)', () => {
    expect(SECTION_DROP_ROW_TYPES.has('projectHeader')).toBe(false);
    expect(SECTION_DROP_ROW_TYPES.has('archivedProjectHeader')).toBe(false);
  });
});

// 2026-10-17 (the real "Clean under the Cleaning/Laundry label" repro): a
// manual label row (subprojectGeneral) inserted INSIDE a chip block. A chip
// task dropped under the label must re-parent to the project — when it kept
// its chip parent, relocateStrayChipTasks (whose positional walk resets at
// label rows) judged it stray and hauled it back under the chip header.
import { relocateStrayChipTasks, liftChipBlocksAboveSections } from '../chipRowPlacement';

describe('chip task dropped under a manual label row inside a chip block', () => {
  const mk = () => ([
    { id: 'ph', _rowType: 'projectHeader', groupId: 'project-LIFE' },
    { id: 'gym-hdr', _rowType: 'subprojectHeader', groupId: 'chip-g', parentGroupId: 'project-LIFE', _chipId: 'c-g1', _chipGroupKey: 'LIFE::gym' },
    { id: 'gym1', _rowType: 'projectTask', _chipId: 'c-g1', parentGroupId: 'chip-g', task: 'Gym' },
    { id: 'clean', _rowType: 'projectTask', _chipId: 'c-cl', parentGroupId: 'chip-g', task: 'Clean' },
    { id: 'label', _rowType: 'subprojectGeneral', subprojectLabel: '2 hours of Cleaning, haircut and Laundry' },
    { id: 'haircut', _rowType: 'projectTask', parentGroupId: 'chip-g', task: 'Haircut' },
    { id: 'gen', _rowType: 'projectGeneral' },
    { id: 'unsched', _rowType: 'projectUnscheduled' },
    { id: 'inbox', _isInboxRow: true },
  ]);

  it('stays under the label through drop + both reconcile passes', () => {
    const rows = mk();
    const from = rows.findIndex(r => r.id === 'clean');
    const target = rows.findIndex(r => r.id === 'label');
    // section drop target → insert below the label
    const dropped = assignParentGroupIds(moveRows(rows, [from], target + 1));
    const clean = dropped.find(r => r.id === 'clean');
    expect(clean.parentGroupId).toBe('project-LIFE'); // no longer chip-parented

    const r1 = relocateStrayChipTasks(dropped);
    const r2 = liftChipBlocksAboveSections(r1.rows);
    const ids = r2.rows.map(r => r.id);
    expect(ids.indexOf('clean')).toBe(ids.indexOf('label') + 1); // NOT yanked back
  });

  it('regression guard: with the chip parent kept, the reconcile yanks it back', () => {
    const rows = mk();
    const from = rows.findIndex(r => r.id === 'clean');
    const target = rows.findIndex(r => r.id === 'label');
    const dropped = moveRows(rows, [from], target + 1); // old drop path, no re-parent
    const r1 = relocateStrayChipTasks(dropped);
    expect(r1.movedIds).toContain('clean');
  });
});
