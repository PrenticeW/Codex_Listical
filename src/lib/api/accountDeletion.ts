import { supabase } from '../supabase';

export interface DeleteAccountResponse {
  success: boolean;
  message?: string;
  error?: string;
}

/**
 * Request account deletion via the Edge Function.
 * Requires the user's current password for verification.
 *
 * @param password - The user's current password for verification
 * @returns DeleteAccountResponse with success status and message/error
 */
export async function requestAccountDeletion(
  password: string
): Promise<DeleteAccountResponse> {
  if (!password) {
    return {
      success: false,
      error: 'Password is required',
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
      body: { password },
    });

    if (response.error) {
      const status = response.error.context?.status;
      if (status === 401) {
        return { success: false, error: 'Unauthorized' };
      }
      if (status === 403) {
        return { success: false, error: 'Invalid password' };
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
