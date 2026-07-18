// Leak-detection orchestrator. Hooks the rest of the SW into the
// baseline + findings + detection-keys modules.
//
// Signal B (local volume) — wired to every proxy.ok event via
//   onProxyOk(). recordEvent then checkAnomaly; raise on anomaly.
//
// Signal A (provider polling) — wired to the periodic poll loop via
//   onProviderPollResult(). Compares upstream delta vs local audit
//   delta per fingerprint; raise when the unexplained excess exceeds
//   max(5, 20% of expected).

import type { ProviderId } from '../shared/providers';
import { recordEvent, checkAnomaly } from './baseline';
import { raise } from './leak-findings';

/** Sniff the right severity for a Signal B anomaly. Tier by how many
 *  multiples over the threshold the recent hour is. */
export function severityForSignalB(recent: number, baselineRate: number): 'warn' | 'critical' {
  if (baselineRate === 0) return 'warn';
  const factor = recent / (baselineRate || 1);
  return factor >= 100 ? 'critical' : 'warn';
}

/** Hook called by proxy.ts after a successful upstream call. */
export async function onProxyOk(args: {
  fingerprint: string;
  provider: ProviderId;
  ts: number;
}): Promise<void> {
  await recordEvent({ fingerprint: args.fingerprint, ts: args.ts });
  const anomaly = await checkAnomaly(args.fingerprint, args.ts);
  if (!anomaly.anomalous) return;
  const severity = severityForSignalB(anomaly.recentHour, anomaly.baselineRate);
  await raise({
    signal: 'B',
    severity,
    provider: args.provider,
    fingerprint: args.fingerprint,
    expected: Math.round(anomaly.baselineRate),
    observed: anomaly.recentHour,
    detail: `Recent hour: ${anomaly.recentHour} calls. Baseline: ~${anomaly.baselineRate.toFixed(2)}/hr over ${Math.floor(anomaly.observedDays)}d.`,
  }, args.ts);
}

// ----- Signal A -----

export interface ProviderPollPerFingerprint {
  fingerprint: string;
  /** New upstream-reported calls since the prior poll. */
  upstreamDelta: number;
  /** Locally observed (audit-derived) calls since the prior poll. */
  localDelta: number;
}

const DELTA_TOLERANCE_FLOOR = 5;
const DELTA_TOLERANCE_RATIO = 0.2;

/** Pure: should we raise a Signal A finding given a per-fingerprint
 *  delta pair? Council T+1: raise when (upstream - local) > max(5,
 *  20% of expected). expected = max(localDelta, 1) so we don't divide
 *  by zero when the user hasn't used the key locally. */
export function shouldRaiseSignalA(args: ProviderPollPerFingerprint): {
  raise: boolean;
  unexplained: number;
  tolerance: number;
} {
  const expected = Math.max(args.localDelta, 1);
  const unexplained = args.upstreamDelta - args.localDelta;
  const tolerance = Math.max(DELTA_TOLERANCE_FLOOR, expected * DELTA_TOLERANCE_RATIO);
  return { raise: unexplained > tolerance, unexplained, tolerance };
}

/** Hook called by the Signal A poll loop with reconciled deltas. */
export async function onProviderPollResult(args: {
  provider: ProviderId;
  perFingerprint: ProviderPollPerFingerprint[];
  now: number;
}): Promise<void> {
  for (const row of args.perFingerprint) {
    const { raise: shouldRaise, unexplained, tolerance } = shouldRaiseSignalA(row);
    if (!shouldRaise) continue;
    await raise({
      signal: 'A',
      severity: unexplained > tolerance * 5 ? 'critical' : 'warn',
      provider: args.provider,
      fingerprint: row.fingerprint,
      expected: row.localDelta,
      observed: row.upstreamDelta,
      detail: `Upstream reports ${row.upstreamDelta} calls; Moltypass-mediated ${row.localDelta}. Unexplained excess ${unexplained} (tolerance ${Math.ceil(tolerance)}).`,
    }, args.now);
  }
}
