import { describe, it, expect, beforeEach } from 'vitest';
import { rotateKey } from '../src/background/rotation';
import { readEpoch } from '../src/background/revocation';
import { __resetForTesting as resetAuditDb, query } from '../src/background/audit-db';
import type { OriginPermission, ProviderId } from '../src/shared/types';

beforeEach(async () => {
  resetAuditDb();
  await chrome.storage.local.clear();
});

interface VaultEntry {
  id: string;
  service: ProviderId;
  label: string;
  plaintext: string;
}

function makeFakes(initial: { entries: VaultEntry[]; grants: OriginPermission[] }) {
  const entries = new Map(initial.entries.map(e => [e.id, e]));
  const grants: OriginPermission[] = [...initial.grants];
  let nextId = 100;
  let newGrantSeq = 0;

  const vault = {
    async getEntry(id: string) {
      const e = entries.get(id);
      return e ? { id: e.id, service: e.service, label: e.label } : null;
    },
    async getKeyPlaintext(id: string) {
      const e = entries.get(id);
      if (!e) throw new Error(`no entry: ${id}`);
      return e.plaintext;
    },
    async addKey(service: ProviderId, label: string, plaintext: string) {
      const id = `k-${nextId++}`;
      entries.set(id, { id, service, label, plaintext });
      return id;
    },
    async removeKey(id: string) {
      entries.delete(id);
    },
  };

  const permissions = {
    async listByKey(keyId: string) {
      return grants.filter(g => g.keyId === keyId);
    },
    async grant(p: OriginPermission) {
      grants.push(p);
    },
  };

  return {
    vault,
    permissions,
    newGrantId: () => `g-new-${++newGrantSeq}`,
    state: { entries, grants },
  };
}

function makeGrant(overrides: Partial<OriginPermission>): OriginPermission {
  return {
    grantId: 'g-1',
    origin: 'https://claude.ai',
    service: 'anthropic',
    keyId: 'k-old',
    mode: 'proxy',
    grantedAt: 0,
    callsUsed: 7,
    ...overrides,
  };
}

describe('rotateKey', () => {
  it('mints a new vault entry, mirrors grants, drops the old entry', async () => {
    const fakes = makeFakes({
      entries: [{ id: 'k-old', service: 'anthropic', label: 'personal', plaintext: 'OLD_SECRET' }],
      grants: [
        makeGrant({ grantId: 'g-1', origin: 'https://claude.ai', keyId: 'k-old' }),
        makeGrant({ grantId: 'g-2', origin: 'https://cursor.sh', keyId: 'k-old' }),
      ],
    });

    const res = await rotateKey('k-old', 'rotated', 'NEW_SECRET', fakes);

    // New entry exists with the supplied plaintext + composed label.
    const newEntry = fakes.state.entries.get(res.newKeyId);
    expect(newEntry?.plaintext).toBe('NEW_SECRET');
    expect(newEntry?.label).toBe('personal-rotated');
    expect(newEntry?.service).toBe('anthropic');

    // Old entry is gone.
    expect(fakes.state.entries.has('k-old')).toBe(false);

    // Both grants now reference the new keyId and have fresh grantIds.
    const newGrants = fakes.state.grants.filter(g => g.keyId === res.newKeyId);
    expect(newGrants).toHaveLength(2);
    expect(newGrants.every(g => g.callsUsed === 0)).toBe(true);
    expect(new Set(newGrants.map(g => g.grantId))).toEqual(new Set(['g-new-1', 'g-new-2']));

    // Result surface for the popup.
    expect(res.mirroredGrants).toBe(2);
    expect(res.origins.sort()).toEqual(['https://claude.ai', 'https://cursor.sh']);
  });

  it('bumps the revocation epoch on completion', async () => {
    const fakes = makeFakes({
      entries: [{ id: 'k-old', service: 'openai', label: 'work', plaintext: 'S' }],
      grants: [],
    });
    expect(await readEpoch()).toBe(0);
    await rotateKey('k-old', 'v2', 'N', fakes);
    expect(await readEpoch()).toBe(1);
  });

  it('emits a rotate.complete audit event with origins + counts', async () => {
    const fakes = makeFakes({
      entries: [{ id: 'k-old', service: 'gemini', label: 'personal', plaintext: 'S' }],
      grants: [
        makeGrant({ origin: 'https://aistudio.google.com', service: 'gemini', keyId: 'k-old' }),
      ],
    });
    await rotateKey('k-old', '', 'NEW', fakes);
    await new Promise(r => setTimeout(r, 0));
    const events = await query({ kinds: ['rotate.complete'] });
    expect(events.records).toHaveLength(1);
    expect(events.records[0]!.meta?.['affectedGrants']).toBe(1);
    expect(events.records[0]!.meta?.['oldKeyId']).toBe('k-old');
  });

  it('preserves grant mode + expiry across rotation, resets callsUsed', async () => {
    const future = Date.now() + 60_000;
    const fakes = makeFakes({
      entries: [{ id: 'k-old', service: 'anthropic', label: 'p', plaintext: 'S' }],
      grants: [
        makeGrant({
          keyId: 'k-old',
          mode: 'reveal',
          expiresAt: future,
          callsAllowed: 100,
          callsUsed: 42,
        }),
      ],
    });
    const res = await rotateKey('k-old', '', 'N', fakes);
    const newGrant = fakes.state.grants.find(g => g.keyId === res.newKeyId)!;
    expect(newGrant.mode).toBe('reveal');
    expect(newGrant.expiresAt).toBe(future);
    expect(newGrant.callsAllowed).toBe(100);
    expect(newGrant.callsUsed).toBe(0);
  });

  it('throws when the old keyId does not exist (no partial state)', async () => {
    const fakes = makeFakes({ entries: [], grants: [] });
    await expect(rotateKey('k-missing', '', 'X', fakes)).rejects.toThrow('not found');
    // No entries created, no epoch bump.
    expect(fakes.state.entries.size).toBe(0);
    expect(await readEpoch()).toBe(0);
  });

  it('rotating a key with zero grants still succeeds and bumps the epoch', async () => {
    const fakes = makeFakes({
      entries: [{ id: 'k-orphan', service: 'openai', label: 'unused', plaintext: 'S' }],
      grants: [],
    });
    const res = await rotateKey('k-orphan', '', 'N', fakes);
    expect(res.mirroredGrants).toBe(0);
    expect(res.origins).toHaveLength(0);
    expect(await readEpoch()).toBe(1);
  });

  it('uses a fallback newGrantId generator when none injected', async () => {
    const fakes = makeFakes({
      entries: [{ id: 'k-old', service: 'anthropic', label: 'p', plaintext: 'S' }],
      grants: [makeGrant({ keyId: 'k-old' })],
    });
    // Strip newGrantId so it falls back to crypto.randomUUID().
    const { newGrantId, ...depsWithoutMint } = fakes;
    const res = await rotateKey('k-old', '', 'N', depsWithoutMint);
    const newGrant = fakes.state.grants.find(g => g.keyId === res.newKeyId)!;
    // crypto.randomUUID returns a v4-shaped string.
    expect(newGrant.grantId).toMatch(/^[0-9a-f-]{36}$/);
  });
});
