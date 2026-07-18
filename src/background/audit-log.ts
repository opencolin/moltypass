// High-level audit façade. Every caller in the background SW emits
// events through this module — they never touch audit-db.ts directly.
// One thin helper per kind so the call site reads like the intent:
//
//   await auditLog.proxyOk({ origin, keyId, ... });
//   await auditLog.grant({ origin, keyId, grantId, ... });
//
// SAFETY:
// - This module NEVER receives plaintext key bytes. Callers pass a
//   precomputed fingerprint or none at all. The CI grep guard
//   enforces this at build time.
// - Writes are fire-and-forget at the call site (await is used here
//   for testability, but in proxy.ts the await happens AFTER the
//   upstream response is ready, never blocking the hot path).

import type { AuditEvent, AuditEventKind } from '../shared/audit-types';
import type { ProviderId } from '../shared/types';
import { appendEvent } from './audit-db';

interface BaseFields {
  origin?: string;
  service?: ProviderId;
  keyId?: string;
  keyLabel?: string;
  keyFingerprint?: string;
  grantId?: string;
  meta?: Record<string, string | number>;
}

interface ProxyFields extends BaseFields {
  origin: string;
  service: ProviderId;
  status: number;
  pathPreview: string;
  latencyMs: number;
  bytesUp?: number;
  bytesDown?: number;
}

interface GrantFields extends BaseFields {
  origin: string;
  service: ProviderId;
  keyId: string;
  grantId: string;
}

interface RevokeFields extends BaseFields {
  /** Scope of the revoke — informs the meta tag. */
  scope: 'grant' | 'key' | 'origin' | 'global';
}

interface RevealFields extends BaseFields {
  origin: string;
  service: ProviderId;
  keyId: string;
  reason?: string;
}

interface CaptureFields extends BaseFields {
  service: ProviderId;
  keyId: string;
  method: 'create-detector' | 'picker' | 'right-click' | 'paste';
  sourceUrl?: string;
}

interface RotateFields extends BaseFields {
  oldKeyId: string;
  newKeyId: string;
  affectedGrants: number;
}

// ------- Item-mutation fields (v2.1 item-history) -------

interface ItemCreatedFields extends BaseFields {
  service: ProviderId;
  keyId: string;
  keyLabel: string;
  captureMethod: 'create-detector' | 'picker' | 'right-click' | 'paste' | 'mcp';
}

interface ItemRenamedFields extends BaseFields {
  keyId: string;
  oldLabel: string;
  newLabel: string;
}

interface ItemNotesUpdatedFields extends BaseFields {
  keyId: string;
  /** Length of the new notes value (0 = cleared). Content is never in audit. */
  notesLength: number;
  hadNotesBefore: boolean;
}

interface ItemFileAttachedFields extends BaseFields {
  keyId: string;
  /** Attached-file name, not path — e.g. "service-account.json". */
  fileName: string;
  fileSize: number;
}

interface ItemFileRemovedFields extends BaseFields {
  keyId: string;
  fileName: string;
}

interface ItemDeletedFields extends BaseFields {
  keyId: string;
  keyLabel: string;
  service: ProviderId;
}

async function emit(kind: AuditEventKind, source: AuditEvent['source'], fields: BaseFields, extras: Partial<AuditEvent> = {}): Promise<void> {
  const event: AuditEvent = {
    ts: Date.now(),
    kind,
    source,
    ...fields,
    ...extras,
  };
  try {
    await appendEvent(event);
  } catch (err) {
    // Audit writes must not throw into hot paths. Dead-letter path
    // would log here; for now we swallow to honor the invariant.
    // TODO(audit-dlq): wire to a small in-memory ring exposed via
    // popup-handler so the audit dashboard can surface lost events.
    console.warn('[audit] append failed', err);
  }
}

export const auditLog = {
  async proxyOk(f: ProxyFields): Promise<void> {
    await emit('proxy.ok', 'proxy', f, {
      status: f.status,
      pathPreview: f.pathPreview,
      latencyMs: f.latencyMs,
      bytesUp: f.bytesUp,
      bytesDown: f.bytesDown,
    });
  },

  async proxyError(f: ProxyFields & { error?: string }): Promise<void> {
    await emit('proxy.error', 'proxy', f, {
      status: f.status,
      pathPreview: f.pathPreview,
      latencyMs: f.latencyMs,
      bytesUp: f.bytesUp,
      bytesDown: f.bytesDown,
      meta: { ...(f.meta ?? {}), ...(f.error ? { error: f.error.slice(0, 200) } : {}) },
    });
  },

  async grant(f: GrantFields): Promise<void> {
    await emit('grant', 'user', f);
  },

  async revoke(f: RevokeFields): Promise<void> {
    await emit('revoke', 'user', f, {
      meta: { ...(f.meta ?? {}), scope: f.scope },
    });
  },

  async reveal(f: RevealFields): Promise<void> {
    await emit('reveal', 'reveal', f, {
      meta: { ...(f.meta ?? {}), ...(f.reason ? { reason: f.reason.slice(0, 200) } : {}) },
    });
  },

  async capture(f: CaptureFields): Promise<void> {
    await emit('capture', 'capture', f, {
      meta: {
        ...(f.meta ?? {}),
        method: f.method,
        ...(f.sourceUrl ? { sourceUrl: f.sourceUrl.slice(0, 200) } : {}),
      },
    });
  },

  async rotate(f: RotateFields): Promise<void> {
    await emit('rotate.complete', 'user', f, {
      meta: {
        ...(f.meta ?? {}),
        oldKeyId: f.oldKeyId,
        newKeyId: f.newKeyId,
        affectedGrants: f.affectedGrants,
      },
    });
  },

  // ------- Item-mutation events (v2.1 item-history) -------

  async itemCreated(f: ItemCreatedFields): Promise<void> {
    await emit('item.created', 'user', f, {
      meta: { ...(f.meta ?? {}), captureMethod: f.captureMethod },
    });
  },

  async itemRenamed(f: ItemRenamedFields): Promise<void> {
    await emit('item.renamed', 'user', f, {
      meta: {
        ...(f.meta ?? {}),
        oldLabel: f.oldLabel.slice(0, 64),
        newLabel: f.newLabel.slice(0, 64),
      },
    });
  },

  async itemNotesUpdated(f: ItemNotesUpdatedFields): Promise<void> {
    await emit('item.notes_updated', 'user', f, {
      meta: {
        ...(f.meta ?? {}),
        notesLength: f.notesLength,
        hadNotesBefore: f.hadNotesBefore ? 1 : 0,
      },
    });
  },

  async itemFileAttached(f: ItemFileAttachedFields): Promise<void> {
    await emit('item.file_attached', 'user', f, {
      meta: {
        ...(f.meta ?? {}),
        fileName: f.fileName.slice(0, 128),
        fileSize: f.fileSize,
      },
    });
  },

  async itemFileRemoved(f: ItemFileRemovedFields): Promise<void> {
    await emit('item.file_removed', 'user', f, {
      meta: { ...(f.meta ?? {}), fileName: f.fileName.slice(0, 128) },
    });
  },

  async itemDeleted(f: ItemDeletedFields): Promise<void> {
    await emit('item.deleted', 'user', f, {
      meta: {
        ...(f.meta ?? {}),
        keyLabel: f.keyLabel.slice(0, 64),
      },
    });
  },
};
