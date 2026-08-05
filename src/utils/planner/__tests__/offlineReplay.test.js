/**
 * Offline pending-save replay semantics (docs/offline-sync-plan.md, Phase 2).
 *
 * The invariant under test: a pending save left over from an offline session
 * replays through the diff save under the BOOKKEEPING IT WAS QUEUED WITH
 * (known row ids + synthetic-id map persisted alongside the desired state in
 * IndexedDB). That is what makes a stale desired state safe to replay:
 *
 *   * a row another client CREATED after the pending state was queued is an
 *     unknown id → the diff leaves it alone (must NOT be deleted)
 *   * a row another client DELETED after the pending state was queued is a
 *     known id missing from the DB → must NOT be resurrected
 *   * the offline edits themselves land, and synthetic-id rows keep the
 *     UUIDs minted when the pending state was persisted (no duplicates)
 *
 * If a refactor makes the replay diff under the CURRENT session's known set
 * instead, the "remote row survives" assertion below fails first.
 *
 * Supabase, storageCache, and plannerOffline are mocked in-memory; the real
 * dataCreators and diff logic run unmodified.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

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
      getUser: async () => {
        if (offline) throw new Error('Failed to fetch');
        return { data: { user: { id: 'u1' } }, error: null };
      },
      getSession: async () => ({ data: { session: { user: { id: 'u1' } } }, error: null }),
    },
  },
}));

vi.mock('../../../lib/tacticsMetricsStorage', () => ({
  loadTacticsMetrics: async () => null,
}));

vi.mock('../../../lib/snapshotStorage', () => ({
  debounceSiteSnapshot: () => {},
}));

const cache = new Map();
vi.mock('../../../lib/storageCache', () => ({
  getCached: (ns, k) => cache.get(`${ns}|${k}`),
  hasCached: (ns, k) => cache.has(`${ns}|${k}`),
  setCached: (ns, k, v) => cache.set(`${ns}|${k}`, v),
  invalidate: (ns, k) => cache.delete(`${ns}|${k}`),
}));

// In-memory stand-in for the IndexedDB layer, same surface as plannerOffline.
const idb = new Map();
let replayHandler = null;
vi.mock('../../../lib/plannerOffline', () => ({
  localUserId: async () => 'u1',
  loadPlannerSnapshot: async (u, y) => idb.get(`snapshot:${u}:${y}`) ?? null,
  savePlannerSnapshot: async (u, y, s) => { idb.set(`snapshot:${u}:${y}`, s); },
  savePendingState: (u, y, p) => {
    idb.set(`pending:${u}:${y}`, JSON.parse(JSON.stringify(p)));
    return Promise.resolve();
  },
  clearPendingState: (u, y) => { idb.delete(`pending:${u}:${y}`); return Promise.resolve(); },
  loadPendingStates: async (u) => [...idb]
    .filter(([k]) => k.startsWith(`pending:${u}:`))
    .map(([k, payload]) => ({ yearNumber: Number(k.split(':')[2]), payload })),
  setOfflineReplayHandler: (fn) => { replayHandler = fn; },
  replayPendingSaves: async () => {
    for (const [k, payload] of [...idb]) {
      if (k.startsWith('pending:u1:')) await replayHandler(Number(k.split(':')[2]), payload);
    }
  },
  scheduleOfflineRetry: () => {},
  hasPendingOfflineSave: () => [...idb.keys()].some((k) => k.startsWith('pending:')),
}));

const { saveTaskRows } = await import('../storage');

// ---------------------------------------------------------------------------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const REMOTE = '33333333-3333-4333-8333-333333333333';
const row = (id, task, displayOrder) => ({ id, task, status: '-', timeValue: 0, dayEntries: {}, displayOrder });

describe('offline pending-save replay', () => {
  beforeEach(() => {
    server.planner_rows.clear();
    server.archived_weeks.clear();
    server.years.clear();
    server.years.set('y1', { id: 'y1', user_id: 'u1', year_number: 1, start_date: '2026-06-01', total_days: 84 });
    server.years.set('y2', { id: 'y2', user_id: 'u1', year_number: 2, start_date: '2026-06-01', total_days: 84 });
    cache.clear();
    idb.clear();
    offline = false;
  });

  it('replays a stale offline save without clobbering remote writes', async () => {
    // Online: seed two rows the web session "knows".
    await saveTaskRows([row(A, 'alpha', 0), row(B, 'beta', 1)], 'project-1', 1);
    await sleep(10);
    expect([...server.planner_rows.keys()].sort()).toEqual([A, B]);
    expect(idb.has('pending:u1:1')).toBe(false); // confirmed save clears pending

    // Offline: edit alpha, add a synthetic-id row. Save fails but the
    // desired state and its bookkeeping persist to the (mock) IndexedDB.
    offline = true;
    await saveTaskRows(
      [row(A, 'alpha EDITED', 0), row(B, 'beta', 1), row('row-0', 'made offline', 2)],
      'project-1',
      1,
    );
    await sleep(10);
    expect(idb.has('pending:u1:1')).toBe(true);
    expect(server.planner_rows.get(A).task).toBe('alpha'); // nothing reached the server

    // Meanwhile another client (mobile) adds a row and deletes beta.
    server.planner_rows.set(REMOTE, { id: REMOTE, user_id: 'u1', year_id: 'y1', task: 'mobile row', row_kind: 'task' });
    server.planner_rows.delete(B);

    // Reconnect and replay the pending save.
    offline = false;
    const { replayPendingSaves } = await import('../../../lib/plannerOffline');
    await replayPendingSaves();
    await sleep(10);

    const tasks = new Map([...server.planner_rows.values()].map((r) => [r.id, r.task]));
    expect(tasks.get(A)).toBe('alpha EDITED');      // offline edit landed
    expect(tasks.has(B)).toBe(false);               // remote delete NOT resurrected
    expect(tasks.get(REMOTE)).toBe('mobile row');   // remote insert NOT deleted
    expect([...tasks.values()]).toContain('made offline'); // offline row landed
    // ...with a real UUID, not the synthetic id:
    const offlineRow = [...server.planner_rows.values()].find((r) => r.task === 'made offline');
    expect(offlineRow.id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(idb.has('pending:u1:1')).toBe(false);    // confirmed replay clears pending
  });

  // Year 2, not year 1: the storage module's per-year bookkeeping
  // (_knownRowIds / synthetic-id maps) is module state that survives across
  // tests in this file, so each test owns a distinct yearNumber.
  it('a second offline save supersedes the first (latest state wins)', async () => {
    await saveTaskRows([row(A, 'alpha', 0)], 'project-1', 2);
    await sleep(10);

    offline = true;
    await saveTaskRows([row(A, 'first offline edit', 0)], 'project-1', 2);
    await sleep(10);
    await saveTaskRows([row(A, 'second offline edit', 0)], 'project-1', 2);
    await sleep(10);

    offline = false;
    const { replayPendingSaves } = await import('../../../lib/plannerOffline');
    await replayPendingSaves();
    await sleep(10);

    expect(server.planner_rows.get(A).task).toBe('second offline edit');
    expect(idb.has('pending:u1:2')).toBe(false);
  });
});
