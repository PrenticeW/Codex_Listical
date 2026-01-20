import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../types/supabase';

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
