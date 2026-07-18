// IDB outbox for events queued to the enterprise collector.
//
// Every audit event also lands here when chrome.storage.managed has
// configured enterprise mode. A periodic alarm drains the outbox to
// /api/ingest in batches. On 2xx the queued rows are deleted; on
// failure they stay queued and exponential backoff kicks in. SW-death
// safe: the connection reopens lazily, the seq survives across boots.

import type { AuditEvent } from '../shared/audit-types';

const DB_NAME = 'moltypass.outbox';
const DB_VERSION = 1;
const STORE = 'queued';
const MAX_OUTBOX_ROWS = 10_000;

let pendingOpen: Promise<IDBDatabase> | null = null;

export function __resetForTesting(): void {
  pendingOpen = null;
}

function openDb(): Promise<IDBDatabase> {
  if (pendingOpen) return pendingOpen;
  pendingOpen = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => { pendingOpen = null; reject(req.error ?? new Error('IDB open failed')); };
    req.onblocked = () => { pendingOpen = null; reject(new Error('IDB open blocked')); };
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'seq', autoIncrement: true });
        store.createIndex('by_ts', 'event.ts', { unique: false });
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onclose = () => { pendingOpen = null; };
      db.onversionchange = () => { db.close(); pendingOpen = null; };
      resolve(db);
    };
  });
  return pendingOpen;
}

/** A row in the outbox. seq is the IDB-assigned auto-increment key. */
export interface OutboxRow {
  seq?: number;
  event: AuditEvent;
  enqueuedAt: number;
}

/** Append an event. Returns the assigned seq. Caps the outbox at 10k
 *  rows — oldest are dropped if we'd exceed. Returns the seq of the
 *  newly-enqueued row. */
export async function enqueue(event: AuditEvent, now: number = Date.now()): Promise<number> {
  const db = await openDb();
  const seq = await new Promise<number>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const req = tx.objectStore(STORE).add({ event, enqueuedAt: now } as OutboxRow);
    req.onsuccess = () => resolve(req.result as number);
    req.onerror = () => reject(req.error ?? new Error('enqueue failed'));
  });
  // After insert, check cap and trim if needed. Done in a separate
  // transaction so a slow trim doesn't slow the enqueue write.
  void trimToCap(MAX_OUTBOX_ROWS);
  return seq;
}

/** Read the oldest N rows without removing them. */
export async function peekBatch(limit: number): Promise<OutboxRow[]> {
  const db = await openDb();
  return new Promise<OutboxRow[]>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const store = tx.objectStore(STORE);
    const out: OutboxRow[] = [];
    const cursorReq = store.openCursor();
    cursorReq.onsuccess = () => {
      const cursor = cursorReq.result;
      if (!cursor || out.length >= limit) { resolve(out); return; }
      out.push(cursor.value as OutboxRow);
      cursor.continue();
    };
    cursorReq.onerror = () => reject(cursorReq.error ?? new Error('peek failed'));
  });
}

/** Delete rows up to and including `maxSeq`. Used after a successful
 *  ingest POST. */
export async function deleteUpTo(maxSeq: number): Promise<number> {
  const db = await openDb();
  return new Promise<number>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const range = IDBKeyRange.upperBound(maxSeq);
    const cursorReq = store.openCursor(range);
    let deleted = 0;
    cursorReq.onsuccess = () => {
      const cursor = cursorReq.result;
      if (!cursor) { resolve(deleted); return; }
      cursor.delete();
      deleted++;
      cursor.continue();
    };
    cursorReq.onerror = () => reject(cursorReq.error ?? new Error('deleteUpTo failed'));
  });
}

export async function count(): Promise<number> {
  const db = await openDb();
  return new Promise<number>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('count failed'));
  });
}

/** Drop rows from the oldest until count <= cap. Returns the number
 *  of rows dropped. Exposed for callers who want to enforce the cap
 *  manually (tests, or after a bulk import); enqueue() calls this
 *  automatically. */
export async function trimToCap(cap: number): Promise<number> {
  const total = await count();
  if (total <= cap) return 0;
  const toDrop = total - cap;
  const db = await openDb();
  return new Promise<number>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const cursorReq = store.openCursor();
    let dropped = 0;
    cursorReq.onsuccess = () => {
      const cursor = cursorReq.result;
      if (!cursor || dropped >= toDrop) { resolve(dropped); return; }
      cursor.delete();
      dropped++;
      cursor.continue();
    };
    cursorReq.onerror = () => reject(cursorReq.error ?? new Error('trimToCap failed'));
  });
}

export const __testing = { MAX_OUTBOX_ROWS };
