import { supabase } from './supabase';
import { getCurrentUserId } from './storageService';

/**
 * Resolve the signed-in user's id WITHOUT a network round-trip when possible.
 *
 * Why: supabase.auth.getUser() hits /auth/v1/user on every call and queues
 * behind the navigator.locks auth lock shared by EVERY tab of the site. A
 * suspended tab holding that lock (laptop sleep mid token-refresh) made every
 * storage call on the System page hang indefinitely (2026-10-23 "website
 * took forever to load / stale page never updated" incident).
 *
 * Order:
 *   1. storageService.getCurrentUserId() — synchronous, set by AuthContext
 *      on sign-in and cleared on sign-out. No lock, no network.
 *   2. supabase.auth.getSession() — persisted session, no network (still
 *      lock-bound, so only a fallback).
 *   3. supabase.auth.getUser() — the old behaviour, network round-trip.
 *
 * Safety: the id is only ever used to FILTER queries (.eq('user_id', …));
 * actual authorisation is the JWT on the request plus RLS, so a stale id
 * can only yield empty results or a 401, never another user's data.
 *
 * Throws 'No authenticated user' like the per-module helpers it replaces.
 */
export async function resolveUserId() {
  const cached = getCurrentUserId();
  if (cached) return cached;
  try {
    const { data } = await supabase.auth.getSession();
    const id = data?.session?.user?.id;
    if (id) return id;
  } catch {
    // fall through to getUser
  }
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error('No authenticated user');
  return user.id;
}

/**
 * Read the persisted Supabase session straight out of localStorage — no
 * auth lock, no network, synchronous. Used by AuthContext when
 * auth.getSession() fails to resolve in time (hung cross-tab lock), so a
 * signed-in user is never shown as signed out just because another tab is
 * wedged. The JWT inside may be expired; that's fine — requests would then
 * 401 and onAuthStateChange reconciles when the real client recovers.
 * Returns the session object ({ user, access_token, … }) or null.
 */
export function peekPersistedSession() {
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith('sb-') || !key.endsWith('-auth-token')) continue;
      const parsed = JSON.parse(localStorage.getItem(key));
      const session = parsed?.currentSession ?? parsed;
      if (session?.user?.id) return session;
    }
  } catch {
    // storage unavailable or malformed — treat as no session
  }
  return null;
}
