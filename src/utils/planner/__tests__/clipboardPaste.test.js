import { describe, it, expect } from 'vitest';
import { handlePasteOperation } from '../clipboardOperations';

const cols = ['rowNum', 'task', 'estimate', 'timeValue'];
const mk = () => [0, 1, 2, 3, 4, 5, 6].map(i => ({ id: `r${i}`, task: `t${i}`, estimate: '2 Hours', timeValue: '2.00' }));
const run = (text, cells) => {
  let data = mk();
  const cmd = handlePasteOperation({
    pastedText: text, selectedRows: new Set(), selectedCells: new Set(cells), data,
    allColumnIds: cols, editingCell: null, lastCopiedColumns: ['estimate', 'timeValue'],
    setData: (fn) => { data = fn(data); },
  });
  cmd.execute();
  return data;
};

describe('system page grid paste', () => {
  it('spreads a copied pair across two cells when one cell is selected', () => {
    const d = run('30 Minutes\t0.30', ['r1|estimate']);
    expect([d[1].estimate, d[1].timeValue]).toEqual(['30 Minutes', '0.30']);
    expect(d[2].estimate).toBe('2 Hours');
  });
  it('tiles a copied pair into a 6 cell selection', () => {
    const d = run('30 Minutes\t0.30\n', ['r2|estimate', 'r2|timeValue', 'r3|estimate', 'r3|timeValue', 'r4|estimate', 'r4|timeValue']);
    [2, 3, 4].forEach(i => expect([d[i].estimate, d[i].timeValue]).toEqual(['30 Minutes', '0.30']));
    expect(d[5].estimate).toBe('2 Hours');
  });
  it('pastes once from the top left when the selection is not a multiple', () => {
    const d = run('30 Minutes\t0.30\n1 Hour\t1.00', ['r5|estimate', 'r4|estimate', 'r3|timeValue', 'r3|estimate']);
    expect([d[3].estimate, d[3].timeValue]).toEqual(['30 Minutes', '0.30']);
    expect([d[4].estimate, d[4].timeValue]).toEqual(['1 Hour', '1.00']);
    expect(d[5].estimate).toBe('2 Hours');
  });
});
