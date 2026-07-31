import { describe, it, expect } from 'vitest';
import { redactStream } from '../src/cli/redact';
import { REDACTION_MARKER } from '../src/mcp/redact';

const SYN = {
  anthropic: 'sk-ant-' + 'A'.repeat(40),
  openai: 'sk-' + 'B'.repeat(40),
  gemini: 'AIza' + 'C'.repeat(35),
};

describe('redactStream', () => {
  it('emits nothing for a chunk that fits entirely in the lookback buffer', () => {
    const s = redactStream();
    const r = s.push('hi');
    expect(r.text).toBe('');
    expect(r.redactionCount).toBe(0);
  });

  it('flushes small buffered content on flush', () => {
    const s = redactStream();
    s.push('hello');
    const r = s.flush();
    expect(r.text).toBe('hello');
    expect(r.redactionCount).toBe(0);
  });

  it('redacts a key that arrives in a single big chunk', () => {
    const s = redactStream();
    // Big padding forces the redactor to emit the prefix immediately.
    const padding = 'x'.repeat(200);
    const first = s.push(padding + SYN.anthropic + padding);
    const tail = s.flush();
    const combined = first.text + tail.text;
    expect(combined).not.toContain(SYN.anthropic);
    expect(combined).toContain(REDACTION_MARKER);
    expect(s.totals().count).toBe(1);
    expect(s.totals().providers).toEqual(['anthropic']);
  });

  it('redacts a key split across two chunks (boundary handling)', () => {
    const s = redactStream();
    const padding = 'y'.repeat(300);
    // Split the key in the middle.
    const cut = 20;
    const first = s.push(padding + SYN.openai.slice(0, cut));
    const second = s.push(SYN.openai.slice(cut));
    const tail = s.flush();
    const combined = first.text + second.text + tail.text;
    expect(combined).not.toContain(SYN.openai);
    expect(combined).toContain(REDACTION_MARKER);
  });

  it('tracks totals across many chunks', () => {
    const s = redactStream();
    // Feed three keys separated by newlines (realistic; e.g. one per log line).
    const chunks = [
      'debug line 1\n',
      SYN.anthropic + '\n',
      'progress line 2\n',
      SYN.gemini + '\n',
      'progress line 3\n',
      SYN.openai + '\n',
      'done\n',
    ];
    let out = '';
    for (const c of chunks) out += s.push(c).text;
    out += s.flush().text;
    for (const k of Object.values(SYN)) expect(out).not.toContain(k);
    expect(s.totals().count).toBe(3);
    expect(new Set(s.totals().providers)).toEqual(new Set(['anthropic', 'openai', 'gemini']));
  });

  it('never emits an unredacted key even under adversarial chunking (byte-by-byte)', () => {
    const s = redactStream();
    const padding = 'z'.repeat(300);
    const full = padding + SYN.anthropic + padding;
    let out = '';
    for (const ch of full) out += s.push(ch).text;
    out += s.flush().text;
    expect(out).not.toContain(SYN.anthropic);
    expect(s.totals().count).toBe(1);
  });

  it('flush without buffered content is a no-op', () => {
    const s = redactStream();
    const r = s.flush();
    expect(r).toEqual({ text: '', redactionCount: 0, providers: [] });
  });
});
