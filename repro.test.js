import { describe, it, expect } from 'vitest';
import { assignParentGroupIds } from './src/hooks/planner/useParentGroupAssignment';
import { relocateStrayChipTasks, liftChipBlocksAboveSections } from './src/utils/planner/chipRowPlacement';
import { SECTION_DROP_ROW_TYPES } from './src/hooks/planner/useDragAndDropRows';

const moveRows = (prev, draggedIndices, insertAt) => {
  const d = [...prev];
  const dragged = draggedIndices.map(i => d[i]);
  for (let i = draggedIndices.length - 1; i >= 0; i--) d.splice(draggedIndices[i], 1);
  const before = draggedIndices.filter(i => i < insertAt).length;
  d.splice(insertAt - before, 0, ...dragged);
  return d;
};

// Exact shapes from production (LIFE UPKEEP, 2026-10-17):
const GYM = 'chip-gymgroup';
const CLEANING = 'chip-cleaninggroup';
const mk = () => ([
  { id: 'ph-lu', _rowType: 'projectHeader', groupId: 'project-LIFE UPKEEP' },
  { id: 'gym-hdr', _rowType: 'subprojectHeader', groupId: GYM, parentGroupId: 'project-LIFE UPKEEP', _chipId: 'c-g1', _chipGroupKey: 'LIFE UPKEEP::gym' },
  { id: 'gym1', _rowType: 'projectTask', _chipId: 'c-g1', parentGroupId: GYM, task: 'Gym' },
  { id: 'gym2', _rowType: 'projectTask', _chipId: 'c-g2', parentGroupId: GYM, task: 'Gym' },
  // "Clean": NO chip id, parented into the gym chip group (production shape)
  { id: 'clean', _rowType: 'projectTask', parentGroupId: GYM, task: 'Clean' },
  // Cleaning header: parented to the WRONG project (production shape!)
  { id: 'clean-hdr', _rowType: 'subprojectHeader', groupId: CLEANING, parentGroupId: 'project-TEST TACULAR', _chipId: 'c-h1', _chipGroupKey: 'LIFE UPKEEP::cleaning' },
  { id: 'haircut', _rowType: 'projectTask', _chipId: 'c-h1', parentGroupId: CLEANING, task: 'Haircut' },
  { id: 'laundry', _rowType: 'projectTask', _chipId: 'c-h2', parentGroupId: CLEANING, task: 'Laundry' },
  { id: 'gen', _rowType: 'projectGeneral', parentGroupId: 'project-LIFE UPKEEP' },
  { id: 'unsched', _rowType: 'projectUnscheduled', parentGroupId: 'project-LIFE UPKEEP' },
  { id: 'ph-tt', _rowType: 'projectHeader', groupId: 'project-TEST TACULAR' },
  { id: 'inbox', _isInboxRow: true },
]);

describe('production repro: drag Clean under the Cleaning subheader', () => {
  it('survives the full drop + reconcile pipeline', () => {
    const data = mk();
    const from = data.findIndex(r => r.id === 'clean');
    const target = data.findIndex(r => r.id === 'clean-hdr');
    const insertAt = SECTION_DROP_ROW_TYPES.has(data[target]._rowType ?? '') ? target + 1 : target;
    // drop path
    let moved = assignParentGroupIds(moveRows(data, [from], insertAt));
    console.log('after drop:', moved.map(r => r.id).join(','));
    console.log('clean parent after drop:', moved.find(r => r.id === 'clean').parentGroupId);
    // chip reconcile passes
    const r1 = relocateStrayChipTasks(moved);
    console.log('relocate moved:', r1.movedIds, r1.rows.map(r => r.id).join(','));
    const r2 = liftChipBlocksAboveSections(r1.rows);
    console.log('lift moved:', r2.movedIds, r2.rows.map(r => r.id).join(','));
    const ids = r2.rows.map(r => r.id);
    expect(ids.indexOf('clean')).toBe(ids.indexOf('clean-hdr') + 1);
  });
});
