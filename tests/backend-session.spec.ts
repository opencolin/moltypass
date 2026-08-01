import { describe, it, expect, beforeEach } from 'vitest';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { randomBytes } from 'node:crypto';
import {
  sessionPath,
  loadSession,
  saveSession,
  clearSession,
  defaultExpiry,
} from '../src/backend/session';

let tmpSession: string;
let tmpVault: string;

beforeEach(async () => {
  const suffix = randomBytes(4).toString('hex');
  tmpSession = path.join(os.tmpdir(), 'moltypass-session-test-' + suffix + '.json');
  tmpVault = '/tmp/vault-' + suffix + '.enc';
  process.env.MOLTYPASS_SESSION = tmpSession;
  await fs.rm(tmpSession, { force: true });
});

describe('sessionPath', () => {
  it('honors MOLTYPASS_SESSION override', () => {
    expect(sessionPath()).toBe(tmpSession);
  });
});

describe('save + load', () => {
  it('round-trips a session record', async () => {
    const rec = { keyHex: 'a'.repeat(64), expiresAt: defaultExpiry(1000, 60000), vaultPath: tmpVault };
    await saveSession(rec);
    const loaded = await loadSession(tmpVault, 1000);
    expect(loaded?.keyHex).toBe('a'.repeat(64));
    expect(loaded?.expiresAt).toBe(defaultExpiry(1000, 60000));
  });

  it('returns null when session file missing', async () => {
    expect(await loadSession(tmpVault)).toBeNull();
  });

  it('returns null when session belongs to a different vault', async () => {
    await saveSession({ keyHex: 'b'.repeat(64), expiresAt: defaultExpiry(1000, 60000), vaultPath: '/some/other.enc' });
    expect(await loadSession(tmpVault, 1000)).toBeNull();
  });

  it('returns null (and clears the file) when session is expired', async () => {
    await saveSession({ keyHex: 'c'.repeat(64), expiresAt: 500, vaultPath: tmpVault });
    expect(await loadSession(tmpVault, 1000)).toBeNull();
    // Cleared.
    const exists = await fs.stat(tmpSession).then(() => true).catch(() => false);
    expect(exists).toBe(false);
  });

  it('writes with mode 0600', async () => {
    if (process.platform === 'win32') return;
    await saveSession({ keyHex: 'd'.repeat(64), expiresAt: defaultExpiry(), vaultPath: tmpVault });
    const stat = await fs.stat(tmpSession);
    expect(stat.mode & 0o777).toBe(0o600);
  });
});

describe('clearSession', () => {
  it('removes the session file', async () => {
    await saveSession({ keyHex: 'e'.repeat(64), expiresAt: defaultExpiry(), vaultPath: tmpVault });
    await clearSession();
    const exists = await fs.stat(tmpSession).then(() => true).catch(() => false);
    expect(exists).toBe(false);
  });

  it('is a no-op if the file doesnt exist', async () => {
    await expect(clearSession()).resolves.not.toThrow();
  });
});

describe('defaultExpiry', () => {
  it('returns now + 15 min by default', () => {
    expect(defaultExpiry(0)).toBe(15 * 60 * 1000);
  });
});
