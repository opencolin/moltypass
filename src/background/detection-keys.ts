// Per-provider admin "detection key" slot.
//
// Council T+1 invariant: detection keys are admin-scoped credentials
// used ONLY by Signal A (provider-usage polling). They MUST NEVER
// appear in:
//   - the grant flow (consent popup options)
//   - the proxy path (cannot be used to fulfill a website request)
//   - the popup's "Keys" list visible to the user without an explicit
//     "show detection keys" toggle
//
// We store the per-provider mapping (provider -> { keyId, ...poll
// metadata }) in chrome.storage.local. The actual key plaintext lives
// in the vault under that keyId, flagged role:'admin'. role-aware vault
// listings are the responsibility of the vault layer (security
// workstream follow-up); this module only owns the mapping.

import type { ProviderId } from '../shared/providers';
import type { DetectionKeyMeta } from '../shared/leak-types';

const STORAGE_KEY = 'moltypass.leak.detection-keys';

type Meta = Pick<DetectionKeyMeta, 'provider' | 'keyId' | 'addedAt' | 'lastPollAt' | 'lastPollCursor' | 'perKeyCounters'>;

interface AllMeta {
  byProvider: Partial<Record<ProviderId, Meta>>;
}

async function loadAll(): Promise<AllMeta> {
  const res = await chrome.storage.local.get(STORAGE_KEY);
  return (res[STORAGE_KEY] as AllMeta | undefined) ?? { byProvider: {} };
}

async function saveAll(all: AllMeta): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: all });
}

/** Register a vault entry as the provider's detection key. The caller
 *  is responsible for ensuring the underlying vault entry is flagged
 *  role:'admin' so the grant/proxy flows exclude it. */
export async function set(
  provider: ProviderId,
  keyId: string,
  now: number = Date.now(),
): Promise<DetectionKeyMeta> {
  if (!keyId) throw new Error('detection-keys: keyId is required');
  const all = await loadAll();
  const meta: Meta = {
    provider,
    keyId,
    addedAt: now,
    perKeyCounters: {},
  };
  all.byProvider[provider] = meta;
  await saveAll(all);
  return meta as DetectionKeyMeta;
}

/** Return the detection key meta for a provider, or null if unset. */
export async function get(provider: ProviderId): Promise<DetectionKeyMeta | null> {
  const all = await loadAll();
  return (all.byProvider[provider] as DetectionKeyMeta | undefined) ?? null;
}

/** Remove a provider's detection-key registration. */
export async function clear(provider: ProviderId): Promise<void> {
  const all = await loadAll();
  delete all.byProvider[provider];
  await saveAll(all);
}

/** List every provider with a configured detection key. Used by the
 *  popup's settings page + the Signal A poll loop. */
export async function listConfigured(): Promise<DetectionKeyMeta[]> {
  const all = await loadAll();
  return Object.values(all.byProvider).filter((m): m is DetectionKeyMeta => Boolean(m));
}

/** Update poll metadata after a Signal A tick. Atomic — the cursor
 *  only advances after a fully reconciled poll. */
export async function recordPoll(
  provider: ProviderId,
  args: {
    now: number;
    cursor?: string;
    perKeyCounters?: DetectionKeyMeta['perKeyCounters'];
  },
): Promise<DetectionKeyMeta | null> {
  const all = await loadAll();
  const meta = all.byProvider[provider];
  if (!meta) return null;
  meta.lastPollAt = args.now;
  if (args.cursor !== undefined) meta.lastPollCursor = args.cursor;
  if (args.perKeyCounters !== undefined) meta.perKeyCounters = args.perKeyCounters;
  await saveAll(all);
  return meta as DetectionKeyMeta;
}

/** Is this keyId reserved for detection (i.e. role:'admin')? Used by
 *  the grant/proxy flows to reject attempts to use it as a regular key. */
export async function isDetectionKey(keyId: string): Promise<boolean> {
  const all = await loadAll();
  for (const m of Object.values(all.byProvider)) {
    if (m?.keyId === keyId) return true;
  }
  return false;
}
