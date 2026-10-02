import { createDecipheriv } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * exportCrypto.ts — server-side decryption for the GDPR data export
 * (docs/encryption-plan.md § Knock-ons).
 *
 * Art. 15/20 require an intelligible copy, so the export must never ship
 * `enc1:` ciphertext. This module unwraps the caller's DEK with the master
 * key (TACULAR_MASTER_KEY env var on Vercel — same base64 32-byte secret as
 * the data-key Edge Function) and decrypts every encrypted field in the
 * export payload.
 *
 * Failure policy is the OPPOSITE of the clients' graceful fallback: a value
 * that cannot be decrypted fails the whole export (shipping ciphertext in a
 * subject-access export is the bug, not the fallback). The master key and
 * DEK are only needed if encrypted values are actually present, so plaintext
 * accounts export fine even if the env var is missing.
 */

const ENC_PREFIX = 'enc1:';

/**
 * Encrypted fields per exported table. Must stay in lockstep with the
 * ENCRYPTION_PLAN table list (docs/encryption-plan.md § What gets encrypted)
 * and the ENCRYPT_WRITE_TABLES flips in src/lib/crypto.js.
 *
 * - `text`: columns holding `enc1:` strings in place.
 * - `json`: `_enc` text column → plaintext jsonb column it replaces. The
 *   decrypted JSON is written back into the plaintext column and the `_enc`
 *   column is removed from the exported row (the placeholder {} / [] value
 *   is internal bookkeeping, not user data).
 *
 * planning_history is trigger-written and not in EXPORT_TABLES, so it is
 * intentionally absent here.
 */
export const EXPORT_ENCRYPTED_FIELDS: Record<
  string,
  { text?: string[]; json?: Record<string, string> }
> = {
  planner_rows: { text: ['task', 'notes', 'subproject_label'] },
  projects: {
    text: ['text', 'project_name', 'project_nickname', 'project_tagline'],
    json: { plan_table_entries_enc: 'plan_table_entries' },
  },
  archived_weeks: { json: { snapshot_enc: 'snapshot' } },
  site_snapshots: { json: { goal_enc: 'goal', plan_enc: 'plan', system_enc: 'system' } },
  task_events: { text: ['old_value', 'new_value', 'note'] },
  chip_task_notes: { text: ['note'] },
  tactics_chips: { text: ['display_label'] },
  tactics_custom_projects: { text: ['label'] },
};

export function isEncryptedValue(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith(ENC_PREFIX);
}

/**
 * Decrypts one `enc1:<b64 iv>:<b64 ct+tag>` value with a raw 32-byte key.
 * Throws on any malformed or unauthentic value.
 */
export function decryptValue(key: Buffer, value: string): string {
  const parts = value.split(':');
  if (parts.length !== 3 || parts[0] !== 'enc1') {
    throw new Error('Unrecognised encrypted value format');
  }
  const iv = Buffer.from(parts[1], 'base64');
  const ctAndTag = Buffer.from(parts[2], 'base64');
  if (iv.length !== 12 || ctAndTag.length < 16) {
    throw new Error('Malformed encrypted value');
  }
  const tag = ctAndTag.subarray(ctAndTag.length - 16);
  const ct = ctAndTag.subarray(0, ctAndTag.length - 16);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}

/**
 * Unwraps a wrapped DEK (same enc1 wire format) with the master key,
 * returning raw bytes — a DEK is random bytes, never valid UTF-8.
 */
export function unwrapDek(masterKey: Buffer, wrapped: string): Buffer {
  const parts = wrapped.split(':');
  if (parts.length !== 3 || parts[0] !== 'enc1') {
    throw new Error('Unrecognised wrapped DEK format');
  }
  const iv = Buffer.from(parts[1], 'base64');
  const ctAndTag = Buffer.from(parts[2], 'base64');
  if (iv.length !== 12 || ctAndTag.length < 16) {
    throw new Error('Malformed wrapped DEK');
  }
  const tag = ctAndTag.subarray(ctAndTag.length - 16);
  const ct = ctAndTag.subarray(0, ctAndTag.length - 16);
  const decipher = createDecipheriv('aes-256-gcm', masterKey, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]);
}

/**
 * Loads and unwraps the user's DEK: user_keys row via the admin client,
 * unwrapped with TACULAR_MASTER_KEY. Returns null when the user has no key
 * row (a plaintext-only account). Throws when a key row exists but the
 * master key env var is missing/invalid — that account may have ciphertext.
 */
export async function loadUserDek(
  adminClient: SupabaseClient,
  userId: string
): Promise<Buffer | null> {
  const { data: row, error } = await adminClient
    .from('user_keys')
    .select('wrapped_dek')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) {
    throw new Error(`user_keys lookup failed: ${error.message}`);
  }
  if (!row) return null;

  const rawMaster = (process.env.TACULAR_MASTER_KEY ?? '').trim();
  const masterKey = Buffer.from(rawMaster, 'base64');
  if (masterKey.length !== 32) {
    throw new Error('TACULAR_MASTER_KEY missing or not 32 bytes (base64)');
  }
  const dek = unwrapDek(masterKey, (row as { wrapped_dek: string }).wrapped_dek);
  if (dek.length !== 32) {
    throw new Error('Unwrapped DEK has unexpected length');
  }
  return dek;
}

/**
 * Decrypts all encrypted fields in the export payload's `data` map,
 * in place. `getDek` is called lazily, once, the first time an encrypted
 * value is encountered; if it yields no key the export fails.
 *
 * After the field-map pass, a sweep asserts no `enc1:` string survives
 * anywhere in the payload — so a newly flipped table that someone forgot to
 * add to EXPORT_ENCRYPTED_FIELDS fails the export loudly instead of
 * shipping ciphertext.
 */
export async function decryptExportData(
  data: Record<string, unknown[]>,
  getDek: () => Promise<Buffer | null>
): Promise<void> {
  let dek: Buffer | null | undefined; // undefined = not fetched yet

  const requireDek = async (): Promise<Buffer> => {
    if (dek === undefined) dek = await getDek();
    if (!dek) {
      throw new Error('Encrypted values present but no data key available for this user');
    }
    return dek;
  };

  for (const [table, spec] of Object.entries(EXPORT_ENCRYPTED_FIELDS)) {
    const rows = data[table];
    if (!Array.isArray(rows)) continue;
    for (const row of rows as Record<string, unknown>[]) {
      if (!row || typeof row !== 'object') continue;

      for (const col of spec.text ?? []) {
        const value = row[col];
        if (isEncryptedValue(value)) {
          row[col] = decryptValue(await requireDek(), value);
        }
      }

      for (const [encCol, plainCol] of Object.entries(spec.json ?? {})) {
        const value = row[encCol];
        if (isEncryptedValue(value)) {
          const plaintext = decryptValue(await requireDek(), value);
          try {
            row[plainCol] = JSON.parse(plaintext);
          } catch {
            throw new Error(`Decrypted ${table}.${encCol} is not valid JSON`);
          }
        }
        // Internal bookkeeping column — never part of the user's data.
        if (encCol in row) delete row[encCol];
      }
    }
  }

  // Sweep: no ciphertext may leave the building.
  const leftovers = findEncryptedLeftovers(data);
  if (leftovers.length > 0) {
    throw new Error(
      `Export still contains encrypted values after decryption: ${leftovers.join(', ')}`
    );
  }
}

/** Deep-scans the data map for surviving enc1: strings; returns locations. */
export function findEncryptedLeftovers(data: Record<string, unknown[]>): string[] {
  const hits: string[] = [];
  const scan = (value: unknown, path: string) => {
    if (isEncryptedValue(value)) {
      hits.push(path);
    } else if (Array.isArray(value)) {
      value.forEach((v, i) => scan(v, `${path}[${i}]`));
    } else if (value && typeof value === 'object') {
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        scan(v, `${path}.${k}`);
      }
    }
  };
  for (const [table, rows] of Object.entries(data)) {
    scan(rows, table);
  }
  return hits;
}
