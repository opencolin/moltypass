import { describe, it, expect } from 'vitest';
import {
  encodeFrame,
  decodeFrame,
  isErrorResponse,
  isEvent,
  type NativeRequest,
  type NativeMessage,
} from '../src/shared/native-protocol';

describe('encodeFrame / decodeFrame', () => {
  it('round-trips a simple object', () => {
    const value = { hello: 'world', n: 42 };
    const frame = encodeFrame(value);
    const decoded = decodeFrame(frame);
    expect(decoded?.value).toEqual(value);
    expect(decoded?.consumed).toBe(frame.length);
  });

  it('writes a 4-byte little-endian length prefix', () => {
    const frame = encodeFrame({}); // shortest valid JSON object
    const view = new DataView(frame.buffer);
    // '{}' is 2 bytes UTF-8.
    expect(view.getUint32(0, true)).toBe(2);
    expect(frame.length).toBe(6); // 4 prefix + 2 body
  });

  it('returns null when the buffer holds only part of the length prefix', () => {
    expect(decodeFrame(new Uint8Array([1, 2, 3]))).toBeNull();
  });

  it('returns null when the buffer has the length but not the body', () => {
    const partial = new Uint8Array([10, 0, 0, 0, 0x7b, 0x7d]); // claims 10 bytes, has 2
    expect(decodeFrame(partial)).toBeNull();
  });

  it('decodes the first frame from a multi-frame buffer and reports consumed', () => {
    const a = encodeFrame({ first: true });
    const b = encodeFrame({ second: true });
    const combined = new Uint8Array(a.length + b.length);
    combined.set(a, 0);
    combined.set(b, a.length);

    const first = decodeFrame(combined);
    expect(first?.value).toEqual({ first: true });
    expect(first?.consumed).toBe(a.length);

    const remaining = combined.subarray(first!.consumed);
    const second = decodeFrame(remaining);
    expect(second?.value).toEqual({ second: true });
    expect(second?.consumed).toBe(b.length);
  });

  it('throws on a frame whose body is not valid JSON', () => {
    // length=3, body = 'foo' (not JSON-parseable)
    const bad = new Uint8Array([3, 0, 0, 0, 0x66, 0x6f, 0x6f]);
    expect(() => decodeFrame(bad)).toThrow(/bad JSON/);
  });

  it('handles non-ASCII characters via UTF-8 byte length, not string length', () => {
    const value = { msg: '✨ Touch ID unlocked' };
    const frame = encodeFrame(value);
    const json = JSON.stringify(value);
    const expectedBytes = new TextEncoder().encode(json).length;
    const view = new DataView(frame.buffer);
    expect(view.getUint32(0, true)).toBe(expectedBytes);
    expect(decodeFrame(frame)?.value).toEqual(value);
  });

  it('round-trips a real NativeRequest', () => {
    const req: NativeRequest = {
      id: 'req-1',
      kind: 'getKey',
      provider: 'anthropic',
      label: 'personal',
      caller: { kind: 'cli', argv0: 'hermes', cwd: '/Users/test/code' },
    };
    const decoded = decodeFrame(encodeFrame(req))?.value as NativeRequest;
    expect(decoded.kind).toBe('getKey');
    expect(decoded.id).toBe('req-1');
  });
});

describe('isErrorResponse', () => {
  it('returns true for a typed error response', () => {
    const err: NativeMessage = {
      id: 'r-1',
      ok: false,
      error: { code: 'vault_locked', message: 'Vault is locked' },
    };
    expect(isErrorResponse(err)).toBe(true);
  });

  it('returns false for a successful response', () => {
    const ok: NativeMessage = {
      id: 'r-1',
      kind: 'lock',
      ok: true,
    };
    expect(isErrorResponse(ok)).toBe(false);
  });

  it('returns false for non-object inputs', () => {
    expect(isErrorResponse(null)).toBe(false);
    expect(isErrorResponse('error')).toBe(false);
    expect(isErrorResponse(42)).toBe(false);
  });
});

describe('isEvent', () => {
  it('recognizes vaultLocked', () => {
    expect(isEvent({ kind: 'vaultLocked', reason: 'idle' })).toBe(true);
  });

  it('recognizes vaultUnlocked', () => {
    expect(isEvent({
      kind: 'vaultUnlocked',
      method: 'touchid',
      idleLockAt: 1_000,
    })).toBe(true);
  });

  it('returns false for response shapes', () => {
    expect(isEvent({ id: 'x', kind: 'lock', ok: true })).toBe(false);
  });

  it('returns false for non-objects', () => {
    expect(isEvent(null)).toBe(false);
    expect(isEvent(undefined)).toBe(false);
    expect(isEvent('vaultLocked')).toBe(false);
  });
});
