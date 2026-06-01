import { describe, it, expect, beforeEach } from 'vitest';
import {
  set,
  get,
  clear,
  listConfigured,
  recordPoll,
  isDetectionKey,
} from '../src/background/detection-keys';

beforeEach(async () => {
  await chrome.storage.local.clear();
});

describe('set + get', () => {
  it('returns null when not configured', async () => {
    expect(await get('anthropic')).toBeNull();
  });

  it('persists the meta and reads it back', async () => {
    const meta = await set('anthropic', 'vk-admin-1', 1_000);
    expect(meta.provider).toBe('anthropic');
    expect(meta.keyId).toBe('vk-admin-1');
    expect(meta.addedAt).toBe(1_000);
    expect(meta.perKeyCounters).toEqual({});

    const read = await get('anthropic');
    expect(read?.keyId).toBe('vk-admin-1');
  });

  it('rejects an empty keyId', async () => {
    await expect(set('openai', '', 0)).rejects.toThrow('keyId is required');
  });

  it('separates configuration per provider', async () => {
    await set('anthropic', 'vk-a', 0);
    await set('openai', 'vk-b', 0);
    expect((await get('anthropic'))?.keyId).toBe('vk-a');
    expect((await get('openai'))?.keyId).toBe('vk-b');
    expect(await get('gemini')).toBeNull();
  });

  it('set replaces a prior registration for the same provider', async () => {
    await set('anthropic', 'vk-1', 0);
    await set('anthropic', 'vk-2', 1_000);
    expect((await get('anthropic'))?.keyId).toBe('vk-2');
  });
});

describe('clear', () => {
  it('removes the provider registration', async () => {
    await set('openai', 'vk-x', 0);
    await clear('openai');
    expect(await get('openai')).toBeNull();
  });

  it('is a no-op on an unconfigured provider', async () => {
    await expect(clear('gemini')).resolves.not.toThrow();
  });
});

describe('listConfigured', () => {
  it('returns every configured provider', async () => {
    await set('anthropic', 'vk-a', 0);
    await set('openai', 'vk-b', 0);
    const list = await listConfigured();
    expect(list).toHaveLength(2);
    expect(list.map(m => m.provider).sort()).toEqual(['anthropic', 'openai']);
  });

  it('returns an empty array when none are configured', async () => {
    expect(await listConfigured()).toEqual([]);
  });
});

describe('recordPoll', () => {
  it('advances lastPollAt + cursor + perKeyCounters atomically', async () => {
    await set('anthropic', 'vk-a', 0);
    const meta = await recordPoll('anthropic', {
      now: 500,
      cursor: 'page=2',
      perKeyCounters: { 'fp-x': { requests: 100, asOf: 500 } },
    });
    expect(meta?.lastPollAt).toBe(500);
    expect(meta?.lastPollCursor).toBe('page=2');
    expect(meta?.perKeyCounters['fp-x']).toEqual({ requests: 100, asOf: 500 });
  });

  it('returns null when the provider is not configured', async () => {
    const meta = await recordPoll('gemini', { now: 100 });
    expect(meta).toBeNull();
  });

  it('only updates fields that were provided (partial update)', async () => {
    await set('anthropic', 'vk-a', 0);
    await recordPoll('anthropic', { now: 100, cursor: 'first' });
    const meta = await recordPoll('anthropic', { now: 200 }); // no cursor
    expect(meta?.lastPollCursor).toBe('first'); // unchanged
    expect(meta?.lastPollAt).toBe(200); // updated
  });
});

describe('isDetectionKey', () => {
  it('returns true for a registered keyId', async () => {
    await set('anthropic', 'vk-admin', 0);
    expect(await isDetectionKey('vk-admin')).toBe(true);
  });

  it('returns false for unknown keyIds', async () => {
    expect(await isDetectionKey('vk-personal')).toBe(false);
  });

  it('returns true when the keyId is registered for ANY provider', async () => {
    await set('openai', 'vk-x', 0);
    expect(await isDetectionKey('vk-x')).toBe(true);
  });
});
