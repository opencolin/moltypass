import { describe, it, expect } from 'vitest';
import {
  parseMoltypassUri,
  isMoltypassUri,
  formatMoltypassUri,
  type ParsedMoltypassUri,
} from '../src/shared/moltypass-uri';

describe('parseMoltypassUri', () => {
  it('parses moltypass://<provider>/<label> with default field=key', () => {
    const r = parseMoltypassUri('moltypass://anthropic/personal');
    expect(r).toEqual({
      scheme: 'moltypass',
      provider: 'anthropic',
      label: 'personal',
      field: 'key',
    });
  });

  it('parses multipass:// alias identically', () => {
    const r = parseMoltypassUri('multipass://openai/work');
    expect(r).toEqual({
      scheme: 'multipass',
      provider: 'openai',
      label: 'work',
      field: 'key',
    });
  });

  it('accepts explicit /key field', () => {
    const r = parseMoltypassUri('moltypass://gemini/personal/key');
    expect((r as ParsedMoltypassUri).field).toBe('key');
  });

  it('accepts /notes field', () => {
    const r = parseMoltypassUri('moltypass://anthropic/personal/notes');
    expect((r as ParsedMoltypassUri).field).toBe('notes');
  });

  it('accepts /file:<name> field', () => {
    const r = parseMoltypassUri('moltypass://gcp/prod/file:service-account.json');
    expect((r as ParsedMoltypassUri).field).toBe('file:service-account.json');
  });

  it('percent-decodes the label', () => {
    const r = parseMoltypassUri('moltypass://anthropic/team%20shared');
    expect((r as ParsedMoltypassUri).label).toBe('team shared');
  });

  it('rejects http:// scheme', () => {
    const r = parseMoltypassUri('http://anthropic/personal');
    expect(r).toMatchObject({ kind: 'bad_scheme' });
  });

  it('rejects missing provider', () => {
    const r = parseMoltypassUri('moltypass:///personal');
    expect(r).toMatchObject({ kind: 'malformed' });
  });

  it('rejects provider with uppercase / dots', () => {
    const r = parseMoltypassUri('moltypass://Anthropic.AI/personal');
    expect(r).toMatchObject({ kind: 'missing_provider' });
  });

  it('rejects missing label', () => {
    const r = parseMoltypassUri('moltypass://anthropic/');
    expect(r).toMatchObject({ kind: 'malformed' });
  });

  it('rejects unknown field', () => {
    const r = parseMoltypassUri('moltypass://anthropic/personal/secret');
    expect(r).toMatchObject({ kind: 'bad_field' });
  });

  it('rejects empty file: name', () => {
    const r = parseMoltypassUri('moltypass://gcp/prod/file:');
    expect(r).toMatchObject({ kind: 'bad_field' });
  });

  it('rejects bad percent-encoding in label', () => {
    const r = parseMoltypassUri('moltypass://anthropic/team%ZZ');
    expect(r).toMatchObject({ kind: 'malformed' });
  });

  it('rejects empty input', () => {
    expect(parseMoltypassUri('')).toMatchObject({ kind: 'malformed' });
  });
});

describe('isMoltypassUri', () => {
  it('matches valid moltypass://', () => {
    expect(isMoltypassUri('moltypass://a/b')).toBe(true);
  });
  it('matches valid multipass://', () => {
    expect(isMoltypassUri('multipass://a/b')).toBe(true);
  });
  it('rejects strings without scheme', () => {
    expect(isMoltypassUri('a/b')).toBe(false);
  });
  it('rejects non-strings', () => {
    expect(isMoltypassUri(42)).toBe(false);
    expect(isMoltypassUri(null)).toBe(false);
    expect(isMoltypassUri(undefined)).toBe(false);
  });
});

describe('formatMoltypassUri', () => {
  it('serializes canonical form (always moltypass://)', () => {
    const out = formatMoltypassUri({
      scheme: 'multipass',
      provider: 'anthropic',
      label: 'personal',
      field: 'key',
    });
    expect(out).toBe('moltypass://anthropic/personal');
  });

  it('omits /key when field is default', () => {
    const out = formatMoltypassUri({
      scheme: 'moltypass',
      provider: 'openai',
      label: 'work',
      field: 'key',
    });
    expect(out).toBe('moltypass://openai/work');
  });

  it('includes /notes when field is notes', () => {
    const out = formatMoltypassUri({
      scheme: 'moltypass',
      provider: 'openai',
      label: 'work',
      field: 'notes',
    });
    expect(out).toBe('moltypass://openai/work/notes');
  });

  it('percent-encodes labels with spaces / slashes', () => {
    const out = formatMoltypassUri({
      scheme: 'moltypass',
      provider: 'anthropic',
      label: 'team shared/2026',
      field: 'key',
    });
    expect(out).toBe('moltypass://anthropic/team%20shared%2F2026');
  });

  it('round-trips through parse', () => {
    const original = 'moltypass://anthropic/team%20shared/notes';
    const parsed = parseMoltypassUri(original) as ParsedMoltypassUri;
    const serialized = formatMoltypassUri(parsed);
    expect(serialized).toBe(original);
  });
});
