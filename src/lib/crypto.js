/**
 * crypto.js — application-level field encryption (docs/encryption-plan.md).
 *
 * AES-256-GCM via WebCrypto, using the per-user data key (DEK) delivered by
 * the `data-key` Edge Function and cached in memory + sessionStorage.
 *
 * Wire format for every encrypted value:
 *   enc1:<base64(iv)>:<base64(ciphertext+tag)>
 * The `enc1:` prefix is both the version tag and the is-this-encrypted
 * discriminator, so plaintext and ciphertext coexist during migration.
 *
 * Rules (same as Supabase access):
 * - Storage modules are the ONLY callers of encryptField/decryptField/
 *   encryptJson/decryptJson. Never encrypt/decrypt in page/component code.
 * - Graceful fallback is non-negotiable: if the key service is down or the
 *   key is not (yet) loaded, decryptField passes values through unchanged
 *   and encryptField returns the plaintext it was given. The app must work
 *   exactly as today with no key. (Phase 1 ships no encrypt-on-write at
 *   all; writes stay plaintext until the Phase 3 per-table flag.)
 */

import { supabase } from './supabase';

const ENC_PREFIX = 'enc1:';
const SESSION_KEY_PREFIX = 'tacular-dek-';

// In-memory state
let cachedKey = null; // CryptoKey
let cachedKeyUserId = null;
let inflightFetch = null;

function b64encode(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function b64decode(str) {
  const bin = atob(str);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function importDek(rawBytes) {
  return crypto.subtle.importKey('raw', rawBytes, { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ]);
}

function readSessionDek(userId) {
  try {
    return sessionStorage.getItem(SESSION_KEY_PREFIX + userId);
  } catch {
    return null; // sessionStorage unavailable (private mode etc.)
  }
}

function writeSessionDek(userId, dekB64) {
  try {
    sessionStorage.setItem(SESSION_KEY_PREFIX + userId, dekB64);
  } catch {
    // Non-fatal: memory cache still works for this tab's lifetime.
  }
}

/**
 * Load the current user's data key: memory → sessionStorage → data-key
 * Edge Function. Safe to call repeatedly (deduplicates in-flight fetches).
 * Never throws; resolves true if a key is now available, false otherwise.
 * Call fire-and-forget on login.
 */
export async function initDataKey(userId) {
  if (!userId) return false;
  if (cachedKey && cachedKeyUserId === userId) return true;

  const stored = readSessionDek(userId);
  if (stored) {
    try {
      cachedKey = await importDek(b64decode(stored));
      cachedKeyUserId = userId;
      return true;
    } catch {
      // Corrupt cache entry — fall through to a fresh fetch.
    }
  }

  if (!inflightFetch) {
    inflightFetch = (async () => {
      try {
        const { data, error } = await supabase.functions.invoke('data-key', {
          body: {},
        });
        if (error || !data?.dek) return false;
        cachedKey = await importDek(b64decode(data.dek));
        cachedKeyUserId = userId;
        writeSessionDek(userId, data.dek);
        return true;
      } catch {
        // Key service unreachable: plaintext mode, exactly as today.
        return false;
      } finally {
        inflightFetch = null;
      }
    })();
  }
  return inflightFetch;
}

/** Drop the cached key (call on sign-out). */
export function clearDataKey(userId) {
  cachedKey = null;
  cachedKeyUserId = null;
  try {
    if (userId) {
      sessionStorage.removeItem(SESSION_KEY_PREFIX + userId);
    } else {
      // No id (already-cleared auth state): sweep all DEK entries.
      for (let i = sessionStorage.length - 1; i >= 0; i--) {
        const k = sessionStorage.key(i);
        if (k && k.startsWith(SESSION_KEY_PREFIX)) sessionStorage.removeItem(k);
      }
    }
  } catch {
    // sessionStorage unavailable — nothing to clear.
  }
}

/** True when a data key is loaded and encryption is possible right now. */
export function hasDataKey() {
  return cachedKey !== null;
}

/** True when a stored value is in the enc1 wire format. */
export function isEncrypted(value) {
  return typeof value === 'string' && value.startsWith(ENC_PREFIX);
}

/**
 * Encrypt one string field. Returns `enc1:...`. Fallback: with no key
 * loaded (or a non-string/empty value) returns the input unchanged.
 */
export async function encryptField(value) {
  if (typeof value !== 'string' || value === '' || !cachedKey) return value;
  if (isEncrypted(value)) return value; // never double-encrypt
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      cachedKey,
      new TextEncoder().encode(value),
    ),
  );
  return ENC_PREFIX + b64encode(iv) + ':' + b64encode(ct);
}

/**
 * Decrypt one field. Passes non-`enc1:` values (plaintext, null, numbers)
 * through unchanged. If an `enc1:` value cannot be decrypted (no key yet,
 * tampered data), returns the raw stored string rather than throwing, so a
 * read path never crashes the app.
 */
export async function decryptField(value) {
  if (!isEncrypted(value)) return value;
  if (!cachedKey) return value;
  try {
    const parts = value.split(':');
    if (parts.length !== 3) return value;
    const iv = b64decode(parts[1]);
    const ct = b64decode(parts[2]);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, cachedKey, ct);
    return new TextDecoder().decode(plain);
  } catch {
    return value;
  }
}

/**
 * Decrypt the named fields of one DB row. `textFields` go through
 * decryptField, `jsonFields` through decryptJson. Plaintext rows are
 * returned as the SAME object (no copy), so callers that compare row
 * identity or stringify for diffs see no change until encrypted data
 * actually exists. Phase 2 (decrypt-on-read): storage modules call this on
 * every row fetched from Supabase, immediately after the fetch and before
 * any caching, diff baselining, or mapping to app payloads.
 */
export async function decryptRow(row, textFields = [], jsonFields = []) {
  if (!row || typeof row !== 'object') return row;
  let out = null;
  for (const f of textFields) {
    if (isEncrypted(row[f])) {
      out = out || { ...row };
      out[f] = await decryptField(row[f]);
    }
  }
  for (const f of jsonFields) {
    if (isEncrypted(row[f])) {
      out = out || { ...row };
      out[f] = await decryptJson(row[f]);
    }
  }
  return out || row;
}

/** decryptRow over an array. Non-arrays pass through unchanged. */
export async function decryptRows(rows, textFields = [], jsonFields = []) {
  if (!Array.isArray(rows)) return rows;
  return Promise.all(rows.map((r) => decryptRow(r, textFields, jsonFields)));
}

/**
 * Encrypt a JSON-serialisable payload into a single `enc1:` string.
 * Fallback: with no key loaded, returns the payload unchanged (caller
 * stores it as before).
 */
export async function encryptJson(payload) {
  if (payload === null || payload === undefined || !cachedKey) return payload;
  return encryptField(JSON.stringify(payload));
}

/**
 * Decrypt a stored jsonb payload. If given an `enc1:` string, decrypts and
 * JSON-parses it; anything else (a real object from a plaintext jsonb
 * column, null) passes through unchanged. Returns null if an encrypted
 * payload cannot be decrypted or parsed.
 */
export async function decryptJson(stored) {
  if (!isEncrypted(stored)) return stored;
  const text = await decryptField(stored);
  if (text === stored) return null; // could not decrypt
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * Jsonb sibling-column read (Phase 3, docs/encryption-plan.md): the three
 * jsonb tables store ciphertext in a nullable `_enc` text column beside the
 * NOT NULL jsonb column (which holds a {} placeholder when encrypted).
 * Prefer the _enc value when present and decryptable; otherwise fall back
 * to the plaintext jsonb value.
 */
export async function decryptJsonPreferEnc(encValue, plainValue) {
  if (isEncrypted(encValue)) {
    const decrypted = await decryptJson(encValue);
    if (decrypted !== null) return decrypted;
  }
  return plainValue;
}

/**
 * Phase 3 — encrypt-on-write, per table (docs/encryption-plan.md).
 * A table listed here has its content fields encrypted at the Supabase
 * write boundary (storage modules only, same rule as always). Rollback =
 * remove the table from this set and redeploy; already-encrypted rows
 * keep reading fine via decryptField, and writes revert to plaintext.
 */
const ENCRYPT_WRITE_TABLES = new Set([
  'chip_task_notes', // flipped 2026-10-02 — web-only table, 1 row
  'task_events', // flipped 2026-10-02 — mobile only INSERTS (plaintext OK), never reads
  'tactics_chips', // flipped 2026-10-02 — web-only table
  'tactics_custom_projects', // flipped 2026-10-02 — web-only table
  'archived_weeks', // flipped 2026-10-02 — web-only; snapshot_enc sibling column
  'site_snapshots', // flipped 2026-10-02 — web-only; goal/plan/system_enc sibling columns
  // 'projects', // DO NOT flip until the mobile build that decrypts
  //             // plan_table_entries_enc is verified on the simulator and
  //             // shipped, and enforce_min_client_build is bumped
  //             // (docs/encryption-plan.md, projects prerequisites).
]);

/** True when writes to `table` should encrypt (and a key is loaded). */
export function encryptWritesEnabled(table) {
  return ENCRYPT_WRITE_TABLES.has(table) && cachedKey !== null;
}
