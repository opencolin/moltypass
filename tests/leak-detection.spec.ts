import { describe, it, expect, beforeEach } from 'vitest';
import {
  severityForSignalB,
  shouldRaiseSignalA,
  onProxyOk,
  onProviderPollResult,
} from '../src/background/leak-detection';
import { listOpen, listAll, clear as clearFindings } from '../src/background/leak-findings';
import { __testing } from '../src/background/baseline';

const DAY = __testing.DAY_MS;
const HOUR = __testing.HOUR_MS;

beforeEach(async () => {
  await chrome.storage.local.clear();
  await clearFindings();
});

describe('severityForSignalB', () => {
  it('warns at 10x baseline', () => {
    expect(severityForSignalB(50, 5)).toBe('warn');
  });

  it('critical at 100x baseline', () => {
    expect(severityForSignalB(500, 5)).toBe('critical');
  });

  it('warns when baseline is zero (avoids divide-by-zero)', () => {
    expect(severityForSignalB(100, 0)).toBe('warn');
  });
});

describe('shouldRaiseSignalA', () => {
  it('raises when unexplained excess > tolerance', () => {
    const res = shouldRaiseSignalA({ fingerprint: 'fp', upstreamDelta: 100, localDelta: 10 });
    expect(res.raise).toBe(true);
    expect(res.unexplained).toBe(90);
  });

  it('does not raise when unexplained <= tolerance (within 20% + 5)', () => {
    // local 100, upstream 110 -> unexplained 10, tolerance max(5, 100*0.2)=20 -> no raise.
    const res = shouldRaiseSignalA({ fingerprint: 'fp', upstreamDelta: 110, localDelta: 100 });
    expect(res.raise).toBe(false);
  });

  it('uses the floor (5) when localDelta is tiny', () => {
    // local 1, upstream 7 -> unexplained 6, tolerance max(5, 1*0.2)=5 -> raise.
    expect(shouldRaiseSignalA({ fingerprint: 'fp', upstreamDelta: 7, localDelta: 1 }).raise).toBe(true);
    // unexplained 5 = floor; not raised because '>' tolerance, not '>='.
    expect(shouldRaiseSignalA({ fingerprint: 'fp', upstreamDelta: 6, localDelta: 1 }).raise).toBe(false);
  });

  it('does not raise on zero unexplained (perfect parity)', () => {
    expect(shouldRaiseSignalA({ fingerprint: 'fp', upstreamDelta: 50, localDelta: 50 }).raise).toBe(false);
  });
});

describe('onProxyOk (Signal B)', () => {
  it('records the event into the baseline', async () => {
    // No history -> not anomalous -> no finding.
    await onProxyOk({ fingerprint: 'fp', provider: 'anthropic', ts: 0 });
    expect(await listOpen()).toHaveLength(0);
  });

  it('does not raise during warm-up even on spike', async () => {
    // 100 calls in the same hour, observedDays < warmup -> no finding.
    for (let i = 0; i < 100; i++) {
      await onProxyOk({ fingerprint: 'fp', provider: 'anthropic', ts: i });
    }
    expect(await listOpen()).toHaveLength(0);
  });

  it('raises a Signal B finding when anomaly conditions hold after warm-up', async () => {
    // Build 5 days of low traffic (2 events/day), then a 30-event spike.
    for (let d = 0; d < 5; d++) {
      await onProxyOk({ fingerprint: 'fp', provider: 'anthropic', ts: d * DAY });
      await onProxyOk({ fingerprint: 'fp', provider: 'anthropic', ts: d * DAY + 1 });
    }
    const spikeStart = 5 * DAY;
    for (let i = 0; i < 30; i++) {
      await onProxyOk({ fingerprint: 'fp', provider: 'anthropic', ts: spikeStart + i });
    }
    const open = await listOpen();
    expect(open).toHaveLength(1);
    expect(open[0]!.signal).toBe('B');
    expect(open[0]!.provider).toBe('anthropic');
    expect(open[0]!.fingerprint).toBe('fp');
    expect(open[0]!.observed).toBeGreaterThanOrEqual(30);
  });
});

describe('onProviderPollResult (Signal A)', () => {
  it('raises one finding per per-fingerprint row exceeding tolerance', async () => {
    await onProviderPollResult({
      provider: 'openai',
      now: 1_000,
      perFingerprint: [
        { fingerprint: 'fp-a', upstreamDelta: 100, localDelta: 10 }, // raise
        { fingerprint: 'fp-b', upstreamDelta: 12, localDelta: 10 },  // within tolerance
        { fingerprint: 'fp-c', upstreamDelta: 500, localDelta: 50 }, // raise (and critical)
      ],
    });
    const open = await listOpen();
    expect(open).toHaveLength(2);
    const byFp = new Map(open.map(f => [f.fingerprint, f]));
    expect(byFp.get('fp-a')?.signal).toBe('A');
    expect(byFp.get('fp-c')?.severity).toBe('critical');
    expect(byFp.has('fp-b')).toBe(false);
  });

  it('repeated polls with the same delta UPDATE rather than duplicate', async () => {
    for (let i = 0; i < 3; i++) {
      await onProviderPollResult({
        provider: 'openai',
        now: 1_000 + i,
        perFingerprint: [{ fingerprint: 'fp', upstreamDelta: 100, localDelta: 10 }],
      });
    }
    const all = await listAll();
    expect(all).toHaveLength(1);
  });

  it('no rows in perFingerprint => no findings', async () => {
    await onProviderPollResult({ provider: 'gemini', now: 0, perFingerprint: [] });
    expect(await listOpen()).toHaveLength(0);
  });
});
