#!/usr/bin/env tsx
// Parse conventional-commit messages between two git refs and emit
// grouped markdown for a GitHub Release body / CHANGELOG section.
//
// Usage:
//   pnpm release-notes v0.9.0-beta..HEAD
//   pnpm release-notes v0.5.0-alpha..v0.9.0-beta
//   pnpm release-notes                          # last tag..HEAD
//
// The parser is DI-shaped so tests can feed synthetic commit logs
// without invoking git.

import { execFileSync } from 'node:child_process';

export interface ParsedCommit {
  type: string;          // 'feat', 'fix', 'chore', 'docs', 'refactor', etc.
  scope?: string;        // 'audit', 'picker', etc.
  breaking: boolean;
  subject: string;       // text after the colon
  sha: string;           // short sha for reference
}

const CONVENTIONAL = /^(?<type>[A-Za-z]+)(?:\((?<scope>[^)]+)\))?(?<bang>!?):\s+(?<subject>.+)$/;

/** Parse one `<sha> <subject>` line into a ParsedCommit, or null if it
 *  doesn't follow the conventional format. */
export function parseLine(line: string): ParsedCommit | null {
  const sp = line.indexOf(' ');
  if (sp < 1) return null;
  const sha = line.slice(0, sp).trim();
  const subjectLine = line.slice(sp + 1).trim();
  const m = CONVENTIONAL.exec(subjectLine);
  if (!m?.groups) return null;
  return {
    type: m.groups['type']!.toLowerCase(),
    scope: m.groups['scope'] ?? undefined,
    breaking: m.groups['bang'] === '!',
    subject: m.groups['subject']!.trim(),
    sha,
  };
}

const GROUP_TITLES: Record<string, string> = {
  feat: '### Features',
  fix: '### Fixes',
  perf: '### Performance',
  refactor: '### Refactors',
  docs: '### Docs',
  test: '### Tests',
  build: '### Build & deps',
  ci: '### CI',
  chore: '### Chores',
};

const GROUP_ORDER = ['feat', 'fix', 'perf', 'refactor', 'docs', 'test', 'build', 'ci', 'chore'];

/** Build a markdown section from parsed commits. */
export function renderNotes(commits: ParsedCommit[], heading: string): string {
  const breaking = commits.filter(c => c.breaking);
  const byType = new Map<string, ParsedCommit[]>();
  for (const c of commits) {
    const arr = byType.get(c.type) ?? [];
    arr.push(c);
    byType.set(c.type, arr);
  }

  const lines: string[] = [];
  lines.push(`## ${heading}`);

  if (breaking.length) {
    lines.push('', '### ⚠️ Breaking changes');
    for (const c of breaking) {
      lines.push(`- ${formatCommit(c)}`);
    }
  }

  for (const type of GROUP_ORDER) {
    const group = byType.get(type);
    if (!group || group.length === 0) continue;
    lines.push('', GROUP_TITLES[type] ?? `### ${type}`);
    for (const c of group) {
      lines.push(`- ${formatCommit(c)}`);
    }
  }

  // Any other types not in GROUP_ORDER — keep them at the bottom.
  for (const [type, group] of byType.entries()) {
    if (GROUP_ORDER.includes(type)) continue;
    lines.push('', `### ${type}`);
    for (const c of group) {
      lines.push(`- ${formatCommit(c)}`);
    }
  }

  return lines.join('\n');
}

function formatCommit(c: ParsedCommit): string {
  const scope = c.scope ? `**${c.scope}:** ` : '';
  return `${scope}${c.subject} (\`${c.sha}\`)`;
}

/** Generate notes for a git range. range like 'v0.9.0..HEAD'. */
export function generateNotes(range: string, heading: string, fetchLog: (r: string) => string[]): string {
  const lines = fetchLog(range);
  const parsed = lines.map(parseLine).filter((c): c is ParsedCommit => c !== null);
  return renderNotes(parsed, heading);
}

/** Default git-backed log fetcher. Returns '<short-sha> <subject>' lines. */
export function gitLogLines(range: string): string[] {
  const out = execFileSync('git', ['log', range, '--pretty=format:%h %s'], {
    encoding: 'utf8',
  });
  return out.split('\n').filter(Boolean);
}

// ----- CLI -----

if (process.argv[1]?.endsWith('release-notes.ts')) {
  const range = process.argv[2] ?? defaultRange();
  const heading = process.argv[3] ?? rangeToHeading(range);
  console.log(generateNotes(range, heading, gitLogLines));
}

function defaultRange(): string {
  try {
    const lastTag = execFileSync('git', ['describe', '--tags', '--abbrev=0'], { encoding: 'utf8' }).trim();
    return `${lastTag}..HEAD`;
  } catch {
    return 'HEAD';
  }
}

function rangeToHeading(range: string): string {
  return range.includes('..')
    ? range.split('..')[1] ?? 'Changes'
    : range;
}
