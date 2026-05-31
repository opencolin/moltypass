// Origin x service permissions. Persisted so SW restarts don't drop them.
// Auto-expires entries with expiresAt in the past on read.

import type { OriginPermission, ProviderId } from '../shared/types';

const STORAGE_KEY = 'moltypass.permissions';

export async function getPermission(
  origin: string,
  service: ProviderId,
): Promise<OriginPermission | null> {
  const all = await loadAll();
  const found = all.find(p => p.origin === origin && p.service === service);
  if (!found) return null;
  if (found.expiresAt && found.expiresAt < Date.now()) {
    await revoke(origin, service);
    return null;
  }
  if (found.callsAllowed !== undefined && found.callsUsed >= found.callsAllowed) {
    await revoke(origin, service);
    return null;
  }
  return found;
}

export async function grant(perm: OriginPermission): Promise<void> {
  const all = await loadAll();
  const filtered = all.filter(p => !(p.origin === perm.origin && p.service === perm.service));
  filtered.push(perm);
  await chrome.storage.local.set({ [STORAGE_KEY]: filtered });
}

export async function recordUsage(
  origin: string,
  service: ProviderId,
  status?: number,
): Promise<void> {
  const all = await loadAll();
  const target = all.find(p => p.origin === origin && p.service === service);
  if (!target) return;
  target.callsUsed += 1;
  target.lastUsedAt = Date.now();
  if (status !== undefined) target.lastStatus = status;
  await chrome.storage.local.set({ [STORAGE_KEY]: all });
}

export async function revoke(origin: string, service: ProviderId): Promise<void> {
  const all = await loadAll();
  const filtered = all.filter(p => !(p.origin === origin && p.service === service));
  await chrome.storage.local.set({ [STORAGE_KEY]: filtered });
}

export async function listForOrigin(origin: string): Promise<OriginPermission[]> {
  const all = await loadAll();
  return all.filter(p => p.origin === origin);
}

export async function listAll(): Promise<OriginPermission[]> {
  return loadAll();
}

async function loadAll(): Promise<OriginPermission[]> {
  const res = await chrome.storage.local.get(STORAGE_KEY);
  return (res[STORAGE_KEY] as OriginPermission[] | undefined) ?? [];
}
