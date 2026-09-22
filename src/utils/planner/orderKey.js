// Fractional order keys for planner rows (2026-09-22 cross-device reorder fix).
//
// Why: display_order was a global integer renumbered 0..N from each client's
// in-memory list on EVERY save, and merged per-row like any other field. Any
// client whose list differed from the server's — a stale tab, mobile's own
// renumbering pass, a page that rebuilt its list in a slightly different
// derived order — therefore "legitimately" rewrote the whole ordering over
// everyone else's (258-row and 435-row rewrites observed 2026-09-21/22).
//
// Now each row carries `order_key`: a base-62 string ordered lexicographically.
// A key is assigned ONCE and only rewritten when that specific row is moved or
// inserted, so an untouched row's position can never be overwritten by a save
// from another device. Rows sort by (orderKey, then legacy displayOrder for
// null-key rows written by pre-fix clients).
//
// Key format: non-empty string over DIGITS, never ending in '0' (so a midpoint
// below any key always exists). Keys are pure "fractions" — comparing is plain
// string comparison, and a key strictly between any two keys always exists.

export const DIGITS =
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const BASE = DIGITS.length; // 62

export function isValidOrderKey(key) {
  if (typeof key !== 'string' || key.length === 0) return false;
  if (key.endsWith('0')) return false;
  for (const ch of key) if (DIGITS.indexOf(ch) === -1) return false;
  return true;
}

// Midpoint of two fraction strings a < b (b === null means "no upper bound").
// Ported from the standard fractional-indexing midpoint algorithm.
function midpoint(a, b) {
  if (b !== null && a >= b) throw new Error(`midpoint: ${a} >= ${b}`);
  if (a.slice(-1) === '0' || (b !== null && b.slice(-1) === '0')) {
    throw new Error('midpoint: trailing zero');
  }
  if (b !== null) {
    let n = 0;
    while ((a[n] || '0') === b[n]) n += 1;
    if (n > 0) return b.slice(0, n) + midpoint(a.slice(n), b.slice(n));
  }
  const digitA = a ? DIGITS.indexOf(a[0]) : 0;
  const digitB = b !== null ? DIGITS.indexOf(b[0]) : BASE;
  if (digitB - digitA > 1) {
    return DIGITS[Math.round(0.5 * (digitA + digitB))];
  }
  if (b !== null && b.length > 1) return b.slice(0, 1);
  return DIGITS[digitA] + midpoint(a.slice(1), null);
}

// A key strictly between a and b. Either side may be null (open end).
export function keyBetween(a, b) {
  if (a !== null && !isValidOrderKey(a)) throw new Error(`bad key: ${a}`);
  if (b !== null && !isValidOrderKey(b)) throw new Error(`bad key: ${b}`);
  if (a !== null && b !== null && a >= b) throw new Error(`${a} >= ${b}`);
  return midpoint(a ?? '', b);
}

// n keys strictly between a and b, in order.
export function keysBetween(a, b, n) {
  if (n <= 0) return [];
  if (n === 1) return [keyBetween(a, b)];
  const mid = keyBetween(a, b);
  const half = Math.floor(n / 2);
  return [...keysBetween(a, mid, half), mid, ...keysBetween(mid, b, n - half - 1)];
}

// Key used for backfilling row i of an existing ordered list (and by the SQL
// migration): 6-char base62 of (i+1), suffixed 'V' so it never ends in '0'
// and always has room below it. Same length ⇒ lexicographic = numeric.
export function backfillKey(index) {
  let n = index + 1;
  let s = '';
  for (let k = 0; k < 6; k += 1) {
    s = DIGITS[n % BASE] + s;
    n = Math.floor(n / BASE);
  }
  return `${s}V`;
}

// Ensure every row in an ordered list has an orderKey consistent with its
// position, rewriting AS FEW keys as possible: rows on the longest strictly
// increasing subsequence of existing valid keys keep theirs; everything else
// (new rows, moved rows, invalid/duplicate keys) gets a fresh key between its
// kept neighbours. Mutates rows in place; returns the ids whose key changed.
export function ensureOrderKeys(rows) {
  const changed = [];
  const n = rows.length;
  if (n === 0) return changed;

  // Longest strictly increasing subsequence over rows with valid, unique keys.
  const seen = new Set();
  const eligible = []; // [rowIndex, key]
  for (let i = 0; i < n; i += 1) {
    const k = rows[i].orderKey;
    if (isValidOrderKey(k) && !seen.has(k)) {
      seen.add(k);
      eligible.push([i, k]);
    }
  }
  // Patience LIS on eligible by key.
  const tailsIdx = []; // indices into eligible
  const prev = new Array(eligible.length).fill(-1);
  for (let e = 0; e < eligible.length; e += 1) {
    const key = eligible[e][1];
    let lo = 0;
    let hi = tailsIdx.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (eligible[tailsIdx[mid]][1] < key) lo = mid + 1;
      else hi = mid;
    }
    prev[e] = lo > 0 ? tailsIdx[lo - 1] : -1;
    tailsIdx[lo] = e;
  }
  const keep = new Set(); // row indices that keep their key
  let cur = tailsIdx.length > 0 ? tailsIdx[tailsIdx.length - 1] : -1;
  while (cur !== -1) {
    keep.add(eligible[cur][0]);
    cur = prev[cur];
  }

  // Rekey every run of non-kept rows between kept anchors.
  let i = 0;
  while (i < n) {
    if (keep.has(i)) { i += 1; continue; }
    let j = i;
    while (j < n && !keep.has(j)) j += 1;
    const before = i > 0 ? rows[i - 1].orderKey : null;
    const after = j < n ? rows[j].orderKey : null;
    const fresh = keysBetween(before, after, j - i);
    for (let k = i; k < j; k += 1) {
      rows[k].orderKey = fresh[k - i];
      changed.push(rows[k].id);
    }
    i = j;
  }
  return changed;
}

// Sort comparator for rows read from the DB. Keyed rows order by key; a
// null-key row (written by a pre-fix client) falls back to displayOrder
// against everything, keeping it roughly where that client put it until the
// next save assigns it a key.
export function compareRowOrder(a, b) {
  const ak = isValidOrderKey(a.orderKey) ? a.orderKey : null;
  const bk = isValidOrderKey(b.orderKey) ? b.orderKey : null;
  if (ak !== null && bk !== null) {
    if (ak < bk) return -1;
    if (ak > bk) return 1;
    return String(a.id).localeCompare(String(b.id));
  }
  const ao = typeof a.displayOrder === 'number' ? a.displayOrder : 0;
  const bo = typeof b.displayOrder === 'number' ? b.displayOrder : 0;
  if (ao !== bo) return ao - bo;
  return String(a.id).localeCompare(String(b.id));
}
