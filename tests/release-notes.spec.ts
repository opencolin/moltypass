import { describe, it, expect } from 'vitest';
import { parseLine, renderNotes, generateNotes } from '../scripts/release-notes';

describe('parseLine', () => {
  it('parses a feat commit with scope', () => {
    expect(parseLine('abc123 feat(audit): add IDB query cursor')).toEqual({
      type: 'feat',
      scope: 'audit',
      breaking: false,
      subject: 'add IDB query cursor',
      sha: 'abc123',
    });
  });

  it('parses a fix commit without scope', () => {
    expect(parseLine('def456 fix: handle SW restart in audit-db')).toEqual({
      type: 'fix',
      scope: undefined,
      breaking: false,
      subject: 'handle SW restart in audit-db',
      sha: 'def456',
    });
  });

  it('parses a breaking-change commit (!)', () => {
    const p = parseLine('789abc feat(api)!: rename ProxyResponse.body to data');
    expect(p?.breaking).toBe(true);
    expect(p?.type).toBe('feat');
    expect(p?.scope).toBe('api');
  });

  it('returns null for non-conventional commit subjects', () => {
    expect(parseLine('1234567 just some random message')).toBeNull();
    expect(parseLine('1234567 :empty type')).toBeNull();
  });

  it('returns null for empty input', () => {
    expect(parseLine('')).toBeNull();
    expect(parseLine('justOneToken')).toBeNull();
  });

  it('lowercases the type', () => {
    expect(parseLine('aaaaaaa FEAT: shout-typed')?.type).toBe('feat');
  });
});

describe('renderNotes', () => {
  it('groups by type with the canonical heading order', () => {
    const md = renderNotes(
      [
        { type: 'chore', subject: 'bump deps', breaking: false, sha: 'a' },
        { type: 'feat', scope: 'audit', subject: 'add cursor', breaking: false, sha: 'b' },
        { type: 'fix', subject: 'oops', breaking: false, sha: 'c' },
      ],
      'v0.10.0',
    );
    const featIdx = md.indexOf('### Features');
    const fixIdx = md.indexOf('### Fixes');
    const choreIdx = md.indexOf('### Chores');
    expect(featIdx).toBeGreaterThan(-1);
    expect(featIdx).toBeLessThan(fixIdx);
    expect(fixIdx).toBeLessThan(choreIdx);
  });

  it('surfaces breaking changes in their own section at the top', () => {
    const md = renderNotes(
      [
        { type: 'feat', subject: 'nice', breaking: false, sha: 'a' },
        { type: 'feat', subject: 'wild new API', breaking: true, sha: 'b' },
      ],
      'v1.0.0',
    );
    const breakingIdx = md.indexOf('### ⚠️ Breaking changes');
    const featIdx = md.indexOf('### Features');
    expect(breakingIdx).toBeGreaterThan(-1);
    expect(breakingIdx).toBeLessThan(featIdx);
    expect(md).toContain('wild new API');
  });

  it('renders bold scope + sha backticks per line', () => {
    const md = renderNotes(
      [{ type: 'feat', scope: 'picker', subject: 'add overlay', breaking: false, sha: 'abc1234' }],
      'next',
    );
    expect(md).toContain('- **picker:** add overlay (`abc1234`)');
  });

  it('handles an empty commit list gracefully (just the heading)', () => {
    const md = renderNotes([], 'v0.0.1');
    expect(md.trim()).toBe('## v0.0.1');
  });

  it('keeps unknown types in their own trailing sections', () => {
    const md = renderNotes(
      [{ type: 'security', subject: 'fix STRIDE bug', breaking: false, sha: 'aaa' }],
      'sec',
    );
    expect(md).toContain('### security');
    expect(md).toContain('fix STRIDE bug');
  });
});

describe('generateNotes', () => {
  it('integrates parser + renderer over a fetched git log', () => {
    const fakeLog = () => [
      'aaa feat(audit): add IDB log',
      'bbb fix(picker): single-instance',
      'ccc chore: bump pnpm',
    ];
    const md = generateNotes('vX..vY', 'My Release', fakeLog);
    expect(md).toContain('## My Release');
    expect(md).toContain('### Features');
    expect(md).toContain('add IDB log');
    expect(md).toContain('### Fixes');
    expect(md).toContain('single-instance');
    expect(md).toContain('### Chores');
  });

  it('skips lines that do not match conventional format', () => {
    const fakeLog = () => [
      'aaa feat: real one',
      'bbb not a conventional message',
      'ccc fix: another real one',
    ];
    const md = generateNotes('range', 'h', fakeLog);
    expect(md).toContain('real one');
    expect(md).toContain('another real one');
    expect(md).not.toContain('not a conventional message');
  });
});
