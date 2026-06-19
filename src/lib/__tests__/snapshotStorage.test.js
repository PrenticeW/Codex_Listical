/**
 * snapshotStorage — gap-fix tests
 *
 * Covers the four "easy tier" snapshot gaps fixed in this session:
 *   1. planner_settings captured and restored (incl. week_names)
 *   2. years.total_days captured and restored
 *   3. tactics_custom_projects captured as plan.customProjects
 *   4. tactics_custom_projects restored independently when chips=null
 *
 * Strategy: mock supabase at the module level. vi.mock factories are hoisted
 * above all imports, so variables they close over must also be hoisted with
 * vi.hoisted(). The mock chain is a thenable builder (like the real Supabase
 * client) so both `await chain` and `await chain.maybeSingle()` work.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted state — shared between vi.mock factory and test bodies
// ---------------------------------------------------------------------------

const {
  MOCK_USER_ID,
  MOCK_YEAR_ID,
  MOCK_YEAR_NUMBER,
  mockTableData,
  calls,
  makeChain,
  resetCalls,
  resetMockTableData,
} = vi.hoisted(() => {
  const MOCK_USER_ID = 'user-abc';
  const MOCK_YEAR_ID = 'year-uuid-1';
  const MOCK_YEAR_NUMBER = 1;

  // Per-table preset data. Tests mutate this object; the mock chain closes
  // over it so changes are visible without reassigning the variable.
  const mockTableData = {
    years: [{ id: MOCK_YEAR_ID, total_days: 84 }],
    site_snapshots: [],
    planner_settings: null,
    tactics_custom_projects: [],
  };

  // Recorded DB calls for assertions.
  const calls = { inserts: [], upserts: [], deletes: [], updates: [] };

  function resetCalls() {
    calls.inserts = [];
    calls.upserts = [];
    calls.deletes = [];
    calls.updates = [];
  }

  function resetMockTableData() {
    mockTableData.years = [{ id: MOCK_YEAR_ID, total_days: 84 }];
    mockTableData.site_snapshots = [];
    mockTableData.planner_settings = null;
    mockTableData.tactics_custom_projects = [];
  }

  /**
   * Chainable mock builder that mirrors the real Supabase query builder.
   *
   * The real client is a thenable — you can `await` the chain directly OR
   * call `.maybeSingle()` / `.single()` to resolve with a single row. To
   * replicate both patterns:
   *   - Non-terminal methods (select, eq, order, limit, delete, update) all
   *     return the chain so they can be chained freely.
   *   - The chain implements `then` so `await chain` resolves with array data.
   *   - `.maybeSingle()` and `.single()` return a raw Promise with one item.
   *   - `.insert()` and `.upsert()` return a raw Promise (always terminals).
   */
  function makeChain(table) {
    const chain = {
      select: () => chain,
      eq: () => chain,
      in: () => chain,
      order: () => chain,
      limit: () => chain,
      is: () => chain,
      // Thenable: `await chain` resolves { data: Array, error: null }
      then: (resolve, reject) => {
        const d = mockTableData[table] ?? null;
        const arr = Array.isArray(d) ? d : d != null ? [d] : [];
        return Promise.resolve({ data: arr, error: null }).then(resolve, reject);
      },
      // Terminal: resolves with first item or null.
      maybeSingle: () => {
        const d = mockTableData[table] ?? null;
        const single = Array.isArray(d) ? (d[0] ?? null) : (d ?? null);
        return Promise.resolve({ data: single, error: null });
      },
      single: () => {
        const d = mockTableData[table] ?? null;
        const single = Array.isArray(d) ? (d[0] ?? null) : (d ?? null);
        return Promise.resolve({ data: single, error: null });
      },
      // Mutations — terminal operations, always directly awaited.
      insert: (rows) => {
        calls.inserts.push({ table, rows });
        return Promise.resolve({ data: null, error: null });
      },
      upsert: (rows, opts) => {
        calls.upserts.push({ table, rows, opts });
        return Promise.resolve({ data: null, error: null });
      },
      // delete / update return chain so .eq() can follow; `await` uses `then`.
      delete: () => {
        calls.deletes.push({ table });
        return chain;
      },
      update: (cols) => {
        calls.updates.push({ table, cols });
        return chain;
      },
    };
    return chain;
  }

  return {
    MOCK_USER_ID,
    MOCK_YEAR_ID,
    MOCK_YEAR_NUMBER,
    mockTableData,
    calls,
    makeChain,
    resetCalls,
    resetMockTableData,
  };
});

// ---------------------------------------------------------------------------
// Module mocks (hoisted above imports by Vitest)
// ---------------------------------------------------------------------------

vi.mock('../supabase', () => ({
  supabase: {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: MOCK_USER_ID } },
        error: null,
      }),
    },
    from: vi.fn((table) => makeChain(table)),
  },
}));

vi.mock('../stagingStorage', () => ({
  loadStagingState: vi.fn().mockResolvedValue({ shortlist: [], archived: [] }),
  serializeRow: vi.fn((row) => row),
}));

vi.mock('../tacticsStorage', () => ({
  loadTacticsChipsState: vi.fn(),
  loadTacticsYearSettings: vi.fn().mockResolvedValue({}),
  saveTacticsChipsState: vi.fn().mockResolvedValue(undefined),
  saveTacticsYearSettings: vi.fn().mockResolvedValue(undefined),
  loadSentChipsSnapshot: vi.fn().mockResolvedValue(null),
  saveSentChipsSnapshot: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../tacticsMetricsStorage', () => ({
  loadTacticsMetrics: vi.fn().mockResolvedValue(null),
  saveTacticsMetrics: vi.fn().mockResolvedValue(undefined),
  loadSentMetricsSnapshot: vi.fn().mockResolvedValue(null),
  saveSentMetricsSnapshot: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../utils/planner/storage', () => ({
  readTaskRows: vi.fn().mockResolvedValue([]),
  saveTaskRows: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../storageCache', () => ({
  clearForYear: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Imports (must follow all vi.mock declarations)
// ---------------------------------------------------------------------------

import { saveSiteSnapshot, restoreSiteSnapshot } from '../snapshotStorage';
import * as tacticsStorage from '../tacticsStorage';
import * as tacticsMetricsStorage from '../tacticsMetricsStorage';
import * as storageCache from '../storageCache';

// ---------------------------------------------------------------------------
// Shared setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  resetCalls();
  resetMockTableData();
  vi.clearAllMocks();

  // Default: non-null chips so saveSiteSnapshot's chip capture succeeds.
  tacticsStorage.loadTacticsChipsState.mockResolvedValue({
    projectChips: [],
    customProjects: [],
    chipTimeOverrides: null,
  });
  tacticsStorage.saveTacticsChipsState.mockResolvedValue(undefined);
  tacticsStorage.loadSentChipsSnapshot.mockResolvedValue(null);
  tacticsStorage.saveSentChipsSnapshot.mockResolvedValue(undefined);
  tacticsMetricsStorage.loadSentMetricsSnapshot.mockResolvedValue(null);
  tacticsMetricsStorage.saveSentMetricsSnapshot.mockResolvedValue(undefined);
});

// ===========================================================================
// 1. planner_settings (including week_names) captured in system
// ===========================================================================

describe('planner_settings capture', () => {
  it('includes planner_settings in system when the row exists', async () => {
    const settings = {
      column_sizing: { task: 200 },
      size_scale: 1.2,
      show_recurring: true,
      show_subprojects: true,
      show_max_min_rows: true,
      sort_statuses: ['Done', 'Not Scheduled'],
      sort_planner_statuses: ['Done'],
      visible_day_columns: { 'day-0': true },
      collapsed_groups: ['Group A'],
      week_names: { 0: 'Sprint 1', 1: 'Sprint 2' },
    };
    mockTableData.planner_settings = settings;

    await saveSiteSnapshot(MOCK_YEAR_NUMBER);

    const snap = calls.inserts.find((c) => c.table === 'site_snapshots');
    expect(snap, 'site_snapshots insert should have fired').toBeTruthy();
    expect(snap.rows.system.plannerSettings).toEqual(settings);
  });

  it('stores null plannerSettings when no settings row exists', async () => {
    mockTableData.planner_settings = null;

    await saveSiteSnapshot(MOCK_YEAR_NUMBER);

    const snap = calls.inserts.find((c) => c.table === 'site_snapshots');
    expect(snap, 'site_snapshots insert should have fired').toBeTruthy();
    expect(snap.rows.system.plannerSettings).toBeNull();
  });
});

// ===========================================================================
// 2. week_names preserved inside plannerSettings
// ===========================================================================

describe('week_names capture (part of planner_settings)', () => {
  it('round-trips week_names through the snapshot payload', async () => {
    mockTableData.planner_settings = {
      column_sizing: {},
      size_scale: 1.0,
      show_recurring: true,
      show_subprojects: true,
      show_max_min_rows: true,
      sort_statuses: [],
      sort_planner_statuses: [],
      visible_day_columns: {},
      collapsed_groups: [],
      week_names: { 2: 'Launch Week', 5: 'Review' },
    };

    await saveSiteSnapshot(MOCK_YEAR_NUMBER);

    const snap = calls.inserts.find((c) => c.table === 'site_snapshots');
    expect(snap, 'site_snapshots insert should have fired').toBeTruthy();
    expect(snap.rows.system.plannerSettings.week_names).toEqual({
      2: 'Launch Week',
      5: 'Review',
    });
  });
});

// ===========================================================================
// 3. years.total_days captured in system
// ===========================================================================

describe('years.total_days capture', () => {
  it('stores total_days as system.yearData.totalDays', async () => {
    mockTableData.years = [{ id: MOCK_YEAR_ID, total_days: 91 }];

    await saveSiteSnapshot(MOCK_YEAR_NUMBER);

    const snap = calls.inserts.find((c) => c.table === 'site_snapshots');
    expect(snap, 'site_snapshots insert should have fired').toBeTruthy();
    expect(snap.rows.system.yearData).toEqual({ totalDays: 91 });
  });

  it('stores null yearData when the year row does not exist', async () => {
    mockTableData.years = [];

    await saveSiteSnapshot(MOCK_YEAR_NUMBER);

    const snap = calls.inserts.find((c) => c.table === 'site_snapshots');
    expect(snap, 'site_snapshots insert should have fired').toBeTruthy();
    expect(snap.rows.system.yearData).toBeNull();
  });
});

// ===========================================================================
// 4. tactics_custom_projects captured as plan.customProjects
// ===========================================================================

describe('tactics_custom_projects capture', () => {
  it('stores custom projects as plan.customProjects', async () => {
    mockTableData.tactics_custom_projects = [
      { external_id: 'cp-1', label: 'Side Project', color: '#ff0000' },
      { external_id: 'cp-2', label: 'Client Work', color: '#0000ff' },
    ];

    await saveSiteSnapshot(MOCK_YEAR_NUMBER);

    const snap = calls.inserts.find((c) => c.table === 'site_snapshots');
    expect(snap, 'site_snapshots insert should have fired').toBeTruthy();
    expect(snap.rows.plan.customProjects).toEqual([
      { id: 'cp-1', label: 'Side Project', color: '#ff0000' },
      { id: 'cp-2', label: 'Client Work', color: '#0000ff' },
    ]);
  });

  it('stores [] when no custom projects exist', async () => {
    mockTableData.tactics_custom_projects = [];

    await saveSiteSnapshot(MOCK_YEAR_NUMBER);

    const snap = calls.inserts.find((c) => c.table === 'site_snapshots');
    expect(snap, 'site_snapshots insert should have fired').toBeTruthy();
    expect(snap.rows.plan.customProjects).toEqual([]);
  });
});

// ===========================================================================
// Restore — planner_settings upserted back
// ===========================================================================

describe('restoreSiteSnapshot — planner_settings', () => {
  it('upserts planner_settings when snapshot contains them', async () => {
    const plannerSettings = {
      column_sizing: { task: 150 },
      size_scale: 0.8,
      show_recurring: false,
      show_subprojects: true,
      show_max_min_rows: false,
      sort_statuses: ['Done'],
      sort_planner_statuses: [],
      visible_day_columns: {},
      collapsed_groups: [],
      week_names: { 0: 'Week A' },
    };

    await restoreSiteSnapshot(
      {
        goal: null,
        plan: { chips: null, settings: null, metrics: null, customProjects: null },
        system: { taskRows: [], plannerSettings, yearData: null },
      },
      MOCK_YEAR_NUMBER,
    );

    const upsert = calls.upserts.find((c) => c.table === 'planner_settings');
    expect(upsert, 'planner_settings upsert should have fired').toBeTruthy();
    expect(upsert.rows.week_names).toEqual({ 0: 'Week A' });
    expect(upsert.rows.column_sizing).toEqual({ task: 150 });
    expect(upsert.rows.user_id).toBe(MOCK_USER_ID);
    expect(upsert.rows.year_id).toBe(MOCK_YEAR_ID);
  });

  it('skips planner_settings upsert when snapshot has none', async () => {
    await restoreSiteSnapshot(
      { goal: null, plan: null, system: { taskRows: [], plannerSettings: null, yearData: null } },
      MOCK_YEAR_NUMBER,
    );

    const upsert = calls.upserts.find((c) => c.table === 'planner_settings');
    expect(upsert).toBeUndefined();
  });
});

// ===========================================================================
// Restore — years.total_days updated
// ===========================================================================

describe('restoreSiteSnapshot — years.total_days', () => {
  it('updates years.total_days when yearData is in the snapshot', async () => {
    await restoreSiteSnapshot(
      {
        goal: null,
        plan: null,
        system: { taskRows: [], plannerSettings: null, yearData: { totalDays: 91 } },
      },
      MOCK_YEAR_NUMBER,
    );

    const update = calls.updates.find((c) => c.table === 'years');
    expect(update, 'years update should have fired').toBeTruthy();
    expect(update.cols).toEqual({ total_days: 91 });
  });

  it('skips years update when yearData is absent (old snapshot)', async () => {
    await restoreSiteSnapshot(
      { goal: null, plan: null, system: { taskRows: [] } },
      MOCK_YEAR_NUMBER,
    );

    const update = calls.updates.find((c) => c.table === 'years');
    expect(update).toBeUndefined();
  });
});

// ===========================================================================
// Restore — tactics_custom_projects when chips=null
// ===========================================================================

describe('restoreSiteSnapshot — tactics_custom_projects', () => {
  it('deletes then reinserts custom projects when chips is null', async () => {
    await restoreSiteSnapshot(
      {
        goal: null,
        plan: {
          chips: null,
          settings: null,
          metrics: null,
          customProjects: [{ id: 'cp-1', label: 'Side Project', color: '#ff0000' }],
        },
        system: { taskRows: [] },
      },
      MOCK_YEAR_NUMBER,
    );

    const del = calls.deletes.find((c) => c.table === 'tactics_custom_projects');
    expect(del, 'delete should have fired').toBeTruthy();

    const ins = calls.inserts.find((c) => c.table === 'tactics_custom_projects');
    expect(ins, 'insert should have fired').toBeTruthy();
    expect(ins.rows).toHaveLength(1);
    expect(ins.rows[0].external_id).toBe('cp-1');
    expect(ins.rows[0].is_sent).toBe(false);
  });

  it('deletes without reinserting when snapshot had no custom projects and chips is null', async () => {
    await restoreSiteSnapshot(
      {
        goal: null,
        plan: { chips: null, settings: null, metrics: null, customProjects: [] },
        system: { taskRows: [] },
      },
      MOCK_YEAR_NUMBER,
    );

    const del = calls.deletes.find((c) => c.table === 'tactics_custom_projects');
    expect(del, 'delete should have fired').toBeTruthy();

    const ins = calls.inserts.find((c) => c.table === 'tactics_custom_projects');
    expect(ins).toBeUndefined();
  });

  it('skips entirely when capture failed (customProjects=null, chips=null)', async () => {
    await restoreSiteSnapshot(
      {
        goal: null,
        plan: { chips: null, settings: null, metrics: null, customProjects: null },
        system: { taskRows: [] },
      },
      MOCK_YEAR_NUMBER,
    );

    const del = calls.deletes.find((c) => c.table === 'tactics_custom_projects');
    expect(del).toBeUndefined();
  });

  it('delegates to saveTacticsChipsState when chips is non-null (not restoreCustomProjects)', async () => {
    const chips = { projectChips: [], customProjects: [], chipTimeOverrides: null };

    await restoreSiteSnapshot(
      {
        goal: null,
        plan: {
          chips,
          settings: null,
          metrics: null,
          customProjects: [{ id: 'cp-1', label: 'x', color: '#fff' }],
        },
        system: { taskRows: [] },
      },
      MOCK_YEAR_NUMBER,
    );

    expect(tacticsStorage.saveTacticsChipsState).toHaveBeenCalledWith(chips, MOCK_YEAR_NUMBER);

    // restoreCustomProjects should NOT have fired directly
    const del = calls.deletes.find((c) => c.table === 'tactics_custom_projects');
    expect(del).toBeUndefined();
  });
});

// ===========================================================================
// Restore — cache cleared after restore
// ===========================================================================

describe('restoreSiteSnapshot — cache invalidation', () => {
  it('calls clearForYear after all restores complete', async () => {
    await restoreSiteSnapshot(
      { goal: null, plan: null, system: { taskRows: [] } },
      MOCK_YEAR_NUMBER,
    );

    expect(storageCache.clearForYear).toHaveBeenCalledWith(MOCK_YEAR_NUMBER);
  });
});

// ===========================================================================
// 5. sentChips captured in plan
// ===========================================================================

describe('sent chips capture', () => {
  it('stores sentChips as plan.sentChips when a sent snapshot exists', async () => {
    const sentChips = {
      projectChips: [{ id: 'chip-1', projectNickname: 'Proj A' }],
      customProjects: [],
      chipTimeOverrides: null,
    };
    tacticsStorage.loadSentChipsSnapshot.mockResolvedValue(sentChips);

    await saveSiteSnapshot(MOCK_YEAR_NUMBER);

    const snap = calls.inserts.find((c) => c.table === 'site_snapshots');
    expect(snap, 'site_snapshots insert should have fired').toBeTruthy();
    expect(snap.rows.plan.sentChips).toEqual(sentChips);
  });

  it('stores null sentChips when no sent snapshot exists', async () => {
    tacticsStorage.loadSentChipsSnapshot.mockResolvedValue(null);

    await saveSiteSnapshot(MOCK_YEAR_NUMBER);

    const snap = calls.inserts.find((c) => c.table === 'site_snapshots');
    expect(snap, 'site_snapshots insert should have fired').toBeTruthy();
    expect(snap.rows.plan.sentChips).toBeNull();
  });
});

// ===========================================================================
// 6. sentMetrics captured in plan
// ===========================================================================

describe('sent metrics capture', () => {
  it('stores sentMetrics as plan.sentMetrics when a sent snapshot exists', async () => {
    const sentMetrics = {
      projectWeeklyQuotas: [{ id: 'p1', label: 'Proj A', weeklyHours: 2.0 }],
      dailyBounds: [],
      weeklyTotals: { availableHours: 10.0, workingHours: 8.0 },
    };
    tacticsMetricsStorage.loadSentMetricsSnapshot.mockResolvedValue(sentMetrics);

    await saveSiteSnapshot(MOCK_YEAR_NUMBER);

    const snap = calls.inserts.find((c) => c.table === 'site_snapshots');
    expect(snap, 'site_snapshots insert should have fired').toBeTruthy();
    expect(snap.rows.plan.sentMetrics).toEqual(sentMetrics);
  });

  it('stores null sentMetrics when no sent snapshot exists', async () => {
    tacticsMetricsStorage.loadSentMetricsSnapshot.mockResolvedValue(null);

    await saveSiteSnapshot(MOCK_YEAR_NUMBER);

    const snap = calls.inserts.find((c) => c.table === 'site_snapshots');
    expect(snap, 'site_snapshots insert should have fired').toBeTruthy();
    expect(snap.rows.plan.sentMetrics).toBeNull();
  });
});

// ===========================================================================
// Restore — sent chips layer
// ===========================================================================

describe('restoreSiteSnapshot — sent chips layer', () => {
  it('calls saveSentChipsSnapshot when sentChips is non-null', async () => {
    const sentChips = {
      projectChips: [{ id: 'chip-1', projectNickname: 'Proj A' }],
      customProjects: [],
      chipTimeOverrides: null,
    };

    await restoreSiteSnapshot(
      {
        goal: null,
        plan: {
          chips: null, settings: null, metrics: null,
          customProjects: null, sentChips, sentMetrics: null,
        },
        system: { taskRows: [] },
      },
      MOCK_YEAR_NUMBER,
    );

    expect(tacticsStorage.saveSentChipsSnapshot).toHaveBeenCalledWith(sentChips, MOCK_YEAR_NUMBER);
  });

  it('skips saveSentChipsSnapshot when sentChips is null (old snapshot)', async () => {
    await restoreSiteSnapshot(
      {
        goal: null,
        plan: {
          chips: null, settings: null, metrics: null,
          customProjects: null, sentChips: null, sentMetrics: null,
        },
        system: { taskRows: [] },
      },
      MOCK_YEAR_NUMBER,
    );

    expect(tacticsStorage.saveSentChipsSnapshot).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// Restore — sent metrics snapshot
// ===========================================================================

describe('restoreSiteSnapshot — sent metrics snapshot', () => {
  it('calls saveSentMetricsSnapshot when sentMetrics is non-null', async () => {
    const sentMetrics = {
      projectWeeklyQuotas: [],
      dailyBounds: [],
      weeklyTotals: { availableHours: 5.0, workingHours: 4.0 },
    };

    await restoreSiteSnapshot(
      {
        goal: null,
        plan: {
          chips: null, settings: null, metrics: null,
          customProjects: null, sentChips: null, sentMetrics,
        },
        system: { taskRows: [] },
      },
      MOCK_YEAR_NUMBER,
    );

    expect(tacticsMetricsStorage.saveSentMetricsSnapshot).toHaveBeenCalledWith(sentMetrics, MOCK_YEAR_NUMBER);
  });

  it('skips saveSentMetricsSnapshot when sentMetrics is null (old snapshot)', async () => {
    await restoreSiteSnapshot(
      {
        goal: null,
        plan: {
          chips: null, settings: null, metrics: null,
          customProjects: null, sentChips: null, sentMetrics: null,
        },
        system: { taskRows: [] },
      },
      MOCK_YEAR_NUMBER,
    );

    expect(tacticsMetricsStorage.saveSentMetricsSnapshot).not.toHaveBeenCalled();
  });
});
