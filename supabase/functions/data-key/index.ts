// data-key Edge Function — encryption plan Phase 1 (docs/encryption-plan.md).
//
// Authenticates the caller's JWT, then returns that user's data key (DEK),
// generating and storing a wrapped one on first call. The DEK is stored in
// public.user_keys wrapped (AES-256-GCM) with the master key, which lives
// ONLY in the TACULAR_MASTER_KEY function secret (base64, 32 bytes).
//
// Response: { dek: <base64 32 bytes>, keyVersion: number }
// Clients cache the DEK in memory + sessionStorage and treat any failure
// here as "no encryption today" — the app must keep working in plaintext.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const te = new TextEncoder();

function b64encode(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function b64decode(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function importMasterKey(): Promise<CryptoKey | null> {
  const raw = Deno.env.get('TACULAR_MASTER_KEY');
  if (!raw) return null;
  const bytes = b64decode(raw.trim());
  if (bytes.length !== 32) return null;
  return await crypto.subtle.importKey('raw', bytes, { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ]);
}

// Same wire format as data values: enc1:<base64(iv)>:<base64(ciphertext+tag)>
async function wrapDek(masterKey: CryptoKey, dek: Uint8Array): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, masterKey, dek),
  );
  return `enc1:${b64encode(iv)}:${b64encode(ct)}`;
}

async function unwrapDek(masterKey: CryptoKey, wrapped: string): Promise<Uint8Array> {
  const parts = wrapped.split(':');
  if (parts.length !== 3 || parts[0] !== 'enc1') {
    throw new Error('Unrecognised wrapped DEK format');
  }
  const iv = b64decode(parts[1]);
  const ct = b64decode(parts[2]);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, masterKey, ct);
  return new Uint8Array(plain);
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return json(405, { error: 'Method not allowed' });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return json(401, { error: 'Missing authorization header' });
    }
    const token = authHeader.replace('Bearer ', '');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(supabaseUrl, serviceRoleKey);

    const { data: userData, error: userError } = await admin.auth.getUser(token);
    if (userError || !userData?.user) {
      return json(401, { error: 'Invalid or expired token' });
    }
    const userId = userData.user.id;

    const masterKey = await importMasterKey();
    if (!masterKey) {
      // Misconfiguration must degrade gracefully client-side (plaintext mode).
      return json(503, { error: 'Key service not configured' });
    }

    // Fetch existing wrapped DEK.
    const { data: row, error: selectError } = await admin
      .from('user_keys')
      .select('wrapped_dek, key_version')
      .eq('user_id', userId)
      .maybeSingle();
    if (selectError) {
      return json(500, { error: 'Key lookup failed' });
    }

    if (row) {
      const dek = await unwrapDek(masterKey, row.wrapped_dek);
      return json(200, { dek: b64encode(dek), keyVersion: row.key_version });
    }

    // First login: mint a DEK and store it wrapped. On a concurrent-insert
    // race the second insert violates the PK; re-read and use the winner's
    // key so both sessions end up with the same DEK.
    const dek = crypto.getRandomValues(new Uint8Array(32));
    const wrapped = await wrapDek(masterKey, dek);
    const { error: insertError } = await admin
      .from('user_keys')
      .insert({ user_id: userId, wrapped_dek: wrapped });
    if (insertError) {
      const { data: winner, error: rereadError } = await admin
        .from('user_keys')
        .select('wrapped_dek, key_version')
        .eq('user_id', userId)
        .maybeSingle();
      if (rereadError || !winner) {
        return json(500, { error: 'Key creation failed' });
      }
      const winnerDek = await unwrapDek(masterKey, winner.wrapped_dek);
      return json(200, { dek: b64encode(winnerDek), keyVersion: winner.key_version });
    }

    return json(200, { dek: b64encode(dek), keyVersion: 1 });
  } catch (_err) {
    // Never leak key material or internals in errors.
    return json(500, { error: 'Internal error' });
  }
});
