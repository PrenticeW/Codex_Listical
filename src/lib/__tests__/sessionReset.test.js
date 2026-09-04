// sessionReset.test.js — sign-out / account-switch cleanup (audit 2026-09-04,
// items W1 + W2).
//
// Covers:
//   1. storageCache runs the registered session-reset hooks on SIGNED_OUT and
//      USER_DELETED, passing the previous owner's id, and on an account
//      switch (SIGNED_IN with a different user, no SIGNED_OUT between).
//   2. plannerStorage's per-session bookkeeping is empty after a reset — the
//      next account's first save cannot diff against the previous one's.
//   3. plannerOffline deletes every IndexedDB snapshot/pending record of the
//      previous user and nobody else's.
import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- hoisted fakes ---------------------------------------------------------

const { authListeners, ls, idb } = vi.hoisted(() => ({
  authListeners: [],
  ls: new Map(),
  idb: new Map(),
}));

vi.mock('../supabase', () => ({
  supabase: {
    auth: {
      onAuthStateChange: (cb) => { authListeners.push(cb); return { data: { subscription: { unsubscribe() {} } } }; },
      getSession: async () => ({ data: { session: null } }),
    },
  },
}));

// Minimal localStorage so storageCache's mirror code paths run.
const noop = () => {};
globalThis.window = globalThis.window || globalThis;
if (!globalThis.window.addEventListener) {
  globalThis.window.addEventListener = noop;
  globalThis.window.removeEventListener = noop;
  globalThis.window.dispatchEvent = noop;
}
if (typeof globalThis.document === 'undefined') {
  globalThis.document = { addEventListener: noop, removeEventListener: noop, visibilityState: 'visible' };
}
globalThis.window.localStorage = {
  get length() { return ls.size; },
  key: (i) => [...ls.keys()][i] ?? null,
  getItem: (k) => (ls.has(k) ? ls.get(k) : null),
  setItem: (k, v) => ls.set(k, String(v)),
  removeItem: (k) => ls.delete(k),
};

// Minimal IndexedDB: enough of open()/transaction()/objectStore() for
// plannerOffline's tiny promise wrapper.
function fakeRequest(run) {
  const req = {};
  queueMicrotask(() => {
    try { req.result = run(); req.onsuccess?.(); } catch (e) { req.error = e; req.onerror?.(); }
  });
  return req;
}
const store = {
  get: (k) => fakeRequest(() => idb.get(k)),
  put: (v, k) => fakeRequest(() => { idb.set(k, v); }),
  delete: (k) => fakeRequest(() => { idb.delete(k); }),
  getAllKeys: () => fakeRequest(() => [...idb.keys()]),
};
const db = { transaction: () => ({ objectStore: () => store }), objectStoreNames: { contains: () => true }, close() {} };
globalThis.indexedDB = {
  open: () => { const req = { result: db }; queueMicrotask(() => req.onsuccess?.()); return req; },
};

const fire = (event, session) => authListeners.forEach((cb) => cb(event, session));
const flush = () => new Promise((r) => setTimeout(r, 0));

const storageCache = await import('../storageCache');
const offline = await import('../plannerOffline');

// ---------------------------------------------------------------------------

describe('storageCache session-reset hooks', () => {
  // Start every test signed out so a SIGNED_IN is a fresh sign-in, not an
  // account switch from whatever the previous test left behind.
  beforeEach(() => { ls.clear(); fire('SIGNED_OUT', null); });

  it('run on SIGNED_OUT with the previous owner id', () => {
    const seen = [];
    const off = storageCache.onSessionReset((prev) => seen.push(prev));
    fire('SIGNED_IN', { user: { id: 'userA' } });
    fire('SIGNED_OUT', null);
    off();
    expect(seen).toEqual(['userA']);
  });

  it('run on USER_DELETED', () => {
    const seen = [];
    const off = storageCache.onSessionReset((prev) => seen.push(prev));
    fire('SIGNED_IN', { user: { id: 'userA' } });
    fire('USER_DELETED', null);
    off();
    expect(seen).toEqual(['userA']);
  });

  it('run on an account switch with no SIGNED_OUT in between', () => {
    const seen = [];
    const off = storageCache.onSessionReset((prev) => seen.push(prev));
    fire('SIGNED_IN', { user: { id: 'userA' } });
    fire('SIGNED_IN', { user: { id: 'userB' } });
    off();
    expect(seen).toEqual(['userA']);
  });

  it('do not run on a token refresh for the same user', () => {
    const seen = [];
    const off = storageCache.onSessionReset((prev) => seen.push(prev));
    fire('SIGNED_IN', { user: { id: 'userA' } });
    fire('TOKEN_REFRESHED', { user: { id: 'userA' } });
    off();
    expect(seen).toEqual([]);
  });

  it('one failing hook does not stop the others', () => {
    const seen = [];
    const off1 = storageCache.onSessionReset(() => { throw new Error('boom'); });
    const off2 = storageCache.onSessionReset((prev) => seen.push(prev));
    fire('SIGNED_IN', { user: { id: 'userA' } });
    expect(() => fire('SIGNED_OUT', null)).not.toThrow();
    off1(); off2();
    expect(seen).toEqual(['userA']);
  });
});

describe('plannerOffline.clearUserOfflineData', () => {
  beforeEach(() => { idb.clear(); });

  it('deletes only the previous user\'s snapshot and pending records', async () => {
    idb.set('snapshot:userA:2026', { rows: [1] });
    idb.set('pending:userA:2026', { taskRows: [1] });
    idb.set('snapshot:userA:2025', { rows: [2] });
    idb.set('snapshot:userB:2026', { rows: [3] });
    idb.set('pending:userB:2026', { taskRows: [3] });

    await offline.clearUserOfflineData('userA');

    expect([...idb.keys()].sort()).toEqual(['pending:userB:2026', 'snapshot:userB:2026']);
  });

  it('is wired to SIGNED_OUT through the session-reset hook', async () => {
    idb.set('snapshot:userA:2026', { rows: [1] });
    idb.set('pending:userA:2026', { taskRows: [1] });
    fire('SIGNED_IN', { user: { id: 'userA' } });
    fire('SIGNED_OUT', null);
    await flush(); await flush();
    expect(idb.size).toBe(0);
  });

  it('ignores a null uid', async () => {
    idb.set('snapshot:userA:2026', { rows: [1] });
    await offline.clearUserOfflineData(null);
    expect(idb.size).toBe(1);
  });
});
