/**
 * Cross-device ordering invariant (2026-09-22 fix).
 *
 * Row order is a per-row order_key assigned once and rewritten only when THAT
 * row is moved or inserted. The invariant under test: a save from a client
 * that did not move a row NEVER overwrites where another client put it —
 * the repeated "tasks all jumbled after using another computer" bug, caused
 * by every save renumbering display_order 0..N and merging it per-row.
 *
 * Same in-memory Supabase harness as offlineReplay.test.js.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const server = { planner_rows: new Map(), archived_weeks: new Map(), years: new Map() };
let offline = false;

function tableQuery(table) {
  const st = { op: 'select', payload: null, filters: {}, inList: null };
  const api = {
    select: () => api,
    upsert: (rows) => { st.op = 'upsert'; st.payload = Array.isArray(rows) ? rows : [rows]; return api; },
    insert: (rows) => { st.op = 'insert'; st.payload = Array.isArray(rows) ? rows : [rows]; return api; },
    delete: () => { st.op = 'delete'; return api; },
    eq: (k, v) => { st.filters[k] = v; return api; },
    in: (k, vals) => { st.inList = [k, vals]; return api; },
    order: () => api,
    limit: () => api,
    maybeSingle: () => api,
    single: () => api,
    then: (resolve) => {
      if (offline) { resolve({ data: null, error: new Error('Failed to fetch') }); return; }
      const t = server[table];
      if (st.op === 'select') {
        const rows = [...t.values()].filter((r) =>
          Object.entries(st.filters).every(([k, v]) => r[k] === v));
        resolve({ data: rows, error: null });
      } else if (st.op === 'upsert' || st.op === 'insert') {
        for (const r of st.payload) t.set(r.id, { ...(t.get(r.id) || {}), ...r });
        resolve({ data: st.payload, error: null });
      } else {
        for (const [id, r] of [...t]) {
          const fOk = Object.entries(st.filters).every(([k, v]) => r[k] === v);
          const inOk = !st.inList || st.inList[1].includes(r[st.inList[0]]);
          if (fOk && inOk) t.delete(id);
        }
        resolve({ error: null });
      }
    },
  };
  return api;
}

vi.mock('../../../lib/supabase', () => ({
  supabase: {
    from: (table) => tableQuery(table),
    auth: {
      getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }),
      getSession: async () => ({ data: { session: { user: { id: 'u1' } } }, error: null }),
    },
  },
}));
vi.mock('../../../lib/tacticsMetricsStorage', () => ({ loadTacticsMetrics: async () => null }));
vi.mock('../../../lib/snapshotStorage', () => ({ debounceSiteSnapshot: () => {} }));
const cache = new Map();
vi.mock('../../../lib/storageCache', () => ({
  getCached: (ns, k) => cache.get(`${ns}|${k}`),
  hasCached: (ns, k) => cache.has(`${ns}|${k}`),
  setCached: (ns, k, v) => cache.set(`${ns}|${k}`, v),
  invalidate: (ns, k) => cache.delete(`${ns}|${k}`),
  onSessionReset: () => () => {},
}));
vi.mock('../../../lib/plannerOffline', () => ({
  localUserId: async () => 'u1',
  loadPlannerSnapshot: async () => null,
  savePlannerSnapshot: async () => {},
  savePendingState: () => Promise.resolve(),
  clearPendingState: () => Promise.resolve(),
  loadPendingStates: async () => [],
  setOfflineReplayHandler: () => {},
  replayPendingSaves: async () => {},
  scheduleOfflineRetry: () => {},
  hasPendingOfflineSave: () => false,
}));

const { saveTaskRows } = await import('../storage');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const A = 'aaaaaaaa-1111-4111-8111-111111111111';
const B = 'bbbbbbbb-2222-4222-8222-222222222222';
const C = 'cccccccc-3333-4333-8333-333333333333';
const D = 'dddddddd-4444-4444-8444-444444444444';
const row = (id, task, displayOrder) => ({ id, task, status: '-', timeValue: 0, dayEntries: {}, displayOrder });
const serverKey = (id) => server.planner_rows.get(id).order_key;

// Distinct yearNumber per test: storage module bookkeeping is module state.
describe('cross-device row ordering', () => {
  beforeEach(() => {
    server.planner_rows.clear();
    server.archived_weeks.clear();
    server.years.clear();
    for (const n of [7, 8, 9]) {
      server.years.set(`y${n}`, { id: `y${n}`, user_id: 'u1', year_number: n, start_date: '2026-06-01', total_days: 84 });
    }
    cache.clear();
    offline = false;
  });

  it('assigns ordered keys on first save and does not rewrite them on a no-op save', async () => {
    await saveTaskRows([row(A, 'a', 0), row(B, 'b', 1), row(C, 'c', 2)], 'p', 7);
    await sleep(10);
    const k1 = [serverKey(A), serverKey(B), serverKey(C)];
    expect([...k1].sort()).toEqual(k1);
    expect(new Set(k1).size).toBe(3);

    await saveTaskRows([row(A, 'a', 0), row(B, 'b', 1), row(C, 'c', 2)], 'p', 7);
    await sleep(10);
    expect([serverKey(A), serverKey(B), serverKey(C)]).toEqual(k1);
  });

  it("a save that did not move a row keeps another client's placement of it", async () => {
    await saveTaskRows([row(A, 'a', 0), row(B, 'b', 1), row(C, 'c', 2), row(D, 'd', 3)], 'p', 8);
    await sleep(10);
    const kA = serverKey(A);

    // Another client moves D to the very front.
    server.planner_rows.get(D).order_key = '0V';
    expect('0V' < kA).toBe(true);

    // This client, unaware, edits B's task and saves its unchanged A,B,C,D list.
    await saveTaskRows([row(A, 'a', 0), row(B, 'b EDITED', 1), row(C, 'c', 2), row(D, 'd', 3)], 'p', 8);
    await sleep(10);

    expect(server.planner_rows.get(B).task).toBe('b EDITED'); // edit landed
    expect(serverKey(D)).toBe('0V'); // remote reorder NOT overwritten
    expect(serverKey(A)).toBe(kA);
  });

  it('an inserted row gets a key between its neighbours without touching them', async () => {
    await saveTaskRows([row(A, 'a', 0), row(B, 'b', 1), row(C, 'c', 2)], 'p', 9);
    await sleep(10);
    const kB = serverKey(B);
    const kC = serverKey(C);

    await saveTaskRows(
      [row(A, 'a', 0), row(B, 'b', 1), row('row-0', 'new between', 2), row(C, 'c', 3)],
      'p', 9,
    );
    await sleep(10);
    const inserted = [...server.planner_rows.values()].find((r) => r.task === 'new between');
    expect(kB < inserted.order_key && inserted.order_key < kC).toBe(true);
    expect(serverKey(B)).toBe(kB);
    expect(serverKey(C)).toBe(kC);
  });
});
