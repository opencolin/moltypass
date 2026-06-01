import { describe, it, expect, vi } from 'vitest';
import { issue, verify, hashToken, generateRawToken, type MagicLinkStore, type MagicLinkRecord } from '../web/lib/auth/magic-link';

function makeStore(): MagicLinkStore & { rows: MagicLinkRecord[] } {
  const rows: MagicLinkRecord[] = [];
  return {
    rows,
    async insert({ email, tokenHash, expiresAt }) {
      rows.push({ email, tokenHash, expiresAt, consumedAt: null });
    },
    async consume(tokenHash, now) {
      const row = rows.find(r => r.tokenHash === tokenHash && r.consumedAt === null);
      if (!row) return null;
      if (row.expiresAt.getTime() <= now.getTime()) return null;
      row.consumedAt = now;
      return row;
    },
  };
}

describe('hashToken / generateRawToken', () => {
  it('hashToken is deterministic SHA-256 hex', () => {
    expect(hashToken('abc')).toBe(hashToken('abc'));
    expect(hashToken('abc')).toHaveLength(64);
    expect(hashToken('abc')).not.toBe(hashToken('abd'));
  });

  it('generateRawToken produces a 43-char base64url string (32 random bytes)', () => {
    const t = generateRawToken();
    expect(t).toHaveLength(43);
    expect(t).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('generateRawToken is collision-resistant in a small sample', () => {
    const set = new Set<string>();
    for (let i = 0; i < 1000; i++) set.add(generateRawToken());
    expect(set.size).toBe(1000);
  });
});

describe('issue', () => {
  it('inserts a hashed token and returns the raw token + expiry', async () => {
    const store = makeStore();
    const now = new Date(Date.now());
    const res = await issue('Alice@Example.test', store, { now, ttlMs: 15 * 60_000 });

    expect(res.rawToken).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(res.expiresAt.getTime() - now.getTime()).toBe(15 * 60_000);

    expect(store.rows).toHaveLength(1);
    const row = store.rows[0]!;
    // Email is lowercased + trimmed.
    expect(row.email).toBe('alice@example.test');
    // DB stores the hash, not the raw token.
    expect(row.tokenHash).toBe(hashToken(res.rawToken));
    expect(row.tokenHash).not.toBe(res.rawToken);
  });

  it('rejects an invalid email shape', async () => {
    const store = makeStore();
    await expect(issue('no-at-sign', store)).rejects.toThrow('invalid email');
    expect(store.rows).toHaveLength(0);
  });

  it('uses the injected RNG (deterministic in tests)', async () => {
    const store = makeStore();
    const rng = vi.fn((_n: number) => Buffer.alloc(32, 0x42)); // all 0x42 bytes
    const a = await issue('a@b.test', store, { rng });
    const b = await issue('a@b.test', store, { rng });
    expect(a.rawToken).toBe(b.rawToken);
    expect(rng).toHaveBeenCalledTimes(2);
  });
});

describe('verify', () => {
  it('round-trips an issued token and returns the email', async () => {
    const store = makeStore();
    const now = new Date(Date.now());
    const { rawToken } = await issue('alice@b.test', store, { now });
    const res = await verify(rawToken, store, { now });
    expect(res).toEqual({ email: 'alice@b.test' });
  });

  it('rejects a token that does not match any record', async () => {
    const store = makeStore();
    expect(await verify('bogus', store)).toBeNull();
  });

  it('rejects an empty / non-string token', async () => {
    const store = makeStore();
    expect(await verify('', store)).toBeNull();
    expect(await verify(undefined as unknown as string, store)).toBeNull();
  });

  it('rejects a token that has already been consumed (single-use)', async () => {
    const store = makeStore();
    const now = new Date(Date.now());
    const { rawToken } = await issue('a@b.test', store, { now });
    expect(await verify(rawToken, store, { now })).not.toBeNull();
    expect(await verify(rawToken, store, { now })).toBeNull(); // replay
  });

  it('rejects an expired token even before consume marks it', async () => {
    const store = makeStore();
    const issuedAt = new Date(Date.now());
    await issue('a@b.test', store, { now: issuedAt, ttlMs: 1000 });
    const futureCheck = new Date(issuedAt.getTime() + 5000);
    // The store's consume short-circuits on expiry too, so verify gets null.
    const rawToken = store.rows[0]!.tokenHash; // wrong: hash, not raw. Force the path differently:
    // We can't recover raw token from store; instead, use a fresh issue and advance time.
    expect(rawToken).toBeDefined();
    // Real test: issue a 1ms-TTL token, then check expiry on read.
    const fresh = await issue('z@b.test', store, { now: issuedAt, ttlMs: 1 });
    expect(await verify(fresh.rawToken, store, { now: futureCheck })).toBeNull();
  });

  it('the store layer is what enforces hash lookup, not application-level compare', async () => {
    // A different raw token with a different hash should NOT match an
    // existing record — guard against accidental "any token returns
    // the row" implementations.
    const store = makeStore();
    const now = new Date(Date.now());
    await issue('a@b.test', store, { now });
    const otherRaw = generateRawToken();
    expect(await verify(otherRaw, store, { now })).toBeNull();
  });
});
