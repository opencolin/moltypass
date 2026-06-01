#!/usr/bin/env tsx
// Pack the Vite production build at dist/ into a Chrome-Web-Store-ready
// .zip with DETERMINISTIC file order and timestamps. Same dist/ contents
// produce byte-identical .zip output, so CI can diff release artifacts
// across runs.
//
// Usage:
//   pnpm zip                  -> dist/moltypass-<version>.zip
//   pnpm zip dist out.zip     -> explicit input/output

import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { deflateRawSync, crc32 } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const FIXED_TS = 0x21215000; // 2000-01-01 00:00:00 in MS-DOS date/time

function listFiles(dir: string, root: string = dir): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) out.push(...listFiles(p, root));
    else out.push(relative(root, p).split(sep).join('/'));
  }
  return out;
}

export interface ZipEntry {
  /** POSIX-style path inside the archive. */
  path: string;
  data: Buffer;
}

/**
 * Build a deterministic ZIP byte stream from a sorted list of entries.
 * Stores file content with deflate compression, fixed 2000-01-01
 * timestamps, and no extra fields — so identical inputs produce
 * identical output.
 */
export function buildZip(entries: ZipEntry[]): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const e of entries) {
    const nameBuf = Buffer.from(e.path, 'utf8');
    const compressed = deflateRawSync(e.data);
    const crc = crc32(e.data);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);              // signature
    localHeader.writeUInt16LE(20, 4);                       // version needed
    localHeader.writeUInt16LE(0, 6);                        // flags
    localHeader.writeUInt16LE(8, 8);                        // method: deflate
    localHeader.writeUInt32LE(FIXED_TS, 10);                // mod time + date
    localHeader.writeUInt32LE(crc, 14);                     // crc32
    localHeader.writeUInt32LE(compressed.length, 18);       // compressed size
    localHeader.writeUInt32LE(e.data.length, 22);           // uncompressed size
    localHeader.writeUInt16LE(nameBuf.length, 26);          // name length
    localHeader.writeUInt16LE(0, 28);                       // extra length
    localParts.push(localHeader, nameBuf, compressed);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);             // signature
    centralHeader.writeUInt16LE(20, 4);                     // version made by
    centralHeader.writeUInt16LE(20, 6);                     // version needed
    centralHeader.writeUInt16LE(0, 8);                      // flags
    centralHeader.writeUInt16LE(8, 10);                     // method
    centralHeader.writeUInt32LE(FIXED_TS, 12);              // mod time + date
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(compressed.length, 20);
    centralHeader.writeUInt32LE(e.data.length, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30);                     // extra length
    centralHeader.writeUInt16LE(0, 32);                     // comment length
    centralHeader.writeUInt16LE(0, 34);                     // disk number
    centralHeader.writeUInt16LE(0, 36);                     // internal attrs
    centralHeader.writeUInt32LE(0, 38);                     // external attrs
    centralHeader.writeUInt32LE(offset, 42);                // local header offset
    centralParts.push(centralHeader, nameBuf);

    offset += localHeader.length + nameBuf.length + compressed.length;
  }

  const central = Buffer.concat(centralParts);
  const local = Buffer.concat(localParts);

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);                        // EOCD signature
  eocd.writeUInt16LE(0, 4);                                  // disk number
  eocd.writeUInt16LE(0, 6);                                  // disk w/ central
  eocd.writeUInt16LE(entries.length, 8);                     // entries on disk
  eocd.writeUInt16LE(entries.length, 10);                    // total entries
  eocd.writeUInt32LE(central.length, 12);                    // central size
  eocd.writeUInt32LE(local.length, 16);                      // central offset
  eocd.writeUInt16LE(0, 20);                                 // comment length

  return Buffer.concat([local, central, eocd]);
}

/** Collect every file under `srcDir` into sorted ZipEntries. */
export function collectEntries(srcDir: string): ZipEntry[] {
  const paths = listFiles(srcDir);
  return paths.map(p => ({
    path: p,
    data: readFileSync(join(srcDir, p)),
  }));
}

// ----- CLI -----

if (process.argv[1]?.endsWith('zip-extension.ts')) {
  const __filename = fileURLToPath(import.meta.url);
  const REPO = dirname(dirname(__filename));
  const srcDir = process.argv[2] ?? join(REPO, 'dist');
  if (!existsSync(srcDir)) {
    console.error(`zip-extension: src not found: ${srcDir}`);
    process.exit(2);
  }
  const pkg = JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8')) as { version: string };
  const outPath = process.argv[3] ?? join(REPO, `dist-moltypass-${pkg.version}.zip`);
  const entries = collectEntries(srcDir);
  const zip = buildZip(entries);
  writeFileSync(outPath, zip);
  console.log(`zip: wrote ${outPath} (${entries.length} files, ${zip.length} bytes)`);
}
