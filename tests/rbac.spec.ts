import { describe, it, expect } from 'vitest';
import {
  ROLES,
  PERMISSIONS,
  ROLE_PERMISSIONS,
  can,
  requirePermission,
  ForbiddenError,
  UnauthenticatedError,
  type Role,
  type Permission,
} from '../web/lib/auth/rbac';

describe('permission map invariants', () => {
  it('every role is present in ROLE_PERMISSIONS', () => {
    for (const role of ROLES) {
      expect(ROLE_PERMISSIONS[role]).toBeDefined();
    }
  });

  it('every permission in a role set is in PERMISSIONS (no typos / phantom perms)', () => {
    const known = new Set<Permission>(PERMISSIONS);
    for (const role of ROLES) {
      for (const perm of ROLE_PERMISSIONS[role]) {
        expect(known.has(perm), `${role}: phantom permission ${perm}`).toBe(true);
      }
    }
  });

  it('admin holds every permission (admin is the superset)', () => {
    for (const perm of PERMISSIONS) {
      expect(ROLE_PERMISSIONS.admin.has(perm), `admin missing ${perm}`).toBe(true);
    }
  });

  it('viewer has only read-style permissions (no :write/:revoke/:invite/:remove/:rotate/:dismiss/:create/billing)', () => {
    for (const perm of ROLE_PERMISSIONS.viewer) {
      expect(
        perm.endsWith(':write') ||
        perm.endsWith(':revoke') ||
        perm.endsWith(':invite') ||
        perm.endsWith(':remove') ||
        perm.endsWith(':rotate') ||
        perm.endsWith(':dismiss') ||
        perm.endsWith(':create') ||
        perm.startsWith('billing:'),
        `viewer should not have ${perm}`,
      ).toBe(false);
    }
  });

  it('billing role is restricted to billing:* permissions only', () => {
    for (const perm of ROLE_PERMISSIONS.billing) {
      expect(perm.startsWith('billing:'), `billing has non-billing perm: ${perm}`).toBe(true);
    }
  });

  it('billing role explicitly does NOT have audit:read (council T+1 boundary)', () => {
    expect(ROLE_PERMISSIONS.billing.has('audit:read')).toBe(false);
  });
});

describe('can', () => {
  it('admin can do everything', () => {
    for (const perm of PERMISSIONS) expect(can('admin', perm)).toBe(true);
  });

  it('viewer can read but not mutate', () => {
    expect(can('viewer', 'audit:read')).toBe(true);
    expect(can('viewer', 'grants:read')).toBe(true);
    expect(can('viewer', 'grants:revoke')).toBe(false);
    expect(can('viewer', 'keys:rotate')).toBe(false);
    expect(can('viewer', 'policy:write')).toBe(false);
    expect(can('viewer', 'tokens:create')).toBe(false);
  });

  it('billing has billing:* only, never audit/grants/keys', () => {
    expect(can('billing', 'billing:portal')).toBe(true);
    expect(can('billing', 'billing:checkout')).toBe(true);
    expect(can('billing', 'audit:read')).toBe(false);
    expect(can('billing', 'grants:read')).toBe(false);
    expect(can('billing', 'keys:read')).toBe(false);
  });
});

describe('requirePermission', () => {
  it('returns silently on success', () => {
    expect(() => requirePermission('admin', 'policy:write')).not.toThrow();
    expect(() => requirePermission('viewer', 'audit:read')).not.toThrow();
  });

  it('throws ForbiddenError on insufficient role', () => {
    expect(() => requirePermission('viewer', 'policy:write')).toThrow(ForbiddenError);
    expect(() => requirePermission('billing', 'audit:read')).toThrow(ForbiddenError);
  });

  it('throws UnauthenticatedError on missing role (undefined)', () => {
    expect(() => requirePermission(undefined, 'audit:read')).toThrow(UnauthenticatedError);
  });

  it('error objects carry role + permission for logging', () => {
    try {
      requirePermission('billing', 'audit:read');
      expect.unreachable('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ForbiddenError);
      expect((e as ForbiddenError).role).toBe('billing');
      expect((e as ForbiddenError).perm).toBe('audit:read');
    }
  });
});

describe('regression: explicit role-permission pairs', () => {
  // Spot-check pairs that the council explicitly mentioned, so a
  // future refactor that drops one is loud.
  const PAIRS: Array<[Role, Permission, boolean]> = [
    ['admin', 'policy:write', true],
    ['admin', 'tokens:create', true],
    ['admin', 'members:remove', true],
    ['admin', 'billing:checkout', true],
    ['viewer', 'audit:read', true],
    ['viewer', 'audit:export', true],
    ['viewer', 'policy:read', true],
    ['viewer', 'policy:write', false],
    ['viewer', 'tokens:revoke', false],
    ['billing', 'billing:portal', true],
    ['billing', 'billing:checkout', true],
    ['billing', 'audit:read', false],
    ['billing', 'members:read', false],
  ];
  for (const [role, perm, expected] of PAIRS) {
    it(`${role} ${expected ? 'has' : 'lacks'} ${perm}`, () => {
      expect(can(role, perm)).toBe(expected);
    });
  }
});
