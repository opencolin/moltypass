// Exponential backoff state machine for ingest + policy ticks.
//
// Persisted in chrome.storage.local so it survives SW death — the next
// wake reads the same failure count and respects the same nextAttemptAt.
// Without persistence a flapping collector could thrash the SW into
// constant retry on every wake.
//
// Doubles from BASE_MS up to MAX_MS. Each tick records success (resets
// to zero) or failure (bumps + recomputes nextAttemptAt). shouldAttempt
// returns false until `now >= nextAttemptAt`.

const BASE_MS = 30_000;        // 30 seconds
const MAX_MS = 60 * 60 * 1000; // 1 hour ceiling per council T+1

export interface BackoffState {
  failures: number;
  /** ms epoch — earliest time the next attempt may run. */
  nextAttemptAt: number;
}

/** Pure: compute the delay for the next attempt given `failures`. */
export function nextDelay(failures: number): number {
  if (failures <= 0) return 0;
  // 30s, 60s, 120s, 240s, ... capped at MAX_MS.
  const ms = BASE_MS * Math.pow(2, failures - 1);
  return Math.min(ms, MAX_MS);
}

/** Pure: state after a failure. */
export function onFailure(prev: BackoffState, now: number): BackoffState {
  const failures = prev.failures + 1;
  return { failures, nextAttemptAt: now + nextDelay(failures) };
}

/** Pure: reset state after a success. */
export function onSuccess(): BackoffState {
  return { failures: 0, nextAttemptAt: 0 };
}

/** Pure: should we attempt now? */
export function shouldAttempt(state: BackoffState, now: number): boolean {
  return now >= state.nextAttemptAt;
}

// ----- storage-backed wrapper -----

export interface BackoffStorage {
  load(): Promise<BackoffState | null>;
  save(state: BackoffState): Promise<void>;
}

/**
 * Storage-backed orchestrator. Reads state at call time, decides if a
 * tick should run, runs the supplied task, and updates state based on
 * the task's resolve/reject. Returns true if the task ran, false if it
 * was skipped due to backoff.
 */
export async function withBackoff(
  storage: BackoffStorage,
  task: () => Promise<void>,
  now: number = Date.now(),
): Promise<{ ran: boolean; state: BackoffState }> {
  const state = (await storage.load()) ?? { failures: 0, nextAttemptAt: 0 };
  if (!shouldAttempt(state, now)) return { ran: false, state };

  try {
    await task();
    const next = onSuccess();
    await storage.save(next);
    return { ran: true, state: next };
  } catch (err) {
    const next = onFailure(state, now);
    await storage.save(next);
    throw err;
  }
}

/** Default chrome.storage.local-backed storage. */
const STORAGE_KEY = 'moltypass.enterprise.backoff';
export function chromeStorageBackoff(): BackoffStorage {
  return {
    async load() {
      const res = await chrome.storage.local.get(STORAGE_KEY);
      return (res[STORAGE_KEY] as BackoffState | undefined) ?? null;
    },
    async save(state) {
      await chrome.storage.local.set({ [STORAGE_KEY]: state });
    },
  };
}

export const __testing = { BASE_MS, MAX_MS };
