import { createClient } from '@supabase/supabase-js';
import type { Database } from '../types/supabase';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

// Build stamp sent with every PostgREST request. The DB-side stale-write
// gate (migration 20260828000001, NOT yet applied — see its header comment)
// rejects destructive planner writes from clients that don't send it, which
// is the only way to stop a service-worker-cached PRE-FIX bundle from
// running its old delete-all-then-reinsert save in the seconds before the
// auto-update reloads it (2026-08-28 stale-browser overwrite). Bump the
// value when save-path semantics change in a way old clients must not mix
// with.
export const CLIENT_BUILD = '20260828';

// Create a typed Supabase client
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  global: { headers: { 'x-tacular-client': CLIENT_BUILD } },
});
