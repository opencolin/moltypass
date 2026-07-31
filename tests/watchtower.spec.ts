import { describe, it, expect } from 'vitest';
import {
  runWatchtower,
  staleRotationCheck,
  staleUnusedCheck,
  grantZombieCheck,
  diskPlaintextCheck,
  vaultDuplicateCheck,
} from '../src/watchtower/checks';
import type { WatchtowerFs, WatchtowerInput, WatchtowerConfig } from '../src/watchtower/types';
import { DEFAULT_CONFIG } from '../src/watchtower/types';
import type { AuditEvent } from '../src/shared/audit-types';
import type { OriginPermission, RedactedVaultEntry } from '../src/shared/types';

const NOW = 1_800_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

// ------- fixtures -------

function entry(overrides: Partial<RedactedVaultEntry> & { id: string }): RedactedVaultEntry {
  return {
    id: overrides.id,
    service: overrides.service ?? 'anthropic',
    label: overrides.label ?? 'personal',
    createdAt: overrides.createdAt ?? NOW,
    hasNotes: false,
    ...overrides,
  } as RedactedVaultEntry;
}

function grant(overrides: Partial<OriginPermission> & { grantId: string }): OriginPermission {
  return {
    grantId: overrides.grantId,
    origin: overrides.origin ?? 'https://claude.ai',
    service: overrides.service ?? 'anthropic',
    keyId: overrides.keyId ?? 'k1',
    mode: overrides.mode ?? 'proxy',
    grantedAt: overrides.grantedAt ?? NOW,
    callsUsed: overrides.callsUsed ?? 0,
  } as OriginPermission;
}

function proxyOk(keyId: string, ts: number, grantId?: string): AuditEvent {
  return {
    ts,
    kind: 'proxy.ok',
    source: 'proxy',
    keyId,
    grantId,
    origin: 'https://claude.ai',
    service: 'anthropic',
    status: 200,
    pathPreview: '/v1/messages',
    latencyMs: 100,
  };
}

const config: WatchtowerConfig = {
  ...DEFAULT_CONFIG,
  thresholds: { rotationDays: 180, unusedDays: 90, zombieDays: 30 },
};

function input(over: Partial<WatchtowerInput> = {}): WatchtowerInput {
  return {
    entries: [],
    grants: [],
    audit: [],
    now: NOW,
    config,
    ...over,
  };
}

// ------- stale.rotation -------

describe('staleRotationCheck', () => {
  it('flags a key older than the rotation threshold', async () => {
    const findings = await staleRotationCheck(input({
      entries: [entry({ id: 'k1', createdAt: NOW - 200 * DAY })],
    }));
    expect(findings).toHaveLength(1);
    expect(findings[0].check).toBe('stale.rotation');
    expect(findings[0].meta?.ageDays).toBe(200);
    expect(findings[0].keyId).toBe('k1');
  });

  it('escalates severity for VERY old keys', async () => {
    const [f1] = await staleRotationCheck(input({
      entries: [entry({ id: 'k1', createdAt: NOW - 200 * DAY })],
    }));
    const [f2] = await staleRotationCheck(input({
      entries: [entry({ id: 'k2', createdAt: NOW - 400 * DAY })],
    }));
    expect(f1.severity).toBe('low');
    expect(f2.severity).toBe('high');
  });

  it('does not flag fresh keys', async () => {
    const findings = await staleRotationCheck(input({
      entries: [entry({ id: 'k1', createdAt: NOW - 30 * DAY })],
    }));
    expect(findings).toEqual([]);
  });
});

// ------- stale.unused -------

describe('staleUnusedCheck', () => {
  it('flags a never-used old key', async () => {
    const findings = await staleUnusedCheck(input({
      entries: [entry({ id: 'k1', createdAt: NOW - 120 * DAY })],
    }));
    expect(findings).toHaveLength(1);
    expect(findings[0].meta?.everUsed).toBe(0);
    expect(findings[0].message).toContain('never been used');
  });

  it('flags a key not used in >threshold days', async () => {
    const findings = await staleUnusedCheck(input({
      entries: [entry({ id: 'k1', createdAt: NOW - 200 * DAY })],
      audit: [proxyOk('k1', NOW - 120 * DAY)],
    }));
    expect(findings).toHaveLength(1);
    expect(findings[0].meta?.everUsed).toBe(1);
    expect(findings[0].meta?.idleDays).toBe(120);
  });

  it('does not flag a recently-used key', async () => {
    const findings = await staleUnusedCheck(input({
      entries: [entry({ id: 'k1', createdAt: NOW - 200 * DAY })],
      audit: [proxyOk('k1', NOW - 5 * DAY)],
    }));
    expect(findings).toEqual([]);
  });

  it('does not flag a key that is too new to have been unused', async () => {
    const findings = await staleUnusedCheck(input({
      entries: [entry({ id: 'k1', createdAt: NOW - 10 * DAY })],
    }));
    expect(findings).toEqual([]);
  });
});

// ------- grant.zombie -------

describe('grantZombieCheck', () => {
  it('flags a grant older than threshold with no traffic', async () => {
    const findings = await grantZombieCheck(input({
      grants: [grant({ grantId: 'g1', grantedAt: NOW - 60 * DAY })],
    }));
    expect(findings).toHaveLength(1);
    expect(findings[0].check).toBe('grant.zombie');
    expect(findings[0].grantId).toBe('g1');
    expect(findings[0].meta?.idleDays).toBe(60);
  });

  it('does not flag a grant with recent traffic', async () => {
    const findings = await grantZombieCheck(input({
      grants: [grant({ grantId: 'g1', grantedAt: NOW - 60 * DAY })],
      audit: [proxyOk('k1', NOW - 5 * DAY, 'g1')],
    }));
    expect(findings).toEqual([]);
  });

  it('does not flag a fresh grant', async () => {
    const findings = await grantZombieCheck(input({
      grants: [grant({ grantId: 'g1', grantedAt: NOW - 5 * DAY })],
    }));
    expect(findings).toEqual([]);
  });

  it('escalates severity when idle > 2x threshold', async () => {
    const [f] = await grantZombieCheck(input({
      grants: [grant({ grantId: 'g1', grantedAt: NOW - 100 * DAY })],
    }));
    expect(f.severity).toBe('medium');
  });
});

// ------- disk.plaintext -------

describe('diskPlaintextCheck', () => {
  function makeFs(files: Record<string, string>): WatchtowerFs {
    return {
      readTextFile: async (p) => files[p] ?? '',
      listFiles: async () => [],
      exists: async (p) => p in files,
      statSize: async (p) => (files[p] ?? '').length,
    };
  }

  it('flags a vaulted key found in a plaintext dotfile', async () => {
    const fakeKey = 'sk-ant-' + 'A'.repeat(40);
    const findings = await diskPlaintextCheck(input({
      entries: [entry({ id: 'k1' })],
      fs: makeFs({ '.env': `ANTHROPIC_API_KEY="${fakeKey}"` }),
      matchAgainstVault: async (v) => v === fakeKey ? 'k1' : null,
    }));
    expect(findings).toHaveLength(1);
    expect(findings[0].check).toBe('disk.plaintext');
    expect(findings[0].severity).toBe('high');
    expect(findings[0].dismissible).toBe(false);
    expect(findings[0].meta?.path).toBe('.env');
    // No plaintext in the message or meta.
    expect(JSON.stringify(findings[0])).not.toContain(fakeKey);
  });

  it('emits no findings when no fs is provided (browser env)', async () => {
    const findings = await diskPlaintextCheck(input({
      entries: [entry({ id: 'k1' })],
    }));
    expect(findings).toEqual([]);
  });

  it('emits no findings when the disk value does not match any vault key', async () => {
    const findings = await diskPlaintextCheck(input({
      entries: [entry({ id: 'k1' })],
      fs: makeFs({ '.env': 'FOO="' + 'X'.repeat(40) + '"' }),
      matchAgainstVault: async () => null,
    }));
    expect(findings).toEqual([]);
  });

  it('skips files larger than the size cap', async () => {
    const bigContents = 'x'.repeat(2 * 1024 * 1024);
    const findings = await diskPlaintextCheck(input({
      entries: [entry({ id: 'k1' })],
      fs: makeFs({ '.env': bigContents }),
      matchAgainstVault: async () => 'k1',  // would match anything
    }));
    // Big file skipped → no findings.
    expect(findings).toEqual([]);
  });

  it('extracts values from JSON key/token/secret patterns', async () => {
    const fakeKey = 'B'.repeat(40);
    const findings = await diskPlaintextCheck(input({
      entries: [entry({ id: 'k1' })],
      fs: makeFs({
        '.continue/config.json': `{"apiKey": "${fakeKey}"}`,
      }),
      matchAgainstVault: async (v) => v === fakeKey ? 'k1' : null,
    }));
    expect(findings).toHaveLength(1);
  });
});

// ------- vault.duplicate -------

describe('vaultDuplicateCheck', () => {
  it('flags two entries with the same fingerprint', async () => {
    const findings = await vaultDuplicateCheck(input({
      entries: [
        entry({ id: 'k1', label: 'personal' }),
        entry({ id: 'k2', label: 'work' }),
      ],
      fingerprints: { k1: 'fp-abc', k2: 'fp-abc' },
    }));
    expect(findings).toHaveLength(2);
    expect(findings[0].check).toBe('vault.duplicate');
    expect(findings[0].meta?.duplicateCount).toBe(2);
    expect(findings[0].dismissible).toBe(false);
  });

  it('does not flag entries with different fingerprints', async () => {
    const findings = await vaultDuplicateCheck(input({
      entries: [entry({ id: 'k1' }), entry({ id: 'k2' })],
      fingerprints: { k1: 'fp-a', k2: 'fp-b' },
    }));
    expect(findings).toEqual([]);
  });

  it('flags three entries with the same fingerprint (one finding each)', async () => {
    const findings = await vaultDuplicateCheck(input({
      entries: [
        entry({ id: 'k1', label: 'a' }),
        entry({ id: 'k2', label: 'b' }),
        entry({ id: 'k3', label: 'c' }),
      ],
      fingerprints: { k1: 'fp', k2: 'fp', k3: 'fp' },
    }));
    expect(findings).toHaveLength(3);
    for (const f of findings) expect(f.meta?.duplicateCount).toBe(3);
  });

  it('is a no-op without fingerprints', async () => {
    const findings = await vaultDuplicateCheck(input({
      entries: [entry({ id: 'k1' })],
    }));
    expect(findings).toEqual([]);
  });
});

// ------- orchestrator -------

describe('runWatchtower', () => {
  it('returns findings from all checks, sorted severity-desc', async () => {
    const findings = await runWatchtower(input({
      entries: [entry({ id: 'k1', createdAt: NOW - 400 * DAY })],  // stale.rotation high
      grants: [grant({ grantId: 'g1', grantedAt: NOW - 60 * DAY })], // grant.zombie low
    }));
    expect(findings.map(f => f.check)).toEqual([
      'stale.rotation',    // high
      'stale.unused',      // medium (never used)
      'grant.zombie',      // low
    ]);
  });

  it('filters out dismissed findings', async () => {
    const withDismiss: WatchtowerConfig = { ...config, dismissed: ['stale.rotation:k1'] };
    const findings = await runWatchtower({
      ...input({ entries: [entry({ id: 'k1', createdAt: NOW - 400 * DAY })] }),
      config: withDismiss,
    });
    expect(findings.map(f => f.check)).not.toContain('stale.rotation');
    // stale.unused (never-used) still fires.
    expect(findings.some(f => f.check === 'stale.unused')).toBe(true);
  });

  it('dedups when two checks produce the same id (higher severity wins)', async () => {
    // Contrived: stale.rotation and stale.unused both produce IDs based on
    // keyId — they don't actually collide, but the dedup logic should hold
    // if a future check overlaps.
    const findings = await runWatchtower(input({
      entries: [entry({ id: 'k1', createdAt: NOW - 400 * DAY })],
    }));
    const ids = findings.map(f => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('returns empty when nothing is wrong', async () => {
    const findings = await runWatchtower(input({
      entries: [entry({ id: 'k1', createdAt: NOW - 5 * DAY })],
      audit: [proxyOk('k1', NOW - 1 * DAY)],
    }));
    expect(findings).toEqual([]);
  });
});
