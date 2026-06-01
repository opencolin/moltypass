// CSRF protection via the double-submit cookie pattern.
//
// At session creation we mint a random CSRF token, store it in TWO
// places: an HttpOnly=false cookie (so client JS can read it) and we
// expect the client to echo it back in a custom header on every
// mutating request. An attacker page on a different origin cannot
// read our cookie (Same-Origin Policy on document.cookie) and cannot
// set custom headers on a cross-origin form/POST (CORB / SameSite=Lax
// on our cookie also blocks the cookie from going out cross-site for
// top-level POSTs), so the double-submit acts as proof the request
// came from our own page.
//
// Why this over a synchronizer-token pattern (server-side store):
//   - No round-trip on every form render to fetch a fresh token.
//   - No server-side storage; per-session token is enough.
//   - Composes cleanly with the HMAC cookie session: the CSRF cookie
//     value can be deterministically derived from the session sid +
//     a server secret, so verifying CSRF doesn't require an extra
//     DB read. We choose to mint it independently and ship it next
//     to the session cookie for simpler reasoning.
//
// SAFETY:
//   - Constant-time compare on the assert path.
//   - assertCsrf throws (the caller maps to 403) rather than returning
//     a bool — composes with the route handler's early-return pattern.

import { randomBytes, timingSafeEqual } from 'node:crypto';

export const CSRF_COOKIE = 'moltypass.csrf';
export const CSRF_HEADER = 'x-moltypass-csrf';

/** Generate a CSRF token — 16 random bytes, base64url-encoded. */
export function generateCsrfToken(rng: (n: number) => Buffer = randomBytes): string {
  return rng(16).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Constant-time compare; returns true on match. */
export function csrfMatches(headerValue: string | undefined, cookieValue: string | undefined): boolean {
  if (typeof headerValue !== 'string' || typeof cookieValue !== 'string') return false;
  if (headerValue.length === 0 || cookieValue.length === 0) return false;
  if (headerValue.length !== cookieValue.length) return false;
  const a = Buffer.from(headerValue);
  const b = Buffer.from(cookieValue);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Throws CsrfError on any mismatch. Caller maps to 403. */
export class CsrfError extends Error {
  constructor(message = 'CSRF check failed') {
    super(message);
    this.name = 'CsrfError';
  }
}

export function assertCsrf(headerValue: string | undefined, cookieValue: string | undefined): void {
  if (!csrfMatches(headerValue, cookieValue)) throw new CsrfError();
}
