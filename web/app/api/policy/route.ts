// GET /api/policy — extension fetches the current org policy on a
// periodic tick. The response includes a `version` so the extension
// can short-circuit redownloads on If-None-Match.

import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, policies } from '../../../lib/db';
import { verifyBearer } from '../../../lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await verifyBearer(req.headers.get('authorization'));
  if (!auth) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const row = (
    await db()
      .select({ version: policies.version, config: policies.config })
      .from(policies)
      .where(eq(policies.orgId, auth.orgId))
      .limit(1)
  )[0];

  const etag = `"v${row?.version ?? 0}"`;
  if (req.headers.get('if-none-match') === etag) {
    return new NextResponse(null, { status: 304, headers: { ETag: etag } });
  }

  return NextResponse.json(
    {
      version: row?.version ?? 0,
      policy: row?.config ?? defaultPolicy(),
    },
    { headers: { ETag: etag, 'cache-control': 'private, max-age=0' } },
  );
}

function defaultPolicy() {
  return {
    revealModeAllowed: true,
    forbiddenProviders: [] as string[],
    maxKeyAgeDays: null as number | null,
    retentionDays: 365,
    exportIntervalMs: 5 * 60_000,
    exportBatchSize: 100,
  };
}
