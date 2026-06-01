// Rolling 7-day per-fingerprint baseline for Signal B (local volume
// anomaly). Persisted in chrome.storage.local so SW death doesn't
// reset the warm-up clock.
//
// We keep two granularities:
//   - hourly:  168 buckets (7 days × 24h) for recent-hour math
//   - daily:    7 buckets for the long baseline average
//
// On every proxy.ok event we increment the current hour's bucket for
// that fingerprint. checkAnomaly(fingerprint, now) compares the most
// recent hour against the 7-day baseline.

import type { BaselineBucket, FingerprintBaseline } from '../shared/leak-types';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const HOURLY_BUCKETS = 168; // 7 days
const DAILY_BUCKETS = 7;

const STORAGE_KEY = 'moltypass.leak.baseline';
/** Minimum days of data before we'll raise an anomaly (warm-up guard). */
const MIN_WARMUP_DAYS = 3;
/** Recent hour must exceed BASELINE_RATE * MULTIPLIER. */
const ANOMALY_MULTIPLIER = 10;
/** Floor: don't raise unless the recent hour itself is above this. */
const RECENT_HOUR_FLOOR = 20;

export interface RecordEventArgs {
  fingerprint: string;
  /** ms epoch. */
  ts: number;
}

export interface AnomalyResult {
  /** True when a finding should be raised (caller decides what to do). */
  anomalous: boolean;
  /** Recent-hour count for this fingerprint. */
  recentHour: number;
  /** Average hourly rate over the daily-bucket baseline (excluding the
   *  current hour). */
  baselineRate: number;
  /** How long we've been observing this fingerprint, in days. */
  observedDays: number;
}

// ----- pure: bucket math -----

/** Pure: insert an event into a baseline. Idempotent on bucket boundaries. */
export function pureRecord(prev: FingerprintBaseline | undefined, args: RecordEventArgs): FingerprintBaseline {
  const baseline: FingerprintBaseline = prev ?? {
    fingerprint: args.fingerprint,
    hourly: [],
    daily: [],
    firstEventAt: args.ts,
  };
  if (!baseline.firstEventAt) baseline.firstEventAt = args.ts;

  baseline.hourly = pruneOld(baseline.hourly, args.ts - 7 * DAY_MS);
  baseline.daily = pruneOld(baseline.daily, args.ts - 7 * DAY_MS);
  baseline.hourly = bumpBucket(baseline.hourly, HOUR_MS, args.ts);
  baseline.daily = bumpBucket(baseline.daily, DAY_MS, args.ts);

  // Cap arrays to prevent unbounded growth on weird timestamps.
  if (baseline.hourly.length > HOURLY_BUCKETS) {
    baseline.hourly = baseline.hourly.slice(-HOURLY_BUCKETS);
  }
  if (baseline.daily.length > DAILY_BUCKETS) {
    baseline.daily = baseline.daily.slice(-DAILY_BUCKETS);
  }
  return baseline;
}

/** Pure: anomaly check. */
export function pureCheckAnomaly(baseline: FingerprintBaseline | undefined, now: number): AnomalyResult {
  if (!baseline) {
    return { anomalous: false, recentHour: 0, baselineRate: 0, observedDays: 0 };
  }
  const observedDays = baseline.firstEventAt
    ? (now - baseline.firstEventAt) / DAY_MS
    : 0;

  // Recent hour = the latest hourly bucket whose window contains `now`.
  const hourStart = Math.floor(now / HOUR_MS) * HOUR_MS;
  const recentHour = baseline.hourly.find(b => b.windowStart === hourStart)?.count ?? 0;

  // Baseline rate = mean of the daily buckets divided by 24h, excluding
  // today (today is the live window).
  const todayStart = Math.floor(now / DAY_MS) * DAY_MS;
  const priorDays = baseline.daily.filter(b => b.windowStart < todayStart);
  const totalPriorCalls = priorDays.reduce((s, b) => s + b.count, 0);
  const baselineRate = priorDays.length > 0 ? totalPriorCalls / priorDays.length / 24 : 0;

  if (observedDays < MIN_WARMUP_DAYS) {
    return { anomalous: false, recentHour, baselineRate, observedDays };
  }
  if (recentHour < RECENT_HOUR_FLOOR) {
    return { anomalous: false, recentHour, baselineRate, observedDays };
  }
  const anomalous = recentHour > baselineRate * ANOMALY_MULTIPLIER;
  return { anomalous, recentHour, baselineRate, observedDays };
}

// ----- storage wrapper -----

interface BaselineStore {
  load(fingerprint: string): Promise<FingerprintBaseline | undefined>;
  save(baseline: FingerprintBaseline): Promise<void>;
}

export function chromeStorageBaseline(): BaselineStore {
  return {
    async load(fingerprint) {
      const res = await chrome.storage.local.get(STORAGE_KEY);
      const map = (res[STORAGE_KEY] as Record<string, FingerprintBaseline> | undefined) ?? {};
      return map[fingerprint];
    },
    async save(baseline) {
      const res = await chrome.storage.local.get(STORAGE_KEY);
      const map = (res[STORAGE_KEY] as Record<string, FingerprintBaseline> | undefined) ?? {};
      map[baseline.fingerprint] = baseline;
      await chrome.storage.local.set({ [STORAGE_KEY]: map });
    },
  };
}

export async function recordEvent(
  args: RecordEventArgs,
  store: BaselineStore = chromeStorageBaseline(),
): Promise<FingerprintBaseline> {
  const prev = await store.load(args.fingerprint);
  const next = pureRecord(prev, args);
  await store.save(next);
  return next;
}

export async function checkAnomaly(
  fingerprint: string,
  now: number = Date.now(),
  store: BaselineStore = chromeStorageBaseline(),
): Promise<AnomalyResult> {
  const baseline = await store.load(fingerprint);
  return pureCheckAnomaly(baseline, now);
}

// ----- internals -----

function bumpBucket(buckets: BaselineBucket[], windowMs: number, ts: number): BaselineBucket[] {
  const windowStart = Math.floor(ts / windowMs) * windowMs;
  const existing = buckets.find(b => b.windowStart === windowStart);
  if (existing) {
    existing.count++;
    return buckets;
  }
  return [...buckets, { windowStart, windowMs, count: 1 }].sort((a, b) => a.windowStart - b.windowStart);
}

function pruneOld(buckets: BaselineBucket[], cutoff: number): BaselineBucket[] {
  return buckets.filter(b => b.windowStart >= cutoff);
}

export const __testing = { HOUR_MS, DAY_MS, MIN_WARMUP_DAYS, ANOMALY_MULTIPLIER, RECENT_HOUR_FLOOR };
