// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useState } from 'react';
import useDragAndDropRows from '../useDragAndDropRows';

// Drag task A1 onto subheader B. Upper half → last slot of group A (above
// B); lower half → filed under B. 2026-10-19: the "last slot under a
// subheader" was unreachable when section rows always took drops below.
const initial = () => ([
  { id: 'ph', _rowType: 'projectHeader', groupId: 'project-P', projectId: 'p1' },
  { id: 'subA', _rowType: 'subprojectHeader', groupId: 'gA', parentGroupId: 'project-P' },
  { id: 'a1', _rowType: 'projectTask', parentGroupId: 'gA' },
  { id: 'a2', _rowType: 'projectTask', parentGroupId: 'gA' },
  { id: 'subB', _rowType: 'subprojectHeader', groupId: 'gB', parentGroupId: 'project-P' },
  { id: 'b1', _rowType: 'projectTask', parentGroupId: 'gB' },
]);

const fakeEvent = (clientY) => ({
  preventDefault() {},
  clientY,
  currentTarget: { getBoundingClientRect: () => ({ top: 100, height: 20 }) },
  dataTransfer: { effectAllowed: '', dropEffect: '', setData() {}, setDragImage() {} },
});

function setup() {
  return renderHook(() => {
    const [data, setData] = useState(initial());
    const dnd = useDragAndDropRows({
      data, setData, selectedRows: new Set(), executeCommand: (c) => c.execute(),
    });
    return { data, dnd };
  });
}

function drag(result, y) {
  act(() => result.current.dnd.handleDragStart(fakeEvent(0), 'a1'));
  act(() => result.current.dnd.handleDragOver(fakeEvent(y), 'subB'));
  const below = result.current.dnd.dropTargetBelow;
  act(() => result.current.dnd.handleDrop(fakeEvent(y), 'subB'));
  return below;
}

describe('dropping on a subheader', () => {
  it('upper half lands in the last slot of the group above', () => {
    const { result } = setup();
    const below = drag(result, 104);
    expect(below).toBe(false);
    expect(result.current.data.map(r => r.id)).toEqual(['ph', 'subA', 'a2', 'a1', 'subB', 'b1']);
  });
  it('lower half files the row under the subheader', () => {
    const { result } = setup();
    const below = drag(result, 116);
    expect(below).toBe(true);
    expect(result.current.data.map(r => r.id)).toEqual(['ph', 'subA', 'a2', 'subB', 'a1', 'b1']);
  });
});
