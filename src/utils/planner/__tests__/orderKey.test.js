import { describe, it, expect } from 'vitest';
import {
  keyBetween, keysBetween, backfillKey, ensureOrderKeys,
  isValidOrderKey, compareRowOrder,
} from '../orderKey.js';

describe('keyBetween', () => {
  it('generates ordered keys at open ends and midpoints', () => {
    const m = keyBetween(null, null);
    const lo = keyBetween(null, m);
    const hi = keyBetween(m, null);
    expect(lo < m && m < hi).toBe(true);
    for (const k of [m, lo, hi]) expect(isValidOrderKey(k)).toBe(true);
  });

  it('always finds a key between adjacent keys (stress)', () => {
    let a = keyBetween(null, null);
    let b = keyBetween(a, null);
    for (let i = 0; i < 200; i += 1) {
      const m = keyBetween(a, b);
      expect(a < m && m < b).toBe(true);
      expect(isValidOrderKey(m)).toBe(true);
      if (i % 2) a = m; else b = m;
    }
  });

  it('keysBetween returns n ordered keys', () => {
    const ks = keysBetween(null, null, 25);
    expect(ks).toHaveLength(25);
    for (let i = 1; i < ks.length; i += 1) expect(ks[i - 1] < ks[i]).toBe(true);
  });

  it('backfillKey is ordered and valid for large indexes', () => {
    let prevK = null;
    for (const i of [0, 1, 61, 62, 500, 5000, 100000]) {
      const k = backfillKey(i);
      expect(isValidOrderKey(k)).toBe(true);
      if (prevK) expect(prevK < k).toBe(true);
      prevK = k;
    }
  });
});

describe('ensureOrderKeys', () => {
  const mk = (id, orderKey) => ({ id, orderKey });

  it('assigns keys to a fresh list and is idempotent', () => {
    const rows = [mk('a'), mk('b'), mk('c')];
    const changed = ensureOrderKeys(rows);
    expect(changed.sort()).toEqual(['a', 'b', 'c']);
    expect(rows[0].orderKey < rows[1].orderKey).toBe(true);
    expect(rows[1].orderKey < rows[2].orderKey).toBe(true);
    expect(ensureOrderKeys(rows)).toEqual([]);
  });

  it('rekeys only the moved row', () => {
    const rows = [mk('a'), mk('b'), mk('c'), mk('d')];
    ensureOrderKeys(rows);
    // move d between a and b
    const reordered = [rows[0], rows[3], rows[1], rows[2]];
    const changed = ensureOrderKeys(reordered);
    expect(changed).toEqual(['d']);
    expect(reordered.map((r) => r.orderKey)).toEqual(
      [...reordered.map((r) => r.orderKey)].sort(),
    );
  });

  it('rekeys inserted rows without touching neighbours', () => {
    const rows = [mk('a'), mk('b'), mk('c')];
    ensureOrderKeys(rows);
    const withNew = [rows[0], mk('x'), mk('y'), rows[1], rows[2]];
    const changed = ensureOrderKeys(withNew);
    expect(changed.sort()).toEqual(['x', 'y']);
  });

  it('repairs duplicate keys', () => {
    const rows = [mk('a', 'V'), mk('b', 'V'), mk('c', 'k')];
    const changed = ensureOrderKeys(rows);
    expect(changed).toContain('b');
    const keys = rows.map((r) => r.orderKey);
    expect(new Set(keys).size).toBe(3);
    expect(keys).toEqual([...keys].sort());
  });
});

describe('compareRowOrder', () => {
  it('orders keyed rows by key and null-key rows by displayOrder', () => {
    const rows = [
      { id: '1', orderKey: 'k', displayOrder: 9 },
      { id: '2', orderKey: null, displayOrder: 0 },
      { id: '3', orderKey: 'V', displayOrder: 5 },
    ];
    rows.sort(compareRowOrder);
    expect(rows.map((r) => r.id)).toEqual(['2', '3', '1']);
  });
});
