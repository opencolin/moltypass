import { describe, it, expect, vi } from 'vitest';
import {
  generateTokenPair,
  saveAndLogPolicy,
  issueAndLogToken,
  revokeAndLogToken,
  type ActionDeps,
  type ActorRef,
  type AdminActionRecord,
} from '../web/lib/actions';
import { createHash } from 'node:crypto';

function fakes() {
  const adminLog: AdminActionRecord[] = [];
  const tokens: Array<{ id: string; orgId: string; name: string; scope: string; hash: string; revoked: boolean }> = [];
  const policies = new Map<string, { config: unknown; version: number }>();
  let nextTokenId = 1;

  const deps: ActionDeps = {
    async savePolicy(orgId, config) {
      const existing = policies.get(orgId);
      const version = (existing?.version ?? 0) + 1;
      policies.set(orgId, { config, version });
      return { version };
    },
    async issueToken({ orgId, name, scope, hash }) {
      const id = `tok-${nextTokenId++}`;
      tokens.push({ id, orgId, name, scope, hash, revoked: false });
      return { id };
    },
    async revokeToken({ tokenId, orgId }) {
      const t = tokens.find(x => x.id === tokenId && x.orgId === orgId);
      if (!t) throw new Error(`token not found: ${tokenId}`);
      t.revoked = true;
    },
    async logAdminAction(rec) {
      adminLog.push(rec);
    },
  };

  return { deps, adminLog, tokens, policies };
}

const adminActor: ActorRef = { kind: 'user', userId: 'u-1' };

describe('generateTokenPair', () => {
  it('produces a raw token with mtp_ prefix', () => {
    const pair = generateTokenPair();
    expect(pair.raw.startsWith('mtp_')).toBe(true);
    expect(pair.prefix).toHaveLength(8); // 'mtp_' + 4 random chars
    expect(pair.prefix).toBe(pair.raw.slice(0, 8));
  });

  it('hash is SHA-256 hex of the raw token', () => {
    const pair = generateTokenPair();
    const expected = createHash('sha256').update(pair.raw).digest('hex');
    expect(pair.hash).toBe(expected);
    expect(pair.hash).toHaveLength(64);
  });

  it('raw and hash differ (the hash is not the raw)', () => {
    const pair = generateTokenPair();
    expect(pair.hash).not.toBe(pair.raw);
  });

  it('honors an injected RNG (deterministic in tests)', () => {
    const rng = vi.fn((_n: number) => Buffer.alloc(24, 0x11));
    const a = generateTokenPair(rng);
    const b = generateTokenPair(rng);
    expect(a.raw).toBe(b.raw);
    expect(a.hash).toBe(b.hash);
  });

  it('1000-sample collision-resistance', () => {
    const set = new Set<string>();
    for (let i = 0; i < 1000; i++) set.add(generateTokenPair().raw);
    expect(set.size).toBe(1000);
  });
});

describe('saveAndLogPolicy', () => {
  it('saves policy, bumps version, logs admin action', async () => {
    const { deps, adminLog, policies } = fakes();
    const res = await saveAndLogPolicy(
      { orgId: 'org-1', actor: adminActor, config: { revealAllowed: false } },
      deps,
    );
    expect(res.version).toBe(1);
    expect(policies.get('org-1')?.config).toEqual({ revealAllowed: false });
    expect(adminLog).toHaveLength(1);
    expect(adminLog[0]).toMatchObject({
      orgId: 'org-1',
      action: 'policy.save',
      targetType: 'policy',
      metadata: { version: 1 },
      actor: { kind: 'user', userId: 'u-1' },
    });
  });

  it('repeated saves increment the version monotonically', async () => {
    const { deps } = fakes();
    expect((await saveAndLogPolicy({ orgId: 'o', actor: adminActor, config: {} }, deps)).version).toBe(1);
    expect((await saveAndLogPolicy({ orgId: 'o', actor: adminActor, config: {} }, deps)).version).toBe(2);
    expect((await saveAndLogPolicy({ orgId: 'o', actor: adminActor, config: {} }, deps)).version).toBe(3);
  });
});

describe('issueAndLogToken', () => {
  it('issues a token, stores HASH (not raw), returns raw + prefix + id', async () => {
    const { deps, tokens, adminLog } = fakes();
    const res = await issueAndLogToken(
      { orgId: 'org-1', actor: adminActor, name: 'ingest-bot', scope: 'ingest' },
      deps,
    );
    expect(res.raw.startsWith('mtp_')).toBe(true);
    expect(res.tokenId).toBe('tok-1');

    expect(tokens).toHaveLength(1);
    expect(tokens[0]!.name).toBe('ingest-bot');
    expect(tokens[0]!.scope).toBe('ingest');
    // CRUCIAL: the stored hash is NOT the raw token.
    expect(tokens[0]!.hash).not.toBe(res.raw);
    expect(tokens[0]!.hash).toBe(createHash('sha256').update(res.raw).digest('hex'));

    // Audit log records the issuance metadata (prefix, not raw).
    expect(adminLog[0]).toMatchObject({
      action: 'token.issue',
      targetType: 'token',
      targetId: 'tok-1',
      metadata: { name: 'ingest-bot', scope: 'ingest', prefix: res.prefix },
    });
    expect(adminLog[0]!.metadata?.['raw']).toBeUndefined();
  });

  it('trims whitespace from the name', async () => {
    const { deps, tokens } = fakes();
    await issueAndLogToken(
      { orgId: 'o', actor: adminActor, name: '  padded  ', scope: 'admin' },
      deps,
    );
    expect(tokens[0]!.name).toBe('padded');
  });

  it('rejects an empty name', async () => {
    const { deps } = fakes();
    await expect(issueAndLogToken(
      { orgId: 'o', actor: adminActor, name: '   ', scope: 'admin' },
      deps,
    )).rejects.toThrow('name is required');
  });

  it('uses the injected RNG for deterministic raw token output', async () => {
    const { deps } = fakes();
    const rng = vi.fn((_n: number) => Buffer.alloc(24, 0x55));
    const a = await issueAndLogToken({ orgId: 'o', actor: adminActor, name: 'a', scope: 'admin' }, deps, rng);
    const b = await issueAndLogToken({ orgId: 'o', actor: adminActor, name: 'b', scope: 'admin' }, deps, rng);
    expect(a.raw).toBe(b.raw);
  });
});

describe('revokeAndLogToken', () => {
  it('marks the token revoked and logs the action', async () => {
    const { deps, tokens, adminLog } = fakes();
    const issued = await issueAndLogToken(
      { orgId: 'o', actor: adminActor, name: 'x', scope: 'ingest' }, deps,
    );
    await revokeAndLogToken({ orgId: 'o', actor: adminActor, tokenId: issued.tokenId }, deps);
    expect(tokens[0]!.revoked).toBe(true);
    expect(adminLog).toHaveLength(2);
    expect(adminLog[1]).toMatchObject({
      action: 'token.revoke',
      targetType: 'token',
      targetId: issued.tokenId,
    });
  });

  it('propagates the underlying revoke error and does NOT log on failure', async () => {
    const { deps, adminLog } = fakes();
    await expect(revokeAndLogToken({ orgId: 'o', actor: adminActor, tokenId: 'nope' }, deps)).rejects.toThrow();
    expect(adminLog).toHaveLength(0);
  });
});
