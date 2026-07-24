/**
 * Storage cache (step 6 of SUPABASE_MIGRATION_PLAN.md)
 *
 * In-memory cache for the four Supabase-backed storage helpers
 * (stagingStorage, tacticsMetricsStorage, tacticsStorage, plannerStorage).
 *
 * Why it exists: pre-port, each helper read from localStorage synchronously
 * and pages rendered instantly with their saved data. Post-port, every page
 * navigation fires a fresh Supabase round-trip (~300ms to 1s), making the
 * Plan and System pages blank out briefly on every navigation.
 *
 * Strategy:
 *   - Each helper wraps its internal row-fetch functions with `getCached` /
 *     `setCached`. Cache HIT returns the saved value immediately.
 *   - Each helper's save functions call `setCached` (with the just-written
 *     row) or `invalidate` (when the next read needs to re-fetch).
 *   - The auth listener below clears everything on sign-out and adopts the
 *     signed-in user on every session event, so one user can never read
 *     another user's cached rows (see "user scoping" below).
 *   - `clearForYear(yearNumber)` is exposed for explicit invalidation when
 *     a year is created (createDraftYear), undone (undoDraftYear), or
 *     archived. Those flows touch many tables; clearing by year is simpler
 *     than tracking which exact keys to invalidate.
 *
 * User scoping (CRIT-1 fix, 2026-07-24):
 *   The localStorage mirror is device-global, so cache entries must be
 *   namespaced by user id — helper cache keys stay year-scoped only, and
 *   this module owns the user segment:
 *
 *     localStorage key = `cw-cache:${userId}::${namespace}::${key}`
 *
 *   The in-memory cache only ever holds ONE user's data (`currentOwnerId`).
 *   Nothing is hydrated at module-init on the blind; hydration happens in
 *   `adoptUser`, which runs (a) synchronously at init if the Supabase auth
 *   token in localStorage identifies the user, and (b) on every auth event
 *   that carries a session (INITIAL_SESSION, SIGNED_IN, TOKEN_REFRESHED...).
 *   Adopting a DIFFERENT user than the cache was written under clears the
 *   in-memory cache and deletes the previous user's localStorage mirror —
 *   this covers the account-switch-without-clean-sign-out path where no
 *   SIGNED_OUT event ever fires. Legacy un-scoped `cw-cache:` entries
 *   (written before this fix) can't be attributed to a user and are deleted
 *   on the first hydration sweep.
 *
 * Caveat: this is a simple in-tab cache. Two browser tabs on the same
 * account will not see each other's edits until refresh. That trade-off
 * is documented in MIGRATION_HANDOFF.md as acceptable pre-launch.
 */

import { supabase } from './supabase';

/** @type {Map<string, Map<string, any>>} */
const caches = new Map();

// --- localStorage persistence ---------------------------------------
//
// The in-memory cache alone makes page-to-page navigation snappy, but a
// hard refresh wipes the JS module so the next render flashes defaults
// again before the Supabase load resolves. Mirroring the cache to
// localStorage closes that gap: the next page load rehydrates from
// localStorage before React renders, so the first paint already shows
// real data.
//
// Layout: one localStorage key per (user, namespace, cache-key) triple,
// prefixed with LS_PREFIX. Writes happen on every setCached; reads happen
// in adoptUser (see hydrateForUser below).

const LS_PREFIX = 'cw-cache:';
const LS_AVAILABLE = (() => {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return false;
    const probe = `${LS_PREFIX}__probe__`;
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
})();

// The user id the cache (memory + localStorage mirror) is scoped to.
// null = signed out / not yet known; persistence is disabled while null.
let currentOwnerId = null;

const lsKey = (namespace, key) =>
  `${LS_PREFIX}${currentOwnerId}::${namespace}::${key}`;

function persistToLocalStorage(namespace, key, value) {
  if (!LS_AVAILABLE || !currentOwnerId) return;
  try {
    window.localStorage.setItem(lsKey(namespace, key), JSON.stringify(value));
  } catch {
    // Quota exceeded or value not serialisable — silently skip; the
    // in-memory cache still works.
  }
}

function removeFromLocalStorage(namespace, key) {
  if (!LS_AVAILABLE || !currentOwnerId) return;
  try {
    window.localStorage.removeItem(lsKey(namespace, key));
  } catch {
    // ignore
  }
}

function clearAllLocalStorage() {
  if (!LS_AVAILABLE) return;
  try {
    const keys = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith(LS_PREFIX)) keys.push(k);
    }
    keys.forEach((k) => window.localStorage.removeItem(k));
  } catch {
    // ignore
  }
}

/**
 * Load `userId`'s mirrored entries into the in-memory cache and delete
 * every `cw-cache:` entry that belongs to anyone else (other users, or
 * legacy un-scoped entries whose owner cannot be determined).
 */
function hydrateForUser(userId) {
  if (!LS_AVAILABLE) return;
  try {
    const ownPrefix = `${LS_PREFIX}${userId}::`;
    const foreign = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (!k || !k.startsWith(LS_PREFIX)) continue;
      if (!k.startsWith(ownPrefix)) {
        // Another user's mirror, or a legacy un-scoped entry — never
        // readable by the current user; delete it.
        foreign.push(k);
        continue;
      }
      const stripped = k.slice(ownPrefix.length);
      const sep = stripped.indexOf('::');
      if (sep < 0) continue;
      const namespace = stripped.slice(0, sep);
      const cacheKey = stripped.slice(sep + 2);
      try {
        const raw = window.localStorage.getItem(k);
        if (raw == null) continue;
        const value = JSON.parse(raw);
        ensureNs(namespace).set(cacheKey, value);
      } catch {
        // skip malformed entry
      }
    }
    foreign.forEach((k) => window.localStorage.removeItem(k));
  } catch {
    // ignore
  }
}

/**
 * Point the cache at `userId`. If the cache currently belongs to a
 * different user, drop everything of theirs first (memory + mirror).
 * Safe to call repeatedly with the same id (no-op after the first call).
 */
function adoptUser(userId) {
  if (!userId || userId === currentOwnerId) return;
  if (currentOwnerId !== null) {
    // Account switch without a SIGNED_OUT in between — wipe the previous
    // user's data before adopting the new one.
    caches.clear();
    clearAllLocalStorage();
  } else {
    // First adoption this page-load. Memory should be empty (nothing is
    // hydrated before an owner is known), but clear defensively.
    caches.clear();
  }
  currentOwnerId = userId;
  hydrateForUser(userId);
}

function ensureNs(namespace) {
  let ns = caches.get(namespace);
  if (!ns) {
    ns = new Map();
    caches.set(namespace, ns);
  }
  return ns;
}

/**
 * Best-effort synchronous read of the signed-in user id from the Supabase
 * auth token that supabase-js itself keeps in localStorage
 * (`sb-<project-ref>-auth-token`). Lets the first render after a refresh
 * hydrate from the mirror without awaiting the async auth event. Returns
 * null on any surprise (missing token, format change) — the auth listener
 * below then adopts the user a tick later, costing only one cold load.
 */
function peekAuthUserIdSync() {
  if (LS_AVAILABLE === false) return null;
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (!k || !k.startsWith('sb-') || !k.endsWith('-auth-token')) continue;
      const raw = window.localStorage.getItem(k);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      const id = parsed?.user?.id ?? parsed?.currentSession?.user?.id;
      if (typeof id === 'string' && id) return id;
    }
  } catch {
    // ignore — fall back to the auth listener
  }
  return null;
}

// Adopt (and hydrate for) the already-signed-in user at module-init time so
// the very first render after a refresh already sees cached data.
{
  const initialUserId = peekAuthUserIdSync();
  if (initialUserId) adoptUser(initialUserId);
}

/**
 * Returns the cached value if present. Returns `undefined` for cache miss.
 * Use `hasCached` to distinguish a real `undefined` value from a miss.
 */
export function getCached(namespace, key) {
  const ns = caches.get(namespace);
  if (!ns) return undefined;
  return ns.get(key);
}

export function hasCached(namespace, key) {
  const ns = caches.get(namespace);
  if (!ns) return false;
  return ns.has(key);
}

export function setCached(namespace, key, value) {
  ensureNs(namespace).set(key, value);
  persistToLocalStorage(namespace, key, value);
}

export function invalidate(namespace, key) {
  const ns = caches.get(namespace);
  if (ns) ns.delete(key);
  removeFromLocalStorage(namespace, key);
}

export function invalidateNamespace(namespace) {
  caches.delete(namespace);
  if (!LS_AVAILABLE || !currentOwnerId) return;
  try {
    const prefix = `${LS_PREFIX}${currentOwnerId}::${namespace}::`;
    const keys = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith(prefix)) keys.push(k);
    }
    keys.forEach((k) => window.localStorage.removeItem(k));
  } catch {
    // ignore
  }
}

export function clearAll() {
  caches.clear();
  clearAllLocalStorage();
}

/**
 * Invalidate every cached entry whose key ends with `:${yearNumber}`.
 * Helpers use cache keys ending with the year number so this sweep works
 * (the helper convention is `${table}:${yearNumber}`; the user segment
 * lives in the localStorage prefix, not in the helper key).
 */
export function clearForYear(yearNumber) {
  if (yearNumber === null || yearNumber === undefined) return;
  const suffix = `:${yearNumber}`;
  for (const [namespace, map] of caches.entries()) {
    for (const key of [...map.keys()]) {
      if (key.endsWith(suffix)) {
        map.delete(key);
        removeFromLocalStorage(namespace, key);
      }
    }
  }
}

// --- auth listener ----------------------------------------------------

let authListenerAttached = false;

function attachAuthListener() {
  if (authListenerAttached) return;
  if (!supabase?.auth?.onAuthStateChange) return;
  try {
    supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || event === 'USER_DELETED') {
        clearAll();
        currentOwnerId = null;
      } else if (session?.user?.id) {
        // INITIAL_SESSION / SIGNED_IN / TOKEN_REFRESHED / USER_UPDATED —
        // adopt the session's user. No-op when the id matches the current
        // owner; clears the previous user's cache when it doesn't (account
        // switch where no SIGNED_OUT fired).
        adoptUser(session.user.id);
      }
    });
    authListenerAttached = true;
  } catch {
    // best effort; module re-import would retry
  }
}

attachAuthListener();
