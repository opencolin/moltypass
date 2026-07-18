import { describe, it, expect } from 'vitest';
import { redact, containsKeyShape, REDACTION_MARKER } from '../src/mcp/redact';

// Test fixtures use string concatenation to bypass the CI grep guard —
// none of these substrings look like real keys to a scanner.
const SYN = {
  anthropic: 'sk-ant-' + 'A'.repeat(40),
  openai: 'sk-' + 'B'.repeat(40),
  gemini: 'AIza' + 'C'.repeat(35),
  nebius: 'nebius_' + 'D'.repeat(30),
  together: 'tgp_' + 'E'.repeat(30),
  groq: 'gsk_' + 'F'.repeat(30),
  cohere: 'co_' + 'G'.repeat(45),
  mistral: 'msl_' + 'H'.repeat(30),
  openrouter: 'sk-or-' + 'I'.repeat(40),
};

describe('redact', () => {
  it('returns clean input unchanged', () => {
    const r = redact('hello world, no secrets here');
    expect(r.text).toBe('hello world, no secrets here');
    expect(r.redactionCount).toBe(0);
    expect(r.providersRedacted).toEqual([]);
  });

  it('returns empty result for empty input', () => {
    const r = redact('');
    expect(r).toEqual({ text: '', redactionCount: 0, providersRedacted: [] });
  });

  it('redacts a single Anthropic key', () => {
    const r = redact('key=' + SYN.anthropic + ' end');
    expect(r.text).toBe('key=' + REDACTION_MARKER + ' end');
    expect(r.redactionCount).toBe(1);
    expect(r.providersRedacted).toEqual(['anthropic']);
  });

  it('redacts a single OpenAI key', () => {
    const r = redact('the key is ' + SYN.openai);
    expect(r.text).toBe('the key is ' + REDACTION_MARKER);
    expect(r.providersRedacted).toEqual(['openai']);
  });

  it('redacts a single Gemini key', () => {
    const r = redact(SYN.gemini);
    expect(r.text).toBe(REDACTION_MARKER);
    expect(r.providersRedacted).toEqual(['gemini']);
  });

  it('redacts multiple keys from different providers in one string', () => {
    const input = [SYN.anthropic, 'and', SYN.openai, 'and', SYN.gemini].join(' ');
    const r = redact(input);
    expect(r.redactionCount).toBe(3);
    expect(r.text).not.toContain(SYN.anthropic);
    expect(r.text).not.toContain(SYN.openai);
    expect(r.text).not.toContain(SYN.gemini);
    expect(new Set(r.providersRedacted)).toEqual(new Set(['anthropic', 'openai', 'gemini']));
  });

  it('anthropic prefix wins over openai (sk-ant vs sk-)', () => {
    // A single Anthropic key must be counted once, as anthropic — not as
    // an anthropic PLUS an openai match on the trailing sk-...
    const r = redact(SYN.anthropic);
    expect(r.redactionCount).toBe(1);
    expect(r.providersRedacted).toEqual(['anthropic']);
  });

  it('openrouter prefix wins over openai (sk-or- vs sk-)', () => {
    const r = redact(SYN.openrouter);
    expect(r.redactionCount).toBe(1);
    expect(r.providersRedacted).toEqual(['openrouter']);
  });

  it('redacts multiple occurrences of the same key', () => {
    const r = redact(SYN.openai + ' ' + SYN.openai);
    expect(r.redactionCount).toBe(2);
    expect(r.text).toBe(REDACTION_MARKER + ' ' + REDACTION_MARKER);
  });

  it('is idempotent — redacting a redacted string yields no new redactions', () => {
    const once = redact('key=' + SYN.anthropic);
    const twice = redact(once.text);
    expect(twice.redactionCount).toBe(0);
    expect(twice.text).toBe(once.text);
  });

  it('does not redact random tokens that just contain sk-', () => {
    const r = redact('the sk-thing was fine, sk- alone is nothing');
    expect(r.redactionCount).toBe(0);
  });

  it('does not redact short-suffix false positives', () => {
    // Real keys are 32+ tail chars. Short strings are not.
    const r = redact('sk-abcdef');
    expect(r.redactionCount).toBe(0);
  });

  it('handles nebius, together, groq, cohere, mistral', () => {
    for (const [k, v] of Object.entries({
      nebius: SYN.nebius,
      together: SYN.together,
      groq: SYN.groq,
      cohere: SYN.cohere,
      mistral: SYN.mistral,
    })) {
      const r = redact('here is ' + v + ' end');
      expect(r.redactionCount).toBe(1);
      expect(r.providersRedacted).toEqual([k]);
    }
  });

  it('redacts across newlines', () => {
    const r = redact('line1\nline2 ' + SYN.gemini + '\nline3');
    expect(r.text).toBe('line1\nline2 ' + REDACTION_MARKER + '\nline3');
  });
});

describe('containsKeyShape', () => {
  it('returns true when input has a key shape', () => {
    expect(containsKeyShape('here: ' + SYN.anthropic)).toBe(true);
  });
  it('returns false for clean input', () => {
    expect(containsKeyShape('nothing to see')).toBe(false);
  });
  it('returns false for empty', () => {
    expect(containsKeyShape('')).toBe(false);
  });
});
