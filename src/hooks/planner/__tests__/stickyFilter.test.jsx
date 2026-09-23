// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useFilteredData } from '../useFilteredData';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const coerceNumber = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
};

const EMPTY = new Set();

const baseParams = (computedData, overrides = {}) => ({
  computedData,
  dayColumnFilters: EMPTY,
  selectedProjectFilters: EMPTY,
  selectedSubprojectFilters: EMPTY,
  selectedStatusFilters: EMPTY,
  selectedRecurringFilters: EMPTY,
  selectedEstimateFilters: EMPTY,
  collapsedGroups: EMPTY,
  coerceNumber,
  dayFilter: null,
  projectFilter: null,
  totalDays: 0,
  ...overrides,
});

const task = (id, status) => ({ id, task: id, status, project: 'P', subproject: 'S' });

describe('sticky filter membership (rows must not vanish mid-edit)', () => {
  it('keeps an edited row visible while the same filter stays active', () => {
    const done = new Set(['Done']);
    const v1 = [task('t1', 'Done'), task('t2', 'Scheduled')];

    const { result, rerender } = renderHook(
      (props) => useFilteredData(props),
      { initialProps: baseParams(v1, { selectedStatusFilters: done }) }
    );
    expect(result.current.map(r => r.id)).toEqual(['t1']);

    // Edit t1 so it no longer matches the active status filter
    const v2 = [task('t1', 'Scheduled'), task('t2', 'Scheduled')];
    rerender(baseParams(v2, { selectedStatusFilters: done }));
    expect(result.current.map(r => r.id)).toEqual(['t1']); // still visible

    // A row edited INTO the filter appears (and then also sticks)
    const v3 = [task('t1', 'Scheduled'), task('t2', 'Done')];
    rerender(baseParams(v3, { selectedStatusFilters: done }));
    expect(result.current.map(r => r.id)).toEqual(['t1', 't2']);
  });

  it('re-evaluates from scratch when the filter itself changes', () => {
    const done = new Set(['Done']);
    const v1 = [task('t1', 'Done'), task('t2', 'Scheduled')];
    const { result, rerender } = renderHook(
      (props) => useFilteredData(props),
      { initialProps: baseParams(v1, { selectedStatusFilters: done }) }
    );
    expect(result.current.map(r => r.id)).toEqual(['t1']);

    const v2 = [task('t1', 'Scheduled'), task('t2', 'Scheduled')];
    rerender(baseParams(v2, { selectedStatusFilters: done }));
    expect(result.current.map(r => r.id)).toEqual(['t1']);

    // Changing the filter selection drops the sticky set
    rerender(baseParams(v2, { selectedStatusFilters: new Set(['Blocked']) }));
    expect(result.current.map(r => r.id)).toEqual([]);

    // Re-selecting Done now finds nothing either (t1 no longer sticks)
    rerender(baseParams(v2, { selectedStatusFilters: new Set(['Done']) }));
    expect(result.current.map(r => r.id)).toEqual([]);
  });

  it('clearing all filters shows everything and resets stickiness', () => {
    const done = new Set(['Done']);
    const v1 = [task('t1', 'Done'), task('t2', 'Scheduled')];
    const { result, rerender } = renderHook(
      (props) => useFilteredData(props),
      { initialProps: baseParams(v1, { selectedStatusFilters: done }) }
    );
    expect(result.current.map(r => r.id)).toEqual(['t1']);

    rerender(baseParams(v1));
    expect(result.current.map(r => r.id)).toEqual(['t1', 't2']);
  });
});
