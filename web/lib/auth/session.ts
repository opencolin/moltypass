// HMAC-signed cookie sessions.
//
// Format: base64url(JSON payload) + '.' + base64url(hmac-sha256(payload))
// — same shape as a JWT minus the header (we have one signing scheme,
// so a header would just be ceremony).
//
// Why HMAC, not JWT, not iron-session:
//   - HMAC is the smallest correct primitive: one secret, no public-key
//     setup, no per-request asymmetric ops, no library surface.
//   - We rotate the secret by issuing a fresh one and accepting both
//     for a grace window (see verifySession's secrets[] arg).
//   - We're not federating tokens to other services — this cookie is
//     read only by the same web app that issued it.
//
// SAFETY:
//   - Constant-time comparison of HMAC bytes.
//   - Mandatory `exp` check; tokens without it are rejected.
//   - The cookie itself is set HttpOnly + Secure + SameSite=Lax by the
//     route handler that wraps this module.

import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto';

export interface SessionPayload {
  userId: string;
  email: string;
  /** Optional — set after the user picks/creates an org. */
  orgId?: string;
  role?: 'admin' | 'viewer' | 'billing';
  /** ms since epoch. Required. */
  exp: number;
  /** ms since epoch. Issued at. Useful for logging. */
  iat: number;
  /** Random per-session id. Lets us add server-side revocation later
   *  without changing the cookie shape. */
  sid: string;
}

export const SESSION_COOKIE = 'moltypass.sess';

const DEFAULT_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

/** Pure helper — sign an arbitrary payload with the given secret. */
export function signPayload(payload: SessionPayload, secret: string): string {
  const body = base64UrlEncode(Buffer.from(JSON.stringify(payload)));
  const mac = base64UrlEncode(hmac(secret, body));
  return `${body}.${mac}`;
}

/** Pure helper — verify and decode. Returns null on any failure (bad
 *  MAC, expired, malformed, wrong shape). Constant-time MAC compare. */
export function verifyPayload(token: string, secrets: string[]): SessionPayload | null {
  const dot = token.indexOf('.');
  if (dot < 1 || dot === token.length - 1) return null;
  const body = token.slice(0, dot);
  const macClaim = token.slice(dot + 1);
  let macClaimBuf: Buffer;
  try {
    macClaimBuf = base64UrlDecode(macClaim);
  } catch {
    return null;
  }

  // Try each accepted secret. Constant-time on each — short-circuiting
  // would leak which secret matched.
  let anyMatch = false;
  for (const s of secrets) {
    const expected = hmac(s, body);
    if (expected.length === macClaimBuf.length && timingSafeEqual(expected, macClaimBuf)) {
      anyMatch = true;
    }
  }
  if (!anyMatch) return null;

  let payload: unknown;
  try {
    payload = JSON.parse(base64UrlDecode(body).toString('utf8'));
  } catch {
    return null;
  }
  if (!isValidShape(payload)) return null;
  if (payload.exp <= Date.now()) return null;
  return payload;
}

/** Mint a session payload + signed cookie value. */
export function mintSession(
  args: { userId: string; email: string; orgId?: string; role?: SessionPayload['role'] },
  secret: string,
  opts: { now?: number; ttlMs?: number; sid?: string } = {},
): { payload: SessionPayload; token: string } {
  const now = opts.now ?? Date.now();
  const ttl = opts.ttlMs ?? DEFAULT_TTL_MS;
  const sid = opts.sid ?? randomBytes(16).toString('hex');
  const payload: SessionPayload = {
    userId: args.userId,
    email: args.email,
    iat: now,
    exp: now + ttl,
    sid,
    ...(args.orgId ? { orgId: args.orgId } : {}),
    ...(args.role ? { role: args.role } : {}),
  };
  return { payload, token: signPayload(payload, secret) };
}

// ----- helpers -----

function hmac(secret: string, body: string): Buffer {
  return createHmac('sha256', secret).update(body).digest();
}

function base64UrlEncode(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(s: string): Buffer {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
}

function isValidShape(x: unknown): x is SessionPayload {
  if (!x || typeof x !== 'object') return false;
  const p = x as Record<string, unknown>;
  if (typeof p['userId'] !== 'string' || !p['userId']) return false;
  if (typeof p['email'] !== 'string' || !p['email']) return false;
  if (typeof p['exp'] !== 'number' || !Number.isFinite(p['exp'])) return false;
  if (typeof p['iat'] !== 'number' || !Number.isFinite(p['iat'])) return false;
  if (typeof p['sid'] !== 'string' || !p['sid']) return false;
  if (p['orgId'] !== undefined && typeof p['orgId'] !== 'string') return false;
  if (p['role'] !== undefined && !['admin', 'viewer', 'billing'].includes(p['role'] as string)) return false;
  return true;
}
