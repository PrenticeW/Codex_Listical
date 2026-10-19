import { describe, it, expect } from 'vitest';
import { estimateDisplayLabel, formatDurationLabel } from '../estimateDisplay';

describe('estimateDisplayLabel', () => {
  it('shows the actual time for Custom rows', () => {
    expect(estimateDisplayLabel('Custom', '12.55')).toBe('12 hours, 55 minutes');
    expect(estimateDisplayLabel('Custom', '1.15')).toBe('1 hour, 15 minutes');
    expect(estimateDisplayLabel('Custom', '1.01')).toBe('1 hour, 1 minute');
    expect(estimateDisplayLabel('Custom', '0.07')).toBe('7 minutes');
    expect(estimateDisplayLabel('Custom', '12.00')).toBe('12 hours');
  });
  it('falls back to the word when there is no usable time', () => {
    expect(estimateDisplayLabel('Custom', '0.00')).toBe('Custom');
    expect(estimateDisplayLabel('Custom', undefined)).toBe('Custom');
  });
  it('leaves every other label alone', () => {
    for (const l of ['2 Hours', '30 Minutes', '-', 'Multi', '', undefined]) {
      expect(estimateDisplayLabel(l, '1.30')).toBe(l);
    }
  });
  it('formats durations', () => {
    expect(formatDurationLabel(775)).toBe('12 hours, 55 minutes');
    expect(formatDurationLabel(0)).toBe('');
  });
});
