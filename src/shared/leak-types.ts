// Shared types for leak detection. Council T+1 decision:
//   - Signal A (provider usage polling) — needs admin keys; advisory.
//   - Signal B (local volume anomaly)  — fully client-side; ships first.
// Both signals produce LeakFinding records the audit page surfaces in
// a sidebar. We NEVER auto-revoke — the user (or rotateKey) decides.

import type { ProviderId } from './providers';

export type LeakSignal = 'A' | 'B';

export type LeakSeverity = 'info' | 'warn' | 'critical';

export type LeakStatus = 'open' | 'dismissed';

export interface LeakFinding {
  id: string;
  signal: LeakSignal;
  severity: LeakSeverity;
  /** Provider this finding relates to, if known. */
  provider?: ProviderId;
  /** Salted SHA-256 fingerprint of the key (never the key bytes). */
  fingerprint?: string;
  /** ms epoch. */
  createdAt: number;
  /** Numbers the user sees: how many calls vs. how many we expected. */
  expected: number;
  observed: number;
  /** Short human-readable explanation (no key bytes). */
  detail: string;
  status: LeakStatus;
  /** ms epoch set on dismiss; reactivation re-fires when observed
   *  exceeds the dismissed watermark. */
  dismissedAt?: number;
  /** The observed-at-dismissal watermark; new findings only re-fire
   *  when observed grows beyond this. */
  dismissedWatermark?: number;
}

/** A bucket in the rolling baseline. `count` is the number of proxy.ok
 *  events for this fingerprint in `windowStart..windowStart+windowMs`. */
export interface BaselineBucket {
  windowStart: number;
  windowMs: number;
  count: number;
}

/** Per-fingerprint baseline aggregate. */
export interface FingerprintBaseline {
  fingerprint: string;
  /** Hourly buckets; index 0 is the oldest. */
  hourly: BaselineBucket[];
  /** Daily rollup buckets — used for the 7-day baseline math. */
  daily: BaselineBucket[];
  /** Earliest event we've seen. Used to determine if we have enough
   *  data for an alert (warm-up guard per council T+1). */
  firstEventAt?: number;
}

/** Detection-key metadata for Signal A (admin-scoped keys). */
export interface DetectionKeyMeta {
  provider: ProviderId;
  /** Vault keyId — references an entry flagged role:'admin'. */
  keyId: string;
  addedAt: number;
  lastPollAt?: number;
  /** Opaque cursor returned by the provider's usage endpoint;
   *  advanced only after a successfully-reconciled poll. */
  lastPollCursor?: string;
  /** Per-fingerprint upstream-reported counts as of lastPollAt. */
  perKeyCounters: Record<string, {
    requests: number;
    inputTokens?: number;
    outputTokens?: number;
    asOf: number;
  }>;
}
