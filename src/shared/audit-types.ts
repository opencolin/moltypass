// Shared types for the IndexedDB audit log.
//
// Every meaningful background event passes through here: proxy calls,
// grants, revokes, reveals, and capture flow completions. The log is
// the trust spine — the user can see what happened to every key.
//
// INVARIANTS:
// - keyFingerprint is a salted SHA-256 hash, never the key itself.
// - pathPreview is the upstream URL pathname only, never query strings,
//   never headers, never body.
// - meta is small structured strings/numbers, never raw response bytes.
// - The CI grep guard (test-infra) blocks key-shaped strings from
//   landing in audit records via fixtures, console.log, or string
//   concatenation in event construction.

import type { ProviderId } from './types';

export type AuditEventKind =
  | 'proxy.ok'
  | 'proxy.error'
  | 'grant'
  | 'revoke'
  | 'reveal'
  | 'capture'
  | 'rotate.complete'
  | 'leak.suspected'
  | 'leak.dismissed'
  // Item-mutation kinds — added v2.1 for per-item history (MCP item_history tool).
  // These describe changes to a vault item itself, distinct from proxy/consent
  // events which describe how a key was used.
  | 'item.created'
  | 'item.renamed'
  | 'item.notes_updated'
  | 'item.file_attached'
  | 'item.file_removed'
  | 'item.deleted';

/**
 * The event kinds that describe a mutation on a vault item (as opposed to a
 * call using that item, or a consent decision). item_history() filters to
 * this subset.
 */
export const ITEM_MUTATION_KINDS: readonly AuditEventKind[] = [
  'item.created',
  'item.renamed',
  'item.notes_updated',
  'item.file_attached',
  'item.file_removed',
  'item.deleted',
  'rotate.complete',
  'revoke',
] as const;

export interface AuditEvent {
  /** Auto-increment primary key set by audit-db on append. Never set by callers. */
  seq?: number;
  /** ms since epoch. Set by audit-log.ts at append time. */
  ts: number;
  kind: AuditEventKind;
  /** Page origin (sender.origin from MessageSender). Optional for vault-level events. */
  origin?: string;
  service?: ProviderId;
  /** The vault entry id this event references. Survives the key being deleted (denormalized by intent). */
  keyId?: string;
  /** Human label of the key at the time of the event. Denormalized so deletes don't break forensics. */
  keyLabel?: string;
  /**
   * Salted SHA-256 hex prefix of the key plaintext. Lets an admin trace
   * the same key across rotations without seeing it. Salt is per-install.
   */
  keyFingerprint?: string;
  /** Grant this event references, when applicable. */
  grantId?: string;
  /** Upstream HTTP status for proxy events. */
  status?: number;
  /** URL pathname only (no query, no fragment). e.g. "/v1/messages". */
  pathPreview?: string;
  /** Wall-clock ms for proxy events. */
  latencyMs?: number;
  bytesUp?: number;
  bytesDown?: number;
  /**
   * Who produced this event. 'proxy' from upstream call, 'reveal' from
   * reveal-mode consent, 'capture' from key-creation flows, 'policy' from
   * enforcement, 'user' from explicit popup action.
   */
  source: 'proxy' | 'reveal' | 'capture' | 'policy' | 'user';
  /** Small flat metadata. NEVER raw keys, bodies, or response payloads. */
  meta?: Record<string, string | number>;
}

/** Compound-index choices on the audit object store. */
export const AUDIT_INDEXES = {
  byTs: 'by_ts',
  byOriginTs: 'by_origin_ts',
  byKeyIdTs: 'by_keyId_ts',
  byKeyFingerprintTs: 'by_keyFingerprint_ts',
  byKindTs: 'by_kind_ts',
} as const;

export type AuditIndexName = (typeof AUDIT_INDEXES)[keyof typeof AUDIT_INDEXES];

/** Filters for query() — composed in audit-db.ts onto the best-matching compound index. */
export interface AuditQueryFilter {
  origins?: string[];
  services?: ProviderId[];
  keyIds?: string[];
  fingerprints?: string[];
  kinds?: AuditEventKind[];
  status?: { min?: number; max?: number };
  /** ms epoch range; inclusive on both ends. */
  tsRange?: { from?: number; to?: number };
  /** Substring scan over origin + keyLabel + pathPreview, applied AFTER index narrowing. */
  textSearch?: string;
}

export interface AuditQueryOptions {
  /** Maximum records returned. Default 100. */
  limit?: number;
  /** ULID cursor — opaque to callers, produced by previous query() result. */
  cursor?: string;
  /** Descending by ts (default) or ascending. */
  order?: 'asc' | 'desc';
}

export interface AuditQueryResult {
  records: AuditEvent[];
  /** Pass to next query() call to continue. Null when fully drained. */
  nextCursor: string | null;
}

// ----- popup channel message contracts -----

export interface QueryAuditMessage {
  kind: 'query-audit';
  filter: AuditQueryFilter;
  options?: AuditQueryOptions;
}

export interface ExportAuditMessage {
  kind: 'export-audit';
  filter: AuditQueryFilter;
  format: 'json' | 'csv';
}

export type AuditMessage = QueryAuditMessage | ExportAuditMessage;
