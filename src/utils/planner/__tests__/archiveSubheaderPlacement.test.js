/**
 * Archive subheader placement (2026-10-17 scrambled-archive fix).
 *
 * Archiving a week copies the project's structure rows (header, General,
 * Unscheduled, custom subheaders) and MOVES the swept tasks. Moved tasks keep
 * their live order_key; copies must not inherit the live row's key (the
 * copy/live duplicate collision was the scrambled-archive bug) so each copy
 * instead carries archivedSortKey — a frozen snapshot of the live row's key —
 * and the read path orders a group's members by it. Invariant under test:
 * after a full archive → save → fresh read round-trip, every subheader sits
 * exactly where it sat live, with its own tasks directly beneath it.
 *
 * Same in-memory Supabase harness as crossDeviceOrder.test.js.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const server = { planner_rows: new Map(), archived_weeks: new Map(), years: new Map() };

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
const { createArchivedProjectStructure, moveTasksToArchive } = await import('../archiveHelpers');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const task = (id, text, status) => ({
  id, _rowType: 'projectTask', parentGroupId: 'project-TT', projectNickname: 'TT',
  project: 'TT', task: text, status, timeValue: 0, dayEntries: {},
});

describe('archived subheaders keep their live placement', () => {
  beforeEach(() => {
    server.planner_rows.clear();
    server.archived_weeks.clear();
    server.years.clear();
    server.years.set('y31', { id: 'y31', user_id: 'u1', year_number: 31, start_date: '2026-06-01', total_days: 84 });
    cache.clear();
  });

  it('full archive round-trip: General, its task, Unscheduled, then each subheader above its own tasks', async () => {
    // Live layout: header / General / g1 / Unscheduled / P1 / t1 t2 / P2 / t3
    const live = [
      { id: 'tt-header', _rowType: 'projectHeader', groupId: 'project-TT', projectNickname: 'TT', isGroupHeader: true, task: '', status: '', timeValue: 0 },
      { id: 'tt-general', _rowType: 'projectGeneral', parentGroupId: 'project-TT', projectNickname: 'TT', task: '', status: '', timeValue: 0 },
      task('tt-g1', 'general done work', 'Done'),
      { id: 'tt-unsch', _rowType: 'projectUnscheduled', parentGroupId: 'project-TT', projectNickname: 'TT', task: '', status: '', timeValue: 0 },
      { id: 'tt-p1', _rowType: 'subprojectGeneral', subprojectLabel: 'Priority 1', parentGroupId: 'project-TT', projectNickname: 'TT', task: '', status: '', timeValue: 0 },
      task('tt-t1', 'p1 task one', 'Done'),
      task('tt-t2', 'p1 task two', 'Done'),
      { id: 'tt-p2', _rowType: 'subprojectGeneral', subprojectLabel: 'Priority 2', parentGroupId: 'project-TT', projectNickname: 'TT', task: '', status: '', timeValue: 0 },
      task('tt-t3', 'p2 task', 'Done'),
    ];
    await saveTaskRows(live, 'p', 31);
    await sleep(10);
    cache.clear();
    const data = await readTaskRows('p', 31);

    // Simulate the page's archive flow against the read-back rows.
    const weekId = 'archive-week-1799000000000-test';
    const weekRow = { id: weekId, groupId: weekId, _rowType: 'archiveRow', archiveWeekLabel: 'Year 31, Week 1', task: '', status: '', timeValue: 0 };
    const projectRows = data.filter((r) => ['projectHeader', 'projectGeneral', 'projectUnscheduled'].includes(r._rowType));
    const subRows = data.filter((r) => ['subprojectGeneral', 'subprojectUnscheduled'].includes(r._rowType));
    const archived = createArchivedProjectStructure(projectRows, subRows, weekId, 84);

    // Copies never inherit the live key (the duplicate-key scramble bug) but
    // do freeze the live position.
    for (const copy of archived) {
      expect(copy.orderKey).toBeNull();
      expect(typeof copy.archivedSortKey).toBe('string');
    }

    const doneTasks = data.filter((r) => r.status === 'Done');
    expect(doneTasks).toHaveLength(4);
    const withArchive = moveTasksToArchive([...data, weekRow, ...archived], doneTasks, weekId);

    await saveTaskRows(withArchive, 'p', 31);
    await sleep(10);
    cache.clear();
    const result = await readTaskRows('p', 31);

    const aHeader = result.find((r) => r._rowType === 'archivedProjectHeader');
    expect(aHeader).toBeTruthy();
    const members = result.filter((r) => r.parentGroupId === aHeader.groupId);
    const label = (r) =>
      r._rowType === 'archivedProjectGeneral' ? 'General'
        : r._rowType === 'archivedProjectUnscheduled' ? 'Unscheduled'
          : r.subprojectLabel || r.task;
    expect(members.map(label)).toEqual([
      'General',
      'general done work',
      'Unscheduled',
      'Priority 1',
      'p1 task one',
      'p1 task two',
      'Priority 2',
      'p2 task',
    ]);

    // And the live rows kept their keys (no copy/live collision re-keyed them).
    const liveP1 = result.find((r) => r._rowType === 'subprojectGeneral' && r.subprojectLabel === 'Priority 1');
    expect(liveP1).toBeTruthy();
  });
});
