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
 *     chips + settings + metrics (tacticsStorage + tacticsMetricsStorage),
 *     System task rows (plannerStorage). Year metadata and UI prefs are NOT
 *     included — they are low-stakes and change rarely.
 *   - What restore does: writes each page's data back through its storage
 *     helper's save functions so normal cache invalidation and custom events
 *     fire correctly.
 */

import { supabase } from './supabase';
import {
  loadTacticsMetrics,
  saveTacticsMetrics,
} from './tacticsMetricsStorage';

// stagingStorage, tacticsStorage, and plannerStorage are all imported
// dynamically inside their respective capture/restore helpers to avoid
// circular dependencies. Each of those modules imports saveSiteSnapshot
// from this file; a static import here would leave saveSiteSnapshot as
// undefined at load time in all three, silently breaking snapshot triggers.
// tacticsMetricsStorage does NOT import snapshotStorage so it is safe to
// import statically above.
const DEFAULT_PROJECT_ID = 'project-1';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SNAPSHOT_CAP = 50;
const MIN_INTERVAL_MS = 1 * 60 * 1000;      // 1 minute
const SESSION_GAP_MS  = 4 * 60 * 60 * 1000; // 4 hours

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function requireUserId() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error('No authenticated user');
  return user.id;
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
    const { loadStagingState } = await import('./stagingStorage');
    return await loadStagingState(yearNumber);
  } catch {
    return null;
  }
}

async function capturePlan(yearNumber) {
  try {
    const { loadTacticsChipsState, loadTacticsYearSettings } = await import('./tacticsStorage');
    const [chips, settings, metrics] = await Promise.all([
      loadTacticsChipsState(yearNumber).catch(() => null),
      loadTacticsYearSettings(yearNumber).catch(() => null),
      loadTacticsMetrics(yearNumber).catch(() => null),
    ]);
    return { chips, settings, metrics };
  } catch {
    return null;
  }
}

async function captureSystem(yearNumber) {
  try {
    const { readTaskRows } = await import('../utils/planner/storage');
    const rows = await readTaskRows(DEFAULT_PROJECT_ID, yearNumber);
    return { taskRows: rows };
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
  const { saveTacticsChipsState, saveTacticsYearSettings } = await import('./tacticsStorage');
  const { chips, settings, metrics } = planData;
  const ops = [];
  if (chips) ops.push(saveTacticsChipsState(chips, yearNumber).catch(() => {}));
  if (settings) ops.push(saveTacticsYearSettings(settings, yearNumber).catch(() => {}));
  if (metrics) ops.push(saveTacticsMetrics(metrics, yearNumber).catch(() => {}));
  await Promise.all(ops);
}

async function restoreSystem(systemData, yearNumber) {
  if (!systemData?.taskRows) return;
  const { saveTaskRows } = await import('../utils/planner/storage');
  await saveTaskRows(systemData.taskRows, DEFAULT_PROJECT_ID, yearNumber);
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
 * helper's save functions. Callers should reload the page (or navigate home)
 * after this resolves so the UI reflects the restored state.
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
    console.log('[snapshotStorage] maybeSnapshotOnSessionStart called, year:', yearNumber);
    const userId = await requireUserId();
    console.log('[snapshotStorage] userId:', userId);
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
    console.log('[snapshotStorage] session-start snapshot saved');

    enforceSnapshotCap(userId, yearNumber).catch(() => {});
  } catch (err) {
    console.error('[snapshotStorage] maybeSnapshotOnSessionStart failed', err);
  }
}
