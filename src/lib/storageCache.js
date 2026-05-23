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

function ensureNs(namespace) {
  let ns = caches.get(namespace);
  if (!ns) {
    ns = new Map();
    caches.set(namespace, ns);
  }
  return ns;
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
}

export function invalidate(namespace, key) {
  const ns = caches.get(namespace);
  if (ns) ns.delete(key);
}

export function invalidateNamespace(namespace) {
  caches.delete(namespace);
}

export function clearAll() {
  caches.clear();
}

/**
 * Invalidate every cached entry whose key ends with `:${yearNumber}`.
 * Helpers should use cache keys ending with the year number so this sweep
 * works (the internal helper convention is `${table}:${userId}:${yearNumber}`).
 */
export function clearForYear(yearNumber) {
  if (yearNumber === null || yearNumber === undefined) return;
  const suffix = `:${yearNumber}`;
  for (const map of caches.values()) {
    for (const key of [...map.keys()]) {
      if (key.endsWith(suffix)) map.delete(key);
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
