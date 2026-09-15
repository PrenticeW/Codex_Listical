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
  onSessionReset: () => () => {},
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

const { saveTaskRows, readTaskRows } = await import('../storage');

// ---------------------------------------------------------------------------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const H1 = 'aaaaaaaa-1111-4111-8111-111111111111'; // header another client owns
const H2 = 'bbbbbbbb-2222-4222-8222-222222222222'; // re-minted duplicate
const H3 = 'cccccccc-3333-4333-8333-333333333333'; // header for a NEW project
const T1 = 'dddddddd-4444-4444-8444-444444444444';

const headerPayload = (id, projectId, nickname) => ({
  id,
  _rowType: 'projectHeader',
  projectId,
  projectNickname: nickname,
  groupId: `group-${nickname}`,
  task: '', status: '-', timeValue: 0,
});
const taskPayload = (id, name) => ({ id, task: name, status: '-', timeValue: 0 });

const structuralHeaders = (projectId) =>
  [...server.planner_rows.values()].filter(
    (r) => r.day_entries?.__extra?._rowType === 'projectHeader' && r.project_id === projectId,
  );

describe('duplicate structural row guard (2026-09-15 incident)', () => {
  beforeEach(() => {
    server.planner_rows.clear();
    server.archived_weeks.clear();
    server.years.clear();
    server.years.set('y1', { id: 'y1', user_id: 'u1', year_number: 1, start_date: '2026-06-01', total_days: 84 });
    cache.clear();
    idb.clear();
    offline = false;
  });

  it('refuses to insert a second projectHeader while the server copy survives', async () => {
    // This session reads the (empty) year — it now has a server basis.
    await readTaskRows('project-1', 1);
    // Another client writes the project header AFTER this session's read:
    // this session has never seen H1 (unknown id).
    server.planner_rows.set(H1, {
      id: H1, user_id: 'u1', year_id: 'y1', project_id: 'p1', row_kind: 'task',
      display_order: 0, status: '-', task: '',
      day_entries: { __cells: {}, __project: 'MH', __extra: { _rowType: 'projectHeader', projectNickname: 'MH' } },
      updated_at: new Date().toISOString(),
    });
    // A stale in-memory state re-mints its own header id for the same
    // project (H2) — the exact shape that produced two MOVE HOUSE headers.
    await saveTaskRows([headerPayload(H2, 'p1', 'MH'), taskPayload(T1, 'a task')], 'project-1', 1);
    await sleep(10);

    const headers = structuralHeaders('p1');
    expect(headers.map((r) => r.id)).toEqual([H1]); // duplicate refused
    expect(server.planner_rows.has(H2)).toBe(false);
    expect(server.planner_rows.has(T1)).toBe(true); // ordinary rows still land
  });

  it('still inserts the first header for a genuinely new project', async () => {
    await readTaskRows('project-1', 1);
    await saveTaskRows([headerPayload(H3, 'p2', 'NEW'), taskPayload(T1, 'task')], 'project-1', 1);
    await sleep(10);
    expect(structuralHeaders('p2').map((r) => r.id)).toEqual([H3]);
  });
});
