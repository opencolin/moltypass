// In-memory sliding-window rate limiter.
//
// Used by /api/auth/magic-link to cap requests-per-IP and per-email,
// stopping enumeration + spam. Pure logic — the route handler injects
// the clock and key resolvers.
//
// Why sliding window over fixed window:
//   - Fixed window allows 2N requests in a 1-second straddle (last
//     half of window N, first half of window N+1).
//   - Sliding window approximates a true rate by considering the
//     overlap of the previous window.
//
// Why in-memory:
//   - Self-host parity. Redis is a heavy dep we don't want to require
//     for OSS users. In-memory is fine for the single-instance Docker
//     image. Multi-instance deployments swap LimiterStore for a
//     Postgres- or Redis-backed implementation.
//
// SAFETY:
//   - The limiter never throws; it returns a typed result. Callers
//     decide what to do on 'denied'.
//   - Keys are pre-bucketed by the route handler (e.g. 'ip:1.2.3.4',
//     'email:alice@b.test'). The limiter does not interpret keys.

export interface LimiterConfig {
  /** Bucket window size in ms. */
  windowMs: number;
  /** Max requests in a window. */
  max: number;
}

export interface LimiterStore {
  /** Returns the count of hits in the last windowMs ending at `now`. */
  hits(key: string, now: number, windowMs: number): number;
  /** Records a hit at `now`. */
  record(key: string, now: number): void;
}

export interface LimitResult {
  allowed: boolean;
  /** How many hits have happened in the current window (inclusive of
   *  the current attempt if allowed). */
  count: number;
  /** Configured max. */
  max: number;
  /** ms until the oldest hit falls out of the window — i.e. when the
   *  next slot opens up. 0 when allowed. */
  retryAfterMs: number;
}

/** Check + (optionally) record. Returns LimitResult — never throws. */
export function check(
  key: string,
  config: LimiterConfig,
  store: LimiterStore,
  opts: { now?: number; record?: boolean } = {},
): LimitResult {
  const now = opts.now ?? Date.now();
  const record = opts.record ?? true;
  const priorHits = store.hits(key, now, config.windowMs);
  if (priorHits >= config.max) {
    return {
      allowed: false,
      count: priorHits,
      max: config.max,
      retryAfterMs: estimateRetryMs(store, key, now, config),
    };
  }
  if (record) store.record(key, now);
  return {
    allowed: true,
    count: priorHits + (record ? 1 : 0),
    max: config.max,
    retryAfterMs: 0,
  };
}

// ----- in-memory store (default) -----

export function createMemoryStore(): LimiterStore & { __clear: () => void } {
  /** key -> sorted timestamps (ms). Older entries are pruned on read. */
  const map = new Map<string, number[]>();

  return {
    hits(key, now, windowMs) {
      const arr = map.get(key);
      if (!arr) return 0;
      const cutoff = now - windowMs;
      // Drop expired entries lazily.
      while (arr.length > 0 && arr[0]! < cutoff) arr.shift();
      if (arr.length === 0) map.delete(key);
      return arr.length;
    },
    record(key, now) {
      const arr = map.get(key) ?? [];
      arr.push(now);
      map.set(key, arr);
    },
    __clear() {
      map.clear();
    },
  };
}

// ----- helpers -----

function estimateRetryMs(store: LimiterStore, key: string, now: number, config: LimiterConfig): number {
  // We can compute exact only if the store exposes timestamps. The
  // generic interface gives us hits(). For the default memory store
  // this is a useful refinement; we expose a faster path when the
  // store provides it via the optional 'oldest' method. Otherwise
  // return windowMs as a conservative ceiling.
  const oldest = (store as LimiterStore & { oldest?: (k: string, n: number, w: number) => number | null })
    .oldest?.(key, now, config.windowMs);
  if (oldest === undefined || oldest === null) return config.windowMs;
  return Math.max(0, oldest + config.windowMs - now);
}

/** A pair of common configurations the route handler uses. */
export const COMMON_LIMITS = {
  magicLinkPerIp: { windowMs: 60_000, max: 5 } as LimiterConfig,
  magicLinkPerEmail: { windowMs: 10 * 60_000, max: 3 } as LimiterConfig,
} as const;
