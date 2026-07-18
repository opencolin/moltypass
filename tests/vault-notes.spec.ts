import { describe, it, expect, beforeEach } from 'vitest';
import {
  initialize,
  unlock,
  lock,
  addKey,
  getKeyPlaintext,
  getNotes,
  setNotes,
  listEntries,
  removeKey,
} from '../src/background/vault';

const PW = 'correct horse battery staple';

beforeEach(async () => {
  await chrome.storage.local.clear();
  lock();
});

describe('vault notes', () => {
  it('addKey without notes stores hasNotes=false and returns empty notes', async () => {
    await initialize(PW);
    const e = await addKey('anthropic', 'personal', 'sk-ant-fake-000001');
    expect(e.hasNotes).toBe(false);
    const notes = await getNotes(e.id);
    expect(notes).toBe('');
  });

  it('addKey with notes stores them and getNotes returns plaintext', async () => {
    await initialize(PW);
    const e = await addKey(
      'anthropic',
      'personal',
      'sk-ant-fake-000002',
      'created for the Q3 demo, delete after Nov',
    );
    expect(e.hasNotes).toBe(true);
    const notes = await getNotes(e.id);
    expect(notes).toBe('created for the Q3 demo, delete after Nov');
  });

  it('setNotes on an existing item persists them', async () => {
    await initialize(PW);
    const e = await addKey('openai', 'work', 'sk-fake-openai-000003');
    expect(e.hasNotes).toBe(false);
    const updated = await setNotes(e.id, 'expires 2027-01-15');
    expect(updated.hasNotes).toBe(true);
    expect(updated.notesUpdatedAt).toBeTypeOf('number');
    expect(await getNotes(e.id)).toBe('expires 2027-01-15');
  });

  it('setNotes with empty string clears notes and hasNotes goes to false', async () => {
    await initialize(PW);
    const e = await addKey('openai', 'work', 'sk-fake-openai-000004', 'draft note');
    expect(e.hasNotes).toBe(true);
    const cleared = await setNotes(e.id, '');
    expect(cleared.hasNotes).toBe(false);
    expect(cleared.notesUpdatedAt).toBeUndefined();
    expect(await getNotes(e.id)).toBe('');
  });

  it('notes survive lock/unlock cycles', async () => {
    await initialize(PW);
    const e = await addKey('gemini', 'personal', 'AIza-fake-000005', 'used by the gemini pipeline');
    lock();
    expect(await unlock(PW)).toBe(true);
    expect(await getNotes(e.id)).toBe('used by the gemini pipeline');
  });

  it('getNotes throws when vault is locked', async () => {
    await initialize(PW);
    const e = await addKey('anthropic', 'personal', 'sk-ant-fake-000006', 'x');
    lock();
    await expect(getNotes(e.id)).rejects.toThrow(/locked/);
  });

  it('setNotes throws when vault is locked', async () => {
    await initialize(PW);
    const e = await addKey('anthropic', 'personal', 'sk-ant-fake-000007');
    lock();
    await expect(setNotes(e.id, 'new')).rejects.toThrow(/locked/);
  });

  it('getNotes throws for unknown key id', async () => {
    await initialize(PW);
    await expect(getNotes('nope')).rejects.toThrow(/not found/);
  });

  it('setNotes throws for unknown key id', async () => {
    await initialize(PW);
    await expect(setNotes('nope', 'x')).rejects.toThrow(/not found/);
  });

  it('notes ciphertext is not the plaintext', async () => {
    await initialize(PW);
    const secret = 'the notes contain a description of the deployment';
    const e = await addKey('anthropic', 'personal', 'sk-ant-fake-000008', secret);
    const raw = await chrome.storage.local.get('moltypass.vault');
    const stored = (raw['moltypass.vault'] as { entries: Array<{ id: string; notesCiphertext?: string }> }).entries;
    const stashed = stored.find(x => x.id === e.id);
    expect(stashed?.notesCiphertext).toBeDefined();
    expect(stashed?.notesCiphertext).not.toContain(secret);
  });

  it('listEntries surfaces hasNotes without unlocking notes', async () => {
    await initialize(PW);
    await addKey('anthropic', 'personal', 'sk-ant-fake-000009', 'with notes');
    await addKey('openai', 'work', 'sk-fake-openai-000010');
    lock();
    const list = await listEntries();
    expect(list.map(e => ({ service: e.service, hasNotes: e.hasNotes }))).toEqual([
      { service: 'anthropic', hasNotes: true },
      { service: 'openai', hasNotes: false },
    ]);
  });

  it('legacy entries (no notesCiphertext field) still list with hasNotes=false', async () => {
    // Bootstrap a real vault via initialize, then hand-forge a legacy entry
    // by writing directly to storage with no notesCiphertext field.
    await initialize(PW);
    const { createHeader, unlockWithHeader, encryptWith } = await import(
      '../src/crypto/vault-crypto'
    );
    const header = await createHeader(PW, 'pbkdf2');
    const key = (await unlockWithHeader(PW, header))!;
    await chrome.storage.local.set({
      'moltypass.vault': {
        header,
        entries: [
          {
            id: 'legacy-1',
            service: 'anthropic',
            label: 'personal',
            ciphertext: await encryptWith(key, 'sk-ant-fake-legacy'),
            createdAt: 1_700_000_000_000,
          },
        ],
      },
    });
    // Locking then unlocking picks up the new header from storage.
    lock();
    expect(await unlock(PW)).toBe(true);
    const list = await listEntries();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      id: 'legacy-1',
      service: 'anthropic',
      hasNotes: false,
    });
    expect(await getKeyPlaintext('legacy-1')).toBe('sk-ant-fake-legacy');
    expect(await getNotes('legacy-1')).toBe('');
  });

  it('removing the key removes its notes', async () => {
    await initialize(PW);
    const e = await addKey('anthropic', 'personal', 'sk-ant-fake-000011', 'to be deleted');
    await removeKey(e.id);
    await expect(getNotes(e.id)).rejects.toThrow(/not found/);
  });
});
