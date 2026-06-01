import { describe, it, expect } from 'vitest';
import {
  check,
  createMemoryStore,
  COMMON_LIMITS,
} from '../web/lib/ratelimit';

describe('check + memory store', () => {
  it('allows the first N attempts within the window', () => {
    const store = createMemoryStore();
    const cfg = { windowMs: 60_000, max: 3 };
    expect(check('k', cfg, store, { now: 1_000 }).allowed).toBe(true);
    expect(check('k', cfg, store, { now: 2_000 }).allowed).toBe(true);
    expect(check('k', cfg, store, { now: 3_000 }).allowed).toBe(true);
  });

  it('denies the (max+1)th attempt within the window', () => {
    const store = createMemoryStore();
    const cfg = { windowMs: 60_000, max: 3 };
    for (let i = 0; i < 3; i++) check('k', cfg, store, { now: 1_000 + i });
    const res = check('k', cfg, store, { now: 5_000 });
    expect(res.allowed).toBe(false);
    expect(res.count).toBe(3);
    expect(res.max).toBe(3);
  });

  it('allows again after the window has slid past prior hits', () => {
    const store = createMemoryStore();
    const cfg = { windowMs: 1_000, max: 1 };
    expect(check('k', cfg, store, { now: 100 }).allowed).toBe(true);
    expect(check('k', cfg, store, { now: 200 }).allowed).toBe(false);
    // 1.5 seconds later — the 100ms hit is outside the 1s window.
    expect(check('k', cfg, store, { now: 1_500 }).allowed).toBe(true);
  });

  it('different keys do not share quota', () => {
    const store = createMemoryStore();
    const cfg = { windowMs: 60_000, max: 1 };
    expect(check('k1', cfg, store, { now: 0 }).allowed).toBe(true);
    expect(check('k1', cfg, store, { now: 0 }).allowed).toBe(false);
    expect(check('k2', cfg, store, { now: 0 }).allowed).toBe(true);
  });

  it('record: false performs a dry-run check without consuming quota', () => {
    const store = createMemoryStore();
    const cfg = { windowMs: 60_000, max: 1 };
    // Dry-run: doesn't consume.
    const dry = check('k', cfg, store, { now: 0, record: false });
    expect(dry.allowed).toBe(true);
    // Real check still has full quota.
    expect(check('k', cfg, store, { now: 0 }).allowed).toBe(true);
    expect(check('k', cfg, store, { now: 0 }).allowed).toBe(false);
  });

  it('retryAfterMs is windowMs (ceiling) when the store lacks oldest()', () => {
    const store = createMemoryStore();
    const cfg = { windowMs: 60_000, max: 1 };
    check('k', cfg, store, { now: 0 });
    const denied = check('k', cfg, store, { now: 10_000 });
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterMs).toBe(60_000);
  });

  it('retryAfterMs uses oldest() when the store provides it', () => {
    // Custom store with oldest() that returns the first hit's timestamp.
    const hits = new Map<string, number[]>();
    const store = {
      hits(k: string, now: number, w: number) {
        const arr = hits.get(k) ?? [];
        const cutoff = now - w;
        while (arr.length > 0 && arr[0]! < cutoff) arr.shift();
        if (arr.length === 0) hits.delete(k);
        else hits.set(k, arr);
        return arr.length;
      },
      record(k: string, n: number) {
        const arr = hits.get(k) ?? [];
        arr.push(n);
        hits.set(k, arr);
      },
      oldest(k: string, _n: number, _w: number): number | null {
        const arr = hits.get(k);
        return arr && arr.length > 0 ? arr[0]! : null;
      },
    };
    const cfg = { windowMs: 60_000, max: 1 };
    check('k', cfg, store as any, { now: 0 });
    const denied = check('k', cfg, store as any, { now: 10_000 });
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterMs).toBe(50_000); // 60s window - 10s elapsed
  });

  it('the memory store prunes expired hits lazily', () => {
    const store = createMemoryStore();
    const cfg = { windowMs: 1_000, max: 100 };
    // Record 10 hits at t=0..9, then check at t=2000 (all expired).
    for (let i = 0; i < 10; i++) check('k', cfg, store, { now: i });
    const res = check('k', cfg, store, { now: 2_000 });
    // All prior hits were pruned; only this one counts.
    expect(res.count).toBe(1);
  });
});

describe('COMMON_LIMITS', () => {
  it('exposes magicLinkPerIp = 5/min', () => {
    expect(COMMON_LIMITS.magicLinkPerIp).toEqual({ windowMs: 60_000, max: 5 });
  });

  it('exposes magicLinkPerEmail = 3/10min', () => {
    expect(COMMON_LIMITS.magicLinkPerEmail).toEqual({ windowMs: 600_000, max: 3 });
  });
});
