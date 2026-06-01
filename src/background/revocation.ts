// The revocation epoch and in-flight abort registry.
//
// Council T+1 binding:
//   - The epoch is a single monotonically-increasing integer at
//     chrome.storage.local key "moltypass.revocation.epoch".
//   - Every revoke (per-grant / per-key / per-origin) bumps the epoch
//     AND signals any in-flight AbortControllers it has registered.
//   - proxy.ts reads the epoch BEFORE the upstream fetch and AFTER
//     the response resolves; mismatch throws RevokedError so a call
//     that started before revoke cannot return a response to the
//     page after revoke.
//
// MV3 SW lifecycle:
//   - The AbortController registry is module-scope; it dies when the
//     SW is recycled. That's correct: when the SW dies, fetch dies
//     too. On wake, the epoch is re-read from storage and every new
//     call's pre-fetch check sees the post-revoke epoch.
//   - The epoch's correctness does NOT depend on the registry — the
//     before/after epoch comparison is the durable guarantee.

const STORAGE_KEY = 'moltypass.revocation.epoch';

/** Thrown by proxy.ts when the epoch changed during an upstream call. */
export class RevokedError extends Error {
  constructor(public grantId?: string) {
    super(`Grant revoked${grantId ? ` (${grantId})` : ''}`);
    this.name = 'RevokedError';
  }
}

export async function readEpoch(): Promise<number> {
  const res = await chrome.storage.local.get(STORAGE_KEY);
  const v = res[STORAGE_KEY];
  return typeof v === 'number' ? v : 0;
}

/** Returns the new epoch value. Aborts every in-flight controller as a side effect. */
export async function bumpEpoch(): Promise<number> {
  const current = await readEpoch();
  const next = current + 1;
  await chrome.storage.local.set({ [STORAGE_KEY]: next });
  abortAllInFlight();
  return next;
}

// ----- in-flight controller registry -----

const registry = new Map<string, Set<AbortController>>();

export function registerInFlight(grantId: string, ctrl: AbortController): void {
  let bucket = registry.get(grantId);
  if (!bucket) {
    bucket = new Set();
    registry.set(grantId, bucket);
  }
  bucket.add(ctrl);
}

export function unregisterInFlight(grantId: string, ctrl: AbortController): void {
  const bucket = registry.get(grantId);
  if (!bucket) return;
  bucket.delete(ctrl);
  if (bucket.size === 0) registry.delete(grantId);
}

/** Abort every controller registered for this grantId. */
export function abortGrant(grantId: string): void {
  const bucket = registry.get(grantId);
  if (!bucket) return;
  for (const c of bucket) {
    try { c.abort(); } catch { /* already aborted */ }
  }
  registry.delete(grantId);
}

/** Abort every in-flight controller across all grants. Used by bumpEpoch. */
export function abortAllInFlight(): void {
  for (const bucket of registry.values()) {
    for (const c of bucket) {
      try { c.abort(); } catch { /* already aborted */ }
    }
  }
  registry.clear();
}

/** Number of in-flight controllers currently registered. For tests / debug. */
export function inFlightCount(): number {
  let n = 0;
  for (const b of registry.values()) n += b.size;
  return n;
}

export const __testing = { STORAGE_KEY };
