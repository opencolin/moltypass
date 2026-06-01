// Server actions for the admin dashboard.
//
// All write actions in the dashboard go through this module so that:
//   (1) they are transactional with their admin_actions audit row, and
//   (2) the route handlers stay tiny — they just unmarshal the form,
//       call requirePermission, then dispatch through here.
//
// DI-shaped (ActionDeps) so the orchestrators are testable with a
// fake DB. The production wiring (web/lib/actions/wire.ts in a later
// tick) supplies a deps object backed by drizzle + db().

import { createHash, randomBytes } from 'node:crypto';

// ----- pure token pair helpers (testable) -----

export interface TokenPair {
  /** Returned to the user ONCE in the issuance modal. Never persisted. */
  raw: string;
  /** SHA-256 hex hash; goes into api_tokens.hash. */
  hash: string;
  /** First 8 chars of the raw token, stored alongside the hash for
   *  display in the tokens list ("mtp_AbCd…"). */
  prefix: string;
}

/** 24 random bytes -> base64url. The 'mtp_' prefix signals 'moltypass
 *  bearer' to anyone who finds one in a log file. */
export function generateTokenPair(rng: (n: number) => Buffer = randomBytes): TokenPair {
  const random = rng(24).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const raw = `mtp_${random}`;
  const hash = createHash('sha256').update(raw).digest('hex');
  const prefix = raw.slice(0, 8); // 'mtp_' + first 4 random chars
  return { raw, hash, prefix };
}

// ----- DI surface -----

export type ActorRef =
  | { kind: 'user'; userId: string }
  | { kind: 'token'; tokenId: string };

export interface AdminActionRecord {
  orgId: string;
  actor: ActorRef;
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
}

export interface ActionDeps {
  savePolicy(orgId: string, config: unknown): Promise<{ version: number }>;
  issueToken(args: { orgId: string; name: string; scope: 'ingest' | 'admin'; hash: string }): Promise<{ id: string }>;
  revokeToken(args: { orgId: string; tokenId: string }): Promise<void>;
  logAdminAction(rec: AdminActionRecord): Promise<void>;
}

// ----- orchestrators -----

/** Save policy + bump version + log. Returns the new version so the
 *  RSC page can show it and the extension will see a fresh ETag. */
export async function saveAndLogPolicy(
  args: { orgId: string; actor: ActorRef; config: unknown },
  deps: ActionDeps,
): Promise<{ version: number }> {
  const { version } = await deps.savePolicy(args.orgId, args.config);
  await deps.logAdminAction({
    orgId: args.orgId,
    actor: args.actor,
    action: 'policy.save',
    targetType: 'policy',
    metadata: { version },
  });
  return { version };
}

/** Issue a new bearer token. Returns the raw token (shown once) and
 *  metadata for the success UI. */
export async function issueAndLogToken(
  args: { orgId: string; actor: ActorRef; name: string; scope: 'ingest' | 'admin' },
  deps: ActionDeps,
  rng: (n: number) => Buffer = randomBytes,
): Promise<{ raw: string; prefix: string; tokenId: string }> {
  if (!args.name.trim()) throw new Error('issueToken: name is required');
  const pair = generateTokenPair(rng);
  const { id } = await deps.issueToken({
    orgId: args.orgId,
    name: args.name.trim(),
    scope: args.scope,
    hash: pair.hash,
  });
  await deps.logAdminAction({
    orgId: args.orgId,
    actor: args.actor,
    action: 'token.issue',
    targetType: 'token',
    targetId: id,
    metadata: { name: args.name.trim(), scope: args.scope, prefix: pair.prefix },
  });
  return { raw: pair.raw, prefix: pair.prefix, tokenId: id };
}

/** Mark an existing token revoked + log. */
export async function revokeAndLogToken(
  args: { orgId: string; actor: ActorRef; tokenId: string },
  deps: ActionDeps,
): Promise<void> {
  await deps.revokeToken({ orgId: args.orgId, tokenId: args.tokenId });
  await deps.logAdminAction({
    orgId: args.orgId,
    actor: args.actor,
    action: 'token.revoke',
    targetType: 'token',
    targetId: args.tokenId,
  });
}
