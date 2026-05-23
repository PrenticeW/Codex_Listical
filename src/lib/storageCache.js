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
 *   - The auth listener below calls `clearAll` on sign-out so the next user
 *     to sign in cannot see the previous user's cached data while their own
 *     load completes.
 *   - `clearForYear(yearNumber)` is exposed for explicit invalidation when
 *     a year is created (createDraftYear), undone (undoDraftYear), or
 *     archived. Those flows touch many tables; clearing by year is simpler
 *     than tracking which exact keys to invalidate.
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
// Layout: one localStorage key per (namespace, cache-key) pair, prefixed
// with LS_PREFIX. Writes happen on every setCached; reads happen lazily
// on module init (see hydrateFromLocalStorage below).

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

const lsKey = (namespace, key) => `${LS_PREFIX}${namespace}::${key}`;

function persistToLocalStorage(namespace, key, value) {
  if (!LS_AVAILABLE) return;
  try {
    window.localStorage.setItem(lsKey(namespace, key), JSON.stringify(value));
  } catch {
    // Quota exceeded or value not serialisable — silently skip; the
    // in-memory cache still works.
  }
}

function removeFromLocalStorage(namespace, key) {
  if (!LS_AVAILABLE) return;
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

function hydrateFromLocalStorage() {
  if (!LS_AVAILABLE) return;
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (!k || !k.startsWith(LS_PREFIX)) continue;
      const stripped = k.slice(LS_PREFIX.length);
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
  } catch {
    // ignore
  }
}

function ensureNs(namespace) {
  let ns = caches.get(namespace);
  if (!ns) {
    ns = new Map();
    caches.set(namespace, ns);
  }
  return ns;
}

// Rehydrate the in-memory cache from localStorage at module-init time so
// the very first render after a refresh already sees cached data.
hydrateFromLocalStorage();

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
  if (!LS_AVAILABLE) return;
  try {
    const prefix = `${LS_PREFIX}${namespace}::`;
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
 * Helpers should use cache keys ending with the year number so this sweep
 * works (the internal helper convention is `${table}:${userId}:${yearNumber}`).
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
    supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT' || event === 'USER_DELETED') {
        clearAll();
      }
    });
    authListenerAttached = true;
  } catch {
    // best effort; module re-import would retry
  }
}

attachAuthListener();
