import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  readManagedConfig,
  readPolicyCache,
  writePolicyCache,
  fetchPolicy,
  isProviderForbidden,
  isRevealAllowed,
  retentionCutoffMs,
  type ManagedConfig,
  type Policy,
} from '../src/background/policy';
import { fakeChrome } from './setup';

beforeEach(async () => {
  // The fake-chrome reset clears local; managed isn't reset by default.
  fakeChrome.managed.__data.clear();
});

const config: ManagedConfig = {
  schemaVersion: 1,
  orgId: 'org-1',
  apiToken: 'tok_AAAAAAAA',
  ingestUrl: 'https://app/api/ingest',
  policyUrl: 'https://app/api/policy',
};

describe('readManagedConfig', () => {
  it('returns null when managed storage is empty (personal mode)', async () => {
    expect(await readManagedConfig()).toBeNull();
  });

  it('returns the config when all required fields are present', async () => {
    await fakeChrome.managed.set(config as unknown as Record<string, unknown>);
    const got = await readManagedConfig();
    expect(got?.orgId).toBe('org-1');
  });

  it('returns null when required fields are missing (refuse-to-bootstrap)', async () => {
    await fakeChrome.managed.set({ orgId: 'o', apiToken: 't' }); // no ingestUrl
    expect(await readManagedConfig()).toBeNull();
  });
});

describe('policy cache round-trip', () => {
  it('readPolicyCache returns null when nothing is cached', async () => {
    expect(await readPolicyCache()).toBeNull();
  });

  it('write + read round-trip', async () => {
    const cache = { policy: { revealModeAllowed: false }, etag: 'W/"v3"', fetchedAt: 123 };
    await writePolicyCache(cache);
    expect(await readPolicyCache()).toEqual(cache);
  });
});

describe('fetchPolicy', () => {
  it('returns the parsed policy on 200', async () => {
    const fetchFn = vi.fn(async () => new Response(JSON.stringify({
      policy: { forbiddenProviders: ['openai'], revealModeAllowed: false, retentionDays: 90 },
    }), { status: 200, headers: { etag: 'W/"v7"' } }));
    const res = await fetchPolicy(config, null, { fetch: fetchFn as unknown as typeof fetch });
    expect(res.notModified).toBe(false);
    expect(res.etag).toBe('W/"v7"');
    expect(res.policy.revealModeAllowed).toBe(false);
  });

  it('also accepts a flat policy JSON body (no { policy: ... } wrapper)', async () => {
    const fetchFn = vi.fn(async () => new Response(JSON.stringify({
      forbiddenProviders: ['gemini'], retentionDays: 30,
    }), { status: 200 }));
    const res = await fetchPolicy(config, null, { fetch: fetchFn as unknown as typeof fetch });
    expect(res.policy.forbiddenProviders).toEqual(['gemini']);
  });

  it('sends Authorization header (Bearer api token)', async () => {
    const fetchFn = vi.fn(async () => new Response('{"policy":{}}', { status: 200 }));
    await fetchPolicy(config, null, { fetch: fetchFn as unknown as typeof fetch });
    const headers = (fetchFn.mock.calls[0]![1] as RequestInit).headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer tok_AAAAAAAA');
  });

  it('sends If-None-Match when prevEtag is provided', async () => {
    const fetchFn = vi.fn(async () => new Response(null, { status: 304 }));
    await fetchPolicy(config, 'W/"v5"', { fetch: fetchFn as unknown as typeof fetch });
    const headers = (fetchFn.mock.calls[0]![1] as RequestInit).headers as Record<string, string>;
    expect(headers['if-none-match']).toBe('W/"v5"');
  });

  it('returns notModified:true on 304', async () => {
    const fetchFn = vi.fn(async () => new Response(null, { status: 304 }));
    const res = await fetchPolicy(config, 'W/"v5"', { fetch: fetchFn as unknown as typeof fetch });
    expect(res.notModified).toBe(true);
    expect(res.etag).toBe('W/"v5"');
  });

  it('throws with a clear error on non-2xx/304', async () => {
    const fetchFn = vi.fn(async () => new Response('boom', { status: 500 }));
    await expect(fetchPolicy(config, null, { fetch: fetchFn as unknown as typeof fetch }))
      .rejects.toThrow(/policy fetch: 500/);
  });
});

describe('policy enforcement', () => {
  it('isProviderForbidden defaults to false', () => {
    expect(isProviderForbidden({}, 'anthropic')).toBe(false);
  });

  it('isProviderForbidden matches the configured list', () => {
    const p: Policy = { forbiddenProviders: ['openai'] };
    expect(isProviderForbidden(p, 'openai')).toBe(true);
    expect(isProviderForbidden(p, 'anthropic')).toBe(false);
  });

  it('isRevealAllowed defaults to true', () => {
    expect(isRevealAllowed({})).toBe(true);
  });

  it('isRevealAllowed honors explicit false', () => {
    expect(isRevealAllowed({ revealModeAllowed: false })).toBe(false);
  });

  it('retentionCutoffMs returns null when retentionDays unset', () => {
    expect(retentionCutoffMs({}, 1_000_000)).toBeNull();
  });

  it('retentionCutoffMs computes the cutoff for valid retentionDays', () => {
    const now = 100 * 24 * 60 * 60 * 1000;
    expect(retentionCutoffMs({ retentionDays: 10 }, now)).toBe(now - 10 * 24 * 60 * 60 * 1000);
  });

  it('retentionCutoffMs returns null for non-positive retentionDays', () => {
    expect(retentionCutoffMs({ retentionDays: 0 }, 1_000_000)).toBeNull();
    expect(retentionCutoffMs({ retentionDays: -1 }, 1_000_000)).toBeNull();
  });
});
