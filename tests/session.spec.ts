import { describe, it, expect } from 'vitest';
import {
  signPayload,
  verifyPayload,
  mintSession,
  type SessionPayload,
} from '../web/lib/auth/session';

const SECRET = 'unit-test-secret-' + 'A'.repeat(32);
const NOW = 1_700_000_000_000;

function basePayload(overrides: Partial<SessionPayload> = {}): SessionPayload {
  // verifyPayload compares exp against Date.now(), so any fixed exp
  // in the past will be rejected. Use real-time-relative exp for the
  // happy-path cases; tests that intentionally exercise expiry pass
  // an explicit exp in the overrides.
  return {
    userId: 'u-1',
    email: 'alice@example.test',
    exp: Date.now() + 60_000,
    iat: NOW,
    sid: 'sid-x',
    ...overrides,
  };
}

describe('mintSession', () => {
  it('produces a payload with iat/exp/sid populated', () => {
    const { payload, token } = mintSession(
      { userId: 'u-1', email: 'alice@example.test' },
      SECRET,
      { now: NOW, ttlMs: 60_000, sid: 'sid-x' },
    );
    expect(payload.userId).toBe('u-1');
    expect(payload.email).toBe('alice@example.test');
    expect(payload.iat).toBe(NOW);
    expect(payload.exp).toBe(NOW + 60_000);
    expect(payload.sid).toBe('sid-x');
    expect(token).toContain('.');
  });

  it('includes orgId + role when provided', () => {
    const { payload } = mintSession(
      { userId: 'u-1', email: 'a@b.test', orgId: 'org-7', role: 'admin' },
      SECRET,
      { now: NOW, sid: 'x' },
    );
    expect(payload.orgId).toBe('org-7');
    expect(payload.role).toBe('admin');
  });

  it('omits orgId + role when not provided (clean shape)', () => {
    const { payload } = mintSession(
      { userId: 'u-1', email: 'a@b.test' },
      SECRET,
      { now: NOW, sid: 'x' },
    );
    expect(payload.orgId).toBeUndefined();
    expect(payload.role).toBeUndefined();
  });

  it('defaults TTL to 14 days when not provided', () => {
    const { payload } = mintSession(
      { userId: 'u-1', email: 'a@b.test' },
      SECRET,
      { now: NOW, sid: 'x' },
    );
    expect(payload.exp - NOW).toBe(14 * 24 * 60 * 60 * 1000);
  });

  it('mints distinct sids on repeated calls (random sid)', () => {
    const a = mintSession({ userId: 'u', email: 'a@b' }, SECRET, { now: NOW }).payload.sid;
    const b = mintSession({ userId: 'u', email: 'a@b' }, SECRET, { now: NOW }).payload.sid;
    expect(a).not.toBe(b);
    expect(a).toHaveLength(32); // 16 hex bytes
  });
});

describe('signPayload + verifyPayload', () => {
  it('round-trips a valid payload', () => {
    const token = signPayload(basePayload(), SECRET);
    const back = verifyPayload(token, [SECRET]);
    expect(back?.userId).toBe('u-1');
  });

  it('rejects a token signed with the wrong secret', () => {
    const token = signPayload(basePayload(), SECRET);
    expect(verifyPayload(token, ['some-other-secret'])).toBeNull();
  });

  it('accepts during a multi-secret rotation window', () => {
    const tokenOld = signPayload(basePayload(), SECRET);
    // verify accepts either old or new while we rotate.
    expect(verifyPayload(tokenOld, ['new-secret', SECRET])).not.toBeNull();
  });

  it('rejects an expired payload', () => {
    const token = signPayload(basePayload({ exp: Date.now() - 1 }), SECRET);
    expect(verifyPayload(token, [SECRET])).toBeNull();
  });

  it('rejects a malformed token (no dot)', () => {
    expect(verifyPayload('no-dot-here', [SECRET])).toBeNull();
  });

  it('rejects a tampered body even with the same MAC length', () => {
    const original = signPayload(basePayload(), SECRET);
    const [body, mac] = original.split('.');
    const tamperedBody = body!.slice(0, -2) + 'XY';
    expect(verifyPayload(`${tamperedBody}.${mac}`, [SECRET])).toBeNull();
  });

  it('rejects a token whose JSON payload has the wrong shape', async () => {
    const { createHmac } = await import('node:crypto');
    const malformed = JSON.stringify({ userId: 'u' }); // no email/exp/iat/sid
    const body = Buffer.from(malformed).toString('base64')
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const mac = createHmac('sha256', SECRET).update(body).digest()
      .toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    expect(verifyPayload(`${body}.${mac}`, [SECRET])).toBeNull();
  });

  it('rejects when role is invalid', () => {
    const bad = basePayload({ role: 'super-admin' as never });
    const token = signPayload(bad, SECRET);
    expect(verifyPayload(token, [SECRET])).toBeNull();
  });
});
