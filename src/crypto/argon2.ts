// Argon2id KDF via hash-wasm. Lazy-loaded so the WASM module doesn't
// bloat the SW cold start when the vault is already unlocked.
//
// Council T+1: this is the launch KDF. If WASM cannot load under MV3
// CSP, vault-crypto falls back to PBKDF2 and the failure must be
// surfaced (caller decides) — never silently downgrade.
//
// hash-wasm is the chosen lib: small (~30KB), zero deps, single-file
// import, runs in service-worker context without 'wasm-unsafe-eval'
// when bundled with Vite.

let argon2idImpl: typeof import('hash-wasm').argon2id | null = null;

async function loadArgon2id(): Promise<typeof import('hash-wasm').argon2id> {
  if (argon2idImpl) return argon2idImpl;
  const mod = await import('hash-wasm');
  argon2idImpl = mod.argon2id;
  return argon2idImpl;
}

export interface Argon2idParams {
  memoryKiB: number;     // memory cost — 64 MB default for v1
  iterations: number;    // time cost — 3 default
  parallelism: number;   // 1 (SW is single-threaded)
  hashLength?: number;   // bytes of output — 32 default (AES-256)
}

/** Derive a 32-byte key from password+salt via Argon2id, returned as a CryptoKey for AES-GCM. */
export async function deriveArgon2idKey(
  password: string,
  salt: Uint8Array,
  params: Argon2idParams,
): Promise<CryptoKey> {
  const argon2id = await loadArgon2id();
  const raw = await argon2id({
    password,
    salt,
    parallelism: params.parallelism,
    iterations: params.iterations,
    memorySize: params.memoryKiB,
    hashLength: params.hashLength ?? 32,
    outputType: 'binary',
  });
  // Import the raw bytes as a non-extractable AES-GCM key.
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

/**
 * Capability probe — caller can decide whether to fall back to PBKDF2
 * if Argon2id fails to load (CSP block, WASM disabled, etc.).
 */
export async function isArgon2idAvailable(): Promise<boolean> {
  try {
    await loadArgon2id();
    return true;
  } catch {
    return false;
  }
}
