/**
 * 2026-10-12 intent-gated deletes (the two-machine 131-row wipe).
 *
 * The save may DELETE a server row only when
 *   (a) a UI action registered it via markRowsDeleted, or
 *   (b) this session itself inserted the row (undo-of-insert).
 * A row that is merely ABSENT from the in-memory state — partial hydration,
 * stale tab, mid-HMR rebuild — is never deleted; the next read resyncs it.
 *
 * Same in-memory Supabase harness as intentGatedSync.test.js.
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
  CLIENT_BUILD: 'test-build',
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

const { saveTaskRows, markRowsDeleted, readTaskRows } = await import('../storage');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const A = 'aaaaaaaa-1111-4111-8111-111111111111';
const B = 'bbbbbbbb-2222-4222-8222-222222222222';
const C = 'cccccccc-3333-4333-8333-333333333333';
const row = (id, task, displayOrder) => ({ id, task, status: '-', timeValue: 0, dayEntries: {}, displayOrder });
const serverTask = (id, yearId, task, displayOrder, key) => ({
  id, user_id: 'u1', year_id: yearId, project_id: null,
  row_kind: 'task', checkbox: false, subproject_label: '', status: '-',
  task, recurring: '', estimate: '', time_value_minutes: 0,
  day_entries: { __cells: {}, __project: '', __extra: {} },
  display_order: displayOrder, order_key: key, created_at: '2026-09-01T00:00:00Z',
  updated_at: '2026-09-01T00:00:00Z',
});

describe('intent-gated deletes', () => {
  beforeEach(() => {
    server.planner_rows.clear();
    server.archived_weeks.clear();
    server.years.clear();
    for (const n of [31, 32, 33]) {
      server.years.set(`y${n}`, { id: `y${n}`, user_id: 'u1', year_number: n, start_date: '2026-06-01', total_days: 84 });
    }
    cache.clear();
    offline = false;
  });

  it('a partially hydrated save deletes NOTHING it did not register', async () => {
    server.planner_rows.set(A, serverTask(A, 'y31', 'a', 0, 'AV'));
    server.planner_rows.set(B, serverTask(B, 'y31', 'b', 1, 'BV'));
    server.planner_rows.set(C, serverTask(C, 'y31', 'c', 2, 'CV'));
    await readTaskRows('p', 31); // rows become known to this session
    // Broken hydration: only A made it into memory. B and C must survive.
    await saveTaskRows([row(A, 'a', 0)], 'p', 31);
    await sleep(10);
    expect(server.planner_rows.has(B)).toBe(true);
    expect(server.planner_rows.has(C)).toBe(true);
  });

  it('markRowsDeleted deletes exactly the registered row', async () => {
    server.planner_rows.set(A, serverTask(A, 'y32', 'a', 0, 'AV'));
    server.planner_rows.set(B, serverTask(B, 'y32', 'b', 1, 'BV'));
    server.planner_rows.set(C, serverTask(C, 'y32', 'c', 2, 'CV'));
    await readTaskRows('p', 32);
    markRowsDeleted(32, [B]);
    // B deleted by the user; C absent by accident — only B may go.
    await saveTaskRows([row(A, 'a', 0)], 'p', 32);
    await sleep(10);
    expect(server.planner_rows.has(A)).toBe(true);
    expect(server.planner_rows.has(B)).toBe(false);
    expect(server.planner_rows.has(C)).toBe(true);
  });

  it('a row inserted this session may be deleted by its undo (absence)', async () => {
    await readTaskRows('p', 33); // establish a server basis for the empty year
    await saveTaskRows([row(A, 'a', 0), row(B, 'b', 1)], 'p', 33);
    await sleep(10);
    expect(server.planner_rows.has(B)).toBe(true);
    // Undo of the insert: B vanishes from memory with no markRowsDeleted.
    await saveTaskRows([row(A, 'a', 0)], 'p', 33);
    await sleep(10);
    expect(server.planner_rows.has(B)).toBe(false);
    expect(server.planner_rows.has(A)).toBe(true);
  });
});
