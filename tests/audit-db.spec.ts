import { describe, it, expect } from 'vitest';
import type { AuditEvent } from '../src/shared/audit-types';
import { appendEvent, query, count, pruneOlderThan } from '../src/background/audit-db';

const baseEvent = (overrides: Partial<AuditEvent> = {}): AuditEvent => ({
  ts: Date.now(),
  kind: 'proxy.ok',
  source: 'proxy',
  origin: 'https://example.test',
  service: 'anthropic',
  keyId: 'k-1',
  status: 200,
  pathPreview: '/v1/messages',
  latencyMs: 124,
  ...overrides,
});

describe('audit-db', () => {
  it('appends and counts events', async () => {
    await appendEvent(baseEvent({ ts: 100 }));
    await appendEvent(baseEvent({ ts: 200 }));
    expect(await count()).toBe(2);
  });

  it('queries by origin via compound index', async () => {
    await appendEvent(baseEvent({ ts: 100, origin: 'https://a.test' }));
    await appendEvent(baseEvent({ ts: 200, origin: 'https://b.test' }));
    await appendEvent(baseEvent({ ts: 300, origin: 'https://a.test' }));
    const result = await query({ origins: ['https://a.test'] });
    expect(result.records).toHaveLength(2);
    expect(result.records.every(r => r.origin === 'https://a.test')).toBe(true);
  });

  it('queries by kind', async () => {
    await appendEvent(baseEvent({ ts: 100, kind: 'proxy.ok' }));
    await appendEvent(baseEvent({ ts: 200, kind: 'grant' }));
    await appendEvent(baseEvent({ ts: 300, kind: 'revoke' }));
    const r = await query({ kinds: ['grant'] });
    expect(r.records).toHaveLength(1);
    expect(r.records[0]!.kind).toBe('grant');
  });

  it('post-filters text search', async () => {
    await appendEvent(baseEvent({ ts: 100, pathPreview: '/v1/messages' }));
    await appendEvent(baseEvent({ ts: 200, pathPreview: '/v1/embeddings' }));
    const r = await query({ textSearch: 'messages' });
    expect(r.records).toHaveLength(1);
    expect(r.records[0]!.pathPreview).toBe('/v1/messages');
  });

  it('prunes records older than cutoff', async () => {
    await appendEvent(baseEvent({ ts: 100 }));
    await appendEvent(baseEvent({ ts: 200 }));
    await appendEvent(baseEvent({ ts: 300 }));
    const deleted = await pruneOlderThan(250);
    expect(deleted).toBe(2);
    expect(await count()).toBe(1);
  });

  it('cursor pagination yields stable order', async () => {
    for (let i = 0; i < 5; i++) await appendEvent(baseEvent({ ts: i * 100 }));
    const first = await query({}, { limit: 2, order: 'asc' });
    expect(first.records).toHaveLength(2);
    expect(first.nextCursor).toBeTruthy();
    const second = await query({}, { limit: 10, order: 'asc', cursor: first.nextCursor! });
    expect(first.records.length + second.records.length).toBe(5);
  });
});
