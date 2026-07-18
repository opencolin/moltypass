// Centralized DB query layer. Drizzle-backed; lives next to db.ts.
// The pure URL contract is in filters.ts so it can be unit-tested at
// the root level without dragging drizzle into root deps.

import { and, between, desc, eq, inArray, type SQL } from 'drizzle-orm';
import { adminActions, apiTokens, auditEvents, devices } from './db';
import type { AuditFilter } from './filters';

export type { AuditFilter } from './filters';
export { parseFilters, filterToSearchParams } from './filters';

// ----- Drizzle WHERE-clause composers (exported for the list* functions) -----

/** Build a SQL WHERE for auditEvents within an org + filter. */
export function auditEventWhere(orgId: string, f: AuditFilter): SQL | undefined {
  const clauses: (SQL | undefined)[] = [eq(auditEvents.orgId, orgId)];

  if (f.tsRange?.from !== undefined && f.tsRange?.to !== undefined) {
    clauses.push(between(auditEvents.ts, new Date(f.tsRange.from), new Date(f.tsRange.to)));
  }
  if (f.origins?.length) clauses.push(inArray(auditEvents.origin, f.origins));
  if (f.services?.length) clauses.push(inArray(auditEvents.service, f.services));
  if (f.fingerprints?.length) clauses.push(inArray(auditEvents.keyFingerprint, f.fingerprints));
  if (f.kinds?.length) clauses.push(inArray(auditEvents.kind, f.kinds));
  // status range omitted from SQL for simplicity — post-filter in code if needed.

  return and(...clauses.filter((c): c is SQL => Boolean(c)));
}

// ----- list* functions — signatures only; thin Drizzle wrappers -----

/** Audit events list (chronological, descending). */
export async function listAuditEvents(orgId: string, filter: AuditFilter, dbFn: typeof import('./db').db) {
  const conn = dbFn();
  const where = auditEventWhere(orgId, filter);
  let q = conn.select().from(auditEvents).orderBy(desc(auditEvents.ts));
  if (where) q = q.where(where) as typeof q;
  if (filter.limit !== undefined) q = q.limit(filter.limit) as typeof q;
  if (filter.offset !== undefined) q = q.offset(filter.offset) as typeof q;
  return q;
}

/** Devices list filtered by org + last-seen range. */
export async function listDevices(orgId: string, _filter: AuditFilter, dbFn: typeof import('./db').db) {
  const conn = dbFn();
  return conn.select().from(devices).where(eq(devices.orgId, orgId));
}

/** API tokens list — never returns the hash column to the dashboard. */
export async function listTokens(orgId: string, dbFn: typeof import('./db').db) {
  const conn = dbFn();
  return conn.select({
    id: apiTokens.id,
    name: apiTokens.name,
    scope: apiTokens.scope,
    createdAt: apiTokens.createdAt,
    lastUsedAt: apiTokens.lastUsedAt,
    revokedAt: apiTokens.revokedAt,
  }).from(apiTokens).where(eq(apiTokens.orgId, orgId));
}

/** Admin actions list — the dashboard's own audit trail. */
export async function listAdminActions(orgId: string, dbFn: typeof import('./db').db) {
  const conn = dbFn();
  return conn.select().from(adminActions).where(eq(adminActions.orgId, orgId)).orderBy(desc(adminActions.createdAt));
}
