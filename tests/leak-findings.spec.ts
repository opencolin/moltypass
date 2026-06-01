import { describe, it, expect, beforeEach } from 'vitest';
import {
  raise,
  listAll,
  listOpen,
  listByStatus,
  dismiss,
  clear,
  type FindingInput,
  type IdGen,
} from '../src/background/leak-findings';

beforeEach(async () => {
  await chrome.storage.local.clear();
});

function counter(): IdGen {
  let n = 0;
  return { newId: () => `f-${++n}` };
}

function input(overrides: Partial<FindingInput> = {}): FindingInput {
  return {
    signal: 'B',
    severity: 'warn',
    provider: 'anthropic',
    fingerprint: 'fp-1',
    expected: 5,
    observed: 50,
    detail: '50 calls in the recent hour vs baseline 5/hr',
    ...overrides,
  };
}

describe('raise', () => {
  it('creates a new finding on first observation', async () => {
    const res = await raise(input(), 100, counter());
    expect(res.action).toBe('created');
    expect(res.finding.id).toBe('f-1');
    expect(res.finding.status).toBe('open');
    expect(res.finding.observed).toBe(50);
  });

  it('updates the same row on repeated observation (no duplicate)', async () => {
    const idGen = counter();
    await raise(input({ observed: 50 }), 100, idGen);
    const res = await raise(input({ observed: 80, detail: 'now 80/hr' }), 200, idGen);
    expect(res.action).toBe('updated');
    expect(res.finding.observed).toBe(80);
    expect(res.finding.detail).toBe('now 80/hr');
    expect((await listAll())).toHaveLength(1);
  });

  it('merges to the higher severity on update', async () => {
    const idGen = counter();
    await raise(input({ severity: 'info' }), 100, idGen);
    const res = await raise(input({ severity: 'critical' }), 200, idGen);
    expect(res.finding.severity).toBe('critical');
  });

  it('does not regress severity downward on update', async () => {
    const idGen = counter();
    await raise(input({ severity: 'critical' }), 100, idGen);
    const res = await raise(input({ severity: 'info' }), 200, idGen);
    expect(res.finding.severity).toBe('critical');
  });

  it('treats different (signal, provider, fingerprint) tuples as distinct rows', async () => {
    const idGen = counter();
    await raise(input({ signal: 'A' }), 100, idGen);
    await raise(input({ signal: 'B' }), 100, idGen);
    await raise(input({ signal: 'B', provider: 'openai' }), 100, idGen);
    expect(await listAll()).toHaveLength(3);
  });
});

describe('dismiss + re-fire watermark', () => {
  it('dismiss records the observed-at-dismissal as the watermark', async () => {
    const idGen = counter();
    await raise(input({ observed: 100 }), 100, idGen);
    const f = await dismiss('f-1', 500);
    expect(f?.status).toBe('dismissed');
    expect(f?.dismissedAt).toBe(500);
    expect(f?.dismissedWatermark).toBe(100);
  });

  it('suppresses re-fire when observed has not grown past the watermark', async () => {
    const idGen = counter();
    await raise(input({ observed: 100 }), 100, idGen);
    await dismiss('f-1', 200);
    // Same observation re-raised; should be suppressed.
    const res = await raise(input({ observed: 100, detail: 'same' }), 300, idGen);
    expect(res.action).toBe('suppressed');
    expect(res.finding.status).toBe('dismissed');
  });

  it('reactivates when observed grows past the dismissed watermark', async () => {
    const idGen = counter();
    await raise(input({ observed: 100 }), 100, idGen);
    await dismiss('f-1', 200);
    const res = await raise(input({ observed: 250, detail: '250/hr' }), 300, idGen);
    expect(res.action).toBe('reactivated');
    expect(res.finding.status).toBe('open');
    expect(res.finding.observed).toBe(250);
    expect(res.finding.dismissedAt).toBeUndefined();
    expect(res.finding.dismissedWatermark).toBeUndefined();
  });

  it('dismiss on an unknown id returns null', async () => {
    expect(await dismiss('not-here')).toBeNull();
  });
});

describe('listOpen / listByStatus', () => {
  it('separates open from dismissed', async () => {
    const idGen = counter();
    await raise(input({ fingerprint: 'fp-A' }), 0, idGen);
    await raise(input({ fingerprint: 'fp-B' }), 0, idGen);
    await dismiss('f-1');
    const open = await listOpen();
    const dismissed = await listByStatus('dismissed');
    expect(open).toHaveLength(1);
    expect(open[0]!.fingerprint).toBe('fp-B');
    expect(dismissed).toHaveLength(1);
    expect(dismissed[0]!.fingerprint).toBe('fp-A');
  });
});

describe('clear', () => {
  it('removes all findings', async () => {
    await raise(input(), 0, counter());
    expect(await listAll()).toHaveLength(1);
    await clear();
    expect(await listAll()).toHaveLength(0);
  });
});
