#!/usr/bin/env tsx
// Release script. Bumps the semver in package.json (the single source
// of truth) and creates a signed git tag. vite.config.ts reads the
// version from package.json at build time, so no manifest update is
// needed — the build pulls it in.
//
// Usage:
//   pnpm release patch          0.9.0 -> 0.9.1
//   pnpm release minor          0.9.0 -> 0.10.0
//   pnpm release major          0.9.0 -> 1.0.0
//   pnpm release set 1.0.0      explicit
//
// Council T+1 binding: the release script is the SOLE writer of the
// version field. Any other commit touching version is flagged by
// scripts/sync-version.ts (CI guard).

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

export type Bump = 'patch' | 'minor' | 'major' | { set: string };

const SEMVER_RE = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;

export function bumpVersion(current: string, bump: Bump): string {
  if (typeof bump === 'object' && bump.set) {
    if (!SEMVER_RE.test(bump.set)) throw new Error(`invalid version: ${bump.set}`);
    return bump.set;
  }
  const m = SEMVER_RE.exec(current);
  if (!m) throw new Error(`current version not semver: ${current}`);
  let [major, minor, patch] = [Number(m[1]), Number(m[2]), Number(m[3])];
  switch (bump) {
    case 'patch': patch++; break;
    case 'minor': minor++; patch = 0; break;
    case 'major': major++; minor = 0; patch = 0; break;
    default: throw new Error(`unknown bump: ${String(bump)}`);
  }
  return `${major}.${minor}.${patch}`;
}

export interface RepoIO {
  readVersion(): string;
  writeVersion(next: string): void;
  createTag(version: string, message: string): void;
}

export function runRelease(bump: Bump, io: RepoIO): { previous: string; next: string } {
  const previous = io.readVersion();
  const next = bumpVersion(previous, bump);
  if (next === previous) throw new Error(`bump produced same version: ${previous}`);
  io.writeVersion(next);
  io.createTag(`v${next}`, `release v${next}`);
  return { previous, next };
}

// ----- production IO -----

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = dirname(dirname(__filename));
const PKG_PATH = join(REPO_ROOT, 'package.json');

export const fsIO: RepoIO = {
  readVersion(): string {
    const pkg = JSON.parse(readFileSync(PKG_PATH, 'utf8')) as { version: string };
    return pkg.version;
  },
  writeVersion(next: string): void {
    const raw = readFileSync(PKG_PATH, 'utf8');
    const pkg = JSON.parse(raw) as { version: string };
    pkg.version = next;
    // Preserve trailing newline if present.
    const out = JSON.stringify(pkg, null, 2) + (raw.endsWith('\n') ? '\n' : '');
    writeFileSync(PKG_PATH, out, 'utf8');
  },
  createTag(version: string, message: string): void {
    execFileSync('git', ['tag', '-a', version, '-m', message], { cwd: REPO_ROOT });
  },
};

// CLI dispatch — guarded so this file is import-safe.
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('release.ts')) {
  const arg = process.argv[2];
  if (!arg) {
    console.error('Usage: pnpm release <patch|minor|major|set X.Y.Z>');
    process.exit(1);
  }
  const bump: Bump = arg === 'set'
    ? { set: process.argv[3] ?? '' }
    : (arg as 'patch' | 'minor' | 'major');
  try {
    const { previous, next } = runRelease(bump, fsIO);
    console.log(`bumped ${previous} -> ${next}`);
  } catch (err) {
    console.error('release failed:', err instanceof Error ? err.message : err);
    process.exit(2);
  }
}
