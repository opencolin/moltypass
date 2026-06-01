// Daily retention sweep. Deletes audit records older than RETENTION_DAYS
// via a chrome.alarms-driven background task. Idempotent — safe to run
// on every SW wake; it just deletes records past the cutoff.
//
// Per council T+1: enterprise policy can override RETENTION_DAYS in v2.0
// via chrome.storage.managed.retentionDays. For v1.0 (local-first), the
// constant below is the effective cap.

import { pruneOlderThan } from './audit-db';

const ALARM_NAME = 'moltypass.audit.retention';
const RETENTION_DAYS = 365;
const RETENTION_MS = RETENTION_DAYS * 24 * 60 * 60 * 1000;

/** Register the daily sweep alarm. Call once on SW startup. */
export async function registerRetentionAlarm(): Promise<void> {
  const existing = await chrome.alarms.get(ALARM_NAME);
  if (existing) return; // already scheduled
  await chrome.alarms.create(ALARM_NAME, {
    delayInMinutes: 60,           // first run within an hour of install
    periodInMinutes: 24 * 60,     // daily after that
  });
}

/** Wire this alarm name from your top-level chrome.alarms.onAlarm listener. */
export function isRetentionAlarm(name: string): boolean {
  return name === ALARM_NAME;
}

/** Delete records older than RETENTION_DAYS. Returns the count deleted. */
export async function sweep(now: number = Date.now()): Promise<number> {
  const cutoff = now - RETENTION_MS;
  return pruneOlderThan(cutoff);
}

export const __testing = { ALARM_NAME, RETENTION_DAYS, RETENTION_MS };
