// IndexedDB wrapper for the audit log.
//
// The MV3 service worker can be killed at any time, so this module
// reopens the connection lazily on every entry point. Callers never
// touch IDB directly — they go through audit-log.ts.
//
// Design notes:
// - Object store: 'events' with keyPath 'seq' (autoIncrement). The seq
//   gives a stable cursor for export and pagination.
// - Compound indexes ([field, ts]) support "filter on one field, order
//   by time" queries. Multi-field filters narrow on the most selective
//   index and post-filter in memory.
// - Reads do not block the proxy hot path: failures are logged and
//   surfaced via a dead-letter ring (not implemented here yet).

import { AUDIT_INDEXES, type AuditEvent, type AuditIndexName, type AuditQueryFilter, type AuditQueryOptions, type AuditQueryResult } from '../shared/audit-types';

const DB_NAME = 'moltypass.audit';
const DB_VERSION = 1;
const STORE = 'events';

let pendingOpen: Promise<IDBDatabase> | null = null;

/** Test-only: drop the cached connection so a fresh IDB instance is reopened. */
export function __resetForTesting(): void {
  pendingOpen = null;
}

function openDb(): Promise<IDBDatabase> {
  if (pendingOpen) return pendingOpen;
  pendingOpen = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => {
      pendingOpen = null;
      reject(req.error ?? new Error('IDB open failed'));
    };
    req.onblocked = () => {
      pendingOpen = null;
      reject(new Error('IDB open blocked'));
    };
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'seq', autoIncrement: true });
        store.createIndex(AUDIT_INDEXES.byTs, 'ts', { unique: false });
        store.createIndex(AUDIT_INDEXES.byOriginTs, ['origin', 'ts'], { unique: false });
        store.createIndex(AUDIT_INDEXES.byKeyIdTs, ['keyId', 'ts'], { unique: false });
        store.createIndex(AUDIT_INDEXES.byKeyFingerprintTs, ['keyFingerprint', 'ts'], { unique: false });
        store.createIndex(AUDIT_INDEXES.byKindTs, ['kind', 'ts'], { unique: false });
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      // If the SW is recycled, the next openDb call will see a closed
      // connection — null out pendingOpen on close so we retry.
      db.onclose = () => { pendingOpen = null; };
      db.onversionchange = () => { db.close(); pendingOpen = null; };
      resolve(db);
    };
  });
  return pendingOpen;
}

/** Append a single event. Returns the assigned seq. */
export async function appendEvent(event: AuditEvent): Promise<number> {
  const db = await openDb();
  return new Promise<number>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const req = store.add(event);
    req.onsuccess = () => resolve(req.result as number);
    req.onerror = () => reject(req.error ?? new Error('append failed'));
  });
}

/** Total count, optionally filtered to a single dimension via index. */
export async function count(filter?: { kind?: string; origin?: string }): Promise<number> {
  const db = await openDb();
  return new Promise<number>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const store = tx.objectStore(STORE);
    let req: IDBRequest<number>;
    if (filter?.kind) {
      req = store.index(AUDIT_INDEXES.byKindTs).count(IDBKeyRange.bound([filter.kind, -Infinity], [filter.kind, Infinity]));
    } else if (filter?.origin) {
      req = store.index(AUDIT_INDEXES.byOriginTs).count(IDBKeyRange.bound([filter.origin, -Infinity], [filter.origin, Infinity]));
    } else {
      req = store.count();
    }
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('count failed'));
  });
}

/**
 * Query records. Picks the most selective compound index, walks a
 * cursor, post-filters the rest in memory. Cursor pagination uses
 * the seq as the opaque cursor value.
 */
export async function query(filter: AuditQueryFilter, opts: AuditQueryOptions = {}): Promise<AuditQueryResult> {
  const limit = opts.limit ?? 100;
  const order: 'asc' | 'desc' = opts.order ?? 'desc';
  const db = await openDb();
  const indexName = pickIndex(filter);
  const records: AuditEvent[] = [];
  let nextCursor: string | null = null;

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const store = tx.objectStore(STORE);
    const source: IDBIndex | IDBObjectStore = indexName ? store.index(indexName) : store;
    const direction: IDBCursorDirection = order === 'desc' ? 'prev' : 'next';
    const range = buildKeyRange(filter, indexName);
    const cursorReq = source.openCursor(range, direction);
    // Cursor pagination: skip every primary key <= the opaque cursor
    // (ascending) or >= it (descending). Records strictly after the
    // cursor are collected. Simple, correct, no continuePrimaryKey
    // gymnastics.
    const skipBoundary = opts.cursor ? Number(opts.cursor) : null;
    cursorReq.onsuccess = () => {
      const cursor = cursorReq.result;
      if (!cursor) { resolve(); return; }
      const pk = Number(cursor.primaryKey);
      if (skipBoundary !== null) {
        const past = order === 'asc' ? pk > skipBoundary : pk < skipBoundary;
        if (!past) { cursor.continue(); return; }
      }
      const value = cursor.value as AuditEvent;
      if (matchesPostFilter(value, filter)) {
        records.push(value);
        if (records.length >= limit) {
          nextCursor = String(cursor.primaryKey);
          resolve();
          return;
        }
      }
      cursor.continue();
    };
    cursorReq.onerror = () => reject(cursorReq.error ?? new Error('query failed'));
  });

  return { records, nextCursor };
}

/** Async-iterate every record matching a filter — used by export. */
export async function* iterate(filter: AuditQueryFilter): AsyncGenerator<AuditEvent, void, undefined> {
  let cursor: string | null = null;
  const PAGE = 500;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const opts: AuditQueryOptions = { limit: PAGE, order: 'asc' };
    if (cursor) opts.cursor = cursor;
    const page = await query(filter, opts);
    for (const r of page.records) yield r;
    if (!page.nextCursor) return;
    cursor = page.nextCursor;
  }
}

/** Delete records older than `cutoffMs` (epoch ms). Returns the delete count. */
export async function pruneOlderThan(cutoffMs: number): Promise<number> {
  const db = await openDb();
  return new Promise<number>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const index = store.index(AUDIT_INDEXES.byTs);
    const range = IDBKeyRange.upperBound(cutoffMs, /* open */ true);
    const cursorReq = index.openCursor(range);
    let deleted = 0;
    cursorReq.onsuccess = () => {
      const cursor = cursorReq.result;
      if (!cursor) { resolve(deleted); return; }
      cursor.delete();
      deleted++;
      cursor.continue();
    };
    cursorReq.onerror = () => reject(cursorReq.error ?? new Error('prune failed'));
  });
}

// ----- internals -----

function pickIndex(filter: AuditQueryFilter): AuditIndexName | null {
  // Single-field-equality filters resolve to the matching compound index.
  // When multiple are set, prefer the most selective: keyId > fingerprint
  // > origin > service > kind.
  if (filter.keyIds && filter.keyIds.length === 1) return AUDIT_INDEXES.byKeyIdTs;
  if (filter.fingerprints && filter.fingerprints.length === 1) return AUDIT_INDEXES.byKeyFingerprintTs;
  if (filter.origins && filter.origins.length === 1) return AUDIT_INDEXES.byOriginTs;
  if (filter.kinds && filter.kinds.length === 1) return AUDIT_INDEXES.byKindTs;
  if (filter.tsRange) return AUDIT_INDEXES.byTs;
  return null;
}

function buildKeyRange(filter: AuditQueryFilter, indexName: AuditIndexName | null): IDBKeyRange | null {
  if (!indexName) return null;
  const ts = filter.tsRange ?? {};
  const tsLo = ts.from ?? -Infinity;
  const tsHi = ts.to ?? Infinity;
  switch (indexName) {
    case AUDIT_INDEXES.byTs:
      return IDBKeyRange.bound(tsLo, tsHi);
    case AUDIT_INDEXES.byKeyIdTs:
      return IDBKeyRange.bound([filter.keyIds![0], tsLo], [filter.keyIds![0], tsHi]);
    case AUDIT_INDEXES.byKeyFingerprintTs:
      return IDBKeyRange.bound([filter.fingerprints![0], tsLo], [filter.fingerprints![0], tsHi]);
    case AUDIT_INDEXES.byOriginTs:
      return IDBKeyRange.bound([filter.origins![0], tsLo], [filter.origins![0], tsHi]);
    case AUDIT_INDEXES.byKindTs:
      return IDBKeyRange.bound([filter.kinds![0], tsLo], [filter.kinds![0], tsHi]);
  }
}

function matchesPostFilter(e: AuditEvent, f: AuditQueryFilter): boolean {
  if (f.origins && f.origins.length > 1 && !f.origins.includes(e.origin ?? '')) return false;
  if (f.services && (!e.service || !f.services.includes(e.service))) return false;
  if (f.keyIds && f.keyIds.length > 1 && !f.keyIds.includes(e.keyId ?? '')) return false;
  if (f.fingerprints && f.fingerprints.length > 1 && !f.fingerprints.includes(e.keyFingerprint ?? '')) return false;
  if (f.kinds && f.kinds.length > 1 && !f.kinds.includes(e.kind)) return false;
  if (f.status) {
    const s = e.status ?? -1;
    if (f.status.min !== undefined && s < f.status.min) return false;
    if (f.status.max !== undefined && s > f.status.max) return false;
  }
  if (f.textSearch) {
    const q = f.textSearch.toLowerCase();
    const hay = `${e.origin ?? ''} ${e.keyLabel ?? ''} ${e.pathPreview ?? ''}`.toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}
