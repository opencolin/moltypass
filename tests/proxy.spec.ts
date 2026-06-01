// Integration smoke for src/background/proxy.ts -> audit-log -> audit-db.
//
// We mock fetch (no network) and vault.getKeyPlaintext so the proxy
// call runs end-to-end and lands an audit event in the real (fake)
// IndexedDB.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SYNTHETIC } from './fixtures/synthetic-keys';

// Mock the vault before importing proxy so the import chain picks up
// the mock instead of attaching to the real vault.
vi.mock('../src/background/vault', () => ({
  getKeyPlaintext: vi.fn(async () => SYNTHETIC.anthropic),
}));

import { proxyRequest } from '../src/background/proxy';
import { query, __resetForTesting as resetAuditDb } from '../src/background/audit-db';

beforeEach(() => {
  resetAuditDb();
  vi.restoreAllMocks();
});

describe('proxyRequest + audit emit integration', () => {
  it('emits proxy.ok audit event on a 2xx upstream response', async () => {
    const fakeRes = new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(fakeRes);

    const result = await proxyRequest(
      'anthropic',
      'k-1',
      '/v1/messages',
      'POST',
      {},
      { model: 'claude-opus-4-7', messages: [] },
      { origin: 'https://example.test', grantId: 'g-1' },
    );

    expect(result.status).toBe(200);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);

    // Allow the void auditLog promise to settle.
    await new Promise(r => setTimeout(r, 0));

    const events = await query({ kinds: ['proxy.ok'] });
    expect(events.records).toHaveLength(1);
    const e = events.records[0]!;
    expect(e.origin).toBe('https://example.test');
    expect(e.service).toBe('anthropic');
    expect(e.grantId).toBe('g-1');
    expect(e.status).toBe(200);
    expect(e.pathPreview).toBe('/v1/messages');
    expect(e.bytesUp).toBeGreaterThan(0);
    expect(e.bytesDown).toBeGreaterThan(0);
  });

  it('emits proxy.error audit event on a 4xx/5xx response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('rate limit', { status: 429 }),
    );

    await proxyRequest(
      'openai',
      'k-2',
      '/v1/chat/completions',
      'POST',
      {},
      { model: 'gpt-5' },
      { origin: 'https://chat.example' },
    );

    await new Promise(r => setTimeout(r, 0));
    const events = await query({ kinds: ['proxy.error'] });
    expect(events.records).toHaveLength(1);
    expect(events.records[0]!.status).toBe(429);
  });

  it('emits proxy.error and rethrows when fetch itself fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('network down'));

    await expect(proxyRequest(
      'gemini', 'k-3', '/v1beta/models/gemini-2.0:generateContent', 'POST', {}, {},
      { origin: 'https://aistudio.example' },
    )).rejects.toThrow('network down');

    await new Promise(r => setTimeout(r, 0));
    const events = await query({ kinds: ['proxy.error'] });
    expect(events.records).toHaveLength(1);
    expect(events.records[0]!.status).toBe(0);
    expect(events.records[0]!.meta?.['error']).toContain('network down');
  });

  it('skips audit when no audit context is provided', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
    await proxyRequest('anthropic', 'k-1', '/v1/messages', 'POST');
    await new Promise(r => setTimeout(r, 0));
    const events = await query({});
    expect(events.records).toHaveLength(0);
  });
});
