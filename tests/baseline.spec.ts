import { describe, it, expect, beforeEach } from 'vitest';
import {
  pureRecord,
  pureCheckAnomaly,
  recordEvent,
  checkAnomaly,
  __testing,
} from '../src/background/baseline';

const HOUR = __testing.HOUR_MS;
const DAY = __testing.DAY_MS;

beforeEach(async () => {
  await chrome.storage.local.clear();
});

describe('pureRecord', () => {
  it('initializes a fresh baseline with firstEventAt + a single bucket', () => {
    const b = pureRecord(undefined, { fingerprint: 'fp', ts: 1_000 });
    expect(b.fingerprint).toBe('fp');
    expect(b.firstEventAt).toBe(1_000);
    expect(b.hourly).toHaveLength(1);
    expect(b.hourly[0]!.count).toBe(1);
    expect(b.daily).toHaveLength(1);
  });

  it('bumps the same bucket when ts is in the same hour', () => {
    let b = pureRecord(undefined, { fingerprint: 'fp', ts: 0 });
    b = pureRecord(b, { fingerprint: 'fp', ts: 30 * 60_000 }); // still in hour 0
    expect(b.hourly).toHaveLength(1);
    expect(b.hourly[0]!.count).toBe(2);
  });

  it('opens a new bucket when ts crosses an hour boundary', () => {
    let b = pureRecord(undefined, { fingerprint: 'fp', ts: 0 });
    b = pureRecord(b, { fingerprint: 'fp', ts: HOUR + 1 });
    expect(b.hourly).toHaveLength(2);
  });

  it('prunes buckets older than 7 days', () => {
    let b = pureRecord(undefined, { fingerprint: 'fp', ts: 0 });
    // Insert at 8 days later; the original bucket should be pruned.
    b = pureRecord(b, { fingerprint: 'fp', ts: 8 * DAY });
    expect(b.hourly).toHaveLength(1);
    expect(b.hourly[0]!.windowStart).toBe(Math.floor(8 * DAY / HOUR) * HOUR);
  });

  it('preserves firstEventAt across many events', () => {
    let b = pureRecord(undefined, { fingerprint: 'fp', ts: 100 });
    b = pureRecord(b, { fingerprint: 'fp', ts: 1_000_000 });
    expect(b.firstEventAt).toBe(100);
  });
});

describe('pureCheckAnomaly', () => {
  it('returns not anomalous + all zeros for unknown fingerprint', () => {
    const res = pureCheckAnomaly(undefined, 0);
    expect(res).toEqual({ anomalous: false, recentHour: 0, baselineRate: 0, observedDays: 0 });
  });

  it('warm-up guard: not anomalous before MIN_WARMUP_DAYS', () => {
    // Insert 1000 events in the first hour — clearly an outlier — but
    // only 1 day of observation.
    let b = pureRecord(undefined, { fingerprint: 'fp', ts: 0 });
    for (let i = 0; i < 999; i++) b = pureRecord(b, { fingerprint: 'fp', ts: 1 });
    const res = pureCheckAnomaly(b, 1 * DAY); // only 1 day observed
    expect(res.anomalous).toBe(false);
    expect(res.observedDays).toBeLessThan(__testing.MIN_WARMUP_DAYS);
  });

  it('returns not anomalous when recent hour < RECENT_HOUR_FLOOR', () => {
    // Pretend 5 days of low traffic — 2 events per day, then 5 in the
    // recent hour. recentHour < 20 -> not anomalous regardless of ratio.
    let b: ReturnType<typeof pureRecord> | undefined;
    for (let d = 0; d < 5; d++) {
      b = pureRecord(b, { fingerprint: 'fp', ts: d * DAY });
      b = pureRecord(b, { fingerprint: 'fp', ts: d * DAY + 1 });
    }
    // 5 events in the recent hour at day 5.
    const recentStart = 5 * DAY;
    for (let i = 0; i < 5; i++) b = pureRecord(b, { fingerprint: 'fp', ts: recentStart + i });
    const res = pureCheckAnomaly(b, recentStart + 30 * 60_000);
    expect(res.anomalous).toBe(false);
    expect(res.recentHour).toBe(5);
  });

  it('raises anomalous when recent >= floor AND > baseline * multiplier', () => {
    // Build a 5-day baseline of ~2 events per day (so daily mean = 2,
    // baselineRate = 2/24 ≈ 0.083/hr). Then 30 events in the recent hour
    // -> 30 > 0.83 (10x baseline) AND >= 20 floor -> anomalous.
    let b: ReturnType<typeof pureRecord> | undefined;
    for (let d = 0; d < 5; d++) {
      b = pureRecord(b, { fingerprint: 'fp', ts: d * DAY });
      b = pureRecord(b, { fingerprint: 'fp', ts: d * DAY + 1 });
    }
    const recentStart = 5 * DAY;
    for (let i = 0; i < 30; i++) b = pureRecord(b, { fingerprint: 'fp', ts: recentStart + i });
    const res = pureCheckAnomaly(b, recentStart + 30 * 60_000);
    expect(res.anomalous).toBe(true);
    expect(res.recentHour).toBe(30);
    expect(res.baselineRate).toBeLessThan(0.2);
  });

  it('not anomalous when recent hour is roughly the same as baseline', () => {
    // 5 days × 240 events/day = 10/hr baseline. Recent hour = 20.
    let b: ReturnType<typeof pureRecord> | undefined;
    for (let d = 0; d < 5; d++) {
      for (let i = 0; i < 240; i++) b = pureRecord(b, { fingerprint: 'fp', ts: d * DAY + i });
    }
    const recentStart = 5 * DAY;
    for (let i = 0; i < 20; i++) b = pureRecord(b, { fingerprint: 'fp', ts: recentStart + i });
    const res = pureCheckAnomaly(b, recentStart + 30 * 60_000);
    // recent 20 is not > 10/hr * 10 = 100, so not anomalous.
    expect(res.anomalous).toBe(false);
  });
});

describe('storage-backed recordEvent / checkAnomaly', () => {
  it('round-trips through chrome.storage.local', async () => {
    await recordEvent({ fingerprint: 'fp-1', ts: 1_000 });
    await recordEvent({ fingerprint: 'fp-1', ts: 2_000 });
    const res = await checkAnomaly('fp-1', 3_000);
    expect(res.recentHour).toBe(2);
  });

  it('isolates baselines per fingerprint', async () => {
    await recordEvent({ fingerprint: 'fp-A', ts: 0 });
    await recordEvent({ fingerprint: 'fp-A', ts: 0 });
    await recordEvent({ fingerprint: 'fp-B', ts: 0 });
    const a = await checkAnomaly('fp-A', 60_000);
    const b = await checkAnomaly('fp-B', 60_000);
    expect(a.recentHour).toBe(2);
    expect(b.recentHour).toBe(1);
  });
});
