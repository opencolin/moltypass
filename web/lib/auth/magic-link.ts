// Magic-link issue + verify.
//
// Flow:
//   issue(email)
//     -> generate a 32-byte raw token
//     -> store SHA-256(token) + email + TTL in magic_link_tokens
//     -> caller emails the raw token (link with ?token=...) via Resend
//
//   verify(rawToken)
//     -> hash the inbound token
//     -> look up by hash; check expiresAt > now AND consumedAt is null
//     -> mark consumed (single-use); return the email it was issued to
//
// SAFETY:
//   - Raw token NEVER persisted; only the SHA-256 hash sits in the DB.
//   - Hash comparison is via DB index lookup, not application-level
//     compare — Postgres's b-tree comparison is what we rely on, and
//     SHA-256 hash space makes timing attacks against the index moot.
//   - Single-use: consumedAt is set during verify; replays return null.
//   - TTL: enforced both via expiresAt and via the eviction sweep
//     (security workstream v2.1 will add the periodic cleanup).
//   - Rate limiting is OUT OF SCOPE for this module — the route
//     handler that calls issue() owns it (rate.ts in a later tick).

import { createHash, randomBytes } from 'node:crypto';

const RAW_TOKEN_BYTES = 32; // 256-bit, base64url-encoded = 43 chars
const DEFAULT_TTL_MS = 15 * 60 * 1000; // 15 minutes

export interface MagicLinkRecord {
  email: string;
  tokenHash: string;
  expiresAt: Date;
  consumedAt: Date | null;
}

export interface MagicLinkStore {
  insert(record: { email: string; tokenHash: string; expiresAt: Date }): Promise<void>;
  /** Returns the record if hash matches AND consumedAt is still null. */
  consume(tokenHash: string, now: Date): Promise<MagicLinkRecord | null>;
}

export interface IssueResult {
  /** The raw token the caller emails to the user. Never persisted by
   *  this module — caller embeds it in the magic-link URL. */
  rawToken: string;
  expiresAt: Date;
}

/** Pure helper — hash a raw token to its DB-stored form. */
export function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

/** Generate a fresh raw token. base64url-encoded so it lives safely
 *  in a URL query string. */
export function generateRawToken(rng: (n: number) => Buffer = randomBytes): string {
  return rng(RAW_TOKEN_BYTES).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Issue a magic-link token for `email`. Returns the raw token (caller
 *  emails it) and the expiry timestamp. */
export async function issue(
  email: string,
  store: MagicLinkStore,
  opts: { now?: Date; ttlMs?: number; rng?: (n: number) => Buffer } = {},
): Promise<IssueResult> {
  const normalized = email.trim().toLowerCase();
  if (!normalized.includes('@')) throw new Error('issue: invalid email');
  const now = opts.now ?? new Date();
  const ttl = opts.ttlMs ?? DEFAULT_TTL_MS;
  const rawToken = generateRawToken(opts.rng);
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(now.getTime() + ttl);
  await store.insert({ email: normalized, tokenHash, expiresAt });
  return { rawToken, expiresAt };
}

/** Verify a raw token. Returns the email it was issued to, or null on
 *  any failure path (bad token, expired, already consumed). */
export async function verify(
  rawToken: string,
  store: MagicLinkStore,
  opts: { now?: Date } = {},
): Promise<{ email: string } | null> {
  if (!rawToken || typeof rawToken !== 'string') return null;
  const now = opts.now ?? new Date();
  const tokenHash = hashToken(rawToken);
  // consume() is the atomic mark+return: it returns the row only if
  // (a) the hash exists AND (b) it wasn't already consumed AND (c) it
  // hasn't expired. If it returns a row, the row IS now marked
  // consumed — we trust the store and don't re-check consumedAt here
  // (a re-check would always fire since consume just set it).
  const rec = await store.consume(tokenHash, now);
  if (!rec) return null;
  return { email: rec.email };
}
