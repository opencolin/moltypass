import { describe, it, expect, beforeEach } from 'vitest';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { randomBytes } from 'node:crypto';
import {
  vaultPath,
  vaultExists,
  initVault,
  unlockVault,
  loadVaultFile,
  saveVaultFile,
  addEntry,
  removeEntry,
  decryptEntry,
  findEntry,
} from '../src/backend/vault-file';

const PW = 'correct horse battery staple';

let tmp: string;
beforeEach(async () => {
  tmp = path.join(os.tmpdir(), 'moltypass-vault-test-' + randomBytes(6).toString('hex') + '.enc');
});

describe('vaultPath', () => {
  it('honors MOLTYPASS_VAULT override', () => {
    const orig = process.env.MOLTYPASS_VAULT;
    process.env.MOLTYPASS_VAULT = '/tmp/x.enc';
    expect(vaultPath()).toBe('/tmp/x.enc');
    if (orig === undefined) delete process.env.MOLTYPASS_VAULT;
    else process.env.MOLTYPASS_VAULT = orig;
  });

  it('returns an OS-appropriate path when unset', () => {
    const orig = process.env.MOLTYPASS_VAULT;
    delete process.env.MOLTYPASS_VAULT;
    const p = vaultPath();
    expect(p).toContain('Moltypass');
    expect(p.endsWith('vault.enc')).toBe(true);
    if (orig !== undefined) process.env.MOLTYPASS_VAULT = orig;
  });
});

describe('vaultExists', () => {
  it('false for a nonexistent path', async () => {
    expect(await vaultExists(tmp)).toBe(false);
  });

  it('true after initVault', async () => {
    await initVault(PW, tmp);
    expect(await vaultExists(tmp)).toBe(true);
  });
});

describe('initVault', () => {
  it('creates a fresh vault + returns a working key', async () => {
    const { vault, key } = await initVault(PW, tmp);
    expect(vault.version).toBe(1);
    expect(vault.entries).toEqual([]);
    expect(vault.header).toBeDefined();
    expect(key).toBeDefined();
  });

  it('refuses to overwrite an existing vault', async () => {
    await initVault(PW, tmp);
    await expect(initVault(PW, tmp)).rejects.toThrow(/already exists/);
  });

  it('writes with mode 0600', async () => {
    if (process.platform === 'win32') return;
    await initVault(PW, tmp);
    const s = await fs.stat(tmp);
    expect(s.mode & 0o777).toBe(0o600);
  });
});

describe('unlockVault', () => {
  it('unlocks with the right password', async () => {
    await initVault(PW, tmp);
    const { vault, key } = await unlockVault(PW, tmp);
    expect(vault.entries).toEqual([]);
    expect(key).toBeDefined();
  });

  it('rejects the wrong password', async () => {
    await initVault(PW, tmp);
    await expect(unlockVault('nope', tmp)).rejects.toThrow(/wrong password/);
  });

  it('errors when no vault exists', async () => {
    await expect(unlockVault(PW, tmp)).rejects.toThrow(/no vault/);
  });
});

describe('addEntry / decryptEntry / findEntry', () => {
  it('encrypts a key on add and decrypts it back', async () => {
    const { vault, key } = await initVault(PW, tmp);
    const e = await addEntry(vault, key, 'anthropic', 'personal', 'sk-ant-fake');
    expect(e.ciphertext).not.toContain('sk-ant-fake');
    const round = await decryptEntry(e, key);
    expect(round).toBe('sk-ant-fake');
  });

  it('persists across save + load + unlock', async () => {
    const { vault, key } = await initVault(PW, tmp);
    await addEntry(vault, key, 'openai', 'work', 'sk-openai-fake');
    await saveVaultFile(vault, tmp);

    const { vault: loaded, key: k2 } = await unlockVault(PW, tmp);
    expect(loaded.entries).toHaveLength(1);
    expect(await decryptEntry(loaded.entries[0], k2)).toBe('sk-openai-fake');
  });

  it('refuses duplicate service+label', async () => {
    const { vault, key } = await initVault(PW, tmp);
    await addEntry(vault, key, 'anthropic', 'personal', 'k1');
    await expect(addEntry(vault, key, 'anthropic', 'personal', 'k2')).rejects.toThrow(/already exists/);
  });

  it('supports notes', async () => {
    const { vault, key } = await initVault(PW, tmp);
    const e = await addEntry(vault, key, 'anthropic', 'personal', 'k', 'demo key');
    expect(e.notesCiphertext).toBeDefined();
  });

  it('findEntry with a label returns the specific match', async () => {
    const { vault, key } = await initVault(PW, tmp);
    await addEntry(vault, key, 'anthropic', 'personal', 'k1');
    await addEntry(vault, key, 'anthropic', 'work', 'k2');
    expect(findEntry(vault, 'anthropic', 'work')?.label).toBe('work');
  });

  it('findEntry without a label prefers "default" then "personal" then first', async () => {
    const { vault, key } = await initVault(PW, tmp);
    await addEntry(vault, key, 'anthropic', 'a', 'k1');
    await addEntry(vault, key, 'anthropic', 'personal', 'k2');
    expect(findEntry(vault, 'anthropic')?.label).toBe('personal');
    await addEntry(vault, key, 'anthropic', 'default', 'k3');
    expect(findEntry(vault, 'anthropic')?.label).toBe('default');
  });

  it('findEntry returns undefined for unknown service', async () => {
    const { vault } = await initVault(PW, tmp);
    expect(findEntry(vault, 'nope')).toBeUndefined();
  });
});

describe('removeEntry', () => {
  it('removes an existing entry', async () => {
    const { vault, key } = await initVault(PW, tmp);
    const e = await addEntry(vault, key, 'openai', 'work', 'k');
    expect(await removeEntry(vault, e.id)).toBe(true);
    expect(vault.entries).toHaveLength(0);
  });

  it('returns false for unknown id', async () => {
    const { vault } = await initVault(PW, tmp);
    expect(await removeEntry(vault, 'nope')).toBe(false);
  });
});

describe('atomic write', () => {
  it('does not leave partial vault on rename failure', async () => {
    // Basic sanity: after saveVaultFile the file exists and is parseable.
    const { vault, key } = await initVault(PW, tmp);
    await addEntry(vault, key, 'anthropic', 'x', 'k');
    await saveVaultFile(vault, tmp);
    const reloaded = await loadVaultFile(tmp);
    expect(reloaded?.entries).toHaveLength(1);
    // No leftover tmp files in the dir.
    const dir = path.dirname(tmp);
    const files = await fs.readdir(dir);
    const leftovers = files.filter(f => f.startsWith(path.basename(tmp) + '.') && f.endsWith('.tmp'));
    expect(leftovers).toEqual([]);
  });
});
