// Session cache for the CLI. On first `moltypass` command in a shell
// session, the user types their master password. We write the DERIVED
// master key (not the password) as hex to a tmpfs file with mode 0600,
// with an expiry timestamp. Subsequent commands within the expiry
// window read the cached key and skip the prompt.
//
// Trade-offs:
// - The cached key is on disk (tmpfs), not in memory. A future in-process
//   daemon would be strictly better; this is the smallest thing that
//   works without a daemon.
// - File perms 0600 + owned by the current uid. Root can still read.
// - Expiry is checked by the reader, not enforced by the OS.
// - The session file lives under $XDG_RUNTIME_DIR when available
//   (typically tmpfs on Linux), else /tmp on macOS/BSD.

import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

const DEFAULT_TTL_MS = 15 * 60 * 1000;

export interface SessionRecord {
  version: 1;
  /** Hex-encoded 32-byte raw AES key. */
  keyHex: string;
  /** ms epoch when this record expires. */
  expiresAt: number;
  /** Path to the vault this session unlocks. */
  vaultPath: string;
}

/** OS-native path where the session file lives. */
export function sessionPath(): string {
  const override = process.env.MOLTYPASS_SESSION;
  if (override) return override;
  const dir = process.env.XDG_RUNTIME_DIR
    || (process.platform === 'darwin' ? path.join(os.homedir(), 'Library', 'Caches', 'Moltypass') : os.tmpdir());
  const uid = typeof process.getuid === 'function' ? process.getuid() : 0;
  return path.join(dir, 'moltypass-' + uid + '.session');
}

export async function loadSession(vaultFile: string, now: number = Date.now()): Promise<SessionRecord | null> {
  try {
    const raw = await fs.readFile(sessionPath(), 'utf8');
    const parsed = JSON.parse(raw) as SessionRecord;
    if (parsed.version !== 1) return null;
    if (parsed.vaultPath !== vaultFile) return null;
    if (parsed.expiresAt < now) {
      await clearSession().catch(() => {});
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function saveSession(rec: Omit<SessionRecord, 'version'>): Promise<void> {
  const file = sessionPath();
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const full: SessionRecord = { version: 1, ...rec };
  await fs.writeFile(file, JSON.stringify(full), { encoding: 'utf8', mode: 0o600 });
  if (process.platform !== 'win32') await fs.chmod(file, 0o600);
}

export async function clearSession(): Promise<void> {
  await fs.rm(sessionPath(), { force: true });
}

export function defaultExpiry(now: number = Date.now(), ttlMs: number = DEFAULT_TTL_MS): number {
  return now + ttlMs;
}

/** Convert a hex-encoded raw AES-256 key back into a WebCrypto CryptoKey. */
export async function importKeyFromHex(hex: string): Promise<CryptoKey> {
  if (hex.length !== 64) throw new Error('expected 32-byte hex-encoded key');
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return crypto.subtle.importKey('raw', bytes, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

/**
 * Extract the raw bytes from a CryptoKey. Requires the key to be
 * extractable — the caller must have derived a fresh key with the
 * extractable flag set (deriveMasterKey does not).
 *
 * We work around this by ALSO computing the raw bytes at derive time and
 * caching them separately. See `deriveMasterKeyRaw` in vault-crypto-ext.
 */
export async function exportKeyToHex(key: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey('raw', key);
  const view = new Uint8Array(raw);
  let out = '';
  for (const b of view) out += b.toString(16).padStart(2, '0');
  return out;
}
