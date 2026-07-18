// parseFilters / filterToSearchParams are pure — the DB-backed
// list* functions live in web/ and are covered by the RSC e2e suite
// (drizzle isn't a root dep so we can't import it here).

import { describe, it, expect } from 'vitest';

// Cherry-pick the pure exports. They don't transitively import
// drizzle from the entry point we use.
// Import from the pure module, not queries.ts (which imports drizzle).
import { parseFilters, filterToSearchParams } from '../web/lib/filters';

function sp(s: string): URLSearchParams {
  return new URLSearchParams(s);
}

describe('parseFilters', () => {
  it('returns DEFAULT_LIMIT (100) when nothing is set', () => {
    const f = parseFilters(sp(''));
    expect(f.limit).toBe(100);
    expect(f.offset).toBeUndefined();
    expect(f.origins).toBeUndefined();
  });

  it('parses tsRange when only from is provided', () => {
    const f = parseFilters(sp('from=1700000000000'));
    expect(f.tsRange?.from).toBe(1_700_000_000_000);
    expect(f.tsRange?.to).toBeUndefined();
  });

  it('parses tsRange when only to is provided', () => {
    const f = parseFilters(sp('to=1700000000000'));
    expect(f.tsRange?.from).toBeUndefined();
    expect(f.tsRange?.to).toBe(1_700_000_000_000);
  });

  it('collects repeated origin params', () => {
    const f = parseFilters(sp('origin=https://a&origin=https://b'));
    expect(f.origins).toEqual(['https://a', 'https://b']);
  });

  it('filters service values to the known providers (drops invalid)', () => {
    const f = parseFilters(sp('service=openai&service=banana&service=anthropic'));
    expect(f.services).toEqual(['openai', 'anthropic']);
  });

  it('collects fingerprints and kinds', () => {
    const f = parseFilters(sp('fp=abc&fp=def&kind=proxy.ok&kind=revoke'));
    expect(f.fingerprints).toEqual(['abc', 'def']);
    expect(f.kinds).toEqual(['proxy.ok', 'revoke']);
  });

  it('parses status range', () => {
    const f = parseFilters(sp('status_min=200&status_max=299'));
    expect(f.status).toEqual({ min: 200, max: 299 });
  });

  it('clamps limit to MAX_LIMIT (500)', () => {
    const f = parseFilters(sp('limit=999999'));
    expect(f.limit).toBe(500);
  });

  it('ignores negative or zero limit (falls back to default)', () => {
    expect(parseFilters(sp('limit=0')).limit).toBe(100);
    expect(parseFilters(sp('limit=-5')).limit).toBe(100);
  });

  it('accepts a valid offset', () => {
    const f = parseFilters(sp('offset=250'));
    expect(f.offset).toBe(250);
  });

  it('ignores a negative offset', () => {
    const f = parseFilters(sp('offset=-5'));
    expect(f.offset).toBeUndefined();
  });

  it('ignores junk numeric inputs', () => {
    const f = parseFilters(sp('from=banana&to=&status_min=oops'));
    expect(f.tsRange).toBeUndefined();
    expect(f.status).toBeUndefined();
  });
});

describe('filterToSearchParams', () => {
  it('round-trips a complete filter', () => {
    const before = {
      tsRange: { from: 1, to: 2 },
      origins: ['https://a', 'https://b'],
      services: ['anthropic'] as Array<'anthropic' | 'openai' | 'gemini'>,
      fingerprints: ['fp1'],
      kinds: ['proxy.ok'],
      status: { min: 200, max: 299 },
      limit: 50,
      offset: 100,
    };
    const sp = filterToSearchParams(before);
    const after = parseFilters(sp);
    expect(after).toEqual({
      tsRange: { from: 1, to: 2 },
      origins: ['https://a', 'https://b'],
      services: ['anthropic'],
      fingerprints: ['fp1'],
      kinds: ['proxy.ok'],
      status: { min: 200, max: 299 },
      limit: 50,
      offset: 100,
    });
  });

  it('omits limit when it matches the default (clean URL)', () => {
    const sp = filterToSearchParams({ limit: 100 });
    expect(sp.has('limit')).toBe(false);
  });

  it('omits offset when zero', () => {
    const sp = filterToSearchParams({ offset: 0 });
    expect(sp.has('offset')).toBe(false);
  });

  it('produces no params for an empty filter', () => {
    const sp = filterToSearchParams({});
    expect(sp.toString()).toBe('');
  });
});
