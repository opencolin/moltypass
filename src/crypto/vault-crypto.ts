// Vault crypto with a forward-compatible KDF abstraction.
//
// Council T+1 binding: Argon2id (WASM) is the launch KDF, with a
// MANDATORY KDF-version field in the vault header so we can migrate
// users to a future KDF without a flag day. PBKDF2(600k) remains a
// documented fallback if Argon2id WASM cannot load under MV3 CSP.
//
// The header layout (base64 of):
//   { v, kdf: { alg, version, params }, salt, canary }
//
// Where:
//   v             — header schema version (currently 1)
//   kdf.alg       — 'argon2id' | 'pbkdf2'
//   kdf.version   — param-set version per algorithm; bump to migrate
//   kdf.params    — primitive-specific (memoryKiB/iterations/parallelism for Argon2id;
//                   iterations for PBKDF2)
//   salt          — base64, per-vault random
//   canary        — AES-GCM(iv || ct) of the canary plaintext, decryptable
//                   only with the correct master key. Verifies passwords without
//                   touching real key material.

export type KdfAlg = 'argon2id' | 'pbkdf2';

export interface KdfDescriptor {
  alg: KdfAlg;
  version: number;
  params: Record<string, number>;
}

export interface VaultHeader {
  v: 1;
  kdf: KdfDescriptor;
  salt: string;     // base64
  canary: string;   // base64 of (iv || aes-gcm(canary plaintext))
}

const CANARY_PLAINTEXT = 'moltypass-canary-v1';

// Argon2id parameters — pinned, bumped via kdf.version on change.
export const ARGON2ID_V1 = {
  memoryKiB: 64 * 1024, // 64 MB
  iterations: 3,
  parallelism: 1,
} as const;

// PBKDF2 parameters — fallback if Argon2id WASM unreliable.
export const PBKDF2_V1 = {
  iterations: 600_000,
} as const;

const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const KEY_LENGTH_BITS = 256;

// ----- public API -----

/**
 * Derive a master key from a password using the specified KDF descriptor.
 * If kdf.alg === 'argon2id' the caller MUST have lazy-imported the WASM
 * module already via crypto/argon2.ts.
 */
export async function deriveMasterKey(password: string, salt: Uint8Array, kdf: KdfDescriptor): Promise<CryptoKey> {
  if (kdf.alg === 'pbkdf2') {
    return derivePbkdf2(password, salt, kdf.params['iterations'] ?? PBKDF2_V1.iterations);
  }
  if (kdf.alg === 'argon2id') {
    return deriveArgon2id(password, salt, {
      memoryKiB: kdf.params['memoryKiB'] ?? ARGON2ID_V1.memoryKiB,
      iterations: kdf.params['iterations'] ?? ARGON2ID_V1.iterations,
      parallelism: kdf.params['parallelism'] ?? ARGON2ID_V1.parallelism,
    });
  }
  const exhaust: never = kdf.alg;
  throw new Error(`Unknown KDF algorithm: ${exhaust as string}`);
}

/** Initialize a fresh vault header with the default KDF for this build. */
export async function createHeader(password: string, alg: KdfAlg = 'argon2id'): Promise<VaultHeader> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const kdf: KdfDescriptor = alg === 'argon2id'
    ? { alg: 'argon2id', version: 1, params: { ...ARGON2ID_V1 } }
    : { alg: 'pbkdf2',   version: 1, params: { ...PBKDF2_V1 } };
  const key = await deriveMasterKey(password, salt, kdf);
  const canary = await encryptWith(key, CANARY_PLAINTEXT);
  return { v: 1, kdf, salt: bytesToBase64(salt), canary };
}

/** Verify the password by attempting to decrypt the canary. Returns the master key on success. */
export async function unlockWithHeader(password: string, header: VaultHeader): Promise<CryptoKey | null> {
  const salt = base64ToBytes(header.salt);
  const key = await deriveMasterKey(password, salt, header.kdf);
  try {
    const plain = await decryptWith(key, header.canary);
    return plain === CANARY_PLAINTEXT ? key : null;
  } catch {
    return null;
  }
}

/** Encrypt with the master key. Output: base64(iv || ciphertext+tag). */
export async function encryptWith(key: CryptoKey, plaintext: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plaintext)),
  );
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv, 0);
  out.set(ct, iv.length);
  return bytesToBase64(out);
}

export async function decryptWith(key: CryptoKey, ciphertext: string): Promise<string> {
  const bytes = base64ToBytes(ciphertext);
  const iv = bytes.slice(0, IV_LENGTH);
  const ct = bytes.slice(IV_LENGTH);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
  return new TextDecoder().decode(pt);
}

/** Migration helper: derive both old and new master keys for a vault rewrap. */
export async function rewrapVault(
  oldPassword: string,
  oldHeader: VaultHeader,
  newAlg: KdfAlg,
): Promise<{ newHeader: VaultHeader; oldKey: CryptoKey; newKey: CryptoKey } | null> {
  const oldKey = await unlockWithHeader(oldPassword, oldHeader);
  if (!oldKey) return null;
  const newHeader = await createHeader(oldPassword, newAlg);
  const newSalt = base64ToBytes(newHeader.salt);
  const newKey = await deriveMasterKey(oldPassword, newSalt, newHeader.kdf);
  return { newHeader, oldKey, newKey };
}

// ----- KDF implementations -----

async function derivePbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: KEY_LENGTH_BITS },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function deriveArgon2id(_password: string, _salt: Uint8Array, _params: { memoryKiB: number; iterations: number; parallelism: number }): Promise<CryptoKey> {
  // Argon2id is lazy-loaded via crypto/argon2.ts. Stubbed here so the
  // vault-crypto module compiles standalone; the security workstream
  // wires the WASM implementation next.
  throw new Error('Argon2id deriver not yet wired — see crypto/argon2.ts (security workstream T+3 work)');
}

// ----- bytes/base64 helpers -----

function bytesToBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!);
  return btoa(s);
}

function base64ToBytes(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
