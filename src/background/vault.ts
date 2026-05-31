// The vault is the only place plaintext API keys live in memory, and only
// while unlocked. Persistence is encrypted blobs in chrome.storage.local.
// MV3 service workers can be torn down at any time, so we re-derive on
// every unlock and idle-lock with chrome.alarms (survives SW restart).

import type { ProviderId, RedactedVaultEntry, VaultEntry } from '../shared/types';
import { decrypt, encrypt } from '../crypto/vault-crypto';

const STORAGE_KEY = 'moltypass.vault';
const LOCK_ALARM = 'moltypass.autolock';
const LOCK_TIMEOUT_MIN = 5;

interface VaultState {
  // A canary blob lets us verify a password without touching real keys.
  canary?: string;
  entries: VaultEntry[];
}

let unlockedPassword: string | null = null;

export function isUnlocked(): boolean {
  return unlockedPassword !== null;
}

export async function isInitialized(): Promise<boolean> {
  const state = await loadState();
  return state.canary !== undefined;
}

export async function initialize(password: string): Promise<void> {
  const state = await loadState();
  if (state.canary) throw new Error('Vault already initialized');
  state.canary = await encrypt('moltypass-canary-v1', password);
  await saveState(state);
  unlockedPassword = password;
  scheduleAutolock();
}

export async function unlock(password: string): Promise<boolean> {
  const state = await loadState();
  if (!state.canary) return false;
  try {
    const decrypted = await decrypt(state.canary, password);
    if (decrypted !== 'moltypass-canary-v1') return false;
    unlockedPassword = password;
    scheduleAutolock();
    return true;
  } catch {
    return false;
  }
}

export function lock(): void {
  unlockedPassword = null;
  void chrome.alarms.clear(LOCK_ALARM);
}

export async function touchActivity(): Promise<void> {
  if (unlockedPassword) scheduleAutolock();
}

function scheduleAutolock(): void {
  // Replaces any existing alarm with the same name.
  void chrome.alarms.create(LOCK_ALARM, { delayInMinutes: LOCK_TIMEOUT_MIN });
}

chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === LOCK_ALARM) lock();
});

export async function addKey(
  service: ProviderId,
  label: string,
  apiKey: string,
): Promise<RedactedVaultEntry> {
  if (!unlockedPassword) throw new Error('Vault is locked');
  const entry: VaultEntry = {
    id: crypto.randomUUID(),
    service,
    label,
    ciphertext: await encrypt(apiKey, unlockedPassword),
    createdAt: Date.now(),
  };
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
  if (!unlockedPassword) throw new Error('Vault is locked');
  scheduleAutolock();
  const state = await loadState();
  const entry = state.entries.find(e => e.id === id);
  if (!entry) throw new Error(`Key not found: ${id}`);
  return decrypt(entry.ciphertext, unlockedPassword);
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
  const { ciphertext: _ciphertext, ...rest } = e;
  return rest;
}

async function loadState(): Promise<VaultState> {
  const res = await chrome.storage.local.get(STORAGE_KEY);
  return (res[STORAGE_KEY] as VaultState | undefined) ?? { entries: [] };
}

async function saveState(state: VaultState): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: state });
}
