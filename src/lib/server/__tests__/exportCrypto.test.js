import { describe, it, expect } from 'vitest';
import { randomBytes, createCipheriv } from 'node:crypto';
import {
  decryptValue,
  unwrapDek,
  decryptExportData,
  findEncryptedLeftovers,
  EXPORT_ENCRYPTED_FIELDS,
} from '../exportCrypto.ts';

// Mirror of the clients' / Edge Function's enc1 encryption, for round-trips.
function encrypt(key, plaintextBuf) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plaintextBuf), cipher.final(), cipher.getAuthTag()]);
  return `enc1:${iv.toString('base64')}:${ct.toString('base64')}`;
}
const encText = (key, s) => encrypt(key, Buffer.from(s, 'utf8'));

describe('exportCrypto', () => {
  const dek = randomBytes(32);

  it('round-trips an enc1 text value', () => {
    expect(decryptValue(dek, encText(dek, 'Pay the VAT bill'))).toBe('Pay the VAT bill');
  });

  it('unwraps a wrapped DEK byte-for-byte', () => {
    const master = randomBytes(32);
    const wrapped = encrypt(master, dek);
    expect(unwrapDek(master, wrapped).equals(dek)).toBe(true);
  });

  it('rejects a tampered value', () => {
    const value = encText(dek, 'secret');
    const parts = value.split(':');
    const ct = Buffer.from(parts[2], 'base64');
    ct[0] ^= 0xff;
    expect(() => decryptValue(dek, `enc1:${parts[1]}:${ct.toString('base64')}`)).toThrow();
  });

  it('decrypts text fields, json _enc columns, and passes plaintext through', async () => {
    const data = {
      planner_rows: [
        { id: 'a', task: encText(dek, 'Write invoice'), notes: null, subproject_label: 'plain' },
      ],
      projects: [
        {
          id: 'p',
          project_tagline: encText(dek, 'Ship it'),
          plan_table_entries: [],
          plan_table_entries_enc: encText(dek, JSON.stringify([{ label: 'Q4' }])),
        },
      ],
      site_snapshots: [
        {
          id: 's',
          goal: {},
          goal_enc: encText(dek, JSON.stringify({ rows: [1] })),
          plan: { legacy: true },
          plan_enc: null,
          system: {},
          system_enc: null,
        },
      ],
      years: [{ id: 'y', year_number: 1 }],
    };
    await decryptExportData(data, async () => dek);

    expect(data.planner_rows[0].task).toBe('Write invoice');
    expect(data.planner_rows[0].subproject_label).toBe('plain');
    expect(data.projects[0].project_tagline).toBe('Ship it');
    expect(data.projects[0].plan_table_entries).toEqual([{ label: 'Q4' }]);
    expect('plan_table_entries_enc' in data.projects[0]).toBe(false);
    expect(data.site_snapshots[0].goal).toEqual({ rows: [1] });
    // Legacy plaintext jsonb untouched when its _enc sibling is null.
    expect(data.site_snapshots[0].plan).toEqual({ legacy: true });
    expect('goal_enc' in data.site_snapshots[0]).toBe(false);
    expect('plan_enc' in data.site_snapshots[0]).toBe(false);
  });

  it('never calls getDek for a plaintext-only export', async () => {
    let called = false;
    const data = { planner_rows: [{ task: 'plain', notes: null }] };
    await decryptExportData(data, async () => {
      called = true;
      return dek;
    });
    expect(called).toBe(false);
  });

  it('fails when encrypted values exist but no DEK is available', async () => {
    const data = { task_events: [{ old_value: encText(dek, 'x') }] };
    await expect(decryptExportData(data, async () => null)).rejects.toThrow(/no data key/);
  });

  it('fails loudly on ciphertext in an unmapped location (sweep)', async () => {
    const data = { years: [{ label: encText(dek, 'sneaky') }] };
    await expect(decryptExportData(data, async () => dek)).rejects.toThrow(/still contains/);
    expect(findEncryptedLeftovers(data)).toEqual(['years[0].label']);
  });

  it('covers every table/field in the encryption plan', () => {
    expect(Object.keys(EXPORT_ENCRYPTED_FIELDS).sort()).toEqual(
      [
        'archived_weeks',
        'chip_task_notes',
        'planner_rows',
        'projects',
        'site_snapshots',
        'tactics_chips',
        'tactics_custom_projects',
        'task_events',
      ].sort()
    );
  });
});
