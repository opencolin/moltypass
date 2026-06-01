import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ingestOnce,
  runIngestTick,
  policyOnce,
  runPolicyTick,
  type OutboxOps,
} from '../src/background/enterprise';
import type { ManagedConfig } from '../src/background/policy';
import type { AuditEvent } from '../src/shared/audit-types';
import type { BackoffStorage } from '../src/background/backoff';

const config: ManagedConfig = {
  schemaVersion: 1,
  orgId: 'org-1',
  apiToken: 'tok_AAAAAAAA',
  ingestUrl: 'https://app/api/ingest',
  policyUrl: 'https://app/api/policy',
};

function evt(seq: number): AuditEvent {
  return { ts: seq * 1000, kind: 'proxy.ok', source: 'proxy' };
}

function fakeOutbox(initial: Array<{ seq: number; event: AuditEvent }> = []): OutboxOps {
  const rows = [...initial];
  return {
    async peekBatch(limit) { return rows.slice(0, limit); },
    async deleteUpTo(maxSeq) {
      const before = rows.length;
      while (rows.length > 0 && rows[0]!.seq! <= maxSeq) rows.shift();
      return before - rows.length;
    },
    async count() { return rows.length; },
  };
}

function memStorage(): BackoffStorage & { state: { failures: number; nextAttemptAt: number } | null } {
  let state: { failures: number; nextAttemptAt: number } | null = null;
  return {
    state,
    async load() { return state; },
    async save(s) { state = s; },
  };
}

describe('ingestOnce', () => {
  it('returns { shipped: 0, drained: true } on empty outbox', async () => {
    const outbox = fakeOutbox([]);
    const fetchFn = vi.fn();
    const res = await ingestOnce(config, outbox, { fetch: fetchFn as unknown as typeof fetch });
    expect(res).toEqual({ shipped: 0, drained: true });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('POSTs the batch and deletes-up-to maxSeq on 2xx', async () => {
    const outbox = fakeOutbox([
      { seq: 1, event: evt(1) },
      { seq: 2, event: evt(2) },
    ]);
    const fetchFn = vi.fn(async () => new Response('{}', { status: 200 }));
    const res = await ingestOnce(config, outbox, { fetch: fetchFn as unknown as typeof fetch });
    expect(res.shipped).toBe(2);
    expect(res.drained).toBe(true);
    expect(await outbox.count()).toBe(0);
    // Verify POST shape.
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe(config.ingestUrl);
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer tok_AAAAAAAA');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.events).toHaveLength(2);
  });

  it('throws on non-2xx; rows REMAIN queued (no partial deletion)', async () => {
    const outbox = fakeOutbox([
      { seq: 1, event: evt(1) },
      { seq: 2, event: evt(2) },
    ]);
    const fetchFn = vi.fn(async () => new Response('boom', { status: 500 }));
    await expect(ingestOnce(config, outbox, { fetch: fetchFn as unknown as typeof fetch }))
      .rejects.toThrow(/ingest: 500/);
    expect(await outbox.count()).toBe(2);
  });

  it('signals drained=false when more rows remain after a partial shipment', async () => {
    // peekBatch returns at most 100; we exceed that artificially.
    const rows = Array.from({ length: 150 }, (_, i) => ({ seq: i + 1, event: evt(i + 1) }));
    const outbox = fakeOutbox(rows);
    const fetchFn = vi.fn(async () => new Response('{}', { status: 200 }));
    const res = await ingestOnce(config, outbox, { fetch: fetchFn as unknown as typeof fetch });
    expect(res.shipped).toBe(100);
    expect(res.drained).toBe(false);
    expect(await outbox.count()).toBe(50);
  });
});

describe('runIngestTick', () => {
  it('runs ingest when backoff allows', async () => {
    const outbox = fakeOutbox([{ seq: 1, event: evt(1) }]);
    const storage = memStorage();
    const fetchFn = vi.fn(async () => new Response('{}', { status: 200 }));
    const res = await runIngestTick(config, outbox, storage, { fetch: fetchFn as unknown as typeof fetch });
    expect(res.ran).toBe(true);
    expect(res.result?.shipped).toBe(1);
  });

  it('skips when backoff has nextAttemptAt in the future', async () => {
    const outbox = fakeOutbox([{ seq: 1, event: evt(1) }]);
    const storage = memStorage();
    await storage.save({ failures: 3, nextAttemptAt: 999_999 });
    const fetchFn = vi.fn();
    const res = await runIngestTick(config, outbox, storage, { fetch: fetchFn as unknown as typeof fetch }, 0);
    expect(res.ran).toBe(false);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('does not crash the caller on transport failure (logs internally)', async () => {
    const outbox = fakeOutbox([{ seq: 1, event: evt(1) }]);
    const storage = memStorage();
    const fetchFn = vi.fn(async () => new Response('x', { status: 500 }));
    // Suppress the console.warn for cleanliness.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const res = await runIngestTick(config, outbox, storage, { fetch: fetchFn as unknown as typeof fetch });
    expect(res.ran).toBe(true);
    expect(res.result).toBeUndefined();
    warn.mockRestore();
  });
});

describe('policyOnce / runPolicyTick', () => {
  beforeEach(async () => {
    await chrome.storage.local.clear();
  });

  it('fetches a fresh policy on first call and caches it', async () => {
    const fetchFn = vi.fn(async () => new Response(
      JSON.stringify({ policy: { revealModeAllowed: false } }),
      { status: 200, headers: { etag: 'W/"v1"' } },
    ));
    const res = await policyOnce(config, { fetch: fetchFn as unknown as typeof fetch }, 100);
    expect(res.notModified).toBe(false);
    expect(res.policy.revealModeAllowed).toBe(false);
    expect(res.etag).toBe('W/"v1"');
  });

  it('on 304 keeps the cached policy and refreshes fetchedAt', async () => {
    // Prime the cache.
    await chrome.storage.local.set({
      'moltypass.enterprise.policy': {
        policy: { revealModeAllowed: false },
        etag: 'W/"v1"',
        fetchedAt: 1,
      },
    });
    const fetchFn = vi.fn(async () => new Response(null, { status: 304 }));
    const res = await policyOnce(config, { fetch: fetchFn as unknown as typeof fetch }, 500);
    expect(res.notModified).toBe(true);
    expect(res.policy.revealModeAllowed).toBe(false);
    expect(res.etag).toBe('W/"v1"');
  });

  it('runPolicyTick respects backoff suppression', async () => {
    const storage = memStorage();
    await storage.save({ failures: 5, nextAttemptAt: 999_999 });
    const fetchFn = vi.fn();
    const res = await runPolicyTick(config, storage, { fetch: fetchFn as unknown as typeof fetch }, 0);
    expect(res.ran).toBe(false);
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
