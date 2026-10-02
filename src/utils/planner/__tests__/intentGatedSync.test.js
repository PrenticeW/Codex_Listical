/**
 * 2026-10-02 cross-device fixes.
 *
 * 1. Structural identity adoption: a client whose synthetic-id bookkeeping is
 *    missing (fresh machine, cleared site data) must ADOPT the server's
 *    existing structural/chip row instead of minting a new UUID and inserting
 *    a duplicate beside it — the duplicate header/subheader/chip incident.
 * 2. Intent-gated ordering: a save only rewrites order_key for rows the user
 *    moved on THIS client (markRowsMoved); a stale client's save never
 *    reshuffles rows back to its own old picture.
 *
 * Same in-memory Supabase harness as crossDeviceOrder.test.js.
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

const { saveTaskRows, markRowsMoved, readTaskRows } = await import('../storage');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const A = 'aaaaaaaa-1111-4111-8111-111111111111';
const B = 'bbbbbbbb-2222-4222-8222-222222222222';
const C = 'cccccccc-3333-4333-8333-333333333333';
const HDR = '99999999-9999-4999-8999-999999999999';
const PID = 'facefeed-0000-4000-8000-000000000001';
const row = (id, task, displayOrder) => ({ id, task, status: '-', timeValue: 0, dayEntries: {}, displayOrder });
const serverKey = (id) => server.planner_rows.get(id).order_key;

const serverHeader = (yearId) => ({
  id: HDR, user_id: 'u1', year_id: yearId, project_id: PID,
  row_kind: 'task', checkbox: false, subproject_label: '', status: '',
  task: '', recurring: '', estimate: '', time_value_minutes: 0,
  day_entries: { __cells: {}, __project: '', __extra: { _rowType: 'projectHeader', projectNickname: 'alpha' } },
  display_order: 0, order_key: 'AV', created_at: '2026-09-01T00:00:00Z',
});

const clientHeader = () => ({
  id: 'alpha-header', _rowType: 'projectHeader', projectId: PID,
  projectNickname: 'alpha', task: '', status: '', timeValue: 0, checkbox: '',
});

const CHIP = 'schedule-chip-x-0';
const serverChipTask = (yearId) => ({
  id: C, user_id: 'u1', year_id: yearId, project_id: PID,
  row_kind: 'task', checkbox: false, subproject_label: '', status: '-',
  task: 'Rehearse', recurring: 'Recurring', estimate: '', time_value_minutes: 60,
  day_entries: { __cells: {}, __project: 'alpha', __extra: { _rowType: 'projectTask', _chipId: CHIP } },
  display_order: 1, order_key: 'BV', created_at: '2026-09-01T00:00:00Z',
});

const clientChipTask = () => ({
  id: `chip-task-${CHIP}`, _rowType: 'projectTask', _chipId: CHIP,
  projectId: PID, project: 'alpha', task: 'Rehearse', recurring: 'Recurring',
  status: '-', timeValue: 1,
});

describe('structural identity adoption + intent-gated ordering', () => {
  beforeEach(() => {
    server.planner_rows.clear();
    server.archived_weeks.clear();
    server.years.clear();
    for (const n of [21, 22, 23, 24, 25]) {
      server.years.set(`y${n}`, { id: `y${n}`, user_id: 'u1', year_number: n, start_date: '2026-06-01', total_days: 84 });
    }
    cache.clear();
    offline = false;
  });

  it('a fresh client adopts the server projectHeader instead of duplicating it', async () => {
    server.planner_rows.set(HDR, serverHeader('y21'));
    await saveTaskRows([clientHeader(), row(A, 'a', 1)], 'p', 21);
    await sleep(10);
    const headers = [...server.planner_rows.values()].filter(
      (r) => r.day_entries?.__extra?._rowType === 'projectHeader');
    expect(headers).toHaveLength(1);
    expect(headers[0].id).toBe(HDR);
  });

  it('a fresh client adopts the server chip task row instead of duplicating it', async () => {
    server.planner_rows.set(C, serverChipTask('y22'));
    await saveTaskRows([clientChipTask()], 'p', 22);
    await sleep(10);
    const chipRows = [...server.planner_rows.values()].filter(
      (r) => r.day_entries?.__extra?._chipId === CHIP);
    expect(chipRows).toHaveLength(1);
    expect(chipRows[0].id).toBe(C);
  });

  it('still mints a row for a genuinely new structural kind', async () => {
    await saveTaskRows([clientHeader()], 'p', 23);
    await sleep(10);
    const headers = [...server.planner_rows.values()].filter(
      (r) => r.day_entries?.__extra?._rowType === 'projectHeader');
    expect(headers).toHaveLength(1);
  });

  it('a reordered list WITHOUT markRowsMoved leaves every server key alone', async () => {
    await saveTaskRows([row(A, 'a', 0), row(B, 'b', 1), row(C, 'c', 2)], 'p', 24);
    await sleep(10);
    const keys = [serverKey(A), serverKey(B), serverKey(C)];
    // Stale client saves the rows in a different order but moved nothing.
    await saveTaskRows([row(C, 'c', 0), row(A, 'a', 1), row(B, 'b', 2)], 'p', 24);
    await sleep(10);
    expect([serverKey(A), serverKey(B), serverKey(C)]).toEqual(keys);
  });

  it('re-keys a structural row whose server key sorts it outside its rendered position', async () => {
    // 2026-10-02 incident: the Inbox divider carried an order_key that sorted
    // it after the whole archive block, so the mobile app absorbed the inbox
    // into the last project section. Structural rows are web-injected chrome,
    // so an out-of-place key is healed on save; task-row keys stay untouched.
    server.years.set('y26', { id: 'y26', user_id: 'u1', year_number: 26, start_date: '2026-06-01', total_days: 84 });
    const DIV = 'dddddddd-4444-4444-8444-444444444444';
    const mkServerTask = (id, task, key, displayOrder) => ({
      id, user_id: 'u1', year_id: 'y26', project_id: null,
      row_kind: 'task', checkbox: false, subproject_label: '', status: '-',
      task, recurring: '', estimate: '', time_value_minutes: 0,
      day_entries: { __cells: {}, __project: '', __extra: {} },
      display_order: displayOrder, order_key: key, created_at: '2026-09-01T00:00:00Z',
    });
    server.planner_rows.set(A, mkServerTask(A, 'a', 'BV', 0));
    server.planner_rows.set(B, mkServerTask(B, 'b', 'CV', 2));
    // Divider keyed way past both neighbours.
    server.planner_rows.set(DIV, {
      ...mkServerTask(DIV, '', 'ZZ', 1),
      day_entries: { __cells: {}, __project: '', __extra: { _isInboxRow: true } },
    });
    const clientDivider = { id: 'inbox-row', _isInboxRow: true, task: '', status: '', timeValue: 0 };
    // Read first so the save has a server basis (unrestricted mode).
    await readTaskRows('p', 26);
    // Rendered order: a, divider, b — nothing moved by the user.
    await saveTaskRows([row(A, 'a', 0), clientDivider, row(B, 'b', 2)], 'p', 26);
    await sleep(10);
    expect(serverKey(A)).toBe('BV');
    expect(serverKey(B)).toBe('CV');
    const divKey = serverKey(DIV);
    expect(divKey > 'BV' && divKey < 'CV').toBe(true);
  });

  it('markRowsMoved persists exactly the moved row, between its new neighbours', async () => {
    await saveTaskRows([row(A, 'a', 0), row(B, 'b', 1), row(C, 'c', 2)], 'p', 25);
    await sleep(10);
    const kA = serverKey(A); const kB = serverKey(B);
    markRowsMoved(25, [C]);
    await saveTaskRows([row(A, 'a', 0), row(C, 'c', 1), row(B, 'b', 2)], 'p', 25);
    await sleep(10);
    expect(serverKey(A)).toBe(kA);
    expect(serverKey(B)).toBe(kB);
    expect(serverKey(C) > kA && serverKey(C) < kB).toBe(true);
  });
});
