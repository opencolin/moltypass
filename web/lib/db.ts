// Schema for the enterprise collector. Stores only metadata — never
// plaintext API keys, never request bodies, only fingerprints and
// per-call counters that an IT admin needs to see what's happening.

import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import {
  bigint,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const organizations = pgTable('organizations', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  plan: text('plan', { enum: ['team', 'enterprise'] }).notNull().default('team'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// Long-lived per-org tokens used by the extension. Stored as SHA-256
// hashes; the raw token is shown once on creation and never again.
export const apiTokens = pgTable(
  'api_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    hash: text('hash').notNull(),
    name: text('name').notNull(),
    scope: text('scope', { enum: ['ingest', 'admin'] }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  t => ({ hashIdx: uniqueIndex('api_tokens_hash_idx').on(t.hash) }),
);

// One row per Chrome profile that has reported events. The deviceUuid is
// generated locally on the extension and never tied to a hardware id.
export const devices = pgTable(
  'devices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    deviceUuid: text('device_uuid').notNull(),
    userEmailHash: text('user_email_hash'), // optional, SHA-256 of email if MDM provides it
    extensionVersion: text('extension_version'),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
  },
  t => ({ uniq: uniqueIndex('devices_org_uuid_idx').on(t.orgId, t.deviceUuid) }),
);

// Audit events. The fingerprint is a salted hash of the plaintext key
// generated client-side — it lets an admin trace a single key across
// rotations and across devices without ever seeing the bytes.
export const auditEvents = pgTable(
  'audit_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    deviceId: uuid('device_id').notNull().references(() => devices.id, { onDelete: 'cascade' }),
    ts: timestamp('ts', { withTimezone: true }).notNull(),
    kind: text('kind').notNull(),
    origin: text('origin'),
    service: text('service'),
    keyId: text('key_id'),
    keyLabel: text('key_label'),
    keyFingerprint: text('key_fingerprint'),
    status: integer('status'),
    pathPreview: text('path_preview'),
    latencyMs: integer('latency_ms'),
    bytesUp: bigint('bytes_up', { mode: 'number' }),
    bytesDown: bigint('bytes_down', { mode: 'number' }),
    source: text('source'),
    meta: jsonb('meta'),
  },
  t => ({
    byOrgTs: index('audit_org_ts_idx').on(t.orgId, t.ts),
    byOrigin: index('audit_org_origin_ts_idx').on(t.orgId, t.origin, t.ts),
    byFingerprint: index('audit_org_fp_ts_idx').on(t.orgId, t.keyFingerprint, t.ts),
    byKind: index('audit_org_kind_ts_idx').on(t.orgId, t.kind, t.ts),
  }),
);

// Policies pushed to devices via the /api/policy endpoint. One row per
// org; bumping `version` causes connected extensions to refetch on next
// tick.
export const policies = pgTable('policies', {
  orgId: uuid('org_id').primaryKey().references(() => organizations.id, { onDelete: 'cascade' }),
  version: integer('version').notNull().default(1),
  config: jsonb('config').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ----- runtime client -----

let _db: ReturnType<typeof drizzle> | null = null;
export function db() {
  if (_db) return _db;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  _db = drizzle(neon(url));
  return _db;
}
