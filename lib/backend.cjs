// Plain-JS backend for the moltypass CLI. Mirrors src/backend/*.ts so the
// bin script can require() it without a build step. Same wire format,
// same cryptography, same defaults — just no TypeScript.
//
// If you edit this file: also update src/backend/{vault-file,session,
// derive-node}.ts and run `pnpm test`.

'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const nodeCrypto = require('node:crypto');
const { promisify } = require('node:util');
const pbkdf2Async = promisify(nodeCrypto.pbkdf2);

const CANARY_PLAINTEXT = 'moltypass-canary-v1';
const PBKDF2_ITER_DEFAULT = 600_000;
const SALT_LEN = 16;
const IV_LEN = 12;
const KEY_LEN_BITS = 256;

// ------- OS paths -------

function vaultPath() {
  if (process.env.MOLTYPASS_VAULT) return process.env.MOLTYPASS_VAULT;
  const home = process.env.HOME || process.env.USERPROFILE || '.';
  if (process.platform === 'darwin') return path.join(home, 'Library', 'Application Support', 'Moltypass', 'vault.enc');
  if (process.platform === 'win32') return path.join(process.env.APPDATA || home, 'Moltypass', 'vault.enc');
  return path.join(process.env.XDG_CONFIG_HOME || path.join(home, '.config'), 'moltypass', 'vault.enc');
}

function sessionPath() {
  if (process.env.MOLTYPASS_SESSION) return process.env.MOLTYPASS_SESSION;
  const dir = process.env.XDG_RUNTIME_DIR
    || (process.platform === 'darwin' ? path.join(os.homedir(), 'Library', 'Caches', 'Moltypass') : os.tmpdir());
  const uid = typeof process.getuid === 'function' ? process.getuid() : 0;
  return path.join(dir, 'moltypass-' + uid + '.session');
}

// ------- Crypto helpers -------

async function deriveKey(password, saltBuf, iterations) {
  const raw = await pbkdf2Async(password, saltBuf, iterations, 32, 'sha256');
  return { raw, key: await crypto.subtle.importKey('raw', raw, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']) };
}

async function importRawKey(hex) {
  if (hex.length !== 64) throw new Error('expected 32-byte hex key');
  const buf = Buffer.from(hex, 'hex');
  return crypto.subtle.importKey('raw', buf, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

async function encryptWith(key, plaintext) {
  const iv = crypto.getRandomValues(new Uint8Array(IV_LEN));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plaintext)));
  const joined = new Uint8Array(iv.length + ct.length);
  joined.set(iv, 0);
  joined.set(ct, iv.length);
  return Buffer.from(joined).toString('base64');
}

async function decryptWith(key, b64) {
  const joined = Buffer.from(b64, 'base64');
  const iv = joined.slice(0, IV_LEN);
  const ct = joined.slice(IV_LEN);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
  return new TextDecoder().decode(pt);
}

// ------- Vault file I/O -------

async function ensureDir(file) {
  await fsp.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
}

async function atomicWrite(file, contents) {
  await ensureDir(file);
  const tmp = file + '.' + nodeCrypto.randomBytes(6).toString('hex') + '.tmp';
  await fsp.writeFile(tmp, contents, { encoding: 'utf8', mode: 0o600 });
  await fsp.rename(tmp, file);
  if (process.platform !== 'win32') await fsp.chmod(file, 0o600);
}

async function vaultExists(file) {
  try { const s = await fsp.stat(file || vaultPath()); return s.isFile() && s.size > 0; }
  catch { return false; }
}

async function loadVaultFile(file) {
  file = file || vaultPath();
  try {
    const raw = await fsp.readFile(file, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    if (e && e.code === 'ENOENT') return null;
    throw e;
  }
}

async function saveVaultFile(vault, file) {
  await atomicWrite(file || vaultPath(), JSON.stringify(vault, null, 2));
}

async function initVault(password, file) {
  file = file || vaultPath();
  if (await vaultExists(file)) throw new Error('vault already exists at ' + file);
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LEN));
  const { raw, key } = await deriveKey(password, Buffer.from(salt), PBKDF2_ITER_DEFAULT);
  const canary = await encryptWith(key, CANARY_PLAINTEXT);
  const vault = {
    version: 1,
    header: {
      v: 1,
      kdf: { alg: 'pbkdf2', version: 1, params: { iterations: PBKDF2_ITER_DEFAULT } },
      salt: Buffer.from(salt).toString('base64'),
      canary,
    },
    entries: [],
  };
  await saveVaultFile(vault, file);
  return { vault, key, raw };
}

async function unlockVault(password, file) {
  const vault = await loadVaultFile(file);
  if (!vault) throw new Error('no vault at ' + (file || vaultPath()) + ' — run `moltypass init` first');
  const iterations = vault.header.kdf.params.iterations;
  const salt = Buffer.from(vault.header.salt, 'base64');
  const { raw, key } = await deriveKey(password, salt, iterations);
  try {
    const plain = await decryptWith(key, vault.header.canary);
    if (plain !== CANARY_PLAINTEXT) throw new Error('wrong password');
  } catch {
    throw new Error('wrong password');
  }
  return { vault, key, raw };
}

async function addEntry(vault, key, service, label, apiKey, notes) {
  if (vault.entries.some(e => e.service === service && e.label === label)) {
    throw new Error(service + '/' + label + ' already exists');
  }
  const entry = {
    id: nodeCrypto.randomBytes(16).toString('hex'),
    service,
    label,
    ciphertext: await encryptWith(key, apiKey),
    createdAt: Date.now(),
  };
  if (notes && notes.length > 0) {
    entry.notesCiphertext = await encryptWith(key, notes);
    entry.notesUpdatedAt = Date.now();
  }
  vault.entries.push(entry);
  return entry;
}

function removeEntry(vault, id) {
  const before = vault.entries.length;
  vault.entries = vault.entries.filter(e => e.id !== id);
  return vault.entries.length < before;
}

function findEntry(vault, service, label) {
  const svc = vault.entries.filter(e => e.service === service);
  if (svc.length === 0) return undefined;
  if (label) return svc.find(e => e.label === label);
  if (svc.length === 1) return svc[0];
  return svc.find(e => e.label === 'default') || svc.find(e => e.label === 'personal') || svc[0];
}

async function decryptEntry(entry, key) {
  return decryptWith(key, entry.ciphertext);
}

// ------- Session cache -------

const DEFAULT_TTL_MS = 15 * 60 * 1000;

async function loadSession(vaultFile, now) {
  now = now || Date.now();
  try {
    const raw = await fsp.readFile(sessionPath(), 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed.version !== 1) return null;
    if (parsed.vaultPath !== vaultFile) return null;
    if (parsed.expiresAt < now) { await clearSession().catch(() => {}); return null; }
    return parsed;
  } catch { return null; }
}

async function saveSession(rec) {
  const file = sessionPath();
  await fsp.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const full = Object.assign({ version: 1 }, rec);
  await fsp.writeFile(file, JSON.stringify(full), { encoding: 'utf8', mode: 0o600 });
  if (process.platform !== 'win32') await fsp.chmod(file, 0o600);
}

async function clearSession() {
  await fsp.rm(sessionPath(), { force: true });
}

function defaultExpiry(now, ttlMs) {
  return (now || Date.now()) + (ttlMs || DEFAULT_TTL_MS);
}

// ------- Password prompt (TTY, minimal, hidden echo) -------

async function promptPassword(message, options) {
  options = options || {};
  if (options.allowEnv !== false && process.env.MOLTYPASS_PASSWORD) {
    return process.env.MOLTYPASS_PASSWORD;
  }
  const readline = require('node:readline');
  const first = await readSilent(message || 'Master password: ', readline);
  if (!options.confirm) return first;
  const second = await readSilent('Confirm password: ', readline);
  if (first !== second) throw new Error('passwords do not match');
  return first;
}

function readSilent(prompt, readline) {
  return new Promise((resolve, reject) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stderr, terminal: true });
    process.stderr.write(prompt);
    const origWrite = rl._writeToOutput ? rl._writeToOutput.bind(rl) : null;
    rl._writeToOutput = (out) => {
      if (out && out.includes && out.includes(prompt)) return origWrite ? origWrite(out) : undefined;
      // Suppress the echoed line.
    };
    rl.once('line', (line) => { rl.close(); process.stderr.write('\n'); resolve(line); });
    rl.once('error', (e) => { rl.close(); reject(e); });
  });
}

async function promptLine(message) {
  const readline = require('node:readline');
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
    rl.question(message, (a) => { rl.close(); resolve(a); });
  });
}

// ------- Session helper for CLI -------

/**
 * Get an unlocked key + vault. If a valid session exists, use it (no
 * prompt). Otherwise prompt for the password, unlock, and refresh the
 * session. Returns { vault, key } or throws with a helpful message.
 */
async function getUnlockedVault(opts) {
  opts = opts || {};
  const file = opts.vaultFile || vaultPath();
  if (!(await vaultExists(file))) {
    throw new Error('no vault at ' + file + ' — run `moltypass init` first');
  }
  const session = await loadSession(file);
  if (session) {
    const vault = await loadVaultFile(file);
    const key = await importRawKey(session.keyHex);
    return { vault, key };
  }
  const password = await promptPassword();
  const { vault, key, raw } = await unlockVault(password, file);
  if (!opts.noCache) {
    await saveSession({ keyHex: Buffer.from(raw).toString('hex'), expiresAt: defaultExpiry(), vaultPath: file });
  }
  return { vault, key };
}

module.exports = {
  vaultPath, sessionPath,
  vaultExists, loadVaultFile, saveVaultFile,
  initVault, unlockVault,
  addEntry, removeEntry, findEntry, decryptEntry,
  loadSession, saveSession, clearSession, defaultExpiry,
  importRawKey, encryptWith, decryptWith,
  promptPassword, promptLine,
  getUnlockedVault,
};
