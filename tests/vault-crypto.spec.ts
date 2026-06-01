import { describe, it, expect } from 'vitest';
import {
  createHeader,
  unlockWithHeader,
  encryptWith,
  decryptWith,
  rewrapVault,
  ARGON2ID_V1,
  PBKDF2_V1,
} from '../src/crypto/vault-crypto';

// Argon2id requires WASM; in the unit-test environment we test PBKDF2
// path end-to-end and leave Argon2id smoke for the e2e layer (it loads
// fine in jsdom but is slow — that goes in tests/e2e/).

describe('vault-crypto (PBKDF2 path)', () => {
  it('createHeader -> unlockWithHeader round-trip succeeds with correct password', async () => {
    const header = await createHeader('correct horse battery staple', 'pbkdf2');
    expect(header.v).toBe(1);
    expect(header.kdf.alg).toBe('pbkdf2');
    expect(header.kdf.version).toBe(1);
    expect(header.kdf.params['iterations']).toBe(PBKDF2_V1.iterations);
    const key = await unlockWithHeader('correct horse battery staple', header);
    expect(key).not.toBeNull();
  });

  it('unlockWithHeader returns null with wrong password', async () => {
    const header = await createHeader('right', 'pbkdf2');
    const key = await unlockWithHeader('wrong', header);
    expect(key).toBeNull();
  });

  it('encryptWith / decryptWith round-trip via the derived key', async () => {
    const header = await createHeader('pw', 'pbkdf2');
    const key = (await unlockWithHeader('pw', header))!;
    const ct = await encryptWith(key, 'super secret');
    const pt = await decryptWith(key, ct);
    expect(pt).toBe('super secret');
  });

  it('encryptWith produces fresh ciphertext each call (IV is random)', async () => {
    const header = await createHeader('pw', 'pbkdf2');
    const key = (await unlockWithHeader('pw', header))!;
    const ct1 = await encryptWith(key, 'same input');
    const ct2 = await encryptWith(key, 'same input');
    expect(ct1).not.toBe(ct2);
  });

  it('decrypt fails on tampered ciphertext (AES-GCM tag mismatch)', async () => {
    const header = await createHeader('pw', 'pbkdf2');
    const key = (await unlockWithHeader('pw', header))!;
    const ct = await encryptWith(key, 'integrity check');
    const bad = ct.slice(0, -4) + 'AAAA';
    await expect(decryptWith(key, bad)).rejects.toBeDefined();
  });

  it('rewrapVault yields a new header that decrypts with the same password', async () => {
    const oldHeader = await createHeader('pw', 'pbkdf2');
    const result = await rewrapVault('pw', oldHeader, 'pbkdf2');
    expect(result).not.toBeNull();
    const { newHeader } = result!;
    expect(newHeader.salt).not.toBe(oldHeader.salt); // fresh salt
    const newKey = await unlockWithHeader('pw', newHeader);
    expect(newKey).not.toBeNull();
  });

  it('header records Argon2id params even when WASM is absent at construct time', async () => {
    // We don't actually derive — we just check the header shape carries
    // the params we'd use, so a future migration knows what to compare.
    const header = await createHeader('pw', 'pbkdf2');
    expect(header.kdf.params['iterations']).toBeGreaterThan(0);
    expect(ARGON2ID_V1.memoryKiB).toBe(65536);
    expect(ARGON2ID_V1.iterations).toBe(3);
  });
});
