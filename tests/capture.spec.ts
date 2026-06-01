import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleCapture, maskCandidate, type CaptureDeps } from '../src/background/capture';
import { __resetForTesting as resetAuditDb, query } from '../src/background/audit-db';
import { SYNTHETIC } from './fixtures/synthetic-keys';

beforeEach(() => { resetAuditDb(); });

function makeDeps(overrides: Partial<CaptureDeps> = {}): CaptureDeps {
  return {
    isVaultUnlocked: () => true,
    askForConfirmation: async () => ({ confirmed: true, label: 'default' }),
    saveToVault: async () => 'k-new',
    ...overrides,
  };
}

describe('handleCapture', () => {
  it('rejects an unknown service', async () => {
    const res = await handleCapture(
      { service: 'unknown' as never, candidate: SYNTHETIC.anthropic, method: 'create-detector' },
      makeDeps(),
    );
    expect(res).toEqual({ ok: false, reason: 'unknown_service' });
  });

  it('rejects a candidate that fails the anchored shape', async () => {
    const res = await handleCapture(
      { service: 'anthropic', candidate: 'not-a-key', method: 'create-detector' },
      makeDeps(),
    );
    expect(res).toEqual({ ok: false, reason: 'shape_invalid' });
  });

  it('rejects when the vault is locked', async () => {
    const res = await handleCapture(
      { service: 'anthropic', candidate: SYNTHETIC.anthropic, method: 'create-detector' },
      makeDeps({ isVaultUnlocked: () => false }),
    );
    expect(res).toEqual({ ok: false, reason: 'vault_locked' });
  });

  it('rejects when the user denies confirmation', async () => {
    const res = await handleCapture(
      { service: 'anthropic', candidate: SYNTHETIC.anthropic, method: 'create-detector' },
      makeDeps({ askForConfirmation: async () => ({ confirmed: false }) }),
    );
    expect(res).toEqual({ ok: false, reason: 'user_denied' });
  });

  it('saves to the vault and emits audit.capture on confirm', async () => {
    const save = vi.fn(async () => 'k-42');
    const askForConfirmation = vi.fn(async () => ({ confirmed: true, label: 'personal' }));
    const res = await handleCapture(
      {
        service: 'openai',
        candidate: SYNTHETIC.openai,
        method: 'create-detector',
        sourceUrl: 'https://platform.openai.com/api-keys',
      },
      makeDeps({ askForConfirmation, saveToVault: save }),
    );
    expect(res).toEqual({ ok: true, keyId: 'k-42' });
    expect(save).toHaveBeenCalledWith({ service: 'openai', label: 'personal', apiKey: SYNTHETIC.openai });
    expect(askForConfirmation).toHaveBeenCalledWith({
      service: 'openai',
      masked: expect.stringContaining('sk-'),
      sourceUrl: 'https://platform.openai.com/api-keys',
      method: 'create-detector',
    });

    await new Promise(r => setTimeout(r, 0));
    const events = await query({ kinds: ['capture'] });
    expect(events.records).toHaveLength(1);
    expect(events.records[0]!.service).toBe('openai');
    expect(events.records[0]!.keyId).toBe('k-42');
    expect(events.records[0]!.meta?.['method']).toBe('create-detector');
  });

  it('reports internal error when saveToVault throws', async () => {
    const res = await handleCapture(
      { service: 'gemini', candidate: SYNTHETIC.gemini, method: 'picker' },
      makeDeps({ saveToVault: async () => { throw new Error('disk full'); } }),
    );
    expect(res).toEqual({ ok: false, reason: 'internal' });
  });
});

describe('maskCandidate', () => {
  it('masks a long candidate by first 8 + last 4', () => {
    expect(maskCandidate('sk-ant-1234567890abcdef')).toBe('sk-ant-1…cdef');
  });

  it('masks a short candidate entirely', () => {
    expect(maskCandidate('short')).toBe('*****');
  });

  it('handles exactly 14 chars (boundary) with full mask', () => {
    expect(maskCandidate('a'.repeat(14))).toBe('*'.repeat(14));
  });
});
