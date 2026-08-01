// On-disk vault for the CLI. Same format shape as the Chrome extension's
// chrome.storage.local layout, but persisted to a filesystem file so the
// CLI has a place to keep keys without needing a running daemon.
//
// File layout: JSON blob at OS-native path, atomic write (temp + rename),
// permissions 0600 on POSIX. The ciphertext fields use the same
// vault-crypto primitives as the extension so a future daemon can share
// this format bidirectionally.

import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { randomBytes } from 'node:crypto';
import type { VaultEntry } from '../shared/types';
import {
  createHeader,
  unlockWithHeader,
  encryptWith,
  decryptWith,
  type VaultHeader,
} from '../crypto/vault-crypto';

export interface VaultFile {
  version: 1;
  header: VaultHeader;
  entries: VaultEntry[];
}

/** OS-native path where the vault lives. Overridable via MOLTYPASS_VAULT. */
export function vaultPath(): string {
  const override = process.env.MOLTYPASS_VAULT;
  if (override) return override;
  const home = process.env.HOME || process.env.USERPROFILE || '.';
  switch (process.platform) {
    case 'darwin':
      return path.join(home, 'Library', 'Application Support', 'Moltypass', 'vault.enc');
    case 'win32':
      return path.join(process.env.APPDATA || home, 'Moltypass', 'vault.enc');
    default:
      return path.join(process.env.XDG_CONFIG_HOME || path.join(home, '.config'), 'moltypass', 'vault.enc');
  }
}

export async function vaultExists(file: string = vaultPath()): Promise<boolean> {
  try {
    const s = await fs.stat(file);
    return s.isFile() && s.size > 0;
  } catch {
    return false;
  }
}

async function ensureDir(file: string): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
}

async function atomicWrite(file: string, contents: string): Promise<void> {
  await ensureDir(file);
  const tmp = file + '.' + randomBytes(6).toString('hex') + '.tmp';
  await fs.writeFile(tmp, contents, { encoding: 'utf8', mode: 0o600 });
  await fs.rename(tmp, file);
  // On some fs the umask overrides the mode; enforce.
  if (process.platform !== 'win32') await fs.chmod(file, 0o600);
}

export async function loadVaultFile(file: string = vaultPath()): Promise<VaultFile | null> {
  try {
    const raw = await fs.readFile(file, 'utf8');
    const parsed = JSON.parse(raw) as VaultFile;
    if (parsed.version !== 1 || !parsed.header || !Array.isArray(parsed.entries)) {
      throw new Error('vault file has unexpected shape');
    }
    return parsed;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw e;
  }
}

export async function saveVaultFile(vault: VaultFile, file: string = vaultPath()): Promise<void> {
  await atomicWrite(file, JSON.stringify(vault, null, 2));
}

/**
 * Initialize a new vault at `file`. Fails if a vault already exists there.
 * Returns the wrapped master key so the caller can proceed to add keys
 * without a second prompt.
 */
export async function initVault(
  password: string,
  file: string = vaultPath(),
): Promise<{ vault: VaultFile; key: CryptoKey }> {
  if (await vaultExists(file)) {
    throw new Error('vault already exists at ' + file);
  }
  const header = await createHeader(password, 'pbkdf2');
  const key = await unlockWithHeader(password, header);
  if (!key) throw new Error('failed to derive key');
  const vault: VaultFile = { version: 1, header, entries: [] };
  await saveVaultFile(vault, file);
  return { vault, key };
}

/**
 * Unlock an existing vault with `password`. Returns the master key + the
 * loaded vault contents. Throws if the vault doesn't exist or the password
 * is wrong.
 */
export async function unlockVault(
  password: string,
  file: string = vaultPath(),
): Promise<{ vault: VaultFile; key: CryptoKey }> {
  const vault = await loadVaultFile(file);
  if (!vault) throw new Error('no vault at ' + file + ' — run `moltypass init` first');
  const key = await unlockWithHeader(password, vault.header);
  if (!key) throw new Error('wrong password');
  return { vault, key };
}

// ---- entry operations (in-memory; caller saves) ----

export async function addEntry(
  vault: VaultFile,
  key: CryptoKey,
  service: string,
  label: string,
  apiKey: string,
  notes?: string,
): Promise<VaultEntry> {
  if (vault.entries.some(e => e.service === service && e.label === label)) {
    throw new Error(service + '/' + label + ' already exists');
  }
  const entry: VaultEntry = {
    id: randomBytes(16).toString('hex'),
    service: service as VaultEntry['service'],
    label,
    ciphertext: await encryptWith(key, apiKey),
    createdAt: 1_700_000_000_000 + vault.entries.length,  // deterministic-ish for tests; overwritten by callers if needed
  };
  if (notes && notes.length > 0) {
    entry.notesCiphertext = await encryptWith(key, notes);
    entry.notesUpdatedAt = entry.createdAt;
  }
  vault.entries.push(entry);
  return entry;
}

export async function removeEntry(vault: VaultFile, id: string): Promise<boolean> {
  const before = vault.entries.length;
  vault.entries = vault.entries.filter(e => e.id !== id);
  return vault.entries.length < before;
}

export async function decryptEntry(entry: VaultEntry, key: CryptoKey): Promise<string> {
  return decryptWith(key, entry.ciphertext);
}

export function findEntry(vault: VaultFile, service: string, label?: string): VaultEntry | undefined {
  const svc = vault.entries.filter(e => e.service === service);
  if (svc.length === 0) return undefined;
  if (label) return svc.find(e => e.label === label);
  if (svc.length === 1) return svc[0];
  // Multiple matches without a label — prefer "default", then "personal", else first.
  return svc.find(e => e.label === 'default') ?? svc.find(e => e.label === 'personal') ?? svc[0];
}
