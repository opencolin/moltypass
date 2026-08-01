import { describe, it, expect } from 'vitest';
import { deriveExtractableKey, importRawKey, verifyKey } from '../src/backend/derive-node';
import { createHeader, encryptWith, decryptWith } from '../src/crypto/vault-crypto';

const PW = 'correct horse battery staple';

describe('deriveExtractableKey', () => {
  it('returns 32 raw bytes + a usable key', async () => {
    const header = await createHeader(PW, 'pbkdf2');
    const { raw, key } = await deriveExtractableKey(PW, header);
    expect(raw.length).toBe(32);
    expect(key).toBeDefined();
  });

  it('the derived key round-trips encrypt/decrypt', async () => {
    const header = await createHeader(PW, 'pbkdf2');
    const { key } = await deriveExtractableKey(PW, header);
    const ct = await encryptWith(key, 'hello');
    const pt = await decryptWith(key, ct);
    expect(pt).toBe('hello');
  });

  it('the derived key verifies against the canary', async () => {
    const header = await createHeader(PW, 'pbkdf2');
    const { key } = await deriveExtractableKey(PW, header);
    expect(await verifyKey(key, header)).toBe(true);
  });

  it('wrong password fails canary verification', async () => {
    const header = await createHeader(PW, 'pbkdf2');
    const { key } = await deriveExtractableKey('not the password', header);
    expect(await verifyKey(key, header)).toBe(false);
  });

  it('rejects Argon2id headers with a clear error', async () => {
    // Fake an Argon2id header — we don't actually call createHeader with argon2id
    // because the deriver isn't wired.
    const fakeHeader = {
      v: 1 as const,
      kdf: { alg: 'argon2id' as const, version: 1, params: { memoryKiB: 1, iterations: 1, parallelism: 1 } },
      salt: Buffer.alloc(16).toString('base64'),
      canary: 'x',
    };
    await expect(deriveExtractableKey(PW, fakeHeader)).rejects.toThrow(/Argon2id/);
  });
});

describe('importRawKey', () => {
  it('round-trips raw bytes through a CryptoKey', async () => {
    const header = await createHeader(PW, 'pbkdf2');
    const { raw, key } = await deriveExtractableKey(PW, header);
    const roundtripKey = await importRawKey(raw.toString('hex'));
    const ct = await encryptWith(key, 'roundtrip');
    const pt = await decryptWith(roundtripKey, ct);
    expect(pt).toBe('roundtrip');
  });

  it('rejects wrong-length hex', async () => {
    await expect(importRawKey('abcdef')).rejects.toThrow(/32-byte/);
  });
});
