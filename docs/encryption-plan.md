# Encryption plan — application-level encryption of user content

Status: **Phase 3 in progress — 6 of 9 tables flipped on web; remaining: projects, planner_rows (planning_history inherits from projects)**. Work now on `main` in both repos. Read alongside `docs/compliance.md`.

## Progress log

- **2026-10-02 (evening, cont.) — export server-side decrypt BUILT (plan § Knock-ons).**
  - New `src/lib/server/exportCrypto.ts`: unwraps the caller's DEK (user_keys via service role + `TACULAR_MASTER_KEY` env var, same base64 32-byte secret as the data-key Edge Function) with node:crypto AES-256-GCM, and decrypts every encrypted field in the export payload. Field map `EXPORT_ENCRYPTED_FIELDS` mirrors the plan's table (text fields in place; `_enc` json columns decrypt into the plaintext column and the `_enc` key is dropped from the exported row). planning_history is not in EXPORT_TABLES, so intentionally absent.
  - Failure policy is the OPPOSITE of client graceful fallback: any undecryptable value fails the whole export (Art. 15/20 — never ship ciphertext). DEK fetch is lazy, so plaintext-only accounts export fine even without the env var. A post-decrypt deep sweep fails the export if ANY `enc1:` string survives anywhere in the payload — a newly flipped table missing from the field map fails loudly instead of leaking ciphertext.
  - Wired into `exportUserData` (dataExport.ts) after the table loop. Vitest: 189/189 (8 new round-trip/sweep/coverage tests in `src/lib/server/__tests__/exportCrypto.test.js`).
  - **DEPLOY PREREQUISITE: add `TACULAR_MASTER_KEY` to the Vercel project env vars (value from the password manager) before or with the next deploy.** Without it, plaintext accounts still export; an account with any enc1 data gets a clean 500 instead of a ciphertext export.
  - KNOWN GAP from the task_events flip is hereby closed (pending deploy + env var).

- **2026-10-02 (evening) — projects flip staged; waiting on the TestFlight build.**
  - Simulator check PASSED (app loads with crypto module, projects/subprojects/headers render). Along the way found and fixed an unrelated regression from the additive-day-funnels change: SystemScreen's dAnyFilterActive still tested `dWeekViewDayFilter !== null` after the filter became an array, so it was ALWAYS true and project headers followed the hidden toggle — flat list. Fixed to `.length > 0`.
  - CLIENT_BUILD bumped to '20261002' in BOTH repos (mobile lib/supabase.js, web src/lib/supabase.ts). TestFlight build submitted with the header fix + bump; NOT yet installed on the phone.
  - GATED until the new build is on the phone: (a) migration raising enforce_min_client_build to '20261002', (b) uncommenting 'projects' in web ENCRYPT_WRITE_TABLES + deploy, (c) the live probe (edit one tagline on web → check phone renders it → check planning_history.previous_data turns enc1 on the next project edit).
  - Safe meanwhile: deploy web (all changes flag-off/inert), and build the export-data server-side decrypt (next item).

- **2026-10-02 (later pm) — projects flip BUILT on both sides, flag still OFF.**
  - Migration `20261002000004_projects_plan_table_entries_enc.sql` applied to prod: nullable `plan_table_entries_enc` text column on `projects` (jsonb column gets an `[]` placeholder when encrypted).
  - Mobile (tacular-mobile): `decryptJsonPreferEnc` mirrored into lib/crypto.js; plannerApi `fetchProjects` now prefers `plan_table_entries_enc` after decryptRows. Pure JS — ships as an app update, no native rebuild needed (quick-crypto pods already in the dev client).
  - Web stagingStorage: new `decryptProjectRows` (all three read sites: fetchStagingStateFromServer + the diff-save's existing-rows read go through it) and `encryptProjectRowForWrite` (encrypts toUpsert AFTER the plaintext diff; text/project_name/project_nickname/project_tagline via encryptField, plan_table_entries → _enc + [] placeholder; flag off → nulls _enc for one source of truth). `saveProjectTagline` encrypts at the boundary too. `saveSystemOrder` untouched (structure only). Confirmed projects has no other Supabase touchpoints (all from('projects') calls live in stagingStorage; archiveYear/createDraftYear/yearMigration/snapshotStorage have none).
  - `projects` is NOT in ENCRYPT_WRITE_TABLES yet (commented marker in both crypto.js files). Flip order: (1) simulator check the installed mobile build decrypts, (2) ship the mobile update, (3) bump enforce_min_client_build, (4) uncomment 'projects' on web + deploy, (5) probe: edit one project tagline on web, check the phone renders it, then verify planning_history rows show enc1 previous_data after a project edit (trigger inherits automatically).
  - Vitest: 181/181 passing.

- **2026-10-02 (pm) — Phase 3 step 1: `chip_task_notes` encrypt-on-write built.**
  - Per-table write flag added to both crypto.js files: `ENCRYPT_WRITE_TABLES` set + `encryptWritesEnabled(table)` (requires a loaded key; mobile additionally requires the native module). Rollback = remove the table from the set and redeploy.
  - Web set contains `chip_task_notes` (web-only table — mobile neither reads nor writes it, so this step has NO mobile-build dependency). Mobile set stays EMPTY until the dev client ships with react-native-quick-crypto and `enforce_min_client_build` is bumped.
  - Web storage.js: both write paths (`saveChipTaskNote` upsert and the localStorage migration upsert in `preloadChipTaskNotes`) encrypt `note` at the Supabase boundary; the in-memory cache keeps plaintext.
  - Pre-flip plaintext backup of the table (1 row) exported to `db-exports/chip_task_notes_pre_phase3_20261002.json`.
  - Vitest: 181/181 passing (2 new flag tests). Supabase checked: user_keys has 1 wrapped DEK, zero enc1 values anywhere pre-flip.
  - Live-test finding: `chip_task_notes` is effectively DORMANT — a chip task row's synthetic `chip-task-` id is replaced by a UUID at first save, after which notes route to `planner_rows.notes` (TaskRowPanel passes `selectedTask.id`). The table only catches notes typed before the first save; its 1 row is from June. Flip kept (harmless, correct); live verification moved to task_events.
  - `task_events` flipped on web same day: mobile only INSERTS into task_events (outbox → sendTaskEventNow), never reads, so old mobile builds can neither show garbage nor break — their plaintext events coexist by design. Web write paths covered: `writeTaskEvent` (storage.js) and `restoreTaskEvents` (snapshotStorage.js re-encrypts the plaintext held in snapshots). Reads already decrypt since Phase 2.
  - Later same day — tactics_chips + tactics_custom_projects flipped (both web-only; mobile has zero references). Write paths: tacticsStorage replace-the-layer save (display_label / label encrypted after row mapping, in-memory cache keeps plaintext payloads) and snapshotStorage restoreCustomProjects. Also fixed a MISSED chip_task_notes write path: snapshotStorage restoreChipNotes now encrypts too. Lesson for remaining tables: grep snapshotStorage for restore-side inserts on every flip.
  - Later again — archived_weeks + site_snapshots flipped (web-only). Migration `20261002000003_encryption_enc_columns.sql` applied to prod: nullable `snapshot_enc` / `goal_enc` / `plan_enc` / `system_enc` text columns beside the NOT NULL jsonb columns (which get {} placeholders when encrypted). New `decryptJsonPreferEnc(encValue, plainValue)` helper in crypto.js; reads prefer _enc. Writes null the _enc column when the flag is off (rollback keeps one source of truth). Fixed a latent bug: the archive stale-week delete check read `existingRes.data` raw — with encrypted snapshots every row would have looked stale; now uses the decrypted array. Verified live: snapshot row 2026-10-02 15:25 UTC fully encrypted ({} + enc1 in all three _enc columns) next to plaintext older rows; tactics layer verified same day via chip-nudge + full reload (27/63 labels + 4/4 custom projects enc, page renders from ciphertext). archived_weeks encrypts from the next System-page save — verify a week's snapshot_enc after one.
  - **Next session — projects flip, prerequisites mapped (2026-10-02):** mobile CONSUMES plan_table_entries (plannerData.js subprojectsFromPlanEntries → subproject dropdowns), so before web flips `projects`: (1) mirror decryptJsonPreferEnc + the plan_table_entries_enc read into mobile plannerApi fetchProjects; (2) simulator check that the installed build decrypts (hasDataKey() true after sign-in, no red screen); (3) ship the mobile build/update; (4) then flip on web. The `plan_table_entries_enc` column does NOT exist yet (only archived_weeks/site_snapshots got their _enc columns in 20261002000003). Web write sites for projects: saveStagingState (encrypt toUpsert AFTER the plaintext diff, never before), saveProjectTagline, saveSystemProjectOrder (structure only, no change). Then planner_rows LAST. Low-risk probe once flipped: edit one project tagline on web, check the phone renders it.
  - Remaining tables: projects (mobile READS — gated on simulator decrypt check + enforce_min_client_build bump; plan_table_entries needs its _enc sibling column), archived_weeks + site_snapshots (web-only, need _enc text columns for the jsonb fields), planning_history (trigger-written — becomes encrypted automatically once projects' values are enc1; verify, nothing to build), planner_rows LAST (diff/baseline/offline machinery).
  - KNOWN GAP until the export decryption lands: `api/export-data.ts` does not yet decrypt server-side, so exports will contain `enc1:` strings for encrypted task_events fields. Must be fixed before the pilot (plan § Knock-ons). — CLOSED 2026-10-02 evening: server-side decrypt built (see top entry); needs `TACULAR_MASTER_KEY` on Vercel + deploy.
  - Verify after deploy: change a status on web → new task_events row shows `enc1:` old/new values in SQL → Status History panel still renders plaintext. Mobile dev-client rebuild DONE (built after Phase 2, includes the quick-crypto pods from Phase 1; the 2026-10-02 red screen was an older pre-crypto simulator binary). Remaining before flipping tables mobile reads (planner_rows, projects): a quick simulator check that the build decrypts, bump enforce_min_client_build, and ship each mobile-side flag flip as a normal app update.

- **2026-10-02 — Pre-step + Phase 2 (decrypt-on-read) built.**
  - Backup tables `planner_rows_backup_20260719` and `planner_rows_ghost_backup_20260921` exported to `db-exports/` (625 + 30 rows, JSON) and dropped from Supabase.
  - `decryptRow`/`decryptRows` helpers added to both crypto.js files (plaintext rows returned as the SAME object, so identity/diff behaviour is unchanged until encrypted data exists).
  - Web: every Supabase read of an encrypted table now decrypts at the fetch boundary, before caching/baselining — stagingStorage (projects, incl. the diff-save's existing-rows read), tacticsStorage (tactics_chips, tactics_custom_projects), planner storage.js (planner_rows reads in readTaskRows AND the save's currentData/structural pass, archived_weeks snapshot reads, chip_task_notes preload, task_events read), snapshotStorage (captureTaskEvents/CustomProjects/ChipNotes decrypt so snapshots store plaintext; loadSiteSnapshots runs goal/plan/system through decryptJson ready for the _enc columns).
  - Mobile plannerApi.js: fetchProjects, fetchPlannerRows, fetchRow, upsertRowPayload's returned row all decrypt at the boundary. Realtime handlers only trigger refetches, so no change there.
  - `planning_history` has no client reads (trigger-written) — nothing to do for it in Phase 2.
  - Web vitest suite: 179/179 passing. Next: observe in prod, verify offline replay + exports + cross-page events on real data, then Phase 3 (encrypt-on-write per table, starting chip_task_notes). Mobile dev-client rebuild with react-native-quick-crypto still pending and blocks Phase 3.
- **2026-09-30 — Phase 1 built and deployed.**
  - `user_keys` table live (RLS enabled, no policies, client privileges revoked; service role only).
  - `data-key` Edge Function deployed (v2) with `TACULAR_MASTER_KEY` secret set; master key also in the password manager. CORS gotcha found and fixed: the client sends `x-tacular-client` on every request, so Edge Function CORS `Access-Control-Allow-Headers` must include it (fixed in `data-key` and `_shared/cors.ts`; without it the browser kills `functions.invoke` at preflight and no request ever appears).
  - Web: `src/lib/crypto.js` (WebCrypto AES-256-GCM, enc1 format, graceful plaintext fallback) + AuthContext key fetch on sign-in / clear on sign-out (memory + sessionStorage). 10-case vitest suite. Verified end to end in the browser: key fetched and cached, wrapped DEK row minted.
  - Mobile (tacular-mobile, branch `encryption`): `lib/crypto.js` mirror using `react-native-quick-crypto` **>=1.0.0 only** (0.7.x truncates keys at the first NUL byte, GHSA-wrf3-fwx3-8jrv — never downgrade); DEK cached in memory + expo-secure-store; App.js key fetch/clear wired. Extra fallback: a build without the native module runs in plaintext mode, so the branch is safe to ship before a dev-client rebuild. npm + pod install done; **dev client rebuild still pending**.
  - Note: the `data-key` function keeps its CORS headers inlined (matching `_shared/cors.ts`) so it deploys as a single bundle; keep the two in sync.
- **Next session:** observe Phase 1 in prod for a few days, then Phase 2 (decrypt-on-read in all storage modules, both clients — a no-op on plaintext, so no mobile-release dependency). The mobile dev-client build with the crypto module must be shipped before ANY table flips to encrypt-on-write in Phase 3.

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
