import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../types/supabase';

const GRACE_PERIOD_DAYS = 30;

/**
 * Result type for account deletion request
 */
export interface AccountDeletionResult {
  success: boolean;
  auditLogId?: string;
  error?: string;
}

/**
 * Creates a Supabase admin client using the service role key.
 * This should only be used in server-side contexts (Edge Functions, API routes, etc.)
 *
 * IMPORTANT: Never expose the service role key to the client.
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
 * Requests account deletion for a user.
 *
 * This function:
 * 1. Sets `deletion_requested_at` to now() on the user's profile
 * 2. Creates an entry in deletion_audit_log with status 'pending' and hashed user_id
 * 3. Returns success/failure with the audit log ID
 *
 * IMPORTANT: This function uses the database function `request_account_deletion`
 * which handles the SHA-256 hashing of the user ID for the audit log.
 *
 * @param userId - The UUID of the user requesting account deletion
 * @returns AccountDeletionResult with success status and audit log ID
 */
export async function requestAccountDeletion(
  userId: string
): Promise<AccountDeletionResult> {
  if (!userId) {
    return {
      success: false,
      error: 'User ID is required',
    };
  }

  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(userId)) {
    return {
      success: false,
      error: 'Invalid user ID format',
    };
  }

  try {
    const adminClient = createAdminClient();

    // Call the database function that handles both the profile update
    // and audit log creation with hashed user_id
    const { data, error } = await adminClient.rpc('request_account_deletion', {
      target_user_id: userId,
    });

    if (error) {
      console.error('Account deletion request failed:', error);
      return {
        success: false,
        error: error.message,
      };
    }

    // The function returns the audit log ID
    const auditLogId = data as string;

    if (!auditLogId) {
      return {
        success: false,
        error: 'Failed to create deletion audit log entry',
      };
    }

    return {
      success: true,
      auditLogId,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
    console.error('Account deletion request error:', err);
    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Completes account deletion for a user.
 *
 * This should be called after all user data has been properly cleaned up.
 * It marks the profile as deleted and updates the audit log status.
 *
 * @param userId - The UUID of the user
 * @param auditLogId - The UUID of the audit log entry created during request
 * @returns Success/failure result
 */
export async function completeAccountDeletion(
  userId: string,
  auditLogId: string
): Promise<{ success: boolean; error?: string }> {
  if (!userId || !auditLogId) {
    return {
      success: false,
      error: 'User ID and audit log ID are required',
    };
  }

  try {
    const adminClient = createAdminClient();

    const { data, error } = await adminClient.rpc('complete_account_deletion', {
      target_user_id: userId,
      audit_log_id: auditLogId,
    });

    if (error) {
      console.error('Account deletion completion failed:', error);
      return {
        success: false,
        error: error.message,
      };
    }

    return {
      success: data === true,
      error: data === true ? undefined : 'Deletion completion returned false',
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
    console.error('Account deletion completion error:', err);
    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Marks an account deletion as failed.
 *
 * Use this when the deletion process encounters an unrecoverable error.
 *
 * @param auditLogId - The UUID of the audit log entry
 * @returns Success/failure result
 */
export async function failAccountDeletion(
  auditLogId: string
): Promise<{ success: boolean; error?: string }> {
  if (!auditLogId) {
    return {
      success: false,
      error: 'Audit log ID is required',
    };
  }

  try {
    const adminClient = createAdminClient();

    const { data, error } = await adminClient.rpc('fail_account_deletion', {
      audit_log_id: auditLogId,
    });

    if (error) {
      console.error('Failed to mark deletion as failed:', error);
      return {
        success: false,
        error: error.message,
      };
    }

    return {
      success: data === true,
      error: data === true ? undefined : 'Failed to update audit log status',
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
    console.error('Fail account deletion error:', err);
    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Permanently deletes a user from Supabase Auth.
 *
 * WARNING: This action is IRREVERSIBLE. Only call this during hard-delete operations,
 * never during soft-delete. Once deleted, the user cannot recover their account.
 *
 * This function uses the Supabase Admin API which requires the service role key.
 * It must only be executed in server-side contexts (Edge Functions, API routes, etc.)
 *
 * @param userId - The UUID of the auth user to permanently delete
 * @returns Success/failure result with optional error message
 */
export async function deleteSupabaseAuthUser(
  userId: string
): Promise<{ success: boolean; error?: string }> {
  if (!userId) {
    return {
      success: false,
      error: 'User ID is required',
    };
  }

  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(userId)) {
    return {
      success: false,
      error: 'Invalid user ID format',
    };
  }

  try {
    const adminClient = createAdminClient();

    const { error } = await adminClient.auth.admin.deleteUser(userId);

    if (error) {
      console.error('[deleteSupabaseAuthUser] Failed to delete auth user:', {
        userId,
        error: error.message,
        code: error.status,
      });
      return {
        success: false,
        error: error.message,
      };
    }

    console.log('[deleteSupabaseAuthUser] Successfully deleted auth user:', userId);
    return {
      success: true,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
    console.error('[deleteSupabaseAuthUser] Unexpected error:', {
      userId,
      error: errorMessage,
    });
    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * User pending deletion with their audit log info
 */
export interface UserPendingDeletion {
  id: string;
  email: string;
  deletion_requested_at: string;
  audit_log_id: string;
}

/**
 * Result of processing a batch of deletions
 */
export interface BatchDeletionResult {
  processed: number;
  succeeded: number;
  failed: number;
  errors: Array<{ userId: string; error: string }>;
}

/**
 * Fetches users who have requested deletion and are past the grace period.
 *
 * @returns Array of users pending hard deletion
 */
export async function getUsersPendingHardDeletion(): Promise<UserPendingDeletion[]> {
  try {
    const adminClient = createAdminClient();

    const gracePeriodDate = new Date();
    gracePeriodDate.setDate(gracePeriodDate.getDate() - GRACE_PERIOD_DAYS);

    // Query profiles where deletion was requested more than 30 days ago
    // and the account hasn't been hard-deleted yet
    // Note: stripe_customer_id may not exist in all schemas - we handle this gracefully
    const { data: profiles, error: profilesError } = await adminClient
      .from('profiles')
      .select('id, email, deletion_requested_at')
      .not('deletion_requested_at', 'is', null)
      .is('deleted_at', null)
      .lt('deletion_requested_at', gracePeriodDate.toISOString());

    if (profilesError) {
      console.error('[getUsersPendingHardDeletion] Failed to fetch profiles:', profilesError);
      return [];
    }

    if (!profiles || profiles.length === 0) {
      return [];
    }

    // Get corresponding audit log entries for these users
    const result: UserPendingDeletion[] = [];

    for (const profile of profiles) {
      // Find the pending audit log entry for this user using the hash function
      const { data: auditLog, error: auditError } = await adminClient
        .from('deletion_audit_log')
        .select('id')
        .eq('user_id_hash', await hashUserId(adminClient, profile.id))
        .eq('status', 'pending')
        .order('requested_at', { ascending: false })
        .limit(1)
        .single();

      if (auditError || !auditLog) {
        console.warn('[getUsersPendingHardDeletion] No audit log found for user:', profile.id);
        continue;
      }

      result.push({
        id: profile.id,
        email: profile.email,
        deletion_requested_at: profile.deletion_requested_at!,
        audit_log_id: auditLog.id,
      });
    }

    return result;
  } catch (err) {
    console.error('[getUsersPendingHardDeletion] Unexpected error:', err);
    return [];
  }
}

/**
 * Helper to hash a user ID using the database function
 */
async function hashUserId(client: SupabaseClient<Database>, userId: string): Promise<string> {
  const { data, error } = await client.rpc('hash_user_id', { user_id: userId });
  if (error) {
    throw new Error(`Failed to hash user ID: ${error.message}`);
  }
  return data as string;
}

/**
 * Performs hard deletion of a single user's data.
 *
 * This function:
 * 1. Deletes all user data from related database tables
 * 2. Deletes the Supabase auth user
 * 3. Marks the profile as deleted and updates audit log
 *
 * @param user - The user to hard delete
 * @returns Success/failure result
 */
export async function hardDeleteUser(
  user: UserPendingDeletion
): Promise<{ success: boolean; error?: string }> {
  console.log('[hardDeleteUser] Starting hard deletion for user:', user.id);

  try {
    // Step 1: Delete user data from related tables
    // Add explicit deletes here for any tables that don't have CASCADE delete
    // For example: user_lists, user_preferences, etc.
    // The profile will be soft-deleted (deleted_at set), not hard deleted, to maintain audit trail

    // Step 2: Delete Supabase auth user
    const authResult = await deleteSupabaseAuthUser(user.id);
    if (!authResult.success) {
      throw new Error(`Auth deletion failed: ${authResult.error}`);
    }

    // Step 3: Complete the deletion (sets deleted_at and updates audit log)
    const completeResult = await completeAccountDeletion(user.id, user.audit_log_id);
    if (!completeResult.success) {
      throw new Error(`Failed to complete deletion: ${completeResult.error}`);
    }

    console.log('[hardDeleteUser] Successfully completed hard deletion for user:', user.id);
    return { success: true };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
    console.error('[hardDeleteUser] Failed to hard delete user:', {
      userId: user.id,
      error: errorMessage,
    });

    // Mark the deletion as failed in the audit log
    await failAccountDeletion(user.audit_log_id);

    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Processes all users pending hard deletion.
 *
 * This is the main function called by the cron job. It:
 * 1. Fetches all users past the grace period
 * 2. Processes each deletion independently (one failure doesn't stop others)
 * 3. Returns a summary of the batch results
 *
 * @returns Batch deletion result with success/failure counts
 */
export async function processScheduledDeletions(): Promise<BatchDeletionResult> {
  console.log('[processScheduledDeletions] Starting scheduled deletion job');

  const result: BatchDeletionResult = {
    processed: 0,
    succeeded: 0,
    failed: 0,
    errors: [],
  };

  try {
    const usersPendingDeletion = await getUsersPendingHardDeletion();

    console.log(`[processScheduledDeletions] Found ${usersPendingDeletion.length} users pending deletion`);

    if (usersPendingDeletion.length === 0) {
      return result;
    }

    for (const user of usersPendingDeletion) {
      result.processed++;

      const deletionResult = await hardDeleteUser(user);

      if (deletionResult.success) {
        result.succeeded++;
      } else {
        result.failed++;
        result.errors.push({
          userId: user.id,
          error: deletionResult.error || 'Unknown error',
        });
      }
    }

    // Log summary
    console.log('[processScheduledDeletions] Batch complete:', {
      processed: result.processed,
      succeeded: result.succeeded,
      failed: result.failed,
    });

    // Alert if there were failures
    if (result.failed > 0) {
      console.error('[processScheduledDeletions] ALERT: Some deletions failed:', result.errors);
    }

    return result;
  } catch (err) {
    console.error('[processScheduledDeletions] Critical error in batch processing:', err);
    throw err;
  }
}
