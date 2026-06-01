import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildZip, collectEntries } from '../scripts/zip-extension';

function tmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'moltypass-zip-'));
}

describe('buildZip', () => {
  it('produces a valid ZIP byte stream with the EOCD signature at the end', () => {
    const entries = [
      { path: 'a.txt', data: Buffer.from('hello') },
      { path: 'b/c.txt', data: Buffer.from('world') },
    ];
    const zip = buildZip(entries);
    // EOCD signature 0x06054b50 (little-endian) at zip.length - 22.
    expect(zip.readUInt32LE(zip.length - 22)).toBe(0x06054b50);
    // Two entries reported.
    expect(zip.readUInt16LE(zip.length - 22 + 10)).toBe(2);
  });

  it('is deterministic — same inputs produce byte-identical output', () => {
    const entries = [
      { path: 'a.txt', data: Buffer.from('hello') },
      { path: 'b.txt', data: Buffer.from('world') },
    ];
    const first = buildZip(entries);
    const second = buildZip(entries);
    expect(first.equals(second)).toBe(true);
  });

  it('different content -> different output (sanity check, not strictly required)', () => {
    const a = buildZip([{ path: 'x', data: Buffer.from('one') }]);
    const b = buildZip([{ path: 'x', data: Buffer.from('two') }]);
    expect(a.equals(b)).toBe(false);
  });

  it('empty entry list still produces a valid (empty) archive', () => {
    const zip = buildZip([]);
    expect(zip.length).toBe(22); // just the EOCD record
    expect(zip.readUInt32LE(0)).toBe(0x06054b50);
    expect(zip.readUInt16LE(10)).toBe(0); // zero entries
  });
});

describe('collectEntries', () => {
  it('collects every file under the source directory in sorted order', () => {
    const dir = tmpDir();
    writeFileSync(join(dir, 'b.txt'), 'BB');
    writeFileSync(join(dir, 'a.txt'), 'AA');
    mkdirSync(join(dir, 'sub'));
    writeFileSync(join(dir, 'sub', 'c.txt'), 'CC');

    const entries = collectEntries(dir);
    expect(entries.map(e => e.path)).toEqual(['a.txt', 'b.txt', 'sub/c.txt']);
    expect(entries[2]!.data.toString()).toBe('CC');
  });

  it('uses POSIX-style separators even on platforms that use backslash', () => {
    const dir = tmpDir();
    mkdirSync(join(dir, 'nested'));
    writeFileSync(join(dir, 'nested', 'file'), 'x');
    const entries = collectEntries(dir);
    expect(entries[0]!.path).toBe('nested/file'); // no '\\'
  });
});

describe('buildZip + collectEntries (integration)', () => {
  it('round-trips a small directory into a deterministic archive', () => {
    const dir = tmpDir();
    writeFileSync(join(dir, 'manifest.json'), JSON.stringify({ name: 'x' }));
    writeFileSync(join(dir, 'background.js'), 'console.log("bg")');
    const zip1 = buildZip(collectEntries(dir));
    const zip2 = buildZip(collectEntries(dir));
    expect(zip1.equals(zip2)).toBe(true);
    // Sanity: archive contains the two files and the EOCD entry count is 2.
    expect(readdirSync(dir).sort()).toEqual(['background.js', 'manifest.json']);
    expect(zip1.readUInt16LE(zip1.length - 22 + 10)).toBe(2);
  });
});
