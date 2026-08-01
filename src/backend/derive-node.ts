// Node-crypto helper: derive the vault master key using PBKDF2 and return
// BOTH the raw bytes (for session cache) and a WebCrypto CryptoKey (for
// encrypt/decrypt via subtle). The extension code path uses
// deriveMasterKey which produces non-extractable keys — correct for the
// browser but incompatible with the CLI's session-cache design.

import { pbkdf2 } from 'node:crypto';
import { promisify } from 'node:util';
import type { VaultHeader } from '../crypto/vault-crypto';

const pbkdf2Async = promisify(pbkdf2);

/** Derive raw + extractable CryptoKey. Used only in the CLI backend. */
export async function deriveExtractableKey(
  password: string,
  header: VaultHeader,
): Promise<{ raw: Buffer; key: CryptoKey }> {
  if (header.kdf.alg !== 'pbkdf2') {
    // Argon2id — the WASM path in the extension. Not wired in Node yet.
    throw new Error('Argon2id KDF not supported in the Node backend yet; run `pnpm build`');
  }
  const saltBytes = Buffer.from(header.salt, 'base64');
  const iterations = (header.kdf.params as { iterations: number }).iterations;
  const raw = await pbkdf2Async(password, saltBytes, iterations, 32, 'sha256');
  const key = await crypto.subtle.importKey(
    'raw',
    raw,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt'],
  );
  return { raw, key };
}

/** Import a cached raw hex key into an extractable CryptoKey. */
export async function importRawKey(hex: string): Promise<CryptoKey> {
  if (hex.length !== 64) throw new Error('expected 32-byte hex-encoded key');
  const raw = Buffer.from(hex, 'hex');
  return crypto.subtle.importKey(
    'raw',
    raw,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt'],
  );
}

/** Verify the derived key against the vault canary. */
export async function verifyKey(key: CryptoKey, header: VaultHeader): Promise<boolean> {
  try {
    // header.canary is base64(salt || iv || ciphertext) matching encryptWith format.
    const { decryptWith } = await import('../crypto/vault-crypto');
    const pt = await decryptWith(key, header.canary);
    return pt === 'moltypass-canary-v1';
  } catch {
    return false;
  }
}
