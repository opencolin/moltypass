// Smoke test verifying that the test setup actually works end-to-end:
// the chrome.* mock round-trips, fake-indexeddb is wired, and the
// per-test reset prevents bleed between cases.

import { describe, it, expect } from 'vitest';
import { fakeChrome } from './setup';

describe('test infrastructure smoke', () => {
  it('chrome.storage.local round-trip works via the fake', async () => {
    await chrome.storage.local.set({ alpha: 1, beta: 'two' });
    const got = await chrome.storage.local.get(['alpha', 'beta']);
    expect(got).toEqual({ alpha: 1, beta: 'two' });
  });

  it('chrome.alarms create + get works and fires registered listeners', async () => {
    let fired = false;
    chrome.alarms.onAlarm.addListener(() => { fired = true; });
    await chrome.alarms.create('test-alarm', { delayInMinutes: 1 });
    const alarm = await chrome.alarms.get('test-alarm');
    expect(alarm?.name).toBe('test-alarm');
    fakeChrome.alarms.__fire('test-alarm');
    expect(fired).toBe(true);
  });

  it('IndexedDB round-trip works via fake-indexeddb', async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('smoke', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('s', { keyPath: 'id' });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('s', 'readwrite');
      tx.objectStore('s').add({ id: 1, value: 'hello' });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    const got = await new Promise<{ id: number; value: string } | undefined>((resolve, reject) => {
      const tx = db.transaction('s', 'readonly');
      const req = tx.objectStore('s').get(1);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    expect(got?.value).toBe('hello');
  });

  it('per-test reset clears chrome.storage between tests', async () => {
    // This test should NOT see 'alpha' from the first test thanks to
    // the beforeEach reset in tests/setup/index.ts.
    const got = await chrome.storage.local.get('alpha');
    expect(got).toEqual({});
  });
});
