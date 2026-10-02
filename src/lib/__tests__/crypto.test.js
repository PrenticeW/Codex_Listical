// crypto.test.js — encryption plan Phase 1 (docs/encryption-plan.md).
//
// Covers the crypto module's contract before any storage module uses it:
//   1. No key loaded: encryptField/decryptField/encryptJson pass values
//      through unchanged (graceful-fallback requirement).
//   2. With a key: field round-trip, enc1 wire format, random IV per value.
//   3. decryptField passes plaintext through and never throws on bad input.
//   4. JSON round-trip, and decryptJson passthrough of real jsonb objects.
//   5. clearDataKey drops the key (back to passthrough behaviour).

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));

vi.mock('../supabase', () => ({
  supabase: { functions: { invoke: invokeMock } },
}));

import {
  initDataKey,
  clearDataKey,
  hasDataKey,
  isEncrypted,
  encryptField,
  decryptField,
  encryptJson,
  decryptJson, encryptWritesEnabled} from '../crypto';

const USER = 'user-1';
const DEK_B64 = Buffer.from(new Uint8Array(32).fill(7)).toString('base64');

beforeEach(() => {
  clearDataKey();
  invokeMock.mockReset();
});

describe('no key loaded (fallback mode)', () => {
  it('passes values through unchanged', async () => {
    expect(hasDataKey()).toBe(false);
    expect(await encryptField('hello')).toBe('hello');
    expect(await decryptField('hello')).toBe('hello');
    expect(await encryptJson({ a: 1 })).toEqual({ a: 1 });
  });

  it('initDataKey resolves false when the key service errors', async () => {
    invokeMock.mockResolvedValue({ data: null, error: new Error('down') });
    expect(await initDataKey(USER)).toBe(false);
    expect(hasDataKey()).toBe(false);
  });

  it('initDataKey resolves false when the key service throws', async () => {
    invokeMock.mockRejectedValue(new Error('network'));
    expect(await initDataKey(USER)).toBe(false);
    expect(hasDataKey()).toBe(false);
  });
});

describe('with a key', () => {
  beforeEach(async () => {
    invokeMock.mockResolvedValue({ data: { dek: DEK_B64, keyVersion: 1 }, error: null });
    expect(await initDataKey(USER)).toBe(true);
  });

  it('round-trips a field through the enc1 wire format', async () => {
    const stored = await encryptField('Launch Tacular');
    expect(isEncrypted(stored)).toBe(true);
    expect(stored.split(':')).toHaveLength(3);
    expect(await decryptField(stored)).toBe('Launch Tacular');
  });

  it('uses a random IV per value and never double-encrypts', async () => {
    const a = await encryptField('same text');
    const b = await encryptField('same text');
    expect(a).not.toBe(b);
    expect(await encryptField(a)).toBe(a);
  });

  it('leaves empty and non-string values alone', async () => {
    expect(await encryptField('')).toBe('');
    expect(await encryptField(null)).toBe(null);
    expect(await encryptField(42)).toBe(42);
  });

  it('decryptField passes plaintext through and survives tampering', async () => {
    expect(await decryptField('plain old text')).toBe('plain old text');
    expect(await decryptField(null)).toBe(null);
    const tampered = 'enc1:AAAA:BBBB';
    expect(await decryptField(tampered)).toBe(tampered);
  });

  it('round-trips JSON payloads', async () => {
    const payload = { rows: [{ id: 1, task: 'write tests' }], n: 3 };
    const stored = await encryptJson(payload);
    expect(isEncrypted(stored)).toBe(true);
    expect(await decryptJson(stored)).toEqual(payload);
  });

  it('decryptJson passes real jsonb objects through unchanged', async () => {
    const obj = { legacy: true };
    expect(await decryptJson(obj)).toBe(obj);
    expect(await decryptJson(null)).toBe(null);
  });

  it('encryptWritesEnabled gates on table AND loaded key', async () => {
    expect(encryptWritesEnabled('chip_task_notes')).toBe(true); // key loaded in beforeEach
    expect(encryptWritesEnabled('planner_rows')).toBe(false); // not flipped yet
    clearDataKey(USER);
    expect(encryptWritesEnabled('chip_task_notes')).toBe(false); // no key => plaintext writes
    expect(await initDataKey(USER)).toBe(true); // restore for later tests
  });

  it('clearDataKey returns the module to fallback mode', async () => {
    const stored = await encryptField('secret');
    clearDataKey(USER);
    expect(hasDataKey()).toBe(false);
    expect(await encryptField('secret')).toBe('secret');
    expect(await decryptField(stored)).toBe(stored); // opaque without key
  });
});
