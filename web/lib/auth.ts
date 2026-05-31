// Verify the bearer token an extension sends with each ingest/policy
// call. Tokens are stored as SHA-256 hashes; we hash the inbound token
// and look up the row.

import { eq } from 'drizzle-orm';
import { apiTokens, db, organizations } from './db';

export interface AuthedRequest {
  orgId: string;
  tokenId: string;
  scope: 'ingest' | 'admin';
}

export async function verifyBearer(authHeader: string | null): Promise<AuthedRequest | null> {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const raw = authHeader.slice('Bearer '.length).trim();
  if (!raw) return null;
  const hash = await sha256Hex(raw);
  const rows = await db()
    .select({
      id: apiTokens.id,
      orgId: apiTokens.orgId,
      scope: apiTokens.scope,
      revokedAt: apiTokens.revokedAt,
    })
    .from(apiTokens)
    .where(eq(apiTokens.hash, hash))
    .limit(1);
  const row = rows[0];
  if (!row || row.revokedAt) return null;
  return { orgId: row.orgId, tokenId: row.id, scope: row.scope };
}

export async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}
