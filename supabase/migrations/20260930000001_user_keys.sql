-- Encryption plan Phase 1 (docs/encryption-plan.md): per-user data-key store.
--
-- Each row holds one user's 256-bit data key (DEK), AES-256-GCM *wrapped*
-- with the master key (TACULAR_MASTER_KEY, an Edge Function secret — never
-- stored in the database). Clients never touch this table: the data-key
-- Edge Function (service role) is the only reader/writer. RLS is enabled
-- with NO policies, so anon/authenticated roles get nothing; the service
-- role bypasses RLS.
--
-- No behaviour change for the app: nothing reads this table yet.

create table if not exists public.user_keys (
  user_id uuid primary key references auth.users (id) on delete cascade,
  -- Wire format mirrors data values: enc1:<base64(iv)>:<base64(ciphertext+tag)>
  wrapped_dek text not null,
  -- Bumped when the DEK is replaced (per-user compromise recovery).
  key_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_keys enable row level security;

-- Deliberately no RLS policies: client roles must have zero access.
-- Belt-and-braces: revoke table privileges from client roles too.
revoke all on table public.user_keys from anon, authenticated;

comment on table public.user_keys is
  'Per-user data keys, wrapped with the master key. Service role only — see docs/encryption-plan.md.';
