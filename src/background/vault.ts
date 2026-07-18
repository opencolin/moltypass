// The vault is the only place plaintext API keys live in memory, and only
// while unlocked. Persistence is encrypted blobs in chrome.storage.local.
// MV3 service workers can be torn down at any time, so we re-derive on
// every unlock and idle-lock with chrome.alarms (survives SW restart).

import type { ProviderId, RedactedVaultEntry, VaultEntry } from '../shared/types';
import {
  createHeader,
  unlockWithHeader,
  encryptWith,
  decryptWith,
  type VaultHeader,
} from '../crypto/vault-crypto';

const STORAGE_KEY = 'moltypass.vault';
const LOCK_ALARM = 'moltypass.autolock';
const LOCK_TIMEOUT_MIN = 5;

interface VaultState {
  header?: VaultHeader;
  entries: VaultEntry[];
}

let unlockedKey: CryptoKey | null = null;

export function isUnlocked(): boolean {
  return unlockedKey !== null;
}

export async function isInitialized(): Promise<boolean> {
  const state = await loadState();
  return state.header !== undefined;
}

export async function initialize(password: string): Promise<void> {
  const state = await loadState();
  if (state.header) throw new Error('Vault already initialized');
  // v2.1: PBKDF2 is used unconditionally in tests + fallback when the
  // Argon2id WASM deriver isn't wired. Real builds override this via the
  // security workstream's runtime patch (see PLANS/workstreams/security.md).
  state.header = await createHeader(password, 'pbkdf2');
  await saveState(state);
  unlockedKey = await unlockWithHeader(password, state.header);
  scheduleAutolock();
}

export async function unlock(password: string): Promise<boolean> {
  const state = await loadState();
  if (!state.header) return false;
  const key = await unlockWithHeader(password, state.header);
  if (!key) return false;
  unlockedKey = key;
  scheduleAutolock();
  return true;
}

export function lock(): void {
  unlockedKey = null;
  // chrome.alarms.clear may be missing in bare test environments; guard.
  void chrome.alarms?.clear?.(LOCK_ALARM);
}

export async function touchActivity(): Promise<void> {
  if (unlockedKey) scheduleAutolock();
}

function scheduleAutolock(): void {
  void chrome.alarms?.create?.(LOCK_ALARM, { delayInMinutes: LOCK_TIMEOUT_MIN });
}

// Register once at module load; guarded for test environments.
chrome.alarms?.onAlarm?.addListener(alarm => {
  if (alarm.name === LOCK_ALARM) lock();
});

export async function addKey(
  service: ProviderId,
  label: string,
  apiKey: string,
  notes?: string,
): Promise<RedactedVaultEntry> {
  if (!unlockedKey) throw new Error('Vault is locked');
  const entry: VaultEntry = {
    id: crypto.randomUUID(),
    service,
    label,
    ciphertext: await encryptWith(unlockedKey, apiKey),
    createdAt: Date.now(),
  };
  if (notes && notes.length > 0) {
    entry.notesCiphertext = await encryptWith(unlockedKey, notes);
    entry.notesUpdatedAt = Date.now();
  }
  const state = await loadState();
  state.entries.push(entry);
  await saveState(state);
  return redact(entry);
}

export async function removeKey(id: string): Promise<void> {
  const state = await loadState();
  state.entries = state.entries.filter(e => e.id !== id);
  await saveState(state);
}

export async function getKeyPlaintext(id: string): Promise<string> {
  if (!unlockedKey) throw new Error('Vault is locked');
  scheduleAutolock();
  const state = await loadState();
  const entry = state.entries.find(e => e.id === id);
  if (!entry) throw new Error(`Key not found: ${id}`);
  return decryptWith(unlockedKey, entry.ciphertext);
}

/**
 * Read the notes plaintext for an item. Returns empty string if the item has
 * no notes (legacy entry or explicitly cleared). Requires vault unlocked.
 */
export async function getNotes(id: string): Promise<string> {
  if (!unlockedKey) throw new Error('Vault is locked');
  scheduleAutolock();
  const state = await loadState();
  const entry = state.entries.find(e => e.id === id);
  if (!entry) throw new Error(`Key not found: ${id}`);
  if (!entry.notesCiphertext) return '';
  return decryptWith(unlockedKey, entry.notesCiphertext);
}

/**
 * Set (or clear, if `notes === ''`) the notes on an item. Returns the redacted
 * entry snapshot after the update. Requires vault unlocked.
 */
export async function setNotes(id: string, notes: string): Promise<RedactedVaultEntry> {
  if (!unlockedKey) throw new Error('Vault is locked');
  scheduleAutolock();
  const state = await loadState();
  const entry = state.entries.find(e => e.id === id);
  if (!entry) throw new Error(`Key not found: ${id}`);
  if (notes.length === 0) {
    delete entry.notesCiphertext;
    delete entry.notesUpdatedAt;
  } else {
    entry.notesCiphertext = await encryptWith(unlockedKey, notes);
    entry.notesUpdatedAt = Date.now();
  }
  await saveState(state);
  return redact(entry);
}

export async function listEntries(): Promise<RedactedVaultEntry[]> {
  const state = await loadState();
  return state.entries.map(redact);
}

export async function listEntriesForService(service: ProviderId): Promise<RedactedVaultEntry[]> {
  const all = await listEntries();
  return all.filter(e => e.service === service);
}

function redact(e: VaultEntry): RedactedVaultEntry {
  const { ciphertext: _ciphertext, notesCiphertext, ...rest } = e;
  return { ...rest, hasNotes: notesCiphertext !== undefined };
}

async function loadState(): Promise<VaultState> {
  const res = await chrome.storage.local.get(STORAGE_KEY);
  return (res[STORAGE_KEY] as VaultState | undefined) ?? { entries: [] };
}

async function saveState(state: VaultState): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: state });
}
