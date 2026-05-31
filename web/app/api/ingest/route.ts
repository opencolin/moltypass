// POST /api/ingest — extensions POST batches of audit events here.
// Auth: `Authorization: Bearer <org-ingest-token>`.
//
// Strict validation. We reject any field that looks like raw key
// material — defense in depth against a client bug.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { auditEvents, db, devices } from '../../../lib/db';
import { verifyBearer } from '../../../lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const EventSchema = z.object({
  id: z.string().min(1).max(40),
  ts: z.number().int().nonnegative(),
  kind: z.string().min(1).max(40),
  origin: z.string().max(2048).optional(),
  service: z.enum(['anthropic', 'openai', 'gemini']).optional(),
  keyId: z.string().max(64).optional(),
  keyLabel: z.string().max(64).optional(),
  keyFingerprint: z.string().min(8).max(64).optional(),
  status: z.number().int().min(0).max(599).optional(),
  pathPreview: z.string().max(256).optional(),
  latencyMs: z.number().int().nonnegative().optional(),
  bytesUp: z.number().int().nonnegative().optional(),
  bytesDown: z.number().int().nonnegative().optional(),
  source: z.string().max(32).optional(),
  meta: z.record(z.union([z.string(), z.number()])).optional(),
});

const BodySchema = z.object({
  deviceUuid: z.string().min(8).max(64),
  extensionVersion: z.string().max(32),
  userEmailHash: z.string().length(64).optional(),
  events: z.array(EventSchema).min(1).max(500),
});

export async function POST(req: NextRequest) {
  const auth = await verifyBearer(req.headers.get('authorization'));
  if (!auth || auth.scope !== 'ingest') {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const parsed = BodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid', issues: parsed.error.issues }, { status: 400 });
  }
  const body = parsed.data;

  // Reject the request if any event field looks like raw key material.
  for (const e of body.events) {
    for (const val of [e.pathPreview, e.keyLabel, e.origin]) {
      if (val && looksLikeApiKey(val)) {
        return NextResponse.json({ error: 'rejected_key_material' }, { status: 400 });
      }
    }
  }

  const conn = db();

  // Upsert the device row, get its primary key.
  const deviceRow = await upsertDevice(conn, {
    orgId: auth.orgId,
    deviceUuid: body.deviceUuid,
    extensionVersion: body.extensionVersion,
    userEmailHash: body.userEmailHash,
  });

  await conn.insert(auditEvents).values(
    body.events.map(e => ({
      orgId: auth.orgId,
      deviceId: deviceRow.id,
      ts: new Date(e.ts),
      kind: e.kind,
      origin: e.origin,
      service: e.service,
      keyId: e.keyId,
      keyLabel: e.keyLabel,
      keyFingerprint: e.keyFingerprint,
      status: e.status,
      pathPreview: e.pathPreview,
      latencyMs: e.latencyMs,
      bytesUp: e.bytesUp,
      bytesDown: e.bytesDown,
      source: e.source,
      meta: e.meta ?? null,
    })),
  );

  return NextResponse.json({
    accepted: body.events.length,
    nextPollMs: 5 * 60_000,
  });
}

async function upsertDevice(
  conn: ReturnType<typeof db>,
  d: { orgId: string; deviceUuid: string; extensionVersion: string; userEmailHash?: string },
) {
  const existing = await conn
    .select({ id: devices.id })
    .from(devices)
    .where(and(eq(devices.orgId, d.orgId), eq(devices.deviceUuid, d.deviceUuid)))
    .limit(1);
  if (existing[0]) {
    await conn
      .update(devices)
      .set({ lastSeenAt: new Date(), extensionVersion: d.extensionVersion })
      .where(eq(devices.id, existing[0].id));
    return existing[0];
  }
  const inserted = await conn
    .insert(devices)
    .values({
      orgId: d.orgId,
      deviceUuid: d.deviceUuid,
      extensionVersion: d.extensionVersion,
      userEmailHash: d.userEmailHash,
    })
    .returning({ id: devices.id });
  return inserted[0]!;
}

const KEY_PATTERNS = [/sk-ant-[A-Za-z0-9_-]{12,}/, /sk-[A-Za-z0-9_-]{20,}/, /AIza[A-Za-z0-9_-]{20,}/];
function looksLikeApiKey(s: string): boolean {
  return KEY_PATTERNS.some(p => p.test(s));
}
