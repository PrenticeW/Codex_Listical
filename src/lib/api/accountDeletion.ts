import { supabase } from '../supabase';

export interface DeleteAccountResponse {
  success: boolean;
  message?: string;
  error?: string;
}

export interface DeleteAccountCredentials {
  /** For password accounts: the user's current password. */
  password?: string;
  /** For OAuth-only accounts (Google, Apple): the typed confirmation phrase. */
  confirmationPhrase?: string;
}

/**
 * Request account deletion via the Edge Function.
 *
 * Password accounts verify with their password; OAuth-only accounts
 * (Google, Apple) verify by typing the confirmation phrase instead. The
 * Edge Function decides which check applies from the user's own identities
 * — the fields sent here are just the credentials for that check.
 */
export async function requestAccountDeletion(
  credentials: DeleteAccountCredentials
): Promise<DeleteAccountResponse> {
  const { password, confirmationPhrase } = credentials ?? {};

  if (!password && !confirmationPhrase) {
    return {
      success: false,
      error: 'Verification is required',
    };
  }

  try {
    // Get current session for authorization
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();

    if (sessionError || !session) {
      return {
        success: false,
        error: 'Not authenticated',
      };
    }

    // Call the Edge Function
    const response = await supabase.functions.invoke('account-delete', {
      body: password ? { password } : { confirmationPhrase },
    });

    if (response.error) {
      const status = response.error.context?.status;
      if (status === 401) {
        return { success: false, error: 'Unauthorized' };
      }
      if (status === 403) {
        return {
          success: false,
          error: password ? 'Invalid password' : 'Invalid confirmation',
        };
      }
      if (status === 429) {
        return { success: false, error: 'Too many attempts. Please try again later.' };
      }
      return {
        success: false,
        error: response.error.message || 'Failed to request account deletion',
      };
    }

    const data = response.data as DeleteAccountResponse;

    if (data.success) {
      // Sign out locally after successful deletion request
      await supabase.auth.signOut();
    }

    return data;
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
    console.error('Account deletion request error:', err);
    return {
      success: false,
      error: errorMessage,
    };
  }
}
