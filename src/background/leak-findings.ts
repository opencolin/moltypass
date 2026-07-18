// Storage-backed leak findings.
//
// Council T+1 invariant: findings are advisory; the extension NEVER
// auto-revokes. dismissed findings should not re-spam — they only
// re-fire when the observed measurement grows past the watermark we
// recorded at dismissal time.
//
// One row per (signal, fingerprint, provider) tuple — that's the
// "what" we're warning about. Subsequent observations update the
// existing row's observed/severity rather than creating duplicates.

import type { LeakFinding, LeakSeverity, LeakStatus, LeakSignal } from '../shared/leak-types';
import type { ProviderId } from '../shared/providers';

const STORAGE_KEY = 'moltypass.leak.findings';

export interface FindingInput {
  signal: LeakSignal;
  severity: LeakSeverity;
  provider?: ProviderId;
  fingerprint?: string;
  expected: number;
  observed: number;
  detail: string;
}

export interface RaiseResult {
  /** The finding row that now exists in the store. */
  finding: LeakFinding;
  /** What changed:
   *   'created'      — fresh row (no prior match)
   *   'updated'      — existing open row had its observed bumped
   *   'reactivated'  — prior dismissed row whose observed grew past
   *                    its dismissedWatermark; status flipped open
   *   'suppressed'   — prior dismissed row whose observed has not yet
   *                    grown past the watermark; no-op
   */
  action: 'created' | 'updated' | 'reactivated' | 'suppressed';
}

export interface IdGen {
  newId(): string;
}

const defaultIdGen: IdGen = {
  newId: () => crypto.randomUUID(),
};

/** Raise (or update) a finding. Pure-ish: store is injected. */
export async function raise(
  input: FindingInput,
  now: number = Date.now(),
  idGen: IdGen = defaultIdGen,
): Promise<RaiseResult> {
  const all = await loadAll();
  const matchKey = keyOf(input);
  const existing = all.find(f => keyOf(f) === matchKey);

  if (!existing) {
    const finding: LeakFinding = {
      id: idGen.newId(),
      ...input,
      createdAt: now,
      status: 'open',
    };
    all.push(finding);
    await saveAll(all);
    return { finding, action: 'created' };
  }

  if (existing.status === 'open') {
    existing.observed = input.observed;
    existing.expected = input.expected;
    existing.severity = mergeSeverity(existing.severity, input.severity);
    existing.detail = input.detail;
    await saveAll(all);
    return { finding: existing, action: 'updated' };
  }

  // dismissed — re-fire only when observed grew past the watermark.
  const watermark = existing.dismissedWatermark ?? 0;
  if (input.observed <= watermark) {
    return { finding: existing, action: 'suppressed' };
  }
  existing.status = 'open';
  existing.observed = input.observed;
  existing.expected = input.expected;
  existing.severity = mergeSeverity(existing.severity, input.severity);
  existing.detail = input.detail;
  delete existing.dismissedAt;
  delete existing.dismissedWatermark;
  await saveAll(all);
  return { finding: existing, action: 'reactivated' };
}

export async function listAll(): Promise<LeakFinding[]> {
  return loadAll();
}

export async function listByStatus(status: LeakStatus): Promise<LeakFinding[]> {
  const all = await loadAll();
  return all.filter(f => f.status === status);
}

export async function listOpen(): Promise<LeakFinding[]> {
  return listByStatus('open');
}

export async function dismiss(id: string, now: number = Date.now()): Promise<LeakFinding | null> {
  const all = await loadAll();
  const f = all.find(x => x.id === id);
  if (!f) return null;
  f.status = 'dismissed';
  f.dismissedAt = now;
  f.dismissedWatermark = f.observed;
  await saveAll(all);
  return f;
}

/** Remove ALL findings. For tests + "clear history" UI. */
export async function clear(): Promise<void> {
  await chrome.storage.local.remove(STORAGE_KEY);
}

// ----- internals -----

function keyOf(f: { signal: LeakSignal; fingerprint?: string; provider?: ProviderId }): string {
  return `${f.signal}|${f.provider ?? ''}|${f.fingerprint ?? ''}`;
}

function mergeSeverity(a: LeakSeverity, b: LeakSeverity): LeakSeverity {
  const rank: Record<LeakSeverity, number> = { info: 0, warn: 1, critical: 2 };
  return rank[a] >= rank[b] ? a : b;
}

async function loadAll(): Promise<LeakFinding[]> {
  const res = await chrome.storage.local.get(STORAGE_KEY);
  return (res[STORAGE_KEY] as LeakFinding[] | undefined) ?? [];
}

async function saveAll(findings: LeakFinding[]): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: findings });
}
