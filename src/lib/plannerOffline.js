// plannerOffline.js — IndexedDB-backed offline layer for the System page's
// planner rows (Phase 2 of docs/offline-sync-plan.md).
//
// Two stores per (user, year), both living in one IndexedDB key/value store:
//   snapshot:{uid}:{year}  the last successfully read-or-saved row array plus
//                          the known-row-id bookkeeping. Lets an already-open
//                          tab render the System page with no connection.
//   pending:{uid}:{year}   the latest desired taskRows state whose save has
//                          not yet been confirmed by the server, plus the
//                          _knownRowIds / synthetic-id maps it was computed
//                          under. A reload or tab close while offline no
//                          longer loses the save.
//
// Unlike mobile (which queues per-row ops), the web's pending unit is the
// whole desired state: saveTaskRows already recomputes a diff against the
// server's live rows inside a serialized queue at flush time, so replaying
// the LATEST desired state is both idempotent and conflict-aware —
// coalescing is automatic (only the last state matters) and remote deletes /
// inserts are respected via the persisted known-id set.
//
// This module deliberately knows nothing about diffing or Supabase tables.
// storage.js registers a replay handler; this module decides WHEN to replay
// (startup, window 'online', tab becoming visible, capped backoff) and owns
// durability. Localstorage is not used: a year of rows exceeds sensible
// localStorage budgets and JSON-parsing it blocks the main thread.
//
// UI: subscribe via the 'planner-offline-pending' window event (detail:
// { pending, __eventYear }) or poll hasPendingOfflineSave().

import { supabase } from './supabase';
import { onSessionReset } from './storageCache';

const DB_NAME = 'listical-offline';
const DB_VERSION = 1;
const STORE = 'kv';

const PENDING_EVENT = 'planner-offline-pending';
const RETRY_BASE_MS = 5000;
const RETRY_MAX_MS = 30000;
// Pending saves older than this are dropped instead of replayed (see
// replayPendingSaves). Generous on purpose: a pending record carries its
// own baseline, so the diff save already protects newer writes from other
// clients however old the record is. This is only a sanity cap so a tab
// forgotten for months does not replay at all.
export const PENDING_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

// --- tiny promise wrapper over IndexedDB (no dependency needed) ----------

let _dbPromise = null;
function openDb() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      // The browser can close the connection out from under us (storage
      // eviction, version change from another tab). Forget it so the next
      // call re-opens instead of failing forever.
      db.onclose = () => { _dbPromise = null; };
      db.onversionchange = () => { db.close(); _dbPromise = null; };
      resolve(db);
    };
    req.onerror = () => {
      _dbPromise = null; // a transient failure must not poison the session
      reject(req.error);
    };
  });
  return _dbPromise;
}

function idbRequest(mode, fn) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const req = fn(tx.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

const idbGet = (key) => idbRequest('readonly', (s) => s.get(key));
const idbSet = (key, value) => idbRequest('readwrite', (s) => s.put(value, key));
const idbDel = (key) => idbRequest('readwrite', (s) => s.delete(key));
const idbKeys = () => idbRequest('readonly', (s) => s.getAllKeys());

const snapshotKey = (uid, yearNumber) => `snapshot:${uid}:${yearNumber}`;
const pendingKey = (uid, yearNumber) => `pending:${uid}:${yearNumber}`;

// Local (non-network) user id — auth.getUser() round-trips to the server and
// fails exactly when this module matters, so use the persisted session.
export async function localUserId() {
  try {
    const { data } = await supabase.auth.getSession();
    return data?.session?.user?.id ?? null;
  } catch {
    return null;
  }
}

// --- snapshot -------------------------------------------------------------

// { rows, knownIds, savedAt }
export async function loadPlannerSnapshot(uid, yearNumber) {
  try {
    return (await idbGet(snapshotKey(uid, yearNumber))) ?? null;
  } catch {
    return null;
  }
}

export async function savePlannerSnapshot(uid, yearNumber, snapshot) {
  try {
    await idbSet(snapshotKey(uid, yearNumber), snapshot);
  } catch {
    // Best-effort: a failed persist degrades to online-only for this read.
  }
}

// --- pending save ---------------------------------------------------------

// Serialize pending writes so a fast sequence of saves can't land in IDB out
// of order (the LAST desired state must win).
let _pendingWriteQueue = Promise.resolve();
// Mirrors whether a pending record exists, for synchronous UI reads.
let _pendingFlag = false;

function dispatchPendingEvent(yearNumber) {
  if (typeof window === 'undefined') return;
  const detail = { pending: _pendingFlag, __eventYear: yearNumber };
  window.dispatchEvent(
    typeof CustomEvent === 'function'
      ? new CustomEvent(PENDING_EVENT, { detail })
      : new Event(PENDING_EVENT),
  );
}

export const hasPendingOfflineSave = () => _pendingFlag;

// payload: { taskRows, knownIds, synIds, seq, queuedAt }
export function savePendingState(uid, yearNumber, payload) {
  _pendingWriteQueue = _pendingWriteQueue
    .then(() => idbSet(pendingKey(uid, yearNumber), payload))
    .then(() => {
      if (!_pendingFlag) {
        _pendingFlag = true;
        dispatchPendingEvent(yearNumber);
      }
    })
    .catch(() => {});
  return _pendingWriteQueue;
}

export function clearPendingState(uid, yearNumber) {
  _pendingWriteQueue = _pendingWriteQueue
    .then(() => idbDel(pendingKey(uid, yearNumber)))
    .then(() => {
      if (_pendingFlag) {
        _pendingFlag = false;
        dispatchPendingEvent(yearNumber);
      }
      _retryCount = 0;
    })
    .catch(() => {});
  return _pendingWriteQueue;
}

export async function loadPendingStates(uid) {
  try {
    const keys = await idbKeys();
    const mine = keys.filter(
      (k) => typeof k === 'string' && k.startsWith(`pending:${uid}:`),
    );
    const out = [];
    for (const key of mine) {
      const payload = await idbGet(key);
      if (payload) {
        out.push({ yearNumber: Number(key.split(':')[2]), payload });
      }
    }
    return out;
  } catch {
    return [];
  }
}

// --- sign-out cleanup -----------------------------------------------------

// Delete every snapshot / pending record belonging to `uid`. Called on
// SIGNED_OUT, USER_DELETED and account switch (via storageCache's session
// reset hooks) so a shared browser never keeps the previous user's planner
// rows on disk after they leave — the IndexedDB counterpart of the
// `cw-cache:` localStorage scoping. A pending save that has not reached the
// server is dropped with it: after sign-out there is no session to replay
// it under.
export async function clearUserOfflineData(uid) {
  if (!uid) return;
  try {
    const keys = await idbKeys();
    const mine = keys.filter(
      (k) => typeof k === 'string' && (k.startsWith(`snapshot:${uid}:`) || k.startsWith(`pending:${uid}:`)),
    );
    for (const key of mine) await idbDel(key);
    if (_pendingFlag) {
      _pendingFlag = false;
      dispatchPendingEvent(null);
    }
  } catch {
    // best effort
  }
}

onSessionReset((previousUserId) => { clearUserOfflineData(previousUserId); });

// --- replay ---------------------------------------------------------------

// storage.js registers this: (yearNumber, payload) => Promise. It restores
// the known-id / synthetic-id bookkeeping and re-runs the diff save.
let _replayHandler = null;
export function setOfflineReplayHandler(fn) {
  _replayHandler = fn;
}

let _replaying = false;
let _retryTimer = null;
let _retryCount = 0;

export async function replayPendingSaves() {
  if (_replaying || !_replayHandler) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  _replaying = true;
  try {
    const uid = await localUserId();
    if (!uid) return;
    const pending = await loadPendingStates(uid);
    if (pending.length === 0) {
      _pendingFlag = false;
      return;
    }
    _pendingFlag = true;
    for (const { yearNumber, payload } of pending) {
      // A pending record older than PENDING_MAX_AGE_MS (30 days) is
      // discarded, not replayed. Younger records replay under their own
      // persisted baseline, so an unsynced edit from a long offline stretch
      // still lands without clobbering anything newer.
      const queuedAt = typeof payload?.queuedAt === 'number' ? payload.queuedAt : null;
      if (queuedAt === null || Date.now() - queuedAt > PENDING_MAX_AGE_MS) {
        console.warn('[plannerOffline] discarding stale pending save', { yearNumber, queuedAt });
        await clearPendingState(uid, yearNumber);
        continue;
      }
      // The handler ends in _saveTaskRowsImpl, which clears the pending
      // record on confirmed success and re-schedules a retry on failure.
      await _replayHandler(yearNumber, payload);
    }
  } finally {
    _replaying = false;
  }
}

export function scheduleOfflineRetry() {
  if (_retryTimer) return;
  const delay = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** _retryCount);
  _retryCount += 1;
  _retryTimer = setTimeout(() => {
    _retryTimer = null;
    replayPendingSaves();
  }, delay);
}

// Wake the replay loop on the signals that mean "we may be back": the
// browser regaining connectivity and the tab becoming visible again.
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    _retryCount = 0;
    replayPendingSaves();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') replayPendingSaves();
  });
}
