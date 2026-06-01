// Orchestrator for the enterprise collector bridge.
//
// Two periodic actions:
//   1. INGEST TICK — drain the outbox to /api/ingest in batches of <=100.
//   2. POLICY TICK — fetch /api/policy with If-None-Match; persist + apply.
//
// Both are wrapped in withBackoff so a flapping collector triggers
// exponential backoff (30s -> 1h) rather than tight retry.

import type { AuditEvent } from '../shared/audit-types';
import { peekBatch as outboxPeekBatch, deleteUpTo as outboxDeleteUpTo, count as outboxCount } from './outbox';
import type { ManagedConfig, Policy, PolicyCache, FetchPolicyDeps } from './policy';
import { readPolicyCache, writePolicyCache, fetchPolicy } from './policy';
import { withBackoff, type BackoffStorage } from './backoff';

const INGEST_BATCH = 100;

// ----- DI surface -----

export interface IngestDeps {
  fetch: typeof fetch;
}

export interface OutboxOps {
  peekBatch(limit: number): Promise<Array<{ seq?: number; event: AuditEvent }>>;
  deleteUpTo(maxSeq: number): Promise<number>;
  count(): Promise<number>;
}

/** Default outbox-ops binding to the real outbox module. */
export const defaultOutboxOps: OutboxOps = {
  peekBatch: outboxPeekBatch,
  deleteUpTo: outboxDeleteUpTo,
  count: outboxCount,
};

// ----- ingest tick -----

export interface IngestResult {
  /** Number of events successfully shipped on this tick. */
  shipped: number;
  /** Whether the outbox still has rows. The next tick should run sooner. */
  drained: boolean;
}

/** Run one ingest batch. Throws on transport / 5xx failures so the
 *  caller (withBackoff) can record the failure. Returns shipped count
 *  on 2xx. */
export async function ingestOnce(
  config: ManagedConfig,
  outbox: OutboxOps,
  deps: IngestDeps,
): Promise<IngestResult> {
  const batch = await outbox.peekBatch(INGEST_BATCH);
  if (batch.length === 0) return { shipped: 0, drained: true };

  const maxSeq = Math.max(...batch.map(b => b.seq ?? 0));
  const events = batch.map(b => b.event);
  const res = await deps.fetch(config.ingestUrl, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${config.apiToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ events }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`ingest: ${res.status} ${body.slice(0, 200)}`);
  }
  // Delete-after-2xx — never lose events when the server confirms.
  await outbox.deleteUpTo(maxSeq);
  const remaining = await outbox.count();
  return { shipped: batch.length, drained: remaining === 0 };
}

/** Backoff-wrapped ingest tick. Returns { ran: true, result } on
 *  attempt (success or failure), { ran: false } when backoff suppressed. */
export async function runIngestTick(
  config: ManagedConfig,
  outbox: OutboxOps,
  storage: BackoffStorage,
  deps: IngestDeps,
  now: number = Date.now(),
): Promise<{ ran: boolean; result?: IngestResult }> {
  let result: IngestResult | undefined;
  const { ran } = await withBackoff(storage, async () => {
    result = await ingestOnce(config, outbox, deps);
  }, now).catch(err => {
    // Errors inside withBackoff are rethrown after state save; we
    // want to surface them at this layer but not crash the SW.
    console.warn('[enterprise] ingest tick error:', err);
    return { ran: true } as { ran: boolean };
  });
  return result ? { ran, result } : { ran };
}

// ----- policy tick -----

export interface PolicyTickResult {
  fetched: boolean;
  notModified: boolean;
  policy: Policy;
  etag: string | null;
}

/** Fetch + cache policy. Returns { fetched, notModified, policy, etag }. */
export async function policyOnce(
  config: ManagedConfig,
  deps: FetchPolicyDeps,
  now: number = Date.now(),
): Promise<PolicyTickResult> {
  const cached = await readPolicyCache();
  const res = await fetchPolicy(config, cached?.etag ?? null, deps);
  if (res.notModified && cached) {
    // Refresh fetchedAt but keep the cached policy + etag.
    await writePolicyCache({ ...cached, fetchedAt: now });
    return { fetched: true, notModified: true, policy: cached.policy, etag: cached.etag };
  }
  const cache: PolicyCache = { policy: res.policy, etag: res.etag, fetchedAt: now };
  await writePolicyCache(cache);
  return { fetched: true, notModified: false, policy: res.policy, etag: res.etag };
}

/** Backoff-wrapped policy tick. Same shape as runIngestTick. */
export async function runPolicyTick(
  config: ManagedConfig,
  storage: BackoffStorage,
  deps: FetchPolicyDeps,
  now: number = Date.now(),
): Promise<{ ran: boolean; result?: PolicyTickResult }> {
  let result: PolicyTickResult | undefined;
  const { ran } = await withBackoff(storage, async () => {
    result = await policyOnce(config, deps, now);
  }, now).catch(err => {
    console.warn('[enterprise] policy tick error:', err);
    return { ran: true } as { ran: boolean };
  });
  return result ? { ran, result } : { ran };
}
