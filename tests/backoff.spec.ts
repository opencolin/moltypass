import { describe, it, expect, vi } from 'vitest';
import {
  nextDelay,
  onFailure,
  onSuccess,
  shouldAttempt,
  withBackoff,
  chromeStorageBackoff,
  type BackoffStorage,
  type BackoffState,
  __testing,
} from '../src/background/backoff';

describe('nextDelay', () => {
  it('returns 0 for non-positive failures', () => {
    expect(nextDelay(0)).toBe(0);
    expect(nextDelay(-1)).toBe(0);
  });

  it('doubles: 30s, 60s, 120s, 240s...', () => {
    expect(nextDelay(1)).toBe(30_000);
    expect(nextDelay(2)).toBe(60_000);
    expect(nextDelay(3)).toBe(120_000);
    expect(nextDelay(4)).toBe(240_000);
  });

  it('caps at MAX_MS (1 hour)', () => {
    expect(nextDelay(20)).toBe(__testing.MAX_MS);
    expect(nextDelay(50)).toBe(__testing.MAX_MS);
  });
});

describe('onFailure / onSuccess / shouldAttempt', () => {
  it('onFailure increments failures and schedules nextAttemptAt', () => {
    const before: BackoffState = { failures: 0, nextAttemptAt: 0 };
    const after = onFailure(before, 1_000);
    expect(after.failures).toBe(1);
    expect(after.nextAttemptAt).toBe(1_000 + 30_000);
  });

  it('onSuccess clears state', () => {
    expect(onSuccess()).toEqual({ failures: 0, nextAttemptAt: 0 });
  });

  it('shouldAttempt is false before nextAttemptAt, true at/after', () => {
    const state: BackoffState = { failures: 1, nextAttemptAt: 5_000 };
    expect(shouldAttempt(state, 4_999)).toBe(false);
    expect(shouldAttempt(state, 5_000)).toBe(true);
    expect(shouldAttempt(state, 9_999)).toBe(true);
  });
});

describe('withBackoff', () => {
  function memStorage(initial: BackoffState | null = null): BackoffStorage & { saved: BackoffState[] } {
    let state: BackoffState | null = initial;
    const saved: BackoffState[] = [];
    return {
      saved,
      async load() { return state; },
      async save(s) { state = s; saved.push(s); },
    };
  }

  it('runs the task and saves onSuccess on resolve', async () => {
    const storage = memStorage();
    const task = vi.fn(async () => {});
    const res = await withBackoff(storage, task, 1_000);
    expect(res.ran).toBe(true);
    expect(task).toHaveBeenCalledTimes(1);
    expect(storage.saved).toEqual([{ failures: 0, nextAttemptAt: 0 }]);
  });

  it('rethrows and saves onFailure on reject', async () => {
    const storage = memStorage();
    const task = vi.fn(async () => { throw new Error('upstream'); });
    await expect(withBackoff(storage, task, 1_000)).rejects.toThrow('upstream');
    expect(storage.saved).toHaveLength(1);
    expect(storage.saved[0]!).toEqual({ failures: 1, nextAttemptAt: 1_000 + 30_000 });
  });

  it('skips when nextAttemptAt is in the future', async () => {
    const storage = memStorage({ failures: 2, nextAttemptAt: 100_000 });
    const task = vi.fn();
    const res = await withBackoff(storage, task, 50_000);
    expect(res.ran).toBe(false);
    expect(task).not.toHaveBeenCalled();
    expect(storage.saved).toHaveLength(0);
  });

  it('exponential progression across repeated failures', async () => {
    const storage = memStorage();
    let now = 0;
    const fail = async () => { throw new Error('x'); };
    for (let i = 0; i < 4; i++) {
      try { await withBackoff(storage, fail, now); } catch { /* expected */ }
      // Jump time forward enough to clear the new backoff.
      now = storage.saved[storage.saved.length - 1]!.nextAttemptAt;
    }
    // After 4 failures, nextDelay should be 240_000.
    expect(storage.saved.map(s => s.failures)).toEqual([1, 2, 3, 4]);
  });

  it('clears state after a recovery success', async () => {
    const storage = memStorage();
    try {
      await withBackoff(storage, async () => { throw new Error('x'); }, 0);
    } catch { /* expected */ }
    expect(storage.saved[0]!.failures).toBe(1);
    // Time advances; success resets.
    await withBackoff(storage, async () => {}, 1_000_000);
    expect(storage.saved[1]!).toEqual({ failures: 0, nextAttemptAt: 0 });
  });

  it('first call without prior state uses sensible defaults', async () => {
    const storage = memStorage(null);
    const res = await withBackoff(storage, async () => {}, 0);
    expect(res.ran).toBe(true);
  });
});

describe('chromeStorageBackoff', () => {
  it('round-trips via fake-chrome', async () => {
    const s = chromeStorageBackoff();
    expect(await s.load()).toBeNull();
    await s.save({ failures: 3, nextAttemptAt: 999_999 });
    expect(await s.load()).toEqual({ failures: 3, nextAttemptAt: 999_999 });
  });
});
