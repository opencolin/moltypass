// Role-based access control.
//
// Council T+1: three roles for the admin dashboard.
//   admin   — full control (all reads + all mutating actions)
//   viewer  — read-only audit access (sees grants, keys, devices,
//             audit events, anomalies; cannot mutate)
//   billing — Stripe portal only (no audit access; can manage
//             subscription)
//
// The permission map is the source of truth. New permissions added to
// the dashboard MUST be added here first, and the test suite asserts
// that every Role explicitly opts in or out of every Permission.

export type Role = 'admin' | 'viewer' | 'billing';
export const ROLES: readonly Role[] = ['admin', 'viewer', 'billing'] as const;

export type Permission =
  // Audit + observability
  | 'audit:read'
  | 'audit:export'
  // Grants (the sharing ledger)
  | 'grants:read'
  | 'grants:revoke'
  // Keys (the fingerprint-grouped view, rotation history)
  | 'keys:read'
  | 'keys:rotate'
  // Devices
  | 'devices:read'
  // Anomalies (leak findings)
  | 'anomalies:read'
  | 'anomalies:dismiss'
  // Policy (MDM payload)
  | 'policy:read'
  | 'policy:write'
  // API tokens (extension ingest bearer tokens)
  | 'tokens:read'
  | 'tokens:create'
  | 'tokens:revoke'
  // Org members + invites
  | 'members:read'
  | 'members:invite'
  | 'members:remove'
  // Billing
  | 'billing:portal'
  | 'billing:checkout';

export const PERMISSIONS: readonly Permission[] = [
  'audit:read', 'audit:export',
  'grants:read', 'grants:revoke',
  'keys:read', 'keys:rotate',
  'devices:read',
  'anomalies:read', 'anomalies:dismiss',
  'policy:read', 'policy:write',
  'tokens:read', 'tokens:create', 'tokens:revoke',
  'members:read', 'members:invite', 'members:remove',
  'billing:portal', 'billing:checkout',
] as const;

/** Authoritative permission map. Each role MUST list every permission
 *  it has — implicit defaults would let new permissions silently fall
 *  through to "everyone has it" or "no one has it". */
export const ROLE_PERMISSIONS: Record<Role, ReadonlySet<Permission>> = {
  admin: new Set<Permission>([
    'audit:read', 'audit:export',
    'grants:read', 'grants:revoke',
    'keys:read', 'keys:rotate',
    'devices:read',
    'anomalies:read', 'anomalies:dismiss',
    'policy:read', 'policy:write',
    'tokens:read', 'tokens:create', 'tokens:revoke',
    'members:read', 'members:invite', 'members:remove',
    'billing:portal', 'billing:checkout',
  ]),
  viewer: new Set<Permission>([
    'audit:read', 'audit:export',
    'grants:read',
    'keys:read',
    'devices:read',
    'anomalies:read',
    'policy:read',
    'tokens:read',
    'members:read',
  ]),
  billing: new Set<Permission>([
    'billing:portal', 'billing:checkout',
    // billing role explicitly does NOT get audit:read — they handle
    // money, not employee credentials. This is a deliberate split per
    // the council's "billing role = Stripe portal only".
  ]),
};

/** Pure predicate: does the given role have the permission? */
export function can(role: Role, perm: Permission): boolean {
  return ROLE_PERMISSIONS[role].has(perm);
}

export class ForbiddenError extends Error {
  constructor(public readonly role: Role, public readonly perm: Permission) {
    super(`Role '${role}' lacks permission '${perm}'`);
    this.name = 'ForbiddenError';
  }
}

export class UnauthenticatedError extends Error {
  constructor() {
    super('Not authenticated');
    this.name = 'UnauthenticatedError';
  }
}

/** Throws UnauthenticatedError if no role, ForbiddenError if role
 *  lacks the permission. Returns silently on success. Caller maps to
 *  401 / 403 respectively. */
export function require_(role: Role | undefined, perm: Permission): void {
  if (!role) throw new UnauthenticatedError();
  if (!can(role, perm)) throw new ForbiddenError(role, perm);
}

// Note: function name is `require_` because `require` is a reserved-ish
// identifier in CommonJS. Re-export with the intended ergonomic name
// for callers who can use it.
export { require_ as requirePermission };
