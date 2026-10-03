/**
 * Archive integrity gate (2026-10-03 archive-churn incident).
 *
 * Phase 3 moved archived_weeks snapshots into snapshot_enc, leaving `{}` in
 * the jsonb column. A session that cannot decrypt (missing/late data key)
 * hydrates fallback week ids ('archive-week-N'), so every archived header
 * is orphaned — and a save from that state inserted duplicate weeks under
 * the fallback ids, deleted the real weeks as "stale", and rewrote the
 * archive on every save cycle.
 *
 * Invariant under test: a session holding ANY week whose snapshot failed to
 * decrypt never writes anything archive-shaped — archived_weeks is skipped
 * wholesale and archive-member planner_rows are held back — while ordinary
 * live-row edits still land. Same in-memory Supabase harness as
 * crossDeviceOrder.test.js. No data key is loaded in this test env, so the
 * encrypted fixture below is genuinely undecryptable, exactly like the
 * production failure.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const server = { planner_rows: new Map(), archived_weeks: new Map(), years: new Map() };

function tableQuery(table) {
  const st = { op: 'select', payload: null, filters: {}, inList: null };
  const api = {
    select: () => api,
    upsert: (rows) => { st.op = 'upsert'; st.payload = Array.isArray(rows) ? rows : [rows]; return api; },
    insert: (rows) => { st.op = 'insert'; st.payload = Array.isArray(rows) ? rows : [rows]; return api; },
    update: (row) => { st.op = 'update'; st.payload = [row]; return api; },
    delete: () => { st.op = 'delete'; return api; },
    eq: (k, v) => { st.filters[k] = v; return api; },
    in: (k, vals) => { st.inList = [k, vals]; return api; },
    order: () => api,
    limit: () => api,
    maybeSingle: () => api,
    single: () => api,
    then: (resolve) => {
      const t = server[table];
      if (st.op === 'select') {
        const rows = [...t.values()].filter((r) =>
          Object.entries(st.filters).every(([k, v]) => r[k] === v));
        resolve({ data: rows.map((r) => ({ ...r })), error: null });
      } else if (st.op === 'upsert' || st.op === 'insert') {
        for (const r of st.payload) {
          const id = r.id ?? `gen-${t.size + 1}`;
          t.set(id, { ...(t.get(id) || {}), ...r, id });
        }
        resolve({ data: st.payload, error: null });
      } else if (st.op === 'update') {
        for (const [id, r] of [...t]) {
          const fOk = Object.entries(st.filters).every(([k, v]) => r[k] === v);
          if (fOk) t.set(id, { ...r, ...st.payload[0] });
        }
        resolve({ error: null });
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
    functions: { invoke: async () => ({ data: null, error: new Error('no key service in tests') }) },
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

const { readTaskRows, saveTaskRows } = await import('../storage');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const T1 = 'aaaaaaaa-1111-4111-8111-111111111111'; // live task
const H1 = 'bbbbbbbb-2222-4222-8222-222222222222'; // archived project header
const AT1 = 'cccccccc-3333-4333-8333-333333333333'; // archived task
const MINTED_WEEK_ID = 'archive-week-1759000000000-abc1234';

// A syntactically valid enc1 value that no loaded key can decrypt (and the
// test env loads no key at all) — mirrors the production Phase 3 rows.
const UNDECRYPTABLE = 'enc1:AAAAAAAAAAAA:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

const liveRow = (id, task, orderKey) => ({
  id, user_id: 'u1', year_id: 'y21', task, status: '-', order_key: orderKey,
  display_order: 0, day_entries: {}, updated_at: '2026-10-01T00:00:00Z',
});

describe('archive decrypt gate', () => {
  beforeEach(() => {
    server.planner_rows.clear();
    server.archived_weeks.clear();
    server.years.clear();
    cache.clear();
    server.years.set('y21', { id: 'y21', user_id: 'u1', year_number: 21, start_date: '2026-06-01', total_days: 84 });

    server.planner_rows.set(T1, liveRow(T1, 'live task', '1V'));
    server.planner_rows.set(H1, {
      ...liveRow(H1, '', '2V'),
      day_entries: { __extra: { _rowType: 'archivedProjectHeader', groupId: 'grp-1', parentGroupId: MINTED_WEEK_ID, projectNickname: 'P1' } },
    });
    server.planner_rows.set(AT1, {
      ...liveRow(AT1, 'archived task', '3V'),
      day_entries: { __extra: { _isArchivedTask: true, parentGroupId: 'grp-1' } },
    });
    server.archived_weeks.set('awdb1', {
      id: 'awdb1', user_id: 'u1', year_id: 'y21', week_number: 1,
      week_range_label: 'Jun 1 - Jun 7', archived_at: '2026-06-08T00:00:00Z',
      snapshot: {}, snapshot_enc: UNDECRYPTABLE,
      total_minutes: 0, daily_min_minutes: [], daily_max_minutes: [],
    });
  });

  it('marks undecryptable weeks and a save from that state never touches the archive', async () => {
    const rows = await readTaskRows('p', 21);
    const week = rows.find((r) => r.archiveWeekLabel === 'Jun 1 - Jun 7');
    expect(week).toBeTruthy();
    expect(week.__decryptFailed).toBe(true);
    expect(week.id).toBe('archive-week-1'); // lossy fallback id

    // Simulate the damage a gated session would otherwise persist: the
    // orphan regroup "moved" the archived rows, and the user edits a live
    // task. Save the whole (mangled) state back.
    const mangled = rows.map((r) => {
      if (r.id === H1) return { ...r, parentGroupId: 'archive-week-1' };
      if (r.id === T1) return { ...r, task: 'live task EDITED' };
      return r;
    });
    await saveTaskRows(mangled, 'p', 21);
    await sleep(10);

    // archived_weeks untouched: no duplicate week, no delete, timestamps kept.
    expect([...server.archived_weeks.keys()]).toEqual(['awdb1']);
    expect(server.archived_weeks.get('awdb1').archived_at).toBe('2026-06-08T00:00:00Z');
    expect(server.archived_weeks.get('awdb1').snapshot_enc).toBe(UNDECRYPTABLE);

    // Archive-member planner_rows untouched: header keeps the minted parent.
    expect(server.planner_rows.get(H1).day_entries.__extra.parentGroupId).toBe(MINTED_WEEK_ID);
    expect(server.planner_rows.has(AT1)).toBe(true);

    // The ordinary edit still landed.
    expect(server.planner_rows.get(T1).task).toBe('live task EDITED');
  });

  it('a healthy (plaintext-snapshot) session skips no-op archive rewrites', async () => {
    // Make the week decryptable by storing it plaintext (pre-Phase-3 shape).
    const aw = server.archived_weeks.get('awdb1');
    aw.snapshot_enc = null;
    aw.snapshot = {
      id: MINTED_WEEK_ID, archiveWeekLabel: 'Jun 1 - Jun 7', archivedAt: '2026-06-08T00:00:00Z',
      totalMinutes: 0, dailyMinMinutes: [], dailyMaxMinutes: [],
    };

    const rows = await readTaskRows('p', 21);
    const week = rows.find((r) => r.archiveWeekLabel === 'Jun 1 - Jun 7');
    expect(week.__decryptFailed).toBeUndefined();
    expect(week.id).toBe(MINTED_WEEK_ID);

    await saveTaskRows(rows, 'p', 21);
    await sleep(10);

    // Still exactly one week, same original archived_at (no restamp churn).
    expect([...server.archived_weeks.keys()]).toEqual(['awdb1']);
    expect(server.archived_weeks.get('awdb1').archived_at).toBe('2026-06-08T00:00:00Z');
  });
});
