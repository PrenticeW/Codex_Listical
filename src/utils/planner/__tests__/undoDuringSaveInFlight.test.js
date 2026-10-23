/**
 * 2026-10-23 undo-resurrection fix (_ownWriteAdvances in storage.js).
 *
 * A save captures its three-way-merge baseline synchronously at queue time,
 * but the live baseline only advances when a save COMPLETES. So a second
 * save queued while the first was still in flight — a cell commit followed
 * by an immediate undo — diffed against a baseline that predated the first
 * save's write: the undo's desired value matched that stale baseline, the
 * merge read the first save's own just-landed write as "another client's
 * newer edit", and the undo was silently dropped. The server kept the bad
 * value and the next refresh resurrected it on screen (reported as: "/"
 * typed into an Accounted row's task cell came back after undo).
 *
 * Saves queued behind an in-flight save must diff against what the screen
 * actually showed — including this session's own in-flight writes.
 *
 * Same in-memory Supabase harness as intentGatedDeletes.test.js.
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

const { saveTaskRows, readTaskRows } = await import('../storage');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const A = 'aaaaaaaa-1111-4111-8111-111111111111';
const row = (id, task, displayOrder, extra = {}) => ({
  id, task, status: '-', timeValue: 0, dayEntries: {}, displayOrder, ...extra,
});
const serverTask = (id, yearId, task, displayOrder, key) => ({
  id, user_id: 'u1', year_id: yearId, project_id: null,
  row_kind: 'task', checkbox: false, subproject_label: '', status: '-',
  task, recurring: '', estimate: '', time_value_minutes: 0,
  day_entries: { __cells: {}, __project: '', __extra: {} },
  display_order: displayOrder, order_key: key, created_at: '2026-09-01T00:00:00Z',
  updated_at: '2026-09-01T00:00:00Z',
});

describe('saves queued while an earlier save is in flight', () => {
  beforeEach(() => {
    server.planner_rows.clear();
    server.archived_weeks.clear();
    server.years.clear();
    for (const n of [41, 42, 43]) {
      server.years.set(`y${n}`, { id: `y${n}`, user_id: 'u1', year_number: n, start_date: '2026-06-01', total_days: 84 });
    }
    cache.clear();
    offline = false;
  });

  it('an undo queued behind its own edit persists (the "/" resurrection bug)', async () => {
    server.planner_rows.set(A, serverTask(A, 'y41', 'original text', 0, 'AV'));
    await readTaskRows('p', 41);
    // Type-to-edit commits '/' — save A queued; its baseline is captured now.
    const p1 = saveTaskRows([row(A, '/', 0)], 'p', 41);
    // Undo restores the original BEFORE save A completes — save B's captured
    // baseline still says the server holds the original, so without the
    // overlay the merge cedes to save A's own write.
    const p2 = saveTaskRows([row(A, 'original text', 0)], 'p', 41);
    await Promise.all([p1, p2]);
    await sleep(10);
    expect(server.planner_rows.get(A).task).toBe('original text');
  });

  it('a second edit queued behind the first wins normally', async () => {
    server.planner_rows.set(A, serverTask(A, 'y42', 'first', 0, 'AV'));
    await readTaskRows('p', 42);
    const p1 = saveTaskRows([row(A, 'second', 0)], 'p', 42);
    const p2 = saveTaskRows([row(A, 'third', 0)], 'p', 42);
    await Promise.all([p1, p2]);
    await sleep(10);
    expect(server.planner_rows.get(A).task).toBe('third');
  });

  it('a remote edit to a field web left alone still survives the queued save', async () => {
    server.planner_rows.set(A, serverTask(A, 'y43', 'task text', 0, 'AV'));
    await readTaskRows('p', 43);
    // Mobile edits the task text after web's read (newer server timestamp).
    const cur = server.planner_rows.get(A);
    server.planner_rows.set(A, { ...cur, task: 'mobile edit', updated_at: '2026-10-23T12:00:00Z' });
    // Web edits only the status, twice in quick succession, never touching
    // the task — the overlay must not turn web's stale task copy into a win.
    const p1 = saveTaskRows([row(A, 'task text', 0, { status: 'Done' })], 'p', 43);
    const p2 = saveTaskRows([row(A, 'task text', 0, { status: 'Accounted' })], 'p', 43);
    await Promise.all([p1, p2]);
    await sleep(10);
    expect(server.planner_rows.get(A).task).toBe('mobile edit');
    expect(server.planner_rows.get(A).status).toBe('Accounted');
  });
});
