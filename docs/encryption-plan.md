# Encryption plan — application-level encryption of user content

Status: **agreed, not yet implemented** (2026-09-30). Read alongside `docs/compliance.md`.

## Goal and honest claim

Encrypt user-entered free text so that it is unreadable in the Supabase dashboard, in SQL, in backups, and to anyone holding a leaked API key. Studio PDW retains a deliberate, controlled ability to decrypt (support, export, future AI wizard). This is **not** end-to-end encryption and must never be described as "we cannot read your data". The approved claim: *"Your planning data is encrypted; we can only access it in limited circumstances such as support requests."* E2E was considered and rejected (password-loss data destruction, web/mobile key sync, blocks the AI planning wizard).

## Architecture — client-side crypto, server-managed keys

Both clients (web and Expo mobile) talk to Supabase directly, and the web System page has an offline IndexedDB layer (`plannerOffline`). A decrypt-proxy server would break all of that. So:

- **Master key (KEK):** random 256-bit key, stored ONLY as an Edge Function secret (`TACULAR_MASTER_KEY`) and in Prentice's password manager. Never in the database, never in client bundles, never in git.
- **Per-user data key (DEK):** random 256-bit key per user, generated at first login by the `data-key` Edge Function, stored in a new `user_keys` table **wrapped** (AES-256-GCM encrypted) with the master key. RLS: no client access at all (service role only).
- **Key delivery:** `data-key` Edge Function authenticates the caller's JWT, unwraps their DEK with the master key, returns it. Clients cache it in memory + `sessionStorage` (web) / `expo-secure-store` (mobile) and encrypt/decrypt locally with AES-256-GCM.
- **Cipher:** AES-256-GCM, random 12-byte IV per value. Wire format for every encrypted value: `enc1:<base64(iv)>:<base64(ciphertext+tag)>` — the `enc1:` prefix is the version tag AND the is-this-encrypted discriminator during migration.
- **Crypto implementations:** web = WebCrypto (`crypto.subtle`, zero deps); mobile = `react-native-quick-crypto` (needs a native module — dev client already in use, so OK; `expo-crypto` alone cannot do AES-GCM).
- New shared module `src/lib/crypto.js` (web) and equivalent in mobile: `encryptField(value)`, `decryptField(value)` (passes through non-`enc1:` values unchanged), `encryptJson`/`decryptJson` for jsonb payloads. **Storage modules are the only callers** — never encrypt/decrypt in page or component code (same rule as Supabase access).

Rotation story: master key rotation = re-wrap ~N tiny DEK rows (cheap, no content rewrite). Per-user compromise = generate new DEK and re-encrypt one user's rows.

## What gets encrypted

Free text and content-bearing jsonb. Structure (ids, FKs, `order_key`, `display_order`, dates, minutes, booleans, status keys, colours, settings) stays plaintext so sync, ordering, diffing and the offline layer are untouched.

| Table | Fields |
|---|---|
| `planner_rows` | `task`, `notes`, `subproject_label` |
| `projects` | `text`, `project_name`, `project_nickname`, `project_tagline`, `plan_table_entries` (jsonb) |
| `archived_weeks` | `snapshot` (jsonb) |
| `site_snapshots` | `goal`, `plan`, `system` (jsonb) |
| `task_events` | `old_value`, `new_value`, `note` |
| `chip_task_notes` | `note` |
| `tactics_chips` | `display_label` |
| `tactics_custom_projects` | `label` |
| `planning_history` | `previous_data` (jsonb) |

Explicitly not encrypted for now: `statuses.label` (config, low sensitivity), `years`, `tactics_year_settings`, `tactics_metrics`, `planner_settings` (numbers/config), `profiles` (email/DOB needed by auth + age gate). Revisit `statuses.label` post-pilot.

Jsonb fields are encrypted as a whole: column type stays/becomes `text` holding one `enc1:` string (schema change for the three jsonb tables happens as NEW columns, see migration). Encrypted text becomes opaque to SQL — acceptable; no server-side search exists or is planned on these fields.

**Pre-step:** drop `planner_rows_backup_20260719` and `planner_rows_ghost_backup_20260921` (after a manual export) rather than migrating them.

## Encrypted values stay strings in place

No column renames for text fields: `task` simply starts holding `enc1:...` strings. `decryptField` passes plaintext through, so old and new data coexist and nothing breaks if a row is missed. The three jsonb→text cases get sibling columns (`plan_table_entries_enc` etc.) with reads preferring `_enc`; the plaintext jsonb column is dropped in the final phase.

## Migration — five phases, each reversible

Prentice's hard requirement: **no step may be able to take the site down or lose data.** Every phase ships separately and runs in production for days before the next.

1. **Foundations (no behaviour change).** `user_keys` table + RLS, `data-key` Edge Function, `crypto.js` in both clients, key fetch on login with graceful fallback (if the function is down, app works exactly as today, plaintext). Deploy, observe.
2. **Decrypt-on-read (still writing plaintext).** All storage-module reads run through `decryptField` (a no-op on plaintext). This proves the read path everywhere — System offline replay, diffing baselines, exports — before a single encrypted byte exists.
3. **Encrypt-on-write, per table, behind a flag.** Start with `chip_task_notes` (1 row, trivial), then `task_events`, then the rest, `planner_rows` last (the diff/baseline/offline machinery — baselines must snapshot *plaintext* values so diffing still works; encrypt at the Supabase boundary only). Old mobile builds still write plaintext during this phase — harmless, reads handle both. Before declaring a table done, bump `enforce_min_client_build` so stale clients are forced to update, then run the backfill.
4. **Backfill + verify.** Node script (service role, run locally): for each table, encrypt plaintext rows in batches; then a verify pass decrypts every `enc1:` value and, for the backfilled batch, compares against a pre-backfill export taken the same run. Full `pg_dump` (Supabase backup) before each table's backfill. Any mismatch: stop, investigate, plaintext originals are still in the backup.
5. **Tidy.** Drop the plaintext jsonb columns, remove the write flag, update `docs/compliance.md` and the privacy policy, add the decryption log (below).

Rollback at any phase = flip the write flag off; data already encrypted still reads fine via `decryptField`. There is no phase where the app depends on encryption existing.

## Knock-ons to handle in implementation

- **Data export (`api/export-data.ts`):** must return decrypted data (Art. 15/20 means intelligible copy). The Vercel function gets the master key as an env var and decrypts server-side before building the JSON. Add to `verify-export-tables.mjs` awareness if field lists change.
- **Account deletion:** unchanged (rows deleted, wrapped DEK row in `user_keys` deleted too — add `user_keys` to `purge_user_data` and the export/purge cross-check).
- **Realtime / cross-page events:** payloads are already post-read app state; events fire after storage-module decryption, so no change — verify during phase 2.
- **`plannerOffline` (IndexedDB):** stores decrypted app state on the user's own device. Acceptable (same trust level as the running app). Pending-save replay goes through `saveTaskRows`, which encrypts at the boundary — verify the bookkeeping diff still compares plaintext-to-plaintext.
- **AI planning wizard (future):** wizard backend decrypts with the master key server-side; no client change needed. This is the main reason server-managed beats E2E.
- **Decryption log:** any manual decryption outside normal app flow gets a one-line entry (date, user affected, reason) in a private log. Turns "I can access it" into "access is controlled and recorded" for GDPR/procurement conversations.
- **Privacy policy (`docs/legal/`):** must state encryption at application level, Studio PDW's controlled access, and the support/export circumstances. Blocking for the SEEDS pilot.

## GDPR position (summary of 2026-09-30 decision)

Art. 32 requires appropriate measures and names encryption as an example; it does not require E2E. Server-managed keys keep Art. 15/17/20 rights (access, erasure, portability) fully workable. Supabase already encrypts disks; this plan protects against leaked keys, RLS mistakes, dashboard access and casual browsing — which is the assurance the pilot audience needs. Not legal advice; sanity-check with a professional before the Ravensbourne agreement is signed.
