// CI guard: greps the repo for key-shaped strings. The ONLY file allowed
// to contain such strings is tests/fixtures/synthetic-keys.ts. Any other
// hit fails the gate with exit 1.
//
// Run via: pnpm test:gate

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const ALLOWED = new Set([
  'tests/fixtures/synthetic-keys.ts',
  'scripts/grep-no-keys.ts', // this file mentions the patterns in comments
]);
const SCAN_DIRS = ['src', 'tests', 'web', 'scripts'];
const SKIP_DIRS = new Set(['node_modules', '.next', 'dist', 'coverage', 'playwright-report', '.git']);

const PATTERNS = [
  /sk-ant-[A-Za-z0-9_-]{12,}/,
  /sk-(?:proj-)?[A-Za-z0-9_-]{20,}/,
  /AIza[A-Za-z0-9_-]{20,}/,
];

interface Hit { file: string; line: number; pattern: string; preview: string; }
const hits: Hit[] = [];

function walk(dir: string): void {
  let entries: string[];
  try { entries = readdirSync(dir); } catch { return; }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    let stats;
    try { stats = statSync(full); } catch { continue; }
    if (stats.isDirectory()) {
      walk(full);
      continue;
    }
    if (!/\.(ts|tsx|js|jsx|md|json|html|css)$/.test(entry)) continue;
    const rel = relative(ROOT, full);
    if (ALLOWED.has(rel)) continue;
    const content = readFileSync(full, 'utf8');
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      for (const pat of PATTERNS) {
        const match = lines[i]!.match(pat);
        if (match) {
          // Skip lines that obviously reference the pattern via the
          // regex source itself (e.g. providers.ts keyShape).
          if (lines[i]!.includes('keyShape') || lines[i]!.includes('PATTERNS')) continue;
          hits.push({
            file: rel,
            line: i + 1,
            pattern: pat.source,
            preview: lines[i]!.slice(0, 120),
          });
        }
      }
    }
  }
}

for (const d of SCAN_DIRS) {
  walk(join(ROOT, d));
}

if (hits.length > 0) {
  console.error('grep-no-keys: FAIL');
  console.error('Found key-shaped strings outside the allow-list:');
  for (const h of hits) {
    console.error(`  ${h.file}:${h.line}  /${h.pattern}/`);
    console.error(`    ${h.preview}`);
  }
  console.error('');
  console.error('If this is a synthetic test fixture, move it to tests/fixtures/synthetic-keys.ts.');
  console.error('If this is a regex source matching key shapes (e.g. providers.ts), inline `// keyShape` on the line.');
  process.exit(1);
}

console.log('grep-no-keys: PASS — no key-shaped strings outside allow-list.');
