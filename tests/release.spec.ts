import { describe, it, expect, vi } from 'vitest';
import { bumpVersion, runRelease, type RepoIO } from '../scripts/release';

describe('bumpVersion', () => {
  it('patch bumps the patch component', () => {
    expect(bumpVersion('0.0.1', 'patch')).toBe('0.0.2');
    expect(bumpVersion('1.2.3', 'patch')).toBe('1.2.4');
  });

  it('minor bumps minor and resets patch', () => {
    expect(bumpVersion('0.9.0', 'minor')).toBe('0.10.0');
    expect(bumpVersion('1.2.3', 'minor')).toBe('1.3.0');
  });

  it('major bumps major and resets minor + patch', () => {
    expect(bumpVersion('0.9.0', 'major')).toBe('1.0.0');
    expect(bumpVersion('1.2.3', 'major')).toBe('2.0.0');
  });

  it('set jumps to an explicit version', () => {
    expect(bumpVersion('0.9.0', { set: '1.0.0' })).toBe('1.0.0');
  });

  it('set rejects non-semver inputs', () => {
    expect(() => bumpVersion('0.0.1', { set: 'banana' })).toThrow();
    expect(() => bumpVersion('0.0.1', { set: '1.0' })).toThrow();
  });

  it('throws on a non-semver current version', () => {
    expect(() => bumpVersion('not-a-version', 'patch')).toThrow();
  });

  it('accepts prerelease suffixes on the current version', () => {
    // Prerelease is dropped on bump (consistent with npm's default).
    expect(bumpVersion('0.9.0-beta', 'patch')).toBe('0.9.1');
  });
});

describe('runRelease', () => {
  function makeIO(initial: string): RepoIO & { writes: string[]; tags: { name: string; message: string }[] } {
    let v = initial;
    const writes: string[] = [];
    const tags: { name: string; message: string }[] = [];
    return {
      readVersion: () => v,
      writeVersion: (next) => { v = next; writes.push(next); },
      createTag: (name, message) => { tags.push({ name, message }); },
      get writes() { return writes; },
      get tags() { return tags; },
    } as any;
  }

  it('writes the new version and creates a v-prefixed tag', () => {
    const io = makeIO('0.9.0');
    const res = runRelease('minor', io);
    expect(res).toEqual({ previous: '0.9.0', next: '0.10.0' });
    expect(io.writes).toEqual(['0.10.0']);
    expect(io.tags).toEqual([{ name: 'v0.10.0', message: 'release v0.10.0' }]);
  });

  it('throws when the bump produces the same version (set to current)', () => {
    const io = makeIO('1.0.0');
    expect(() => runRelease({ set: '1.0.0' }, io)).toThrow(/same version/);
    expect(io.writes).toHaveLength(0);
    expect(io.tags).toHaveLength(0);
  });

  it('does not tag when writeVersion throws', () => {
    const io = makeIO('0.9.0');
    io.writeVersion = vi.fn(() => { throw new Error('disk full'); });
    expect(() => runRelease('patch', io)).toThrow('disk full');
    expect(io.tags).toHaveLength(0);
  });
});
