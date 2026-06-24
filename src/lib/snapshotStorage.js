/**
 * Snapshot Storage (Version History)
 *
 * Stores whole-site snapshots in Supabase so users can roll back to a
 * previous state after accidental edits or data bugs. Each snapshot bundles
 * all three pages together (Goal, Plan, System) as JSONB so restoring is a
 * single action.
 *
 * Public API:
 *   saveSiteSnapshot(yearNumber)       => Promise<void>
 *   loadSiteSnapshots(yearNumber)      => Promise<Snapshot[]>
 *   restoreSiteSnapshot(snapshot, yearNumber) => Promise<void>
 *   maybeSnapshotOnSessionStart(yearNumber)   => Promise<void>
 *
 * Design decisions:
 *   - Activity-driven: a snapshot fires before each save, throttled to one
 *     every 2 minutes so snapshots cluster around real editing sessions.
 *   - Rolling window of 50: when a 51st row would be inserted, the oldest
 *     is deleted first.
 *   - Session-start snapshot: call maybeSnapshotOnSessionStart on app load.
 *     It fires immediately if the most recent snapshot is older than 4 hours,
 *     ensuring a clean "before this session" restore point is always available.
 *   - What is snapshotted: Goal shortlist/archived (stagingStorage), Plan
 *     chips + settings + metrics + custom projects + sent chips/metrics +
 *     chip task notes (tacticsStorage + tacticsMetricsStorage + chip_task_notes),
 *     System task rows + planner settings + years.total_days (plannerStorage).
 *   - What restore does: writes each page's data back through its storage
 *     helper's save functions so normal cache invalidation and custom events
 *     fire correctly. Calls clearForYear at the end so stale in-memory cache
 *     entries don't survive into the next read.
 */

import { supabase } from './supabase';
import { clearForYear } from './storageCache';
import {
  loadTacticsMetrics,
  saveTacticsMetrics,
  loadSentMetricsSnapshot,
  saveSentMetricsSnapshot,
} from './tacticsMetricsStorage';

// stagingStorage, tacticsStorage, and plannerStorage are all imported
// dynamically inside their respective capture/restore helpers to avoid
// circular dependencies. Each of those modules imports saveSiteSnapshot
// from this file; a static import here would leave saveSiteSnapshot as
// undefined at load time in all three, silently breaking snapshot triggers.
// tacticsMetricsStorage and storageCache do NOT import snapshotStorage so
// they are safe to import statically above.
const DEFAULT_PROJECT_ID = 'project-1';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SNAPSHOT_CAP = 50;
const MIN_INTERVAL_MS = 25 * 1000;          // 25 seconds (safety floor under the 30s debounce)
const SESSION_GAP_MS  = 4 * 60 * 60 * 1000; // 4 hours
const DEBOUNCE_MS     = 30 * 1000;          // 30 seconds

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function requireUserId() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error('No authenticated user');
  return user.id;
}

/**
 * Resolve a year UUID from yearNumber within this module without relying on
 * plannerStorage's internal findYearRow (which would require a dynamic import
 * and adds indirect coupling). Uses the same ordering guard as plannerStorage.
 */
async function findYearIdForSnapshot(userId, yearNumber) {
  const { data } = await supabase
    .from('years')
    .select('id')
    .eq('user_id', userId)
    .eq('year_number', yearNumber)
    .order('created_at', { ascending: false })
    .limit(1);
  return data?.[0]?.id ?? null;
}

/**
 * Returns the created_at timestamp of the most recent snapshot for this user
 * and year, or null if none exists.
 */
async function getLatestSnapshotTime(userId, yearNumber) {
  const { data, error } = await supabase
    .from('site_snapshots')
    .select('created_at')
    .eq('user_id', userId)
    .eq('year_number', yearNumber)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data?.created_at ?? null;
}

/**
 * Deletes the oldest snapshot(s) so the total stays at or below SNAPSHOT_CAP.
 * Called after each successful insert.
 */
async function enforceSnapshotCap(userId, yearNumber) {
  // Fetch the ids of all snapshots for this user/year, newest first.
  const { data, error } = await supabase
    .from('site_snapshots')
    .select('id, created_at')
    .eq('user_id', userId)
    .eq('year_number', yearNumber)
    .order('created_at', { ascending: false });

  if (error) throw error;

  const rows = data ?? [];
  if (rows.length <= SNAPSHOT_CAP) return;

  const idsToDelete = rows.slice(SNAPSHOT_CAP).map((r) => r.id);
  const { error: deleteError } = await supabase
    .from('site_snapshots')
    .delete()
    .in('id', idsToDelete);

  if (deleteError) throw deleteError;
}

// ---------------------------------------------------------------------------
// Capture helpers: read current state from each storage module
// ---------------------------------------------------------------------------

async function captureGoal(yearNumber) {
  try {
    const { loadStagingState, serializeRow } = await import('./stagingStorage');
    const state = await loadStagingState(yearNumber);
    // planTableEntries come back from loadStagingState as arrays with
    // non-enumerable metadata (__rowType, __pairId, __sectionType, __isTotalRow).
    // JSON.stringify strips non-enumerable properties, so we must convert each
    // entry to the explicit { cells, _rowType, _pairId, ... } object form
    // before the data lands in Supabase JSONB — otherwise the table structure
    // is lost when the snapshot is restored.
    const serializeItem = (item) => ({
      ...item,
      planTableEntries: Array.isArray(item.planTableEntries)
        ? item.planTableEntries.map(serializeRow)
        : [],
    });
    return {
      shortlist: (state.shortlist ?? []).map(serializeItem),
      archived: (state.archived ?? []).map(serializeItem),
    };
  } catch {
    return null;
  }
}

async function capturePlan(yearNumber) {
  try {
    const { loadTacticsChipsState, loadTacticsYearSettings, loadSentChipsSnapshot } = await import('./tacticsStorage');
    const [chips, settings, metrics, customProjects, sentChips, sentMetrics, chipNotes] = await Promise.all([
      loadTacticsChipsState(yearNumber).catch(() => null),
      loadTacticsYearSettings(yearNumber).catch(() => null),
      loadTacticsMetrics(yearNumber).catch(() => null),
      // Capture custom projects independently so they survive if chip capture
      // fails. restorePlan uses this as a fallback when chips is null.
      captureCustomProjects(yearNumber),
      // Capture the sent (is_sent=true) chip layer — what System page sees.
      loadSentChipsSnapshot(yearNumber).catch(() => null),
      // Capture the sent metrics snapshot — quota data the System page uses.
      loadSentMetricsSnapshot(yearNumber).catch(() => null),
      // Capture chip task notes (keyed by stable chip UUID, not year-scoped in DB).
      captureChipNotes(yearNumber),
    ]);
    return { chips, settings, metrics, customProjects, sentChips, sentMetrics, chipNotes };
  } catch {
    return null;
  }
}

async function captureSystem(yearNumber) {
  try {
    const { readTaskRows } = await import('../utils/planner/storage');
    const [rows, plannerSettings, yearData] = await Promise.all([
      readTaskRows(DEFAULT_PROJECT_ID, yearNumber),
      captureSystemSettings(yearNumber),
      captureYearData(yearNumber),
    ]);
    return { taskRows: rows, plannerSettings, yearData };
  } catch (err) {
    return null;
  }
}

/**
 * Captures the full planner_settings row (all UI columns + week_names) for
 * the given year. Excludes send_to_system_at which is owned by tacticsStorage.
 */
async function captureSystemSettings(yearNumber) {
  try {
    const userId = await requireUserId();
    const yearId = await findYearIdForSnapshot(userId, yearNumber);
    if (!yearId) return null;
    const { data, error } = await supabase
      .from('planner_settings')
      .select(
        'column_sizing, size_scale, show_recurring, show_subprojects, ' +
        'show_max_min_rows, sort_statuses, sort_planner_statuses, ' +
        'visible_day_columns, collapsed_groups, week_names',
      )
      .eq('user_id', userId)
      .eq('year_id', yearId)
      .maybeSingle();
    if (error) throw error;
    return data ?? null;
  } catch {
    return null;
  }
}

/**
 * Captures years.total_days for the given year. Stored as { totalDays } so
 * the restore helper can update the column without a years-table read.
 */
async function captureYearData(yearNumber) {
  try {
    const userId = await requireUserId();
    const { data, error } = await supabase
      .from('years')
      .select('total_days')
      .eq('user_id', userId)
      .eq('year_number', yearNumber)
      .order('created_at', { ascending: false })
      .limit(1);
    if (error) throw error;
    const row = data?.[0];
    if (!row) return null;
    return { totalDays: row.total_days };
  } catch {
    return null;
  }
}

/**
 * Captures the live (is_sent=false) tactics_custom_projects for the year.
 *
 * Returns [] when confirmed empty, null when the read failed. The restore
 * helper uses this distinction: [] triggers a delete-and-reinsert (cleaning up
 * any projects added after the snapshot), null skips the restore entirely.
 */
async function captureCustomProjects(yearNumber) {
  try {
    const userId = await requireUserId();
    const yearId = await findYearIdForSnapshot(userId, yearNumber);
    if (!yearId) return [];
    const { data, error } = await supabase
      .from('tactics_custom_projects')
      .select('external_id, label, color')
      .eq('user_id', userId)
      .eq('year_id', yearId)
      .eq('is_sent', false);
    if (error) throw error;
    return (data ?? []).map((r) => ({ id: r.external_id, label: r.label, color: r.color }));
  } catch {
    return null;
  }
}

/**
 * Captures chip task notes for all chips belonging to this year (both live
 * and sent layers). Notes are keyed by chip UUID with no year_id in the DB,
 * so we first resolve which chip IDs belong to this year via tactics_chips.
 *
 * Returns [] when confirmed empty, null when the read failed.
 */
async function captureChipNotes(yearNumber) {
  try {
    const userId = await requireUserId();
    const yearId = await findYearIdForSnapshot(userId, yearNumber);
    if (!yearId) return [];

    // Fetch all chip UUIDs for this year (both live and sent layers).
    const { data: chipRows, error: chipError } = await supabase
      .from('tactics_chips')
      .select('chip_id')
      .eq('user_id', userId)
      .eq('year_id', yearId);
    if (chipError) throw chipError;
    if (!chipRows?.length) return [];

    const chipIds = chipRows.map((r) => r.chip_id);

    const { data: noteRows, error: noteError } = await supabase
      .from('chip_task_notes')
      .select('chip_id, note')
      .eq('user_id', userId)
      .in('chip_id', chipIds);
    if (noteError) throw noteError;

    return (noteRows ?? []).map((r) => ({ chipId: r.chip_id, note: r.note }));
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Restore helpers: write snapshot data back through storage helpers
// ---------------------------------------------------------------------------

async function restoreGoal(goalData, yearNumber) {
  if (!goalData) return;
  const { saveStagingState } = await import('./stagingStorage');
  await saveStagingState(goalData, yearNumber);
}

async function restorePlan(planData, yearNumber) {
  if (!planData) return;
  const { saveTacticsChipsState, saveTacticsYearSettings, saveSentChipsSnapshot } = await import('./tacticsStorage');
  const { chips, settings, metrics, customProjects, sentChips, sentMetrics } = planData;
  const ops = [];

  if (chips) {
    // saveTacticsChipsState writes both the chip layer and customProjects
    // internally via writeChipsLayer. No need to call restoreCustomProjects
    // separately — chips.customProjects already covers it.
    ops.push(saveTacticsChipsState(chips, yearNumber).catch(() => {}));
  } else {
    // chips capture failed — restore custom projects independently so any
    // projects created after the snapshot point don't survive the rollback.
    // restoreCustomProjects skips when customProjects is null (failed capture)
    // but correctly clears on [] (confirmed empty at snapshot time).
    ops.push(restoreCustomProjects(customProjects ?? null, yearNumber).catch(() => {}));
  }

  if (settings) ops.push(saveTacticsYearSettings(settings, yearNumber).catch(() => {}));
  if (metrics) ops.push(saveTacticsMetrics(metrics, yearNumber).catch(() => {}));

  // Restore the sent (is_sent=true) chip layer — reverts what System page sees.
  // null means the snapshot predates this fix; skip to avoid wiping the live layer.
  if (sentChips != null) ops.push(saveSentChipsSnapshot(sentChips, yearNumber).catch(() => {}));

  // Restore the sent metrics snapshot — quota data System page uses.
  if (sentMetrics != null) ops.push(saveSentMetricsSnapshot(sentMetrics, yearNumber).catch(() => {}));

  // Restore chip task notes for this year's chips.
  // null/undefined = capture failed or old snapshot — skip to avoid wiping live notes.
  if (planData.chipNotes != null) ops.push(restoreChipNotes(planData.chipNotes, yearNumber).catch(() => {}));

  await Promise.all(ops);
}

async function restoreSystem(systemData, yearNumber) {
  if (!systemData?.taskRows) return;
  const { saveTaskRows } = await import('../utils/planner/storage');
  await Promise.all([
    saveTaskRows(systemData.taskRows, DEFAULT_PROJECT_ID, yearNumber),
    restoreSystemSettings(systemData.plannerSettings ?? null, yearNumber),
    restoreYearData(systemData.yearData ?? null, yearNumber),
  ]);
}

/**
 * Upserts all planner_settings UI columns from a previously captured snapshot.
 * Deliberately excludes send_to_system_at (owned by tacticsStorage) and any
 * columns not present in the captured object so old snapshots that predate
 * this fix restore cleanly without clobbering unrelated columns.
 */
async function restoreSystemSettings(settingsData, yearNumber) {
  if (!settingsData) return;
  try {
    const userId = await requireUserId();
    const yearId = await findYearIdForSnapshot(userId, yearNumber);
    if (!yearId) return;
    const {
      column_sizing, size_scale, show_recurring, show_subprojects,
      show_max_min_rows, sort_statuses, sort_planner_statuses,
      visible_day_columns, collapsed_groups, week_names,
    } = settingsData;
    const { error } = await supabase
      .from('planner_settings')
      .upsert(
        {
          user_id: userId,
          year_id: yearId,
          column_sizing,
          size_scale,
          show_recurring,
          show_subprojects,
          show_max_min_rows,
          sort_statuses,
          sort_planner_statuses,
          visible_day_columns,
          collapsed_groups,
          week_names,
        },
        { onConflict: 'user_id,year_id' },
      );
    if (error) throw error;
  } catch (err) {
    console.error('[snapshotStorage] restoreSystemSettings failed', err);
  }
}

/**
 * Writes years.total_days back from a captured { totalDays } object.
 * Skips when totalDays is null/undefined (old snapshots that predate this fix).
 */
async function restoreYearData(yearData, yearNumber) {
  if (yearData?.totalDays == null) return;
  try {
    const userId = await requireUserId();
    const yearId = await findYearIdForSnapshot(userId, yearNumber);
    if (!yearId) return;
    const { error } = await supabase
      .from('years')
      .update({ total_days: yearData.totalDays })
      .eq('id', yearId)
      .eq('user_id', userId);
    if (error) throw error;
  } catch (err) {
    console.error('[snapshotStorage] restoreYearData failed', err);
  }
}

/**
 * Replaces the live (is_sent=false) tactics_custom_projects layer with the
 * captured snapshot array.
 *
 * null  → skip entirely (capture failed; don't risk wiping real data)
 * []    → delete all existing rows and insert nothing (correctly removes any
 *         projects that were added after the snapshot point)
 * [...] → delete existing, re-insert the captured set
 */
async function restoreCustomProjects(customProjects, yearNumber) {
  if (customProjects === null || customProjects === undefined) return;
  try {
    const userId = await requireUserId();
    const yearId = await findYearIdForSnapshot(userId, yearNumber);
    if (!yearId) return;
    const { error: deleteError } = await supabase
      .from('tactics_custom_projects')
      .delete()
      .eq('user_id', userId)
      .eq('year_id', yearId)
      .eq('is_sent', false);
    if (deleteError) throw deleteError;
    if (customProjects.length > 0) {
      const rows = customProjects.map((cp) => ({
        user_id: userId,
        year_id: yearId,
        is_sent: false,
        external_id: cp.id,
        label: cp.label,
        color: cp.color,
      }));
      const { error: insertError } = await supabase
        .from('tactics_custom_projects')
        .insert(rows);
      if (insertError) throw insertError;
    }
  } catch (err) {
    console.error('[snapshotStorage] restoreCustomProjects failed', err);
  }
}

/**
 * Replaces chip task notes for this year's chips with the captured snapshot array.
 *
 * null/undefined → skip entirely (capture failed or old snapshot; don't risk wiping data)
 * []             → delete all existing notes for this year's chips and insert nothing
 * [...]          → delete existing notes for this year's chips, re-insert the captured set
 *
 * Scopes the delete to chip IDs belonging to this year so notes for other
 * years' chips are never touched.
 */
async function restoreChipNotes(chipNotes, yearNumber) {
  if (chipNotes === null || chipNotes === undefined) return;
  try {
    const userId = await requireUserId();
    const yearId = await findYearIdForSnapshot(userId, yearNumber);
    if (!yearId) return;

    // Resolve chip IDs for this year to scope the delete correctly.
    const { data: chipRows, error: chipError } = await supabase
      .from('tactics_chips')
      .select('chip_id')
      .eq('user_id', userId)
      .eq('year_id', yearId);
    if (chipError) throw chipError;
    if (!chipRows?.length) return; // No chips → no notes to manage.

    const chipIds = chipRows.map((r) => r.chip_id);

    // Delete existing notes for this year's chips.
    const { error: deleteError } = await supabase
      .from('chip_task_notes')
      .delete()
      .eq('user_id', userId)
      .in('chip_id', chipIds);
    if (deleteError) throw deleteError;

    // Re-insert the captured notes (skip if empty — confirmed no notes at snapshot time).
    if (chipNotes.length > 0) {
      const rows = chipNotes.map((n) => ({
        user_id: userId,
        chip_id: n.chipId,
        note: n.note,
        updated_at: new Date().toISOString(),
      }));
      const { error: insertError } = await supabase
        .from('chip_task_notes')
        .insert(rows);
      if (insertError) throw insertError;
    }
  } catch (err) {
    console.error('[snapshotStorage] restoreChipNotes failed', err);
  }
}

// ---------------------------------------------------------------------------
// Debounced snapshot trigger (used by storage save functions)
// ---------------------------------------------------------------------------

// Per-year debounce timers. Keyed by yearNumber so concurrent year edits
// are tracked independently.
const _debounceTimers = new Map();

/**
 * Schedules a snapshot for yearNumber after 30 seconds of inactivity.
 * Each call resets the timer, so rapid or mid-thought edits (typing a note,
 * adjusting chips) coalesce into a single snapshot taken after the last
 * write settles.
 *
 * Use this in storage save functions instead of saveSiteSnapshot directly.
 *
 * @param {number} yearNumber
 */
export function debounceSiteSnapshot(yearNumber) {
  if (yearNumber == null) return;
  const existing = _debounceTimers.get(yearNumber);
  if (existing) clearTimeout(existing);
  const id = setTimeout(() => {
    _debounceTimers.delete(yearNumber);
    saveSiteSnapshot(yearNumber);
  }, DEBOUNCE_MS);
  _debounceTimers.set(yearNumber, id);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Captures a whole-site snapshot for the given year and writes it to
 * site_snapshots. Throttled: skips the write if the most recent snapshot is
 * less than 2 minutes old. Safe to call frequently — the guard makes it cheap.
 *
 * @param {number} yearNumber
 */
export async function saveSiteSnapshot(yearNumber) {
  if (yearNumber == null) return;

  try {
    const userId = await requireUserId();

    // Debounce: skip if a snapshot was taken less than 2 minutes ago.
    const latestTime = await getLatestSnapshotTime(userId, yearNumber);
    if (latestTime) {
      const msSinceLast = Date.now() - new Date(latestTime).getTime();
      if (msSinceLast < MIN_INTERVAL_MS) return;
    }

    // Capture all three pages in parallel.
    const [goal, plan, system] = await Promise.all([
      captureGoal(yearNumber),
      capturePlan(yearNumber),
      captureSystem(yearNumber),
    ]);

    // Insert the snapshot row.
    const { error: insertError } = await supabase
      .from('site_snapshots')
      .insert({
        user_id: userId,
        year_number: yearNumber,
        goal:   goal   ?? {},
        plan:   plan   ?? {},
        system: system ?? {},
      });

    if (insertError) throw insertError;

    // Trim to the cap — best-effort, don't let a cleanup failure block saves.
    enforceSnapshotCap(userId, yearNumber).catch(() => {});
  } catch (err) {
    // Never surface snapshot errors to the user — a failed snapshot should
    // not interrupt a normal save.
    console.error('saveSiteSnapshot failed', err);
  }
}

/**
 * Returns up to SNAPSHOT_CAP snapshots for the given year, newest first.
 * Each entry includes: id, year_number, created_at, goal, plan, system.
 *
 * @param {number} yearNumber
 * @returns {Promise<Array>}
 */
export async function loadSiteSnapshots(yearNumber) {
  if (yearNumber == null) return [];

  try {
    const userId = await requireUserId();
    const { data, error } = await supabase
      .from('site_snapshots')
      .select('id, year_number, created_at, goal, plan, system')
      .eq('user_id', userId)
      .eq('year_number', yearNumber)
      .order('created_at', { ascending: false })
      .limit(SNAPSHOT_CAP);

    if (error) throw error;
    return data ?? [];
  } catch (err) {
    console.error('loadSiteSnapshots failed', err);
    return [];
  }
}

/**
 * Restores a snapshot by writing each page's data back through its storage
 * helper's save functions. Clears the in-memory cache for this year after
 * restore so the next read fetches the restored values from Supabase.
 * Callers should reload the page (or navigate home) after this resolves so
 * the UI reflects the restored state.
 *
 * @param {object} snapshot   A row from loadSiteSnapshots
 * @param {number} yearNumber
 */
export async function restoreSiteSnapshot(snapshot, yearNumber) {
  if (!snapshot || yearNumber == null) return;

  await Promise.all([
    restoreGoal(snapshot.goal, yearNumber),
    restorePlan(snapshot.plan, yearNumber),
    restoreSystem(snapshot.system, yearNumber),
  ]);

  // Bust the in-memory + localStorage cache for this year so stale values
  // are not served from cache after the restore completes.
  clearForYear(yearNumber);
}

/**
 * Fires a snapshot immediately if the most recent snapshot is older than
 * 4 hours (or if no snapshot exists yet). Call once on app load, before any
 * edits can land, to ensure there is always a clean "before this session"
 * restore point.
 *
 * @param {number} yearNumber
 */
export async function maybeSnapshotOnSessionStart(yearNumber) {
  if (yearNumber == null) return;

  try {
    const userId = await requireUserId();
    const latestTime = await getLatestSnapshotTime(userId, yearNumber);

    if (latestTime) {
      const msSinceLast = Date.now() - new Date(latestTime).getTime();
      if (msSinceLast < SESSION_GAP_MS) return;
    }

    // Bypass the 2-minute throttle by inserting directly.
    const [goal, plan, system] = await Promise.all([
      captureGoal(yearNumber),
      capturePlan(yearNumber),
      captureSystem(yearNumber),
    ]);

    const { error: insertError } = await supabase
      .from('site_snapshots')
      .insert({
        user_id: userId,
        year_number: yearNumber,
        goal:   goal   ?? {},
        plan:   plan   ?? {},
        system: system ?? {},
      });

    if (insertError) throw insertError;

    enforceSnapshotCap(userId, yearNumber).catch(() => {});
  } catch (err) {
    console.error('[snapshotStorage] maybeSnapshotOnSessionStart failed', err);
  }
}
