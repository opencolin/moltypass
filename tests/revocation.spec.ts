import { describe, it, expect, beforeEach } from 'vitest';
import {
  readEpoch,
  bumpEpoch,
  registerInFlight,
  unregisterInFlight,
  abortGrant,
  abortAllInFlight,
  inFlightCount,
  RevokedError,
} from '../src/background/revocation';

beforeEach(async () => {
  await chrome.storage.local.clear();
});

describe('revocation epoch', () => {
  it('starts at 0 when nothing is stored', async () => {
    expect(await readEpoch()).toBe(0);
  });

  it('bumpEpoch increments and persists', async () => {
    expect(await bumpEpoch()).toBe(1);
    expect(await bumpEpoch()).toBe(2);
    expect(await readEpoch()).toBe(2);
  });

  it('readEpoch survives a fresh storage read (persistence)', async () => {
    await bumpEpoch();
    await bumpEpoch();
    await bumpEpoch();
    // Direct read bypassing the helper, to assert persistence shape.
    const raw = await chrome.storage.local.get('moltypass.revocation.epoch');
    expect(raw['moltypass.revocation.epoch']).toBe(3);
  });
});

describe('in-flight registry', () => {
  it('register/unregister maintains an accurate count', () => {
    const a = new AbortController();
    const b = new AbortController();
    registerInFlight('g1', a);
    registerInFlight('g1', b);
    expect(inFlightCount()).toBe(2);
    unregisterInFlight('g1', a);
    expect(inFlightCount()).toBe(1);
    unregisterInFlight('g1', b);
    expect(inFlightCount()).toBe(0);
  });

  it('abortGrant signals all controllers for that grant', () => {
    const a = new AbortController();
    const b = new AbortController();
    const other = new AbortController();
    registerInFlight('g1', a);
    registerInFlight('g1', b);
    registerInFlight('g2', other);

    abortGrant('g1');

    expect(a.signal.aborted).toBe(true);
    expect(b.signal.aborted).toBe(true);
    expect(other.signal.aborted).toBe(false);
    expect(inFlightCount()).toBe(1); // only g2's controller remains
  });

  it('abortAllInFlight signals every controller', () => {
    const a = new AbortController();
    const b = new AbortController();
    registerInFlight('g1', a);
    registerInFlight('g2', b);

    abortAllInFlight();

    expect(a.signal.aborted).toBe(true);
    expect(b.signal.aborted).toBe(true);
    expect(inFlightCount()).toBe(0);
  });

  it('bumpEpoch aborts every in-flight controller as a side effect', async () => {
    const a = new AbortController();
    const b = new AbortController();
    registerInFlight('g1', a);
    registerInFlight('g2', b);

    await bumpEpoch();

    expect(a.signal.aborted).toBe(true);
    expect(b.signal.aborted).toBe(true);
    expect(inFlightCount()).toBe(0);
  });
});

describe('RevokedError', () => {
  it('captures the grantId in the message', () => {
    const err = new RevokedError('g-42');
    expect(err.name).toBe('RevokedError');
    expect(err.message).toContain('g-42');
    expect(err.grantId).toBe('g-42');
  });

  it('works without a grantId (epoch-only revoke)', () => {
    const err = new RevokedError();
    expect(err.message).toContain('revoked');
  });
});
