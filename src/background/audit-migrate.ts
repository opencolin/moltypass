// One-time replay of any legacy chrome.storage.local audit tail into
// the new IDB log. Idempotent via a 'moltypass.audit.migratedV1' flag.
//
// Tolerant of partial / missing / malformed legacy entries — we never
// throw into the SW boot path. Best-effort migration, then mark done.

import type { AuditEvent, AuditEventKind } from '../shared/audit-types';
import { appendEvent } from './audit-db';

const LEGACY_KEY = 'moltypass.audit.tail';
const MIGRATED_FLAG = 'moltypass.audit.migratedV1';

interface LegacyEntry {
  ts?: number;
  kind?: string;
  origin?: string;
  service?: string;
  keyId?: string;
  keyLabel?: string;
  keyFingerprint?: string;
  grantId?: string;
  status?: number;
  pathPreview?: string;
  latencyMs?: number;
  bytesUp?: number;
  bytesDown?: number;
  source?: string;
  meta?: Record<string, string | number>;
  [k: string]: unknown;
}

const VALID_KINDS: ReadonlySet<AuditEventKind> = new Set<AuditEventKind>([
  'proxy.ok', 'proxy.error', 'grant', 'revoke', 'reveal', 'capture', 'rotate.complete', 'leak.suspected', 'leak.dismissed',
]);

const VALID_SOURCES: ReadonlySet<AuditEvent['source']> = new Set<AuditEvent['source']>([
  'proxy', 'reveal', 'capture', 'policy', 'user',
]);

export interface MigrationResult {
  migrated: number;
  skipped: number;
  alreadyDone: boolean;
}

/** Run once at SW startup. Safe to call on every wake — no-op after success. */
export async function replayOnce(): Promise<MigrationResult> {
  const flagResult = await chrome.storage.local.get(MIGRATED_FLAG);
  if (flagResult[MIGRATED_FLAG]) {
    return { migrated: 0, skipped: 0, alreadyDone: true };
  }

  const tailResult = await chrome.storage.local.get(LEGACY_KEY);
  const raw = tailResult[LEGACY_KEY];
  let migrated = 0;
  let skipped = 0;

  if (Array.isArray(raw)) {
    for (const entry of raw as LegacyEntry[]) {
      const event = mapEntry(entry);
      if (!event) {
        skipped++;
        continue;
      }
      try {
        await appendEvent(event);
        migrated++;
      } catch {
        skipped++;
      }
    }
  }

  // Mark migration complete BEFORE attempting to delete the legacy key.
  // If the delete fails the next boot still skips replay (no double-import).
  await chrome.storage.local.set({ [MIGRATED_FLAG]: true });
  // Best-effort cleanup; leave legacy data in place on failure.
  try { await chrome.storage.local.remove(LEGACY_KEY); } catch { /* ignore */ }

  return { migrated, skipped, alreadyDone: false };
}

function mapEntry(entry: LegacyEntry): AuditEvent | null {
  if (typeof entry?.ts !== 'number' || typeof entry?.kind !== 'string') return null;
  if (!VALID_KINDS.has(entry.kind as AuditEventKind)) return null;
  const source = (entry.source && VALID_SOURCES.has(entry.source as AuditEvent['source']))
    ? entry.source as AuditEvent['source']
    : 'proxy';
  const out: AuditEvent = {
    ts: entry.ts,
    kind: entry.kind as AuditEventKind,
    source,
  };
  if (entry.origin) out.origin = String(entry.origin);
  if (entry.service === 'anthropic' || entry.service === 'openai' || entry.service === 'gemini') {
    out.service = entry.service;
  }
  if (entry.keyId) out.keyId = String(entry.keyId);
  if (entry.keyLabel) out.keyLabel = String(entry.keyLabel);
  if (entry.keyFingerprint) out.keyFingerprint = String(entry.keyFingerprint);
  if (entry.grantId) out.grantId = String(entry.grantId);
  if (typeof entry.status === 'number') out.status = entry.status;
  if (entry.pathPreview) out.pathPreview = String(entry.pathPreview);
  if (typeof entry.latencyMs === 'number') out.latencyMs = entry.latencyMs;
  if (typeof entry.bytesUp === 'number') out.bytesUp = entry.bytesUp;
  if (typeof entry.bytesDown === 'number') out.bytesDown = entry.bytesDown;
  if (entry.meta && typeof entry.meta === 'object') out.meta = entry.meta;
  return out;
}

export const __testing = { LEGACY_KEY, MIGRATED_FLAG };
