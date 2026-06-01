import { describe, it, expect, vi } from 'vitest';
import {
  generateCsrfToken,
  csrfMatches,
  assertCsrf,
  CsrfError,
  CSRF_COOKIE,
  CSRF_HEADER,
} from '../web/lib/auth/csrf';

describe('generateCsrfToken', () => {
  it('produces a 22-char base64url string (16 random bytes)', () => {
    const t = generateCsrfToken();
    expect(t).toHaveLength(22);
    expect(t).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('is collision-resistant in a 1000-sample test', () => {
    const set = new Set<string>();
    for (let i = 0; i < 1000; i++) set.add(generateCsrfToken());
    expect(set.size).toBe(1000);
  });

  it('honors an injected RNG (deterministic in tests)', () => {
    const rng = vi.fn((_n: number) => Buffer.alloc(16, 0x7));
    const a = generateCsrfToken(rng);
    const b = generateCsrfToken(rng);
    expect(a).toBe(b);
  });
});

describe('csrfMatches', () => {
  it('returns true on exact match', () => {
    const t = generateCsrfToken();
    expect(csrfMatches(t, t)).toBe(true);
  });

  it('returns false on mismatch', () => {
    expect(csrfMatches(generateCsrfToken(), generateCsrfToken())).toBe(false);
  });

  it('returns false when either side is missing', () => {
    expect(csrfMatches(undefined, 'x')).toBe(false);
    expect(csrfMatches('x', undefined)).toBe(false);
    expect(csrfMatches(undefined, undefined)).toBe(false);
  });

  it('returns false on empty strings (defense against empty-cookie attacks)', () => {
    expect(csrfMatches('', '')).toBe(false);
    expect(csrfMatches('', 'x')).toBe(false);
    expect(csrfMatches('x', '')).toBe(false);
  });

  it('returns false when lengths differ (short-circuit before timingSafeEqual)', () => {
    expect(csrfMatches('abcd', 'abcdefgh')).toBe(false);
  });
});

describe('assertCsrf', () => {
  it('returns silently on match', () => {
    const t = generateCsrfToken();
    expect(() => assertCsrf(t, t)).not.toThrow();
  });

  it('throws CsrfError on mismatch', () => {
    expect(() => assertCsrf('a', 'b')).toThrow(CsrfError);
  });

  it('throws CsrfError when either side is missing', () => {
    expect(() => assertCsrf(undefined, 'x')).toThrow(CsrfError);
    expect(() => assertCsrf('x', undefined)).toThrow(CsrfError);
  });

  it('throws CsrfError on empty strings', () => {
    expect(() => assertCsrf('', '')).toThrow(CsrfError);
  });

  it('exposes the cookie and header name constants', () => {
    expect(CSRF_COOKIE).toBe('moltypass.csrf');
    expect(CSRF_HEADER).toBe('x-moltypass-csrf');
  });
});
