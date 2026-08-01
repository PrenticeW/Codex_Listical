import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

interface DeleteAccountRequest {
  // Password users verify with their password; OAuth-only users (Google,
  // Apple) have no password and verify by typing the confirmation phrase.
  password?: string;
  confirmationPhrase?: string;
}

const CONFIRMATION_PHRASE = 'DELETE';

interface DeleteAccountResponse {
  success: boolean;
  message?: string;
  error?: string;
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Only allow POST
  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ success: false, error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    // Get authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Extract the JWT token
    const token = authHeader.replace('Bearer ', '');

    // Parse request body
    let body: DeleteAccountRequest;
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid request body' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { password, confirmationPhrase } = body;

    // Create Supabase admin client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Get the authenticated user using the JWT token
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userId = user.id;
    const userEmail = user.email;

    if (!userEmail) {
      return new Response(
        JSON.stringify({ success: false, error: 'User email not found' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check rate limit (max 3 attempts per hour)
    const { data: isAllowed, error: rateLimitCheckError } = await supabaseAdmin.rpc(
      'check_deletion_rate_limit',
      { target_user_id: userId }
    );

    if (rateLimitCheckError) {
      console.error('Rate limit check error:', rateLimitCheckError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to check rate limit' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!isAllowed) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Too many deletion attempts. Please try again later.',
        }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Record this attempt for rate limiting
    await supabaseAdmin.rpc('record_deletion_attempt', { target_user_id: userId });

    // Verify the caller's intent. The verification method is decided from
    // the user's OWN identities (from the verified JWT), never from which
    // fields the request happened to include — so a password user can't
    // skip password verification by sending a confirmation phrase.
    const hasPasswordIdentity = (user.identities ?? []).some(
      (identity) => identity.provider === 'email'
    );

    if (hasPasswordIdentity) {
      if (!password || typeof password !== 'string') {
        return new Response(
          JSON.stringify({ success: false, error: 'Password is required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Verify password by attempting to sign in
      const { error: signInError } = await supabaseAdmin.auth.signInWithPassword({
        email: userEmail,
        password: password,
      });

      if (signInError) {
        return new Response(
          JSON.stringify({ success: false, error: 'Invalid password' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    } else {
      // OAuth-only user (Google / Apple) — no password exists, so verify
      // with the typed confirmation phrase instead.
      if (confirmationPhrase !== CONFIRMATION_PHRASE) {
        return new Response(
          JSON.stringify({ success: false, error: 'Invalid confirmation' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Identity verified - request account deletion
    const { data: auditLogId, error: deletionError } = await supabaseAdmin.rpc(
      'request_account_deletion',
      { target_user_id: userId }
    );

    if (deletionError) {
      console.error('Account deletion request failed:', deletionError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to request account deletion' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!auditLogId) {
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to create deletion request' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const response: DeleteAccountResponse = {
      success: true,
      message: 'Account deletion requested successfully. You have been signed out.',
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
