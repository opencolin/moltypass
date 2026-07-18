import { describe, it, expect, beforeEach } from 'vitest';
import {
  enqueue,
  peekBatch,
  deleteUpTo,
  count,
  trimToCap,
  __resetForTesting,
} from '../src/background/outbox';
import type { AuditEvent } from '../src/shared/audit-types';

beforeEach(() => { __resetForTesting(); });

function evt(overrides: Partial<AuditEvent> = {}): AuditEvent {
  return {
    ts: 1_000,
    kind: 'proxy.ok',
    source: 'proxy',
    origin: 'https://x',
    service: 'anthropic',
    keyId: 'k1',
    ...overrides,
  };
}

describe('outbox', () => {
  it('enqueue returns monotonic seq', async () => {
    const a = await enqueue(evt({ ts: 1 }));
    const b = await enqueue(evt({ ts: 2 }));
    const c = await enqueue(evt({ ts: 3 }));
    expect(a).toBeGreaterThan(0);
    expect(b).toBe(a + 1);
    expect(c).toBe(b + 1);
  });

  it('count reflects the number of queued rows', async () => {
    expect(await count()).toBe(0);
    await enqueue(evt());
    await enqueue(evt());
    expect(await count()).toBe(2);
  });

  it('peekBatch reads the oldest N rows in seq order', async () => {
    await enqueue(evt({ ts: 1 }));
    await enqueue(evt({ ts: 2 }));
    await enqueue(evt({ ts: 3 }));
    const batch = await peekBatch(2);
    expect(batch).toHaveLength(2);
    expect(batch[0]!.event.ts).toBe(1);
    expect(batch[1]!.event.ts).toBe(2);
  });

  it('peekBatch is non-destructive (rows remain queued)', async () => {
    await enqueue(evt());
    await enqueue(evt());
    await peekBatch(10);
    expect(await count()).toBe(2);
  });

  it('deleteUpTo removes rows up to and including maxSeq', async () => {
    const a = await enqueue(evt({ ts: 1 }));
    const b = await enqueue(evt({ ts: 2 }));
    const c = await enqueue(evt({ ts: 3 }));
    const deleted = await deleteUpTo(b);
    expect(deleted).toBe(2);
    expect(await count()).toBe(1);
    const remaining = await peekBatch(10);
    expect(remaining[0]!.seq).toBe(c);
    expect(a).toBeDefined(); // silences unused-var lint
  });

  it('deleteUpTo on a future seq deletes nothing', async () => {
    await enqueue(evt());
    const deleted = await deleteUpTo(0);
    expect(deleted).toBe(0);
    expect(await count()).toBe(1);
  });

  it('trimToCap drops oldest rows to bring count to cap', async () => {
    for (let i = 0; i < 10; i++) await enqueue(evt({ ts: i }));
    const dropped = await trimToCap(6);
    expect(dropped).toBe(4);
    expect(await count()).toBe(6);
    // The four oldest (ts 0..3) are gone; ts 4..9 remain.
    const remaining = await peekBatch(10);
    expect(remaining[0]!.event.ts).toBe(4);
    expect(remaining[5]!.event.ts).toBe(9);
  });

  it('trimToCap is a no-op when under the cap', async () => {
    await enqueue(evt());
    await enqueue(evt());
    const dropped = await trimToCap(10);
    expect(dropped).toBe(0);
    expect(await count()).toBe(2);
  });

  it('rows carry enqueuedAt for diagnostic display', async () => {
    await enqueue(evt(), 9_000);
    const batch = await peekBatch(1);
    expect(batch[0]!.enqueuedAt).toBe(9_000);
  });
});
