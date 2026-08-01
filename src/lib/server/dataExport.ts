import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../types/supabase';

/**
 * GDPR data export (UK GDPR Art. 15 access / Art. 20 portability).
 *
 * Exports every row of a user's data across ALL years — the export is
 * deliberately NOT year-scoped, unlike the client storage modules.
 *
 * TABLE LIST SOURCE OF TRUTH
 * --------------------------
 * The list below must stay in lockstep with the deletion flow's explicit
 * purge list in supabase/migrations/20260801000001_complete_deletion_purge.sql
 * (purge_user_data). `scripts/verify-export-tables.mjs` parses both and fails
 * if they drift — run it whenever either changes.
 *
 * Intentional differences from the purge list (documented in the script):
 *   - deletion_rate_limits / export_rate_limits: internal rate-limit
 *     bookkeeping, purged on deletion but never exported.
 *   - deletion_audit_log: hash-only audit trail, in neither list.
 *   - profiles: exported (minus internal flags) via a dedicated query since
 *     it keys on `id`, not `user_id`.
 */
export const EXPORT_TABLES = [
  'years',
  'projects',
  'planner_rows',
  'planner_settings',
  'archived_weeks',
  'tactics_chips',
  'tactics_custom_projects',
  'tactics_metrics',
  'tactics_year_settings',
  'task_events',
  'chip_task_notes',
  'site_snapshots',
] as const;

/**
 * profiles columns that are internal service records, excluded from the
 * export (they are deletion-flow flags, not the user's own content).
 */
export const INTERNAL_PROFILE_COLUMNS = ['deletion_requested_at', 'deleted_at'] as const;

export interface DataExportPayload {
  exportedAt: string;
  user: {
    email: string;
    dateOfBirth: string | null;
  };
  data: Record<string, unknown[]>;
}

export interface DataExportResult {
  success: boolean;
  payload?: DataExportPayload;
  error?: string;
}

/**
 * Creates a Supabase admin client using the service role key.
 * Server-side only — never expose the service role key to the client.
 */
function createAdminClient(): SupabaseClient<Database> {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new Error('Missing SUPABASE_URL environment variable');
  }
  if (!supabaseServiceKey) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY environment variable');
  }

  return createClient<Database>(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

/**
 * Resolves a Supabase access token (JWT) to a user id. The caller's
 * identity comes ONLY from the verified token — never from request input.
 */
export async function getUserIdFromToken(
  accessToken: string
): Promise<{ userId?: string; error?: string }> {
  if (!accessToken) {
    return { error: 'Missing access token' };
  }
  try {
    const adminClient = createAdminClient();
    const { data, error } = await adminClient.auth.getUser(accessToken);
    if (error || !data?.user) {
      return { error: 'Invalid or expired session' };
    }
    return { userId: data.user.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[getUserIdFromToken] Token verification failed:', message);
    return { error: message };
  }
}

/**
 * Checks the export rate limit (3 per hour per user) and, if allowed,
 * records the attempt. Returns whether the export may proceed.
 */
export async function checkAndRecordExportAttempt(
  userId: string
): Promise<{ allowed: boolean; error?: string }> {
  try {
    const adminClient = createAdminClient();

    const { data: allowed, error: checkError } = await adminClient.rpc(
      'check_export_rate_limit',
      { target_user_id: userId }
    );
    if (checkError) {
      console.error('[checkAndRecordExportAttempt] Rate limit check failed:', checkError);
      return { allowed: false, error: checkError.message };
    }
    if (allowed !== true) {
      return { allowed: false };
    }

    const { error: recordError } = await adminClient.rpc('record_export_attempt', {
      target_user_id: userId,
    });
    if (recordError) {
      // Recording failed — fail closed rather than allow unmetered exports.
      console.error('[checkAndRecordExportAttempt] Recording attempt failed:', recordError);
      return { allowed: false, error: recordError.message };
    }

    return { allowed: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[checkAndRecordExportAttempt] Unexpected error:', message);
    return { allowed: false, error: message };
  }
}

/**
 * Builds the full machine-readable export for one user.
 *
 * Queries every table in EXPORT_TABLES by user_id (all years, no year
 * scoping) plus the profiles row by id with internal flags stripped.
 */
export async function exportUserData(userId: string): Promise<DataExportResult> {
  if (!userId) {
    return { success: false, error: 'User ID is required' };
  }

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(userId)) {
    return { success: false, error: 'Invalid user ID format' };
  }

  try {
    const adminClient = createAdminClient();
    const data: Record<string, unknown[]> = {};

    // profiles — keyed on id, internal deletion flags excluded
    const { data: profile, error: profileError } = await adminClient
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (profileError || !profile) {
      return { success: false, error: `Failed to load profile: ${profileError?.message}` };
    }

    const profileRow: Record<string, unknown> = { ...(profile as Record<string, unknown>) };
    for (const col of INTERNAL_PROFILE_COLUMNS) {
      delete profileRow[col];
    }
    data.profiles = [profileRow];

    // Every user_id-keyed table, across all years, paged so large accounts
    // are never silently truncated by PostgREST's default row cap.
    const PAGE_SIZE = 1000;
    for (const table of EXPORT_TABLES) {
      const rows: unknown[] = [];
      let from = 0;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { data: page, error } = await adminClient
          .from(table as string)
          .select('*')
          .eq('user_id', userId)
          .range(from, from + PAGE_SIZE - 1);

        if (error) {
          return { success: false, error: `Failed to export ${table}: ${error.message}` };
        }
        rows.push(...(page ?? []));
        if (!page || page.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
      }
      data[table] = rows;
    }

    return {
      success: true,
      payload: {
        exportedAt: new Date().toISOString(),
        user: {
          email: (profile as { email: string }).email,
          dateOfBirth: (profile as { date_of_birth: string | null }).date_of_birth ?? null,
        },
        data,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error occurred';
    console.error('[exportUserData] Unexpected error:', message);
    return { success: false, error: message };
  }
}
